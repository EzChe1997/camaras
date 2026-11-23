// Service worker de la app: recibe los avisos (Web Push) del vigilante del Moto y los muestra.
// No cachea nada: la app siempre carga de casa.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
    let d = {};
    try { d = e.data ? e.data.json() : {}; } catch { d = {titulo: 'Cámaras', cuerpo: e.data && e.data.text()}; }
    const base = self.registration.scope;
    const op = {
        body: d.cuerpo || '',
        icon: base + 'icono-192.png',
        tag: d.tag || undefined,
        renotify: !!d.tag,
        vibrate: [300, 120, 300],
        data: {url: new URL(d.url || './', base).href},
    };
    if (d.foto) op.image = new URL(d.foto, base).href;
    e.waitUntil(self.registration.showNotification(d.titulo || 'Cámaras', op));
});

self.addEventListener('notificationclick', e => {
    e.notification.close();
    const url = e.notification.data && e.notification.data.url || self.registration.scope;
    e.waitUntil((async () => {
        const ventanas = await self.clients.matchAll({type: 'window', includeUncontrolled: true});
        for (const v of ventanas) {
            if (v.url.startsWith(self.registration.scope) && 'navigate' in v) {
                await v.focus();
                return v.navigate(url);
            }
        }
        return self.clients.openWindow(url);
    })());
});
