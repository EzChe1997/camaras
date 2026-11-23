import {VideoRTC} from './video-rtc.js?v=1';
import {V} from './casa.js?v=1';

// Reproductor del en vivo (go2rtc por WebSocket + MSE). Lo usan la pantalla principal y la de
// grabaciones (el vigilante publica la grabacion en go2rtc como si fuera una camara).
/** Reproductor de go2rtc sin controles, sin audio y con stream intercambiable. */
export class CamPlayer extends VideoRTC {
    constructor() {
        super();
        // Solo MSE: WebRTC no anda en el Moto (Android bloquea a go2rtc listar interfaces).
        this.mode = 'mse';
        this.media = 'video';
    }

    oninit() {
        super.oninit();
        this.video.controls = false;
        this.video.muted = true;
    }

    /**
     * Igual que el original, pero cada WebSocket solo habla con el reproductor mientras
     * siga siendo el actual. Si no, el 'close' tardío de la conexión vieja pisaba a la
     * nueva (this.ws = null) y el video quedaba sin pedirse hasta el reintento.
     */
    onconnect() {
        if (!this.isConnected || !this.wsURL || this.ws || this.pc) return false;
        this.wsState = WebSocket.CONNECTING;
        this.connectTS = Date.now();

        const ws = new WebSocket(this.wsURL);
        ws.binaryType = 'arraybuffer';
        // Registrado antes que el de VideoRTC: corta los mensajes de una conexión vieja.
        ws.addEventListener('message', ev => {
            if (this.ws !== ws) ev.stopImmediatePropagation();
        });
        ws.addEventListener('open', () => { if (this.ws === ws) this.onopen(); });
        ws.addEventListener('close', () => { if (this.ws === ws) this.onclose(); });
        this.ws = ws;
        return true;
    }

    /** Como el original, pero sin `src = ''` (dispara un 'error' que cierra la conexión nueva). */
    ondisconnect() {
        this.wsState = WebSocket.CLOSED;
        if (this.ws) {
            const ws = this.ws;
            this.ws = null;
            ws.close();
        }
        this.pcState = WebSocket.CLOSED;
        if (this.pc) {
            this.pc.getSenders().forEach(sender => sender.track && sender.track.stop());
            this.pc.close();
            this.pc = null;
        }
        if (this.video) {
            this.video.removeAttribute('src');
            this.video.srcObject = null;
            this.video.load();
        }
    }

    /** Conecta al stream indicado (o no hace nada si ya está en ese). */
    ver(stream) {
        const url = new URL(V('api/ws?src=' + encodeURIComponent(stream)), location.href).toString();
        if (this.wsURL === 'ws' + url.substring(4)) return false;
        this.ondisconnect();
        this.src = url;
        return true;
    }

    /** Corta el stream (para no gastar datos con la cámara oculta). */
    detener() {
        this.ondisconnect();
        this.wsURL = '';
    }

    reintentar() {
        if (!this.wsURL) return;
        const url = this.wsURL;
        this.detener();
        this.src = url;
    }
}
customElements.define('cam-player', CamPlayer);
