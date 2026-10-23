/* Herramienta 3 — Últimas UT en Movimiento */
(function (root) {
  'use strict';
  const CP = (root.CP = root.CP || {});
  const U = CP.util, IO = CP.io;
  const T = (CP.ultimas = {});
  const D = () => root.CPDATA || {};
  const ORDEN_EJES = ['Am', 'Blv', 'Met', 'Ocm', 'Pz', 'Serv Cont', 'Serv Esp'];
  const FORZADAS = { 'R-036': 'Serv Esp' };
  const TOLERANCIA = 180;

  const normComparar = (t) => U.rstripChars(String(t).trim().toLowerCase().replace(/\s+/g, ' '), '.');
  let PATIO = null, RESG = null;
  function init() {
    if (PATIO) return;
    PATIO = new Set((D().UT_PATIO || []).concat(D().UT_PATIO_ANT || []).map(normComparar));
    RESG = {};
    Object.entries(D().UT_RESGUARDO || {}).forEach(([a, ds]) => { RESG[a.trim().toUpperCase()] = new Set(ds.map(normComparar)); });
  }
  T.esUbicacionPatio = function (ubic, alias) {
    init();
    const n = normComparar(ubic);
    if (PATIO.has(n)) return true;
    if (alias) { const s = RESG[String(alias).trim().toUpperCase()]; return s ? s.has(n) : false; }
    return false;
  };
  T.limpiarUbicacion = function (texto) {
    texto = String(texto).trim();
    if (!texto) return '';
    const seg = (p) => new RegExp('(?:^|\\.\\s*)' + p + '\\b', 'i');
    let m = seg('Parroquia').exec(texto);
    if (m) {
      const antes = texto.slice(0, m.index).trim();
      if (antes) return U.rstripChars(antes, '.').trim() + '.';
      const resto = texto.slice(m.index + m[0].length).trim();
      const m2 = /^\s*([^.]+)\./.exec(resto);
      if (m2) return m2[1].trim() + '.';
      return U.rstripChars(resto, '.').trim() + '.';
    }
    for (const p of ['Municipio', 'Estado', 'Venezuela']) {
      m = seg(p).exec(texto);
      if (m) { const antes = texto.slice(0, m.index).trim(); if (antes) return U.rstripChars(antes, '.').trim() + '.'; }
    }
    return U.rstripChars(texto, '.').trim() + '.';
  };
  T.parsearHoraManual = function (texto) {
    const limpio = String(texto).trim();
    let h12, min, pm;
    let m = /^(\d{1,2}):(\d{2})\s*([ap])\.?\s*m\.?$/i.exec(limpio);
    if (m) {
      h12 = parseInt(m[1], 10); min = parseInt(m[2], 10);
      if (!(h12 >= 1 && h12 <= 12 && min >= 0 && min <= 59)) throw new Error(`Formato de hora inválido: '${texto}'.`);
      pm = m[3].toLowerCase() === 'p';
    } else {
      const m2 = /^(\d{1,2}):(\d{2})$/.exec(limpio);
      if (!m2) throw new Error(`Formato de hora inválido: '${texto}'.\nUsa por ejemplo: 21:15  o  08:02 pm`);
      const h24 = parseInt(m2[1], 10); min = parseInt(m2[2], 10);
      if (!(h24 >= 0 && h24 <= 23 && min >= 0 && min <= 59)) throw new Error(`Formato de hora inválido: '${texto}'.`);
      pm = h24 >= 12; h12 = h24 % 12; if (h12 === 0) h12 = 12;
    }
    return `${U.pad(h12, 2)}:${U.pad(min, 2)} ${pm ? 'Pm' : 'Am'}`;
  };
  T.parsearDuracionSeg = function (texto) {
    texto = String(texto).trim();
    if (!texto) return null;
    const partes = [...texto.matchAll(/(\d+)\s*(d|h|m|s)/gi)];
    if (!partes.length) return null;
    const mul = { d: 86400, h: 3600, m: 60, s: 1 };
    return partes.reduce((a, p) => a + parseInt(p[1], 10) * mul[p[2].toLowerCase()], 0);
  };
  const UTC = (y, mo, d, h, mi, s) => new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  T.parsearFechaAbsoluta = function (texto) {
    texto = String(texto).trim();
    if (!texto) return null;
    let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2}):(\d{2}) ([AaPp][Mm])$/.exec(texto);
    if (m) { let h = parseInt(m[4], 10); if (h < 1 || h > 12) return null; h = (h % 12) + (m[7].toLowerCase() === 'pm' ? 12 : 0); return UTC(+m[3], +m[2], +m[1], h, +m[5], +m[6]); }
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2}):(\d{2})$/.exec(texto);
    if (m && +m[4] < 24) return UTC(+m[3], +m[2], +m[1], +m[4], +m[5], +m[6]);
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2}) ([AaPp][Mm])$/.exec(texto);
    if (m) { let h = parseInt(m[4], 10); if (h < 1 || h > 12) return null; h = (h % 12) + (m[6].toLowerCase() === 'pm' ? 12 : 0); return UTC(+m[3], +m[2], +m[1], h, +m[5], 0); }
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2})$/.exec(texto);
    if (m && +m[4] < 24) return UTC(+m[3], +m[2], +m[1], +m[4], +m[5], 0);
    return null;
  };
  const limpiarAlias = (r) => String(r).replace(/^ut\s*:\s*/i, '').trim();
  const normExcl = (alias) => {
    const a = limpiarAlias(alias).toUpperCase().replace(/ /g, '');
    let m = /^R-?(\d{1,3})$/.exec(a);
    if (m) return 'R-' + U.pad(parseInt(m[1], 10), 3);
    if (/^\d{1,4}$/.test(a)) return a.padStart(4, '0');
    return a;
  };
  function extraerEje(matricula, alias) {
    if (alias in FORZADAS) return FORZADAS[alias];
    const m = /^\s*(?:VIN|Vin|vin)\s*:\s*\S+\s+(.+?)\s*$/.exec(String(matricula).trim());
    if (!m) return null;
    const et = U.rstripChars(m[1].replace(/\s+/g, ' ').trim(), '.').toLowerCase();
    return (D().UT_SUBEJE_A_EJE || {})[et] || null;
  }
  function encontrarColumna(cols, cands) {
    const low = cols.map((c) => [c.trim().toLowerCase(), c]);
    for (const c of cands) { const f = low.find(([l]) => l === c.trim().toLowerCase()); if (f) return f[1]; }
    for (const c of cands) { const f = low.find(([l]) => l.includes(c.trim().toLowerCase())); if (f) return f[1]; }
    return null;
  }
  function textoPlano(node) {
    const out = [];
    (function walk(n) { n.childNodes.forEach((c) => { if (c.nodeType === 3) { const t = c.data.trim(); if (t) out.push(t); } else if (c.nodeType === 1 && !/^(script|style)$/i.test(c.nodeName)) walk(c); }); })(node);
    return out.join(' ');
  }

  /* Lee el "Reporte de Estatus Actual" (HTML disfrazado de .xls) -> {cols, filas:[{col:valor}], fechaGeneracion} */
  T.leerArchivo = function (buf) {
    const html = IO.decodeText(buf);
    const doc = new root.DOMParser().parseFromString(html, 'text/html');
    let enc = null, tabla = null;
    for (const t of doc.querySelectorAll('table')) {
      const trs = [...t.querySelectorAll('tr')].filter((tr) => tr.closest('table') === t);
      if (!trs.length) continue;
      const primera = [...trs[0].querySelectorAll('th,td')].map((c) => c.textContent.trim());
      if (primera.includes('Alias') && primera.includes('Ubicación')) { tabla = trs; enc = primera; break; }
    }
    if (!tabla) throw new Error("No se encontró la tabla de datos (se esperaban columnas 'Alias' y 'Ubicación'). ¿Es el archivo 'Reporte de Estatus Actual'?");
    const filas = [];
    for (const tr of tabla.slice(1)) {
      const tx = [...tr.querySelectorAll('td,th')].filter((c) => c.closest('tr') === tr).map((c) => c.textContent.trim());
      if (tx.length === enc.length) { const o = {}; enc.forEach((c, i) => (o[c] = tx[i])); filas.push(o); }
    }
    if (!filas.length) throw new Error('La tabla no tiene filas de datos.');
    const m = /Reporte de Estatus Actual\s*\(\s*([^)]+?)\s*\)/.exec(textoPlano(doc.body || doc));
    return { cols: enc, filas, fechaGeneracion: m ? T.parsearFechaAbsoluta(m[1]) : null };
  };

  T.generarReporte = function (df, horaTexto, log, excluir) {
    log = log || (() => {});
    const excl = excluir && excluir.size ? new Set([...excluir].map(normExcl)) : null;
    const horaDisplay = T.parsearHoraManual(horaTexto);
    const cols = df.cols;
    const cA = encontrarColumna(cols, ['Alias']), cM = encontrarColumna(cols, ['Matrícula', 'Matricula']), cU = encontrarColumna(cols, ['Ubicación', 'Ubicacion']);
    const cUlt = encontrarColumna(cols, ['Último Reporte', 'Ultimo Reporte']), cF = encontrarColumna(cols, ['Fecha']);
    const fg = df.fechaGeneracion || null;
    const usarAbs = cUlt === null && cF !== null && fg !== null;
    const falt = [['Alias', cA], ['Matrícula', cM], ['Ubicación', cU]].filter((x) => !x[1]).map((x) => x[0]);
    if (cUlt === null && !usarAbs) {
      falt.push(cF === null ? "Último Reporte (tampoco se encontró una columna 'Fecha' de respaldo)" : "Último Reporte (hay columna 'Fecha', pero no se pudo leer la hora de generación del reporte del encabezado del archivo para usarla de respaldo)");
    }
    if (falt.length) throw new Error(`Columnas no encontradas: ${falt.join(', ')}\nColumnas detectadas: ${cols.join(', ')}`);
    if (usarAbs) log("ℹ Este archivo no trae la columna 'Último Reporte' -- se calculó el tiempo transcurrido usando la columna 'Fecha' de cada unidad contra la hora de generación del reporte.");
    const grupos = {}; ORDEN_EJES.forEach((e) => (grupos[e] = []));
    const sinClas = new Set(); let enPatio = 0, exMan = 0;
    for (const fila of df.filas) {
      let seg;
      if (usarAbs) { const f = T.parsearFechaAbsoluta(fila[cF]); seg = f === null ? null : Math.max(0, Math.trunc((fg - f) / 1000)); }
      else seg = T.parsearDuracionSeg(fila[cUlt]);
      if (seg === null || seg >= TOLERANCIA) continue;
      const alias = limpiarAlias(fila[cA]);
      if (excl && excl.has(normExcl(alias))) { exMan++; continue; }
      const eje = extraerEje(fila[cM], alias);
      if (eje === null) { sinClas.add(String(fila[cM]).trim()); continue; }
      const ub = T.limpiarUbicacion(fila[cU]);
      if (T.esUbicacionPatio(ub, alias)) { enPatio++; continue; }
      grupos[eje].push(`${alias} ${ub}`.trim());
    }
    if (sinClas.size) log(`⚠ ${sinClas.size} etiqueta(s) de Matrícula sin clasificar (no están en la tabla Eje): ${[...sinClas].sort().join(', ')}`);
    if (enPatio) log(`ℹ ${enPatio} unidad(es) omitida(s) por estar en Patio o en su Punto de Resguardo.`);
    if (exMan) log(`ℹ ${exMan} unidad(es) omitida(s) por pedido explícito del usuario.`);
    return ORDEN_EJES.map((eje) => {
      const ED = eje.toUpperCase(), dist = '-'.repeat(16) + ED + '-'.repeat(16), us = grupos[eje];
      const msg = us.length
        ? [dist, '', `El Centro de Control de Operaciones informa que para la (${horaDisplay}) se visualizan las siguientes UT en movimiento:`].concat(us.map((t, i) => `${i + 1}. ${t}`)).join('\n')
        : `${dist}\n\nEl Centro de Control de Operaciones informa que para la (${horaDisplay}) no se visualizan UT en movimiento.`;
      return [ED, msg];
    });
  };
})(typeof window !== 'undefined' ? window : globalThis);
