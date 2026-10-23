/* Extractor de tablas de PDF con pdf.js: reconstruye la cuadrícula a partir de las líneas/rectángulos
   vectoriales (equivalente a pdfplumber.extract_tables con la estrategia por defecto "lines"). */
(function (root) {
  'use strict';
  const CP = (root.CP = root.CP || {});
  const P = (CP.pdf = {});
  const lib = () => root.pdfjsLib;

  const mult = (a, b) => [
    a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
  ];
  const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

  P.setWorker = function (src) { if (lib() && lib().GlobalWorkerOptions) lib().GlobalWorkerOptions.workerSrc = src; };

  async function pageGeometry(page) {
    const vp = page.getViewport({ scale: 1 });
    const OPS = lib().OPS;
    const ol = await page.getOperatorList();
    const edges = [];
    let ctm = vp.transform.slice();
    const stack = [];
    let cur = []; // segmentos de la ruta actual
    const addSeg = (x1, y1, x2, y2) => {
      const dx = Math.abs(x1 - x2), dy = Math.abs(y1 - y2);
      if (dy < 1.5 && dx > 2) edges.push({ o: 'h', a: Math.min(x1, x2), b: Math.max(x1, x2), p: (y1 + y2) / 2 });
      else if (dx < 1.5 && dy > 2) edges.push({ o: 'v', a: Math.min(y1, y2), b: Math.max(y1, y2), p: (x1 + x2) / 2 });
    };
    const addRect = (x, y, w, h) => {
      const p1 = apply(ctm, x, y), p2 = apply(ctm, x + w, y + h);
      const x1 = Math.min(p1[0], p2[0]), x2 = Math.max(p1[0], p2[0]);
      const y1 = Math.min(p1[1], p2[1]), y2 = Math.max(p1[1], p2[1]);
      const W = x2 - x1, H = y2 - y1;
      if (W < 2 && H > 2) edges.push({ o: 'v', a: y1, b: y2, p: (x1 + x2) / 2 });
      else if (H < 2 && W > 2) edges.push({ o: 'h', a: x1, b: x2, p: (y1 + y2) / 2 });
      else if (W >= 2 && H >= 2) {
        edges.push({ o: 'h', a: x1, b: x2, p: y1 }, { o: 'h', a: x1, b: x2, p: y2 });
        edges.push({ o: 'v', a: y1, b: y2, p: x1 }, { o: 'v', a: y1, b: y2, p: x2 });
      }
    };
    for (let i = 0; i < ol.fnArray.length; i++) {
      const fn = ol.fnArray[i], args = ol.argsArray[i];
      if (fn === OPS.save) stack.push(ctm.slice());
      else if (fn === OPS.restore) { if (stack.length) ctm = stack.pop(); }
      else if (fn === OPS.transform) ctm = mult(ctm, args);
      else if (fn === OPS.constructPath) {
        const ops = args[0], c = args[1];
        let k = 0, last = null, start = null;
        for (const op of ops) {
          if (op === OPS.moveTo) { last = apply(ctm, c[k], c[k + 1]); start = last; k += 2; }
          else if (op === OPS.lineTo) { const p = apply(ctm, c[k], c[k + 1]); if (last) addSeg(last[0], last[1], p[0], p[1]); last = p; k += 2; }
          else if (op === OPS.curveTo) { last = apply(ctm, c[k + 4], c[k + 5]); k += 6; }
          else if (op === OPS.curveTo2 || op === OPS.curveTo3) { last = apply(ctm, c[k + 2], c[k + 3]); k += 4; }
          else if (op === OPS.rectangle) { addRect(c[k], c[k + 1], c[k + 2], c[k + 3]); k += 4; }
          else if (op === OPS.closePath) { if (last && start) addSeg(last[0], last[1], start[0], start[1]); last = start; }
        }
      }
    }
    const tc = await page.getTextContent();
    const items = [];
    for (const it of tc.items) {
      if (!it.str || !it.str.trim() && it.str !== ' ') { if (!it.str) continue; }
      const t = it.transform;
      const [vx, vy] = apply(vp.transform, t[4], t[5]);
      const h = Math.abs(it.height || Math.hypot(t[2], t[3]) || 8);
      items.push({ s: it.str, x: vx, y: vy, w: Math.abs(it.width || 0), h });
    }
    return { edges, items };
  }

  function dedupe(vals, tol) {
    vals = vals.slice().sort((a, b) => a - b);
    const out = [];
    for (const v of vals) {
      if (out.length && Math.abs(v - out[out.length - 1].s / out[out.length - 1].n) <= tol) { out[out.length - 1].s += v; out[out.length - 1].n++; }
      else out.push({ s: v, n: 1 });
    }
    return out.map((g) => g.s / g.n);
  }

  function components(edges) {
    const n = edges.length, parent = Array.from({ length: n }, (_, i) => i);
    const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
    const uni = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[a] = b; };
    const T = 3;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const e = edges[i], f = edges[j];
      let hit = false;
      if (e.o === f.o) hit = Math.abs(e.p - f.p) <= T && e.a <= f.b + T && f.a <= e.b + T;
      else {
        const h = e.o === 'h' ? e : f, v = e.o === 'h' ? f : e;
        hit = v.p >= h.a - T && v.p <= h.b + T && h.p >= v.a - T && h.p <= v.b + T;
      }
      if (hit) uni(i, j);
    }
    const groups = new Map();
    edges.forEach((e, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(e); });
    return [...groups.values()];
  }

  function textoDeItems(its) {
    if (!its.length) return '';
    its = its.slice().sort((a, b) => a.y - b.y || a.x - b.x);
    const lines = [];
    for (const it of its) {
      const ln = lines.find((l) => Math.abs(l.y - it.y) <= Math.max(2, it.h * 0.4));
      if (ln) ln.its.push(it); else lines.push({ y: it.y, its: [it] });
    }
    return lines.sort((a, b) => a.y - b.y).map((l) => {
      l.its.sort((a, b) => a.x - b.x);
      let out = '', prevEnd = null;
      for (const it of l.its) {
        if (prevEnd !== null && !out.endsWith(' ') && !it.s.startsWith(' ') && it.x - prevEnd > Math.max(1, it.h * 0.15)) out += ' ';
        out += it.s;
        prevEnd = it.x + it.w;
      }
      return out.replace(/\s+/g, ' ').trim();
    }).filter(Boolean).join('\n');
  }

  P.extract = async function (buf) {
    const data = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const doc = await lib().getDocument({ data: data.slice(), useSystemFonts: false, disableFontFace: true, isEvalSupported: false }).promise;
    const out = { pages: [], tables: [], lines: [] };
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const { edges, items } = await pageGeometry(page);
      out.pages.push(p);
      // líneas de texto (diagnóstico / respaldo)
      const lt = textoDeItems(items);
      lt.split('\n').forEach((l) => out.lines.push(l));
      for (const comp of components(edges)) {
        const xs = dedupe(comp.filter((e) => e.o === 'v').map((e) => e.p), 2.5);
        const ys = dedupe(comp.filter((e) => e.o === 'h').map((e) => e.p), 2.5);
        if (xs.length < 2 || ys.length < 2) continue;
        const rows = [];
        for (let r = 0; r < ys.length - 1; r++) {
          const row = [];
          for (let c = 0; c < xs.length - 1; c++) {
            const cell = items.filter((it) => {
              const cx = it.x + it.w / 2, cy = it.y - it.h * 0.3;
              return cx >= xs[c] - 1 && cx < xs[c + 1] + 1 && cy >= ys[r] - 1 && cy < ys[r + 1] + 1;
            });
            row.push(textoDeItems(cell));
          }
          rows.push(row);
        }
        if (rows.length) out.tables.push({ page: p, rows });
      }
      page.cleanup();
    }
    await doc.destroy();
    return out;
  };
})(typeof window !== 'undefined' ? window : globalThis);
