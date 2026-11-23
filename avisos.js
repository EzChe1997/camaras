// Pantalla de avisos: activar notificaciones en este celu, cuándo avisar, zonas y eventos.
// Habla con el vigilante del Moto en av/ (API publicada bajo el mismo enlace secreto).
import {V, A} from './casa.js?v=1';

const $ = id => document.getElementById(id);
let estado = null;
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

async function api(ruta, datos) {
    const r = await fetch(A(ruta), datos === undefined ? {cache: 'no-store'} : {
        method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(datos)});
    if (!r.ok) throw new Error(`Error ${r.status}`);
    return r.json();
}

function mostrarError(e) {
    $('error').textContent = e ? 'No se pudo conectar con casa. ' + (e.message || '') : '';
    $('error').style.display = e ? 'block' : 'none';
}

async function cargar() {
    try {
        estado = await api('estado');
        mostrarError(null);
    } catch (e) { mostrarError(e); return; }
    dibujarConfig();
    dibujarEventos();
}

// ---------- este celu ----------
function b64aBytes(s) {
    const b = atob((s + '='.repeat((4 - s.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(b, c => c.charCodeAt(0));
}

async function registro() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
    return navigator.serviceWorker.register('sw.js');
}

async function revisarCelu() {
    const txt = $('celuTxt'), btn = $('celuBtn');
    const reg = await registro().catch(() => null);
    if (!reg) { txt.textContent = 'Este navegador no puede recibir avisos.'; return; }
    const sub = await reg.pushManager.getSubscription();
    if (Notification.permission === 'denied') {
        txt.innerHTML = 'Bloqueaste las notificaciones de esta app.<span class="sub">Activalas en Ajustes de Android → Apps → Cámaras → Notificaciones.</span>';
        btn.hidden = true; $('celuMas').hidden = true; return;
    }
    if (sub) {
        txt.innerHTML = 'Avisos activados ✓<span class="sub">Este celu recibe las notificaciones.</span>';
        btn.textContent = 'Desactivar'; btn.className = 'b gris'; btn.hidden = false; $('celuMas').hidden = false;
        // re-registrar por las dudas (si el Moto la borró o se reinstaló)
        api('suscribir', {sub: sub.toJSON(), nombre: nombreCelu()}).catch(() => {});
    } else {
        txt.innerHTML = 'Este celu no recibe avisos.';
        btn.textContent = 'Activar'; btn.className = 'b'; btn.hidden = false; $('celuMas').hidden = true;
    }
}

function nombreCelu() {
    const m = navigator.userAgent.match(/Android [\d.]+; ([^;)]+)/);
    return m ? m[1].trim() : navigator.platform || 'celu';
}

$('celuBtn').addEventListener('click', async () => {
    const btn = $('celuBtn');
    btn.disabled = true;
    try {
        const reg = await registro();
        await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
            await api('desuscribir', {endpoint: sub.endpoint}).catch(() => {});
            await sub.unsubscribe();
        } else {
            if (await Notification.requestPermission() !== 'granted') throw new Error('No diste permiso para notificaciones.');
            const nueva = await reg.pushManager.subscribe({userVisibleOnly: true,
                applicationServerKey: b64aBytes(estado.vapid)});
            await api('suscribir', {sub: nueva.toJSON(), nombre: nombreCelu()});
        }
    } catch (e) { alert(e.message || e); }
    btn.disabled = false;
    revisarCelu();
});

$('probar').addEventListener('click', async () => {
    const b = $('probar');
    b.disabled = true; b.textContent = 'Enviando…';
    try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        const r = await api('probar', {endpoint: sub && sub.endpoint});
        b.textContent = r.resultado.includes('ok') ? 'Enviado ✓' : 'Falló';
        if (!r.resultado.includes('ok')) alert('No se pudo mandar: ' + r.resultado.join(', '));
    } catch (e) { b.textContent = 'Falló'; alert(e.message); }
    setTimeout(() => { b.disabled = false; b.textContent = 'Probar'; }, 3000);
});

// ---------- configuración ----------
async function guardar(cambios) {
    try {
        const r = await api('config', cambios);
        estado.config = r.config; estado.armado = r.armado;
        mostrarError(null);
    } catch (e) { mostrarError(e); }
    dibujarConfig();
}

