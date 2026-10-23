/* Herramientas 2 (Sin Información, Top 5) y 4 (UT en Movimiento + Sin Información por Sub-eje) — reporte diario GTR */
(function (root) {
  'use strict';
  const CP = (root.CP = root.CP || {});
  const U = CP.util, IO = CP.io;
  const G = (CP.gtr = {});
  const ORDEN = ['AM', 'BLV', 'MET', 'OCM', 'PZ', 'SERV.'];
  const NOMBRE = { AM: 'Am', BLV: 'Blv', MET: 'Met', OCM: 'Ocm', PZ: 'Pz', 'SERV.': 'Serv' };
  const OCULTAR = new Set(['METRO', 'PLAZA ZAMORA']);
  const NORM_SUB = { NORTE: 'Norte', CENTRO: 'Centro', SUR: 'Sur', ACEVEDO: 'Acevedo', ACE: 'Acevedo', BRION: 'Brion', 'BRIÓN': 'Brion', BRI: 'Brion', BUROZ: 'Buroz', BUR: 'Buroz', PAEZ: 'Paez', 'PÁEZ': 'Paez', PA: 'Paez', 'PEDRO GUAL': 'Pedro Gual', PG: 'Pedro Gual', 'TUY I': 'Tuy I', 'TUY II': 'Tuy II', SUCRE: 'Sucre', ESP: 'Esp', 'ESP.': 'Esp', CONT: 'Cont', 'CONT.': 'Cont' };
  const TOP_N = 5, UMBRAL_KM = 1.0;
  const fmt2 = (x) => {
    if (Math.abs(x * 8 - Math.round(x * 8)) < 1e-9 && Math.round(x * 1000) % 10 === 5) { const f = Math.floor(x * 100); return ((f % 2 === 0 ? f : f + 1) / 100).toFixed(2); }
    return x.toFixed(2);
  };
  const clean = (s) => String(s).replace(/^ut:\s*/i, '').trim();

  function textoCelda(c) { const out = []; (function w(n) { n.childNodes.forEach((x) => { if (x.nodeType === 3) { const t = x.data.trim(); if (t) out.push(t); } else if (x.nodeType === 1) w(x); }); })(c); return out.join(''); }

  /* HTML (o Excel) -> {cols, filas:[{col:valor}]} usando la 1ª fila que tenga 'Flota' y 'Alias' */
  G.leerArchivo = function (buf) {
    let matriz;
    if (IO.esHtml(buf)) {
      const doc = new root.DOMParser().parseFromString(IO.decodeText(buf), 'text/html');
      const tabla = doc.querySelector('table');
      if (!tabla) throw new Error('No se encontró ninguna tabla en el archivo.');
      matriz = [...tabla.querySelectorAll('tr')].map((tr) => [...tr.querySelectorAll('th,td')].filter((c) => c.closest('tr') === tr).map(textoCelda));
    } else {
      const sh = IO.readSheets(buf);
      matriz = sh.length ? sh[0].rows.map((r) => r.map((v) => (v === null || v === undefined ? '' : String(v).trim()))) : [];
    }
    let enc = null; const datos = [];
    for (const textos of matriz) {
      if (enc === null) { if (textos.includes('Flota') && textos.includes('Alias')) enc = textos; }
      else if (textos.length === enc.length) datos.push(textos);
    }
    if (enc === null) throw new Error('No se encontró la fila de encabezados.');
    return { cols: enc, filas: datos.map((t) => { const o = {}; enc.forEach((c, i) => (o[c] = t[i])); return o; }) };
  };
  function encontrar(cols, cands) {
    const low = cols.map((c) => [c.trim().toLowerCase(), c]);
    for (const c of cands) { const f = low.find(([l]) => l === c.trim().toLowerCase()); if (f) return f[1]; }
    for (const c of cands) { const f = low.find(([l]) => l.includes(c.trim().toLowerCase())); if (f) return f[1]; }
    return null;
  }
  function preparar(df, umbral) {
    const cF = encontrar(df.cols, ['Flota']), cS = encontrar(df.cols, ['Sub Flota', 'Sub-Flota', 'SubFlota']), cA = encontrar(df.cols, ['Alias']);
    const cD = encontrar(df.cols, ['Distancia Recorrida (Km)', 'Distancia Recorrida', 'distancia recorrida (km)', 'Distancia']);
    const falt = [['Flota', cF], ['Sub Flota', cS], ['Alias', cA], ['Distancia Recorrida (Km)', cD]].filter((x) => !x[1]).map((x) => x[0]);
    if (falt.length) throw new Error(`Columnas no encontradas: ${falt.join(', ')}\nColumnas detectadas: ${df.cols.join(', ')}`);
    const filas = df.filas.map((f) => {
      const n = Number(String(f[cD]).replace(/,/g, '.').trim());
      return { raw: f, flota: String(f[cF]).trim().toUpperCase(), sub: String(f[cS]).trim().toUpperCase(), subRaw: String(f[cS]).trim(), alias: f[cA], dist: String(f[cD]).trim() === '' || Number.isNaN(n) ? 0 : n };
    }).filter((f) => ORDEN.includes(f.flota) && f.dist > umbral);
    return filas;
  }

  /* Herramienta 2 -> [[eje, [mensajes]]] */
  G.sinInformacion = function (df) {
    const filas = preparar(df, 0), res = [];
    for (const fk of ORDEN) {
      const nombre = NOMBRE[fk], grupo = filas.filter((f) => f.flota === fk);
      const subs = [...new Set(grupo.map((f) => f.sub))].sort();
      const msgs = [];
      for (const su of subs) {
        const top = grupo.filter((f) => f.sub === su).map((f, i) => [f, i]).sort((a, b) => b[0].dist - a[0].dist || a[1] - b[1]).slice(0, TOP_N).map((x) => x[0]);
        for (const f of top) {
          const alias = clean(String(f.alias).trim()), vin = U.getVin(alias);
          const disp = Object.prototype.hasOwnProperty.call(NORM_SUB, su) ? NORM_SUB[su] : U.title(f.subRaw);
          const linea = OCULTAR.has(su) ? `• Eje *${nombre}*` : fk === 'SERV.' ? `• Eje *${nombre}* *${disp}:*` : `• Eje *${nombre}* Sub-eje *${disp}*`;
          msgs.push(`Buenos Días\n${linea}\n• Unidad *${alias}* - Vin *${vin}*\n• CTS: *S.I*\n\n*Incidencia:* Sin información\n*Observación:* No se ha recibido reporte de disponibilidad *(${fmt2(f.dist)}km recorridos).*`);
        }
      }
      res.push([nombre, msgs]);
    }
    return res;
  };

  /* Herramienta 4 */
  G.reportePorEje = function (df, hora) {
    const filas = preparar(df, UMBRAL_KM);
    const secs = []; let total = 0;
    for (const fk of ORDEN) {
      const lineas = [`*${NOMBRE[fk]}*`]; let c = 0;
      for (const f of filas.filter((x) => x.flota === fk)) { c++; lineas.push(`${c}. ${clean(f.alias)}`); }
      lineas.push(`* Total: ${c}`); secs.push(lineas.join('\n')); total += c;
    }
    return `*UT en movimiento para la hora: ${hora}*\n\n${secs.join('\n\n')}\n\n* Total General: ${total}`;
  };
  G.reportesSubeje = function (df, hora) {
    const filas = preparar(df, UMBRAL_KM), res = [];
    for (const fk of ORDEN) {
      const grupo = filas.filter((f) => f.flota === fk);
      const subs = [...new Set(grupo.map((f) => f.sub))].sort();
      const bloques = []; let total = 0;
      for (const su of subs) {
        const g = grupo.filter((f) => f.sub === su);
        const raw = String(g[0].subRaw).trim();
        const lineas = [raw ? U.title(raw) : 'S/E']; let c = 0;
        for (const f of g) { c++; lineas.push(`${c}. ${clean(f.alias)}`); }
        bloques.push(lineas.join('\n')); total += c;
      }
      const header = `UT en movimiento para la hora: ${hora}\nSin información`;
      res.push([NOMBRE[fk], bloques.length ? `${header}\n${bloques.join('\n')}\n* Total: ${total}` : `${header}\n* Total: ${total}`]);
    }
    return res;
  };
})(typeof window !== 'undefined' ? window : globalThis);
