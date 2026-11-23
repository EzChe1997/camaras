// Dónde está "casa" (el Moto).
// - Si la página la sirve el Moto (enlace viejo de Tailscale): todo es relativo a esta página.
// - Si la sirve GitHub Pages (ezche1997.github.io/camaras): el video viaja por túneles gratis
//   de Cloudflare, cuya dirección cambia cuando se reinician. El Moto publica la dirección
//   actual en la rama "tunel" del repositorio y acá se lee. La clave secreta NO está en el
//   repositorio: llega una sola vez en el enlace (#k=...) y queda guardada en el celu.
const REPO = 'EzChe1997/camaras';
export const enPages = location.hostname.endsWith('.github.io');

const leer = k => { try { return localStorage.getItem(k); } catch { return null; } };
const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch { /* modo privado */ } };

// Enlace de instalación: ...#k=<secreto>. Se guarda y se saca de la barra de direcciones.
const m = location.hash.match(/^#k=([\w-]+)$/);
if (m) {
    guardar('secreto', m[1]);
    history.replaceState(null, '', location.pathname + location.search);
}

export const casa = {video: './', av: 'av/'};
export const V = ruta => casa.video + ruta;   // go2rtc: páginas de video, grabaciones, fotos
export const A = ruta => casa.av + ruta;      // vigilante: avisos, zonas, eventos

async function leerTunel() {
    const fuentes = [
        [`https://api.github.com/repos/${REPO}/contents/tunel.json?ref=tunel&t=${Date.now()}`,
            {headers: {Accept: 'application/vnd.github.raw+json'}}],
        [`https://raw.githubusercontent.com/${REPO}/tunel/tunel.json?t=${Date.now()}`, {}],
    ];
    for (const [url, op] of fuentes) {
        try {
            const r = await fetch(url, {...op, cache: 'no-store', signal: AbortSignal.timeout(6000)});
            if (!r.ok) continue;
            const t = await r.json();
            if (/^https:\/\/[\w.-]+$/.test(t.video) && /^https:\/\/[\w.-]+$/.test(t.av)) return t;
        } catch { /* probar la otra */ }
    }
    return null;
}

function usar(t, secreto) {
    casa.video = `${t.video}/${secreto}/`;
    casa.av = `${t.av}/${secreto}/av/`;
}

/** Vuelve a leer la dirección de los túneles. Devuelve true si cambió. */
export async function reubicar() {
    if (!enPages) return false;
    const t = await leerTunel();
    if (!t) return false;
    const antes = leer('tunel');
    guardar('tunel', JSON.stringify(t));
    usar(t, leer('secreto'));
    return antes !== JSON.stringify(t);
}

if (enPages) {
    const secreto = leer('secreto');
    if (!secreto) {
        // sin la clave no hay nada que mostrar
        document.documentElement.innerHTML = `<body style="background:#000;color:#ddd;font:16px system-ui;
            padding:40px 24px;line-height:1.5">Para usar las cámaras abrí el enlace completo que te pasaron
            (el que termina en <b>#k=…</b>).</body>`;
        throw new Error('sin clave');
    }
    let t = null;
    try { t = JSON.parse(leer('tunel')); } catch { /* nada guardado */ }
    if (t) {
        usar(t, secreto);
        reubicar();  // por si cambió, sin esperar
    } else if (!await reubicar()) {
        usar({video: 'https://sin-conexion.invalid', av: 'https://sin-conexion.invalid'}, secreto);
    }
}
