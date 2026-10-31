/* Version web : <webview> (propre à l'application Windows) remplacé par un cadre <iframe>.
 * La page s'affiche à la vraie largeur de l'appareil ; les sites qui interdisent l'affichage dans un cadre
 * (X-Frame-Options, CSP frame-ancestors) sont signalés grâce à NEXORA Cloud. */
let seq = 100;
class NxWebview extends HTMLElement {
  constructor() {
    super();
    this.wcid = seq += 1;
    this.frame = document.createElement('iframe');
    this.frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads');
    this.frame.setAttribute('allow', 'clipboard-write; fullscreen; geolocation; camera; microphone');
    Object.assign(this.frame.style, { width: '100%', height: '100%', border: '0', display: 'block', background: '#fff' });
    this.frame.addEventListener('load', () => this.onLoad());
    this.started = false;
  }

  connectedCallback() {
    if (!this.frame.isConnected) this.append(this.frame);
    if (!this.started) { this.started = true; setTimeout(() => this.fire('dom-ready'), 80); }
  }

  fire(type, extra = {}) { const e = new Event(type); Object.assign(e, extra); this.dispatchEvent(e); }

  getWebContentsId() { return this.wcid; }

  getURL() { return this.url || 'about:blank'; }

  async loadURL(u) {
    this.url = u;
    this.fire('did-start-loading');
    if (/^https?:/.test(u)) this.checkFrame(u);
    this.frame.src = u;
    return true;
  }

  async checkFrame(u) {
    try {
      if (!window.__nxCloud) return;
      const info = await window.__nxCloud.callFn('site-info', { url: u });
      if (info && info.frameable === false && this.url === u) {
        this.fire('did-fail-load', { isMainFrame: true, errorCode: -27, errorDescription: `Ce site interdit son affichage dans un autre site (${info.reason}). Ouvre-le dans l’application Windows NEXORA pour le voir dans les appareils.`, validatedURL: u });
      }
      if (info && info.title && this.url === u) this.fire('page-title-updated', { title: info.title });
    } catch { /* vérification facultative */ }
  }

  onLoad() {
    let url = this.url;
    try { url = this.frame.contentWindow.location.href; } catch { /* autre origine */ }
    if (url && url !== 'about:blank') this.fire('did-navigate', { url });
    try { const t = this.frame.contentDocument && this.frame.contentDocument.title; if (t) this.fire('page-title-updated', { title: t }); } catch { /* autre origine */ }
    this.fire('did-stop-loading');
  }

  reload() { const s = this.frame.src; this.frame.src = 'about:blank'; setTimeout(() => { this.frame.src = s; }, 30); }

  reloadIgnoringCache() { this.reload(); }

  stop() {}

  canGoBack() { return false; }

  canGoForward() { return false; }

  goBack() { try { this.frame.contentWindow.history.back(); } catch { /* autre origine */ } }

  goForward() { try { this.frame.contentWindow.history.forward(); } catch { /* autre origine */ } }

  async executeJavaScript(code) {
    const w = this.frame.contentWindow;
    try { return await w.eval(code); } catch (e) { throw new Error('Page d’un autre site : lecture impossible depuis le navigateur.'); }
  }

  async insertCSS(css) { try { const s = this.frame.contentDocument.createElement('style'); s.textContent = css; this.frame.contentDocument.head.append(s); } catch { /* autre origine */ } return ''; }

  send() {}

  sendInputEvent() {}

  setZoomFactor() {}

  getZoomFactor() { return 1; }

  setAudioMuted() {}

  isLoading() { return false; }

  openDevTools() {}

  async capturePage() { throw new Error('Capture d’écran de la page : disponible dans l’application Windows.'); }
}

if (!customElements.get('nx-webview')) customElements.define('nx-webview', NxWebview);
const create = document.createElement.bind(document);
document.createElement = (tag, opts) => (String(tag).toLowerCase() === 'webview' ? create('nx-webview', opts) : create(tag, opts));
