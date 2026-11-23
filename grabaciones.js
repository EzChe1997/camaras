import camaras from './config.js';
import {V, A} from './casa.js?v=1';

// Grabaciones de grabar.sh: grabaciones/<cam>/AAAA-MM-DD_hh-mm-ss.mp4 (10 min cada una).
// El listado sale del índice de carpeta que genera el servidor de archivos de go2rtc.

const vacio = document.getElementById('vacio');
const rotulo = document.getElementById('rotulo');
const lista = document.getElementById('lista');
const error = document.getElementById('error');
const pestanas = document.getElementById('pestanas');

let cam = camaras[0];
let archivos = []; // nombres, del más viejo al más nuevo
let actual = null;
let eventos = [];  // del vigilante (personas en zona): {cam, inicio, fin}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function fechaDe(nombre) {
    const m = nombre.match(/^(\d{4})-(\d\d)-(\d\d)_(\d\d)-(\d\d)-(\d\d)\.mp4$/);
    return m ? new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : null;
}

function etiquetaDia(f) {
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const dia = new Date(f); dia.setHours(0, 0, 0, 0);
    const dif = Math.round((hoy - dia) / 86400000);
    if (dif === 0) return 'Hoy';
    if (dif === 1) return 'Ayer';
    return `${DIAS[dia.getDay()]} ${dia.getDate()}/${dia.getMonth() + 1}`;
}

const hhmm = f => f.toTimeString().slice(0, 5);

/** Fin del archivo i: el inicio del siguiente, o el próximo múltiplo de 10 min (cortes alineados al reloj). */
function finDe(i) {
    if (i + 1 < archivos.length) return fechaDe(archivos[i + 1]);
    const f = fechaDe(archivos[i]);
    const fin = new Date(f);
    fin.setSeconds(0, 0);
    fin.setMinutes(Math.floor(f.getMinutes() / 10) * 10 + 10);
    return fin;
}

async function cargar() {
    error.style.display = 'none';
    try {
        const r = await fetch(V(`grabaciones/${cam.id}/`), {cache: 'no-store'});
        if (!r.ok) throw new Error(r.status === 404 ? 'Todavía no hay grabaciones.' : `Error ${r.status}`);
        const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
        archivos = [...doc.querySelectorAll('a')]
            .map(a => decodeURIComponent(a.getAttribute('href')))
            .filter(n => fechaDe(n))
            .sort();
    } catch (e) {
        archivos = [];
        error.textContent = e.message.startsWith('Todavía') || e.message.startsWith('Error')
            ? e.message : 'No se pudo conectar con casa.';
        error.style.display = 'block';
    }
    try {
        const r = await fetch(A('estado'), {cache: 'no-store'});
        if (r.ok) eventos = (await r.json()).eventos;
    } catch { /* sin vigilante: sin marcas */ }
    dibujar();
}

/** Primer evento de la cámara actual dentro del archivo i (o undefined). */
function eventoEn(i) {
    const ini = fechaDe(archivos[i]).getTime() / 1000, fin = finDe(i).getTime() / 1000;
    return eventos.filter(e => e.cam === cam.id && !e.dudoso && e.fin >= ini && e.inicio < fin)
        .sort((a, b) => a.inicio - b.inicio)[0];
}

function dibujar() {
    lista.replaceChildren();
    // del más nuevo al más viejo, agrupado por día
    let diaActual = null, grilla = null;
    for (let i = archivos.length - 1; i >= 0; i--) {
        const nombre = archivos[i];
        const f = fechaDe(nombre);
        const dia = etiquetaDia(f);
        if (dia !== diaActual) {
            diaActual = dia;
            const h = document.createElement('h2');
            h.textContent = dia;
            grilla = document.createElement('div');
            grilla.className = 'horas';
            lista.append(h, grilla);
        }
        const b = document.createElement('button');
        // si otro archivo empezó en el mismo minuto (cortes por eventos o reinicios), mostrar segundos
        const repetido = archivos.some(o => o !== nombre && hhmm(fechaDe(o)) === hhmm(f) && etiquetaDia(fechaDe(o)) === dia);
        b.textContent = repetido ? f.toTimeString().slice(0, 8) : hhmm(f);
        b.dataset.nombre = nombre;
        if (nombre === actual) b.classList.add('sel');
        if (i === archivos.length - 1) {
            // El archivo en curso sigue creciendo y Chrome no lo puede reproducir hasta que cierre.
            b.classList.add('encurso');
            b.disabled = true;
            b.title = `Grabándose ahora: disponible a las ${hhmm(finDe(i))}`;
        } else {
            const ev = eventoEn(i);
            if (ev) {
                // hubo alguien: arranca unos segundos antes del momento
                b.classList.add('evento');
                b.title = 'Hubo una persona en la zona';
                const desde = Math.max(0, ev.inicio - fechaDe(nombre).getTime() / 1000 - 5);
                b.addEventListener('click', () => reproducir(nombre, desde));
            } else {
                b.addEventListener('click', () => reproducir(nombre));
            }
        }
        grilla.append(b);
    }
}

