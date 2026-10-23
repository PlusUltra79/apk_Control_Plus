/* Herramientas 5 (Consolidador Semanal) y 6 (Consolidador Mensual) */
(function (root) {
  'use strict';
  const CP = (root.CP = root.CP || {});
  const U = CP.util, IO = CP.io;
  const T = (CP.consolidar = {});
  const COL_SEMANAL = ['Responsable', 'Reporte', 'Fecha', 'Hora', 'Eje', 'Sub Eje', 'Unidad', 'Cts', 'Tipo de reporte', 'Incidencias', 'Niveles', 'Descripción', 'Observación', 'Respuesta', 'Detalle'];
  const RENOMBRAR = { 'Número de reporte': 'Reporte', 'Sub‑eje': 'Sub Eje', 'Sub-eje': 'Sub Eje', Respuestas: 'Respuesta' };
  const ESPERADAS = ['Responsable', 'Reporte', 'Fecha', 'Eje', 'Unidad'];
  const vacio = (v) => v === null || v === undefined || (typeof v === 'string' && v === '') || (typeof v === 'number' && Number.isNaN(v));

  /* tabla = {cols:[...], rows:[[...]]} */
  function aTabla(rows) {
    const cols = rows[0].map((c) => (c === null || c === undefined ? '' : String(c)));
    const data = rows.slice(1).map((r) => cols.map((_, i) => (vacio(r[i]) ? null : r[i])));
    return { cols, rows: data };
  }
  function parseFecha(v) {
    if (v instanceof Date) return v;
    if (typeof v !== 'string') return null;
    const s = v.trim();
    let m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec(s);
    if (m) { const d = +m[1], mo = +m[2]; if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return new Date(Date.UTC(+m[3], mo - 1, d)); return null; }
    m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return null;
  }
  function fechaInferida(nombre) {
    let m = /(\d{4}-\d{2}-\d{2})/.exec(nombre);
    if (m) return m[1];
    m = /(\d{2})[-/](\d{2})[-/](\d{4})/.exec(nombre);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
  }
  function concatenar(tablas) {
    const cols = [];
    tablas.forEach((t) => t.cols.forEach((c) => { if (!cols.includes(c)) cols.push(c); }));
    const rows = [];
    tablas.forEach((t) => t.rows.forEach((r) => rows.push(cols.map((c) => { const i = t.cols.indexOf(c); return i === -1 ? null : r[i]; }))));
    return { cols, rows };
  }
  const claveFila = (r) => JSON.stringify(r.map((v) => (v === null ? null : v instanceof Date ? 'D' + v.toISOString() : typeof v + ':' + v)));
  function postProceso(t, log, semanal) {
    let rows = t.rows.filter((r) => r.some((v) => v !== null));
    const antes = rows.length, vistos = new Set(), unicas = [];
    for (const r of rows) { const k = claveFila(r); if (!vistos.has(k)) { vistos.add(k); unicas.push(r); } }
    rows = unicas;
    if (antes - rows.length) log(`  ℹ ${antes - rows.length} fila(s) duplicada(s) eliminada(s).`);
    const iF = t.cols.indexOf('Fecha');
    if (iF !== -1) {
      const keyed = rows.map((r, i) => [parseFecha(r[iF]), i, r]);
      keyed.sort((a, b) => { const A = a[0], B = b[0]; if (A === null && B === null) return a[1] - b[1]; if (A === null) return 1; if (B === null) return -1; return A - B || a[1] - b[1]; });
      rows = keyed.map((k) => k[2]);
    }
    let cols = t.cols.slice();
    if (semanal) {
      const iR = cols.indexOf('Reporte');
      if (iR !== -1) { rows.forEach((r, i) => (r[iR] = `N°${U.pad(i + 1, 3)}`)); log(`  ℹ Columna 'Reporte' renumerada del N°001 al N°${U.pad(rows.length, 3)}.`); }
    } else {
      cols.splice(1, 0, 'Reporte'); rows.forEach((r, i) => r.splice(1, 0, `N°${U.pad(i + 1, 3)}`));
      log(`  ℹ Columna 'Reporte' numerada del N°001 al N°${U.pad(rows.length, 3)}.`);
    }
    const pres = COL_SEMANAL.filter((c) => cols.includes(c)), extra = cols.filter((c) => !COL_SEMANAL.includes(c));
    const orden = pres.concat(extra).map((c) => cols.indexOf(c));
    const out = { cols: pres.concat(extra), rows: rows.map((r) => orden.map((i) => r[i])) };
    log(`  ✓ Total consolidado: ${out.rows.length} filas.`);
    return out;
  }

  /* archivos: [{name, buf}] */
  T.consolidarSemanal = function (archivos, log) {
    log = log || (() => {});
    const tablas = [];
    for (const a of archivos) {
      try {
        const sh = IO.readSheets(a.buf)[0];
        if (!sh || sh.rows.length < 2) { log(`  ⚠ ${a.name}: archivo vacío, se omite.`); continue; }
        const t = aTabla(sh.rows);
        t.cols = t.cols.map((c) => RENOMBRAR[c] || c);
        if (!t.cols.includes('Fecha')) {
          const f = fechaInferida(a.name);
          t.cols.push('Fecha'); t.rows.forEach((r) => r.push(f));
          log(f ? `  ℹ ${a.name}: Fecha inferida desde nombre → ${f}` : `  ⚠ ${a.name}: no se pudo inferir Fecha.`);
        }
        log(`  ✓ ${a.name}: ${t.rows.length} filas leídas.`);
        tablas.push(t);
      } catch (e) { log(`  ✗ ${a.name}: ERROR → ${e.message}`); }
    }
    if (!tablas.length) { log('✗ No se pudo leer ningún archivo.'); return null; }
    log(`\nUniendo ${tablas.length} archivo(s)...`);
    return postProceso(concatenar(tablas), log, true);
  };
  T.consolidarMensual = function (archivos, log) {
    log = log || (() => {});
    const tablas = [];
    for (const a of archivos) {
      try {
        const sheets = IO.readSheets(a.buf);
        let elegida = null;
        for (const sh of sheets) { if (!sh.rows.length) continue; const h = new Set(sh.rows[0].map((c) => (c === null ? '' : String(c)))); if (ESPERADAS.every((c) => h.has(c))) { elegida = sh; break; } }
        if (!elegida) { log(`  ✗ ${a.name}: no se encontró hoja con columnas de datos. Se omite.`); continue; }
        if (elegida.rows.length < 2) { log(`  ⚠ ${a.name}: hoja '${elegida.name}' vacía, se omite.`); continue; }
        const t = aTabla(elegida.rows);
        const iR = t.cols.indexOf('Reporte');
        if (iR !== -1) { t.cols.splice(iR, 1); t.rows.forEach((r) => r.splice(iR, 1)); }
        log(`  ✓ ${a.name} [hoja: '${elegida.name}']: ${t.rows.length} filas leídas.`);
        tablas.push(t);
      } catch (e) { log(`  ✗ ${a.name}: ERROR → ${e.message}`); }
    }
    if (!tablas.length) { log('✗ No se pudo leer ningún archivo.'); return null; }
    log(`\nUniendo ${tablas.length} archivo(s)...`);
    return postProceso(concatenar(tablas), log, false);
  };

  const csvCelda = (v) => { if (v === null || v === undefined) return ''; let s = v instanceof Date ? v.toISOString().slice(0, 19).replace('T', ' ') : String(v); if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"'; return s; };
  T.guardar = async function (t, tipo) {
    let ini = 'fecha', fin = 'fecha';
    const iF = t.cols.indexOf('Fecha');
    if (iF !== -1) {
      const f = t.rows.map((r) => parseFecha(r[iF])).filter(Boolean).sort((a, b) => a - b);
      if (f.length) { const fm = (d) => `${U.pad(d.getUTCDate(), 2)}-${U.pad(d.getUTCMonth() + 1, 2)}-${d.getUTCFullYear()}`; ini = fm(f[0]); fin = fm(f[f.length - 1]); }
    }
    const base = `Data_de_alertas_${tipo}_${ini}_hasta_${fin}`;
    const wb = new root.ExcelJS.Workbook(), ws = wb.addWorksheet('General');
    const thin = { style: 'thin' };
    t.cols.forEach((c, i) => { const ce = ws.getCell(1, i + 1); ce.value = c; ce.font = { bold: true }; ce.alignment = { horizontal: 'center', vertical: 'top' }; ce.border = { left: thin, right: thin, top: thin, bottom: thin }; });
    t.rows.forEach((r, ri) => r.forEach((v, ci) => { if (v !== null && v !== undefined) ws.getCell(ri + 2, ci + 1).value = v; }));
    t.cols.forEach((c, i) => (ws.getColumn(i + 1).width = Math.min(45, Math.max(10, String(c).length + 4))));
    const csv = '\ufeff' + [t.cols.map(csvCelda).join(',')].concat(t.rows.map((r) => r.map(csvCelda).join(','))).join('\n') + '\n';
    return { base, xlsx: await wb.xlsx.writeBuffer(), csv, total: t.rows.length };
  };
})(typeof window !== 'undefined' ? window : globalThis);