function dibujarConfig() {
    const c = estado.config;
    const a = $('armado');
    a.className = 'estado ' + (estado.armado ? 'on' : 'off');
    a.textContent = estado.armado ? '● Ahora avisa si ve a alguien' : 'Ahora no avisa (solo guarda los eventos)';
    for (const b of $('modo').children) b.classList.toggle('activa', b.dataset.modo === c.modo);
    $('horario').hidden = c.modo !== 'auto';
    $('desde').value = c.horario.desde;
    $('hasta').value = c.horario.hasta;
    $('fallas').checked = c.fallas;

    const cont = $('camaras');
    cont.replaceChildren();
    for (const [id, cam] of Object.entries(c.camaras)) {
        const bloque = document.createElement('div');
        bloque.className = 'zonas-cam';
        bloque.innerHTML = `<div class="cab"><span class="txt">${cam.nombre}</span>
            <label class="interruptor"><input type="checkbox"><span></span></label></div>`;
        const chk = bloque.querySelector('input');
        chk.checked = cam.avisar;
        chk.addEventListener('change', () => guardar({camaras: {[id]: {avisar: chk.checked}}}));
        cam.zonas.forEach((z, i) => {
            const f = document.createElement('div');
            f.className = 'zona';
            f.innerHTML = `<span class="txt"></span><button class="b gris">Editar</button>`;
            f.querySelector('.txt').innerHTML = `${escapar(z.nombre)}<span class="sub">${describir(z)}</span>`;
            f.querySelector('button').addEventListener('click', () => abrirEditor(id, i));
            bloque.append(f);
        });
        if (cam.zonas.length < 6) {
            const b = document.createElement('button');
            b.className = 'agregar';
            b.textContent = '+ Agregar zona';
            b.addEventListener('click', () => abrirEditor(id, -1));
            bloque.append(b);
        }
        cont.append(bloque);
    }
}

const escapar = s => s.replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'})[c]);

function describir(z) {
    const que = z.espera > 0 ? `Si alguien se queda ${z.espera < 60 ? z.espera + ' s' : z.espera / 60 + ' min'}` : 'Apenas entra alguien';
    return `${que} · ${z.cuando === 'siempre' ? 'a cualquier hora' : 'en el horario de avisos'}`;
}

for (const b of $('modo').children) b.addEventListener('click', () => guardar({modo: b.dataset.modo}));
for (const id of ['desde', 'hasta']) $(id).addEventListener('change', () =>
    guardar({horario: {desde: $('desde').value, hasta: $('hasta').value}}));
$('fallas').addEventListener('change', () => guardar({fallas: $('fallas').checked}));

// ---------- eventos ----------
function etiquetaDia(d) {
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const x = new Date(d); x.setHours(0, 0, 0, 0);
    const dif = Math.round((hoy - x) / 86400000);
    return dif === 0 ? 'Hoy' : dif === 1 ? 'Ayer' : `${DIAS[x.getDay()]} ${x.getDate()}/${x.getMonth() + 1}`;
}
const hora = d => d.toTimeString().slice(0, 8);

