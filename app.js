import './camplayer.js?v=2';
import camaras from './config.js';
import {V, reubicar} from './casa.js?v=1';

const ESPERA_PRIMER_CUADRO = 8000; // ms sin video al conectar -> "Sin señal" y reintento
const ESPERA_CORTE = 5000;         // ms con la imagen congelada -> "Sin señal" y reintento



/** Sigue si un reproductor muestra video: 'ok', 'esperando' o 'sin-senal'. */
class Vigia {
    constructor(player) {
        this.player = player;
        this.reset();
    }
    reset() {
        this.ultimo = -1;
        this.desde = Date.now();
        this.vio = false;
    }
    revisar(ahora) {
        const video = this.player.video;
        if (video && video.readyState >= 2 && video.currentTime !== this.ultimo) {
            this.ultimo = video.currentTime;
            this.desde = ahora;
            this.vio = true;
            return 'ok';
        }
        const limite = this.vio ? ESPERA_CORTE : ESPERA_PRIMER_CUADRO;
        if (ahora - this.desde > limite) {
            this.player.reintentar();
            this.desde = ahora; // próximo intento en 5 s
            this.vio = true;
            return 'sin-senal';
        }
        return this.vio && ahora - this.desde < 1500 ? 'ok' : 'esperando';
    }
}

const grilla = document.getElementById('grilla');
const aviso = document.getElementById('aviso');
let ampliada = null; // vista ampliada, o null

// Cada cámara tiene dos reproductores: el substream (siempre que se ve) y el
// principal (solo ampliada), que tapa al substream recién cuando ya tiene imagen.
const vistas = camaras.map(cam => {
    const caja = document.createElement('div');
    caja.className = 'cam';
    caja.innerHTML = `
        <div class="rotulo"><span class="punto"></span><span></span></div>
        <div class="estado">Conectando…</div>`;
    caja.querySelector('.rotulo span:last-child').textContent = cam.nombre;

    const sub = document.createElement('cam-player');
    const hd = document.createElement('cam-player');
    hd.className = 'hd';
    caja.prepend(sub, hd);
    grilla.append(caja);

    const vista = {cam, caja, sub, hd, vSub: new Vigia(sub), vHd: new Vigia(hd)};
    caja.addEventListener('click', () => ampliada ? volver() : ampliar(vista));
    return vista;
});

function estado(vista, ok, texto) {
    vista.caja.classList.toggle('ok', ok);
    if (texto) vista.caja.querySelector('.estado').textContent = texto;
}

function verSub(vista) {
    if (vista.sub.ver(vista.cam.id + '_sub')) {
        vista.vSub.reset();
        estado(vista, false, 'Conectando…');
    }
}

function vistaDeDos() {
    for (const v of vistas) verSub(v);
}

// --- Ampliar / volver (con el botón atrás del celu) ---
function ampliar(vista) {
    ampliada = vista;
    history.pushState({ampliada: vista.cam.id}, '');
    grilla.classList.add('ampliada');
    for (const v of vistas) {
        v.caja.classList.toggle('activa', v === vista);
        if (v !== vista) v.sub.detener();
    }
    // El substream sigue a la vista (ampliación instantánea); el principal carga detrás.
    vista.hd.ver(vista.cam.id);
    vista.vHd.reset();

    // Horizontal forzado (como YouTube): anda aunque el celu tenga la rotación automática
    // desactivada. Si Chrome no deja girar directo, pide pantalla completa y gira.
    const girar = () => screen.orientation?.lock?.('landscape') ?? Promise.reject();
    girar().catch(() => {
        const pc = document.documentElement.requestFullscreen?.({navigationUI: 'hide'});
        if (pc) pc.then(girar).catch(() => {});
    });
}

function volver() {
    if (ampliada) history.back(); // dispara popstate -> achicar()
}

function achicar() {
    if (!ampliada) return;
    const vista = ampliada;
    ampliada = null;
    vista.hd.detener();
    vista.caja.classList.remove('hd-listo');
    grilla.classList.remove('ampliada');
    for (const v of vistas) v.caja.classList.remove('activa');
    try { screen.orientation?.unlock?.(); } catch {}
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    vistaDeDos();
}

addEventListener('popstate', achicar);
// Si el usuario sale de pantalla completa con el gesto del sistema, volver también a la vista de 2.
document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && ampliada) volver();
});

// --- Vigilancia: detecta imagen congelada y reintenta cada 5 s ---
setInterval(() => {
    if (document.hidden) return;
    const ahora = Date.now();
    for (const v of vistas) {
        if (!v.sub.wsURL) continue; // cámara oculta mientras otra está ampliada
        const sub = v.vSub.revisar(ahora);
        let hdListo = false;
        if (v === ampliada) {
            hdListo = v.vHd.revisar(ahora) === 'ok';
            v.caja.classList.toggle('hd-listo', hdListo);
        }
        if (hdListo || sub === 'ok') estado(v, true);
        else if (sub === 'sin-senal') estado(v, false, 'Sin señal');
        else if (!v.vSub.vio) estado(v, false, 'Conectando…');
    }
}, 500);

// Al volver a la app después de un rato, darle tiempo a reconectar antes de marcar "Sin señal".
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) for (const v of vistas) { v.vSub.desde = Date.now(); v.vHd.desde = Date.now(); }
});

// --- ¿Llega al servidor de casa? ---
// Si no llega, puede ser que el Moto haya rehecho el túnel con otra dirección: se vuelve a
// leer y, si cambió, se recarga la página para conectar todo a la dirección nueva.
let fallasCasa = 0;
async function revisarCasa() {
    let ok = false;
    try {
        const r = await fetch(V('api'), {cache: 'no-store', signal: AbortSignal.timeout(6000)});
        ok = r.ok;
    } catch { /* sin conexión */ }
    fallasCasa = ok ? 0 : fallasCasa + 1;
    aviso.classList.toggle('visible', fallasCasa >= 2);
    if (fallasCasa === 1 || fallasCasa % 6 === 0) {
        if (await reubicar()) location.reload();
    }
}
setInterval(revisarCasa, 5000);
revisarCasa();

vistaDeDos();

// Enlace desde un aviso con la persona todavía ahí: ./#vivo=cam2 abre esa cámara ampliada.
function abrirDesdeEnlace() {
    const m = location.hash.match(/^#vivo=(\w+)$/);
    if (!m) return;
    history.replaceState(null, '', location.pathname + location.search);
    const vista = vistas.find(v => v.cam.id === m[1]);
    if (vista && ampliada !== vista) {
        if (ampliada) achicar();
        ampliar(vista);
    }
}
abrirDesdeEnlace();
addEventListener('hashchange', abrirDesdeEnlace);