function reproducir(nombre, desde = 0) {
    actual = nombre;
    const f = fechaDe(nombre);
    const fin = finDe(archivos.indexOf(nombre));
    rotulo.textContent = `${cam.nombre} · ${etiquetaDia(f)} ${hhmm(f)}–${hhmm(fin)}`;
    vacio.style.display = 'none';
    vacio.textContent = 'Elegí un horario de la lista';
    abrirVideo(nombre, desde);
    for (const b of lista.querySelectorAll('button')) b.classList.toggle('sel', b.dataset.nombre === nombre);
    scrollTo({top: 0, behavior: 'smooth'});
}

// ---------- Reproductor ----------
// El reproductor normal del navegador, bajando el MP4 de a pedazos (permite adelantar).
// Por el túnel de Cloudflare anda fluido en los celus; por el Funnel de Tailscale no
// (entraba por EE. UU. y una sola conexión no llegaba a 1,5 Mbps en Wi-Fi).
const video = document.getElementById('video');

function abrirVideo(nombre, desde = 0) {
    video.src = V(`grabaciones/${cam.id}/${encodeURIComponent(nombre)}`) + (desde ? `#t=${Math.floor(desde)}` : '');
    video.play().catch(() => { /* el usuario toca play */ });
}

// Al terminar un archivo, sigue con el siguiente (más nuevo) de la misma cámara.
video.addEventListener('ended', async () => {
    const anterior = actual;
    await cargar();
    if (actual !== anterior) return;
    const i = archivos.indexOf(anterior);
    if (i >= 0 && i < archivos.length - 2) reproducir(archivos[i + 1]);   // el último se está grabando
    else rotulo.textContent += ' · Fin de lo grabado: lo que sigue está en vivo.';
});

async function elegirCamara(c) {
    cam = c;
    for (const b of pestanas.children) b.classList.toggle('activa', b.dataset.id === c.id);
    video.removeAttribute('src');
    video.load();
    actual = null;
    rotulo.textContent = '';
    vacio.style.display = '';
    vacio.textContent = 'Elegí un horario de la lista';
    await cargar();
}

/** Enlace desde un aviso: grabaciones.html#cam2@<segundos epoch>. */
async function irAlMomento() {
    const m = location.hash.match(/^#(\w+)@(\d+)$/);
    if (!m) return false;
    const c = camaras.find(x => x.id === m[1]);
    if (!c) return false;
    history.replaceState(null, '', location.pathname + location.search);
    await elegirCamara(c);
    const t = +m[2];
    for (let i = archivos.length - 1; i >= 0; i--) {
        const ini = fechaDe(archivos[i]).getTime() / 1000;
        if (ini <= t && t < finDe(i).getTime() / 1000) {
            if (i === archivos.length - 1) {
                vacio.innerHTML = `Se está grabando ahora: se puede ver desde las ${hhmm(finDe(i))}.<br><br>
                    <a href="./#vivo=${c.id}" style="color:#4c9aff">Ver en vivo</a>`;
            } else {
                reproducir(archivos[i], Math.max(0, t - ini - 5));
            }
            return true;
        }
    }
    vacio.textContent = 'Esa grabación ya no está (se borran las más viejas).';
    return true;
}

for (const c of camaras) {
    const b = document.createElement('button');
    b.textContent = c.nombre;
    b.dataset.id = c.id;
    b.addEventListener('click', () => elegirCamara(c));
    pestanas.append(b);
}

// Pantalla completa propia (la del navegador mostraría la imagen aplastada).
document.getElementById('pc').addEventListener('click', () => {
    const visor = document.getElementById('visor');
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else visor.requestFullscreen?.().then(() => screen.orientation?.lock?.('landscape')).catch(() => {});
});

// La lista se actualiza sola (cada 10 min aparece un archivo nuevo)
setInterval(() => { if (video.paused) cargar(); }, 60000);

irAlMomento().then(ok => { if (!ok) elegirCamara(camaras[0]); });
addEventListener('hashchange', irAlMomento);