function dibujarEventos() {
    const cont = $('eventos');
    cont.replaceChildren();
    if (!estado.eventos.length) {
        cont.innerHTML = '<p class="vacio">Sin eventos. Cuando vea a alguien dentro de una zona, aparece acá con su foto.</p>';
        return;
    }
    let dia = null;
    for (const ev of estado.eventos) {
        const ini = new Date(ev.inicio * 1000);
        const d = etiquetaDia(ini);
        if (d !== dia) {
            dia = d;
            const h = document.createElement('h3');
            h.textContent = d;
            cont.append(h);
        }
        const nombre = estado.config.camaras[ev.cam]?.nombre || ev.cam;
        const dur = Math.round(ev.fin - ev.inicio);
        const a = document.createElement('a');
        a.className = 'ev' + (ev.dudoso ? ' dudoso' : '');
        a.id = ev.id;
        // si sigue pasando, al en vivo; si ya terminó, a la grabación de ese momento
        a.href = ev.abierto ? `./#vivo=${ev.cam}` : `grabaciones.html#${ev.cam}@${Math.floor(ev.inicio)}`;
        a.innerHTML = `<img loading="lazy" alt="" src="${V('eventos/fotos/' + ev.foto)}?v=${Math.floor(ev.fin)}">
            <span class="txt">${ev.dudoso ? 'Descartado (no parecía persona)' : 'Persona'} · ${nombre}${ev.zona ? ' · ' + escapar(ev.zona) : ''}<span class="sub">${hora(ini)}${dur > 5 ? ` · ${dur < 90 ? dur + ' s' : Math.round(dur / 60) + ' min'}` : ''}${ev.abierto ? ' · ahora' : ''}${ev.avisado ? ' · avisado' : ''}</span>
            <span class="sub">${ev.abierto ? 'Pasando ahora: tocá para ver en vivo' : 'Tocá para ver la grabación'}</span></span>`;
        a.querySelector('img').addEventListener('click', e => {
            e.preventDefault();
            $('foto').querySelector('img').src = e.target.src;
            $('foto').classList.add('abierto');
        });
        cont.append(a);
    }
    destacar();
}
$('foto').addEventListener('click', () => $('foto').classList.remove('abierto'));

function destacar() {
    const id = decodeURIComponent(location.hash.slice(1));
    const el = id && document.getElementById(id);
    if (el) { el.classList.add('destacado'); el.scrollIntoView({block: 'center'}); }
}

// ---------- editor de zona ----------
// Puntos arrastrables. Tocar cerca de un borde agrega un punto ahí; tocar un punto lo selecciona
// (para borrarlo). Las coordenadas van de 0 a 1; el SVG usa 1600x900 (16:9, sin deformar).
const VW = 1600, VH = 900;
let editando = null;   // {cam, i}  (i = -1: zona nueva)
let puntos = [], elegido = -1, arrastre = null;

function abrirEditor(cam, i) {
    const zonas = estado.config.camaras[cam].zonas;
    const z = i >= 0 ? zonas[i] : {nombre: '', espera: 15, cuando: 'siempre',
        puntos: [[0.4, 0.45], [0.6, 0.45], [0.6, 0.8], [0.4, 0.8]]};
    editando = {cam, i};
    puntos = z.puntos.map(p => [...p]);
    elegido = -1;
    $('zNombre').value = z.nombre;
    $('zEspera').value = String(z.espera);
    if ($('zEspera').value !== String(z.espera)) {  // valor fuera de la lista
        const o = new Option(`si alguien se queda ${z.espera} s`, z.espera);
        $('zEspera').add(o);
        $('zEspera').value = String(z.espera);
    }
    $('zCuando').value = z.cuando;
    $('zEliminar').hidden = i < 0;
    $('editorImg').src = `${A('cuadro/' + cam)}.jpg?t=${Date.now()}`;
    $('editor').classList.add('abierto');
    $('editor').scrollTop = 0;
    history.pushState({editor: 1}, '');
    dibujarZona();
}

function cerrarEditor() {
    $('editor').classList.remove('abierto');
    editando = null;
}
addEventListener('popstate', () => { if (editando) cerrarEditor(); });

function dibujarZona() {
    const svg = $('editorSvg');
    const {cam, i} = editando;
    const otras = estado.config.camaras[cam].zonas.filter((_, k) => k !== i);
    const pts = ps => ps.map(([x, y]) => `${x * VW},${y * VH}`).join(' ');
    let h = otras.map(z => `<polygon points="${pts(z.puntos)}" fill="rgba(255,255,255,.08)" stroke="rgba(255,255,255,.45)" stroke-width="4" stroke-dasharray="14 10"/>`).join('');
    h += `<polygon points="${pts(puntos)}" fill="rgba(48,164,108,.28)" stroke="#30a46c" stroke-width="7"/>`;
    h += puntos.map(([x, y], k) => `<circle cx="${x * VW}" cy="${y * VH}" r="${k === elegido ? 30 : 24}"
        fill="${k === elegido ? '#f5a623' : '#fff'}" stroke="#0b3d24" stroke-width="5"/>`).join('');
    svg.innerHTML = h;
    $('zBorrarPunto').disabled = elegido < 0 || puntos.length <= 3;
}

