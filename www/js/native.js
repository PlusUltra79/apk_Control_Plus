/* Puente con Android (portapapeles / compartir / guardar) con respaldo para navegador. */
(function (root) {
  'use strict';
  const CP = (root.CP = root.CP || {});
  const N = (CP.native = {});
  const cap = () => root.Capacitor;
  N.isNative = () => !!(cap() && cap().isNativePlatform && cap().isNativePlatform());
  const plugin = (n) => (cap() && cap().Plugins && cap().Plugins[n]) || null;

  N.copy = async function (text) {
    try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); return true; } } catch (e) { /* respaldo */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
      document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
      const ok = document.execCommand('copy'); document.body.removeChild(ta); return ok;
    } catch (e) { return false; }
  };
  N.shareText = async function (text) {
    const S = plugin('Share');
    try {
      if (S && N.isNative()) { await S.share({ text, dialogTitle: 'Compartir reporte' }); return 'shared'; }
      if (navigator.share) { await navigator.share({ text }); return 'shared'; }
    } catch (e) { if (e && /cancel|abort/i.test(String(e.message || e))) return 'cancel'; }
    return (await N.copy(text)) ? 'copied' : 'fail';
  };
  const b64 = (u8) => { let s = ''; const C = 0x8000; for (let i = 0; i < u8.length; i += C) s += String.fromCharCode.apply(null, u8.subarray(i, i + C)); return btoa(s); };
  N.shareFile = async function (name, data, mime) {
    const u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
    const FS = plugin('Filesystem'), S = plugin('Share');
    if (FS && S && N.isNative()) {
      try {
        const r = await FS.writeFile({ path: name, data: b64(u8), directory: 'CACHE' });
        await S.share({ title: name, url: r.uri, dialogTitle: 'Guardar / compartir archivo' });
        return 'shared';
      } catch (e) { if (e && /cancel|abort/i.test(String(e.message || e))) return 'cancel'; }
    }
    N.download(name, u8, mime);
    return 'download';
  };
  N.download = function (name, data, mime) {
    const blob = new Blob([data], { type: mime || 'application/octet-stream' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  };

  /* fondo de estrellas animado (ligero) */
  N.stars = function () {
    const cv = document.getElementById('stars'); if (!cv || !cv.getContext) return;
    if (root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = cv.getContext('2d'); if (!ctx) return; let W, H, stars = [], raf = null;
    function size() { W = cv.width = root.innerWidth; H = cv.height = root.innerHeight; stars = Array.from({ length: Math.min(90, Math.round(W * H / 14000)) }, () => ({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.4 + .3, s: Math.random() * .25 + .05, p: Math.random() * 6 })); }
    function tick(t) {
      ctx.clearRect(0, 0, W, H);
      for (const s of stars) {
        s.y += s.s; s.x += s.s * .3; if (s.y > H) { s.y = -2; s.x = Math.random() * W; } if (s.x > W) s.x = 0;
        ctx.globalAlpha = .35 + .35 * Math.sin(t / 700 + s.p); ctx.fillStyle = s.r > 1.2 ? '#ffc65a' : '#cfe1ff';
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.283); ctx.fill();
      }
      raf = root.requestAnimationFrame(tick);
    }
    size(); root.addEventListener('resize', size); raf = root.requestAnimationFrame(tick);
    document.addEventListener('visibilitychange', () => { if (document.hidden) root.cancelAnimationFrame(raf); else raf = root.requestAnimationFrame(tick); });
  };
})(typeof window !== 'undefined' ? window : globalThis);