function posicion(e) {
    const r = $('lienzo').getBoundingClientRect();
    return {x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
            y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
            ancho: r.width, alto: r.height};
}

function puntoCercano(p) {
    // distancia en píxeles de pantalla (zona de toque generosa para el dedo)
    let mejor = -1, dist = 30;
    puntos.forEach(([x, y], k) => {
        const d = Math.hypot((x - p.x) * p.ancho, (y - p.y) * p.alto);
        if (d < dist) { dist = d; mejor = k; }
    });
    return mejor;
}

function bordeCercano(p) {
    // índice donde insertar: después del punto k (borde k -> k+1) más cercano al toque
    let mejor = 0, dist = Infinity;
    for (let k = 0; k < puntos.length; k++) {
        const [ax, ay] = puntos[k], [bx, by] = puntos[(k + 1) % puntos.length];
        const X = p.x * p.ancho, Y = p.y * p.alto;
        const AX = ax * p.ancho, AY = ay * p.alto, BX = bx * p.ancho, BY = by * p.alto;
        const L = (BX - AX) ** 2 + (BY - AY) ** 2 || 1;
        const t = Math.max(0, Math.min(1, ((X - AX) * (BX - AX) + (Y - AY) * (BY - AY)) / L));
        const d = Math.hypot(X - (AX + t * (BX - AX)), Y - (AY + t * (BY - AY)));
        if (d < dist) { dist = d; mejor = k + 1; }
    }
    return mejor;
}

const lienzo = $('lienzo');
lienzo.addEventListener('pointerdown', e => {
    const p = posicion(e);
    const k = puntoCercano(p);
    if (k >= 0) {
        arrastre = {k, movido: false, x0: e.clientX, y0: e.clientY};
        elegido = k;
        lienzo.setPointerCapture(e.pointerId);
    } else {
        // agregar un punto en el borde más cercano y empezar a arrastrarlo
        const pos = bordeCercano(p);
        puntos.splice(pos, 0, [+p.x.toFixed(4), +p.y.toFixed(4)]);
        elegido = pos;
        arrastre = {k: pos, movido: true};
        lienzo.setPointerCapture(e.pointerId);
    }
    dibujarZona();
    e.preventDefault();
});
lienzo.addEventListener('pointermove', e => {
    if (!arrastre) return;
    if (!arrastre.movido && Math.hypot(e.clientX - arrastre.x0, e.clientY - arrastre.y0) < 4) return;
    arrastre.movido = true;
    const p = posicion(e);
    puntos[arrastre.k] = [+p.x.toFixed(4), +p.y.toFixed(4)];
    dibujarZona();
});
const soltar = () => { arrastre = null; };
lienzo.addEventListener('pointerup', soltar);
lienzo.addEventListener('pointercancel', soltar);

$('zBorrarPunto').addEventListener('click', () => {
    if (elegido >= 0 && puntos.length > 3) { puntos.splice(elegido, 1); elegido = -1; dibujarZona(); }
});
$('zTodo').addEventListener('click', () => { puntos = [[0, 0], [1, 0], [1, 1], [0, 1]]; elegido = -1; dibujarZona(); });
$('zCancelar').addEventListener('click', () => history.back());

async function guardarZonas(zonas) {
    await guardar({camaras: {[editando.cam]: {zonas}}});
    history.back();
}

$('zGuardar').addEventListener('click', () => {
    const {cam, i} = editando;
    const zonas = estado.config.camaras[cam].zonas.map(z => ({...z}));
    const z = {id: i >= 0 ? zonas[i].id : '', nombre: $('zNombre').value.trim() || 'Zona',
        espera: +$('zEspera').value, cuando: $('zCuando').value, puntos};
    if (i >= 0) zonas[i] = z; else zonas.push(z);
    guardarZonas(zonas);
});
$('zEliminar').addEventListener('click', () => {
    const {cam, i} = editando;
    if (!confirm('¿Borrar esta zona?')) return;
    guardarZonas(estado.config.camaras[cam].zonas.filter((_, k) => k !== i));
});

addEventListener('hashchange', destacar);
revisarCelu();
cargar();
setInterval(() => { if (!editando && document.visibilityState === 'visible') cargar(); }, 30000);
