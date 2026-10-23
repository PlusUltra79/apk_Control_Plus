/* Herramienta 7 — Actualizar Desconexión */
(function (root) {
  'use strict';
  const CP = (root.CP = root.CP || {});
  const U = CP.util, Disp = CP.disp;
  const T = (CP.desconexion = {});
  const OBVIAR = new Set((root.CPDATA && root.CPDATA.UNIDADES_A_OBVIAR) || []);
  const SIN_CHIP = new Set((root.CPDATA && root.CPDATA.UNIDADES_SIN_CHIP) || []);
  const COL = { RESP: 1, FECHA: 2, CORTE: 3, ULT: 4, EJE: 5, SUB: 6, UNI: 7, TIEMPO: 8, GPS: 9, STATUS: 10 };
  const FILA_INI = 2;
  const MAPA = Disp.MAPA_SUBEJE;

  const condicionGps = (a) => (SIN_CHIP.has(String(a).trim().toUpperCase()) ? 'Sin Chip' : 'Sin Transmitir');
  const utc = (y, mo, d, h, mi, s) => new Date(Date.UTC(y, mo - 1, d, h || 0, mi || 0, s || 0));

  T.normalizarAlias = function (raw) {
    raw = U.rstripChars(raw.trim(), '*').trim();
    const m = /\d+/.exec(raw);
    if (!m) return raw;
    return raw.toUpperCase().startsWith('R') ? `R-${m[0]}` : m[0];
  };
  T.mapearEjeSubeje = (sub) => (!sub ? [null, null] : MAPA[Disp.quitarTildes(sub)] || [null, null]);

  const PAT_UNIDAD = /^(?<alias>[A-Za-z]*[:\-]?\s*\d+)\*?\s*\(\s*[Vv][Ii][Nn]:\s*(?<vin>\d+)(?:\s+(?<sub>[^)]*))?\)$/;
  const PAT_FECHA = /HCR:(?<fecha>\d{2}\/\d{2}\/\d{4})\s+(?<hora>\d{1,2}:\d{2}:\d{2}\s*[AP]M)/i;

  T.parsearFechaPdf = function (fecha, hora) {
    const [d, mo, y] = fecha.split('/').map(Number);
    const m = /(\d{1,2}):(\d{2}):(\d{2})\s*([AP])M/i.exec(hora);
    let h = parseInt(m[1], 10) % 12;
    if (m[4].toUpperCase() === 'P') h += 12;
    return utc(y, mo, d, h, parseInt(m[2], 10), parseInt(m[3], 10));
  };

  T.leerPdf = async function (buf, log) {
    log = log || (() => {});
    const pdf = await CP.pdf.extract(buf);
    let registros = [], sinParsear = [];
    for (const tb of pdf.tables) {
      for (const fila of tb.rows) {
        if (!fila || !fila[0] || ['N°', ''].includes(fila[0].trim())) continue;
        if (fila.length < 3) continue;
        const tu = (fila[1] || '').replace(/\s+/g, ' ').trim();
        const tf = (fila[2] || '').replace(/\s+/g, ' ').trim();
        const mu = PAT_UNIDAD.exec(tu), mf = PAT_FECHA.exec(tf);
        if (!mu || !mf) { sinParsear.push(tu || tf); continue; }
        const alias = T.normalizarAlias(mu.groups.alias);
        const sub = mu.groups.sub;
        const [eje, subeje] = T.mapearEjeSubeje(sub);
        registros.push({ unidad: alias, vin: mu.groups.vin, subeje_raw: sub, eje, subeje, fecha_reporte: T.parsearFechaPdf(mf.groups.fecha, mf.groups.hora) });
      }
    }
    if (sinParsear.length) log(`⚠️  ${sinParsear.length} fila(s) del PDF no se pudieron interpretar y fueron omitidas.`);
    const antes = registros.length;
    registros = registros.filter((r) => !OBVIAR.has(r.unidad));
    if (antes - registros.length) log(`✔ ${antes - registros.length} unidad(es) del PDF omitidas por estar en UNIDADES_A_OBVIAR_DEL_PDF.`);
    log(`✔ PDF leído: ${registros.length} unidad(es) sin reportar encontradas.`);
    return registros;
  };

  /* ── tiempo de desconexión ── */
  function sumarMeses(f, n) {
    const mesTotal = f.getUTCMonth() + n;
    const anio = f.getUTCFullYear() + Math.floor(mesTotal / 12);
    const mes = ((mesTotal % 12) + 12) % 12;
    const diasMes = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
    return new Date(Date.UTC(anio, mes, Math.min(f.getUTCDate(), diasMes), f.getUTCHours(), f.getUTCMinutes(), f.getUTCSeconds()));
  }
  function mesesCompletos(ini, fin) {
    if (fin <= ini) return 0;
    let n = 0;
    while (sumarMeses(ini, n + 1) <= fin) n++;
    return n;
  }
  function desglose(fa, ut) {
    const dias = Math.floor((fa - ut) / 3600000 / 24);
    if (dias <= 31) return [dias, 0, 0];
    const meses = mesesCompletos(ut, fa);
    return [dias, meses, Math.floor(meses / 12)];
  }
  T.calcularTiempo = function (fa, ut) {
    const [dias, meses, anios] = desglose(fa, ut);
    if (dias <= 31) return dias === 1 ? `${dias} Día` : `${dias} Días`;
    if (meses < 12) return meses === 1 ? `${meses} Mes` : `${meses} Meses`;
    return anios === 1 ? `${anios} Año` : `${anios} Años`;
  };
  T.tiene24h = (fa, ut) => desglose(fa, ut)[0] >= 1;
  T.parsearFechaActual = function (texto) {
    const m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?\s*$/.exec(texto);
    if (!m) throw new Error('Fecha inválida. Usa DD/MM/AAAA o DD/MM/AAAA HH:MM');
    const [d, mo, y] = [+m[1], +m[2], +m[3]];
    if (m[4] === undefined) return utc(y, mo, d, 23, 59, 59);
    return utc(y, mo, d, +m[4], +m[5], m[6] ? +m[6] : 0);
  };

  const claveOrden = (f) => {
    const eje = Disp.quitarTildes(f.eje || ''), sub = Disp.quitarTildes(f.subeje || ''), uni = Disp.quitarTildes(String(f.unidad || ''));
    return [eje === '' ? 1 : 0, eje, sub === '' ? 1 : 0, sub, uni];
  };
  const cmp = (a, b) => { for (let i = 0; i < a.length; i++) { if (a[i] < b[i]) return -1; if (a[i] > b[i]) return 1; } return 0; };

  /* ── helpers ExcelJS ── */
  const clone = (o) => (o ? JSON.parse(JSON.stringify(o)) : o);
  const valor = (cell) => {
    let v = cell.value;
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      if ('result' in v) v = v.result;
      else if (v.richText) v = v.richText.map((r) => r.text).join('');
      else if ('text' in v) v = v.text;
    }
    return v === undefined ? null : v;
  };
  const capturar = (ws, fila, n) => { const o = []; for (let c = 1; c <= n; c++) { const ce = ws.getCell(fila, c); o.push({ font: clone(ce.font), fill: clone(ce.fill), border: clone(ce.border), alignment: clone(ce.alignment), numFmt: ce.numFmt || null }); } return o; };
  const aplicar = (ws, fila, est) => est.forEach((e, i) => { const ce = ws.getCell(fila, i + 1); if (e.font) ce.font = clone(e.font); if (e.fill) ce.fill = clone(e.fill); if (e.border) ce.border = clone(e.border); if (e.alignment) ce.alignment = clone(e.alignment); if (e.numFmt) ce.numFmt = e.numFmt; });

  function estiloBanda(hex) {
    const thin = { style: 'thin', color: { argb: 'FFD9D9D9' } };
    const out = [];
    for (let c = 1; c <= 10; c++) out.push({
      font: { size: 10 }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + hex } },
      border: { left: thin, right: thin, top: thin, bottom: thin }, alignment: { horizontal: 'center', vertical: 'center' },
      numFmt: c === COL.FECHA ? 'dd/mm/yyyy' : c === COL.ULT ? 'dd/mm/yyyy hh:mm:ss' : 'General',
    });
    return out;
  }
  function crearNuevo(log) {
    const wb = new root.ExcelJS.Workbook();
    const ws = wb.addWorksheet('Desconexion');
    const enc = { 1: 'Responsable', 2: 'Fecha', 3: 'Corte', 4: 'Ultima Transmision', 5: 'Eje', 6: 'Sub Eje', 7: 'Unidad', 8: 'Tiempo de Desconexion', 9: 'Condicion de GPS', 10: 'Status' };
    const thin = { style: 'thin', color: { argb: 'FFB0B0B0' } };
    for (const [c, t] of Object.entries(enc)) {
      const ce = ws.getCell(1, +c);
      ce.value = t;
      ce.font = { color: { argb: 'FFFFFFFF' }, bold: true, size: 11 };
      ce.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B3A6B' } };
      ce.alignment = { horizontal: 'center', vertical: 'center', wrapText: true };
      ce.border = { left: thin, right: thin, top: thin, bottom: thin };
      ws.getColumn(+c).width = 20;
    }
    ws.getRow(1).height = 28;
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    log('✔ Creado un Excel de Desconexión nuevo (sin plantilla previa).');
    return { wb, ws };
  }

  /* opts: {pdf:ArrayBuffer, excel:ArrayBuffer|null, fechaActual:Date(UTC), responsable, corte, statusDb, hoy:Date} */
  T.actualizar = async function (opts, log) {
    log = log || (() => {});
    const registros = await T.leerPdf(opts.pdf, log);
    const fa = opts.fechaActual;
    let wb, ws, nCols, filaMax, respG, corteG, estPar, estImpar;
    if (!opts.excel) {
      ({ wb, ws } = crearNuevo(log));
      nCols = 10; respG = opts.responsable || ''; corteG = opts.corte || '';
      estPar = estiloBanda('FFFFFF'); estImpar = estiloBanda('F2F2F2'); filaMax = 1;
    } else {
      wb = new root.ExcelJS.Workbook();
      await wb.xlsx.load(opts.excel);
      ws = wb.worksheets[0];
      log(`✔ Excel leído: hoja '${ws.name}' con ${Math.max(ws.rowCount - 1, 0)} fila(s) de datos.`);
      ws.getCell(1, COL.GPS).value = 'Condicion de GPS';
      nCols = Math.max(ws.columnCount, 10);
      filaMax = ws.rowCount;
      respG = valor(ws.getCell(FILA_INI, COL.RESP));
      corteG = valor(ws.getCell(FILA_INI, COL.CORTE));
      estPar = capturar(ws, FILA_INI, nCols);
      estImpar = capturar(ws, FILA_INI + 1, nCols);
    }
    let filas = [];
    if (opts.excel) {
      for (let r = FILA_INI; r <= filaMax; r++) {
        const u = valor(ws.getCell(r, COL.UNI));
        if (u === null || String(u).trim() === '') continue;
        let ult = valor(ws.getCell(r, COL.ULT));
        if (typeof ult === 'string') { try { ult = T.parsearFechaActual(ult); } catch (e) { ult = null; } }
        filas.push({ unidad: String(u).trim(), eje: valor(ws.getCell(r, COL.EJE)), subeje: valor(ws.getCell(r, COL.SUB)), ultima_tx: ult, cond_gps: valor(ws.getCell(r, COL.GPS)), status: valor(ws.getCell(r, COL.STATUS)) });
      }
    }
    const enPdf = new Set(registros.map((r) => r.unidad));
    let reconectadas = 0;
    if (filas.length) {
      const keep = [];
      for (const f of filas) { if (enPdf.has(f.unidad) || OBVIAR.has(f.unidad)) keep.push(f); else reconectadas++; }
      filas = keep;
    }
    let actualizadas = 0, agregadas = 0;
    for (const reg of registros) {
      const co = filas.filter((f) => f.unidad === reg.unidad);
      if (co.length) { for (const f of co) { f.ultima_tx = reg.fecha_reporte; actualizadas++; } }
      else { filas.push({ unidad: reg.unidad, eje: reg.eje, subeje: reg.subeje, ultima_tx: reg.fecha_reporte, cond_gps: null, status: null }); agregadas++; }
    }
    const finales = []; let excluidas = 0;
    for (const f of filas) {
      if (f.ultima_tx === null || f.ultima_tx === undefined) continue;
      if (!T.tiene24h(fa, f.ultima_tx)) { excluidas++; continue; }
      f.tiempo_desc = T.calcularTiempo(fa, f.ultima_tx);
      finales.push(f);
    }
    finales.sort((a, b) => cmp(claveOrden(a), claveOrden(b)));
    if (filaMax >= FILA_INI) ws.spliceRows(FILA_INI, filaMax - FILA_INI + 1);
    const fechaB = utc(fa.getUTCFullYear(), fa.getUTCMonth() + 1, fa.getUTCDate(), 0, 0, 0);
    let stAct = 0;
    finales.forEach((f, i) => {
      const fila = FILA_INI + i;
      aplicar(ws, fila, i % 2 === 0 ? estPar : estImpar);
      const sn = Disp.getStatusOSinReportar(opts.statusDb, f.unidad, f.eje, f.subeje);
      if (sn !== null) { f.status = sn; stAct++; }
      f.cond_gps = condicionGps(f.unidad);
      const set = (c, v) => {
        const ce = ws.getCell(fila, c);
        ce.value = v === undefined ? null : v;
        // openpyxl asigna un formato de fecha si la celda estaba en General; se replica con formato legible
        if (v instanceof Date && (!ce.numFmt || ce.numFmt === 'General')) ce.numFmt = c === COL.FECHA ? 'dd/mm/yyyy' : 'dd/mm/yyyy hh:mm:ss';
      };
      set(COL.RESP, respG); set(COL.FECHA, fechaB); set(COL.CORTE, corteG); set(COL.ULT, f.ultima_tx);
      set(COL.EJE, f.eje); set(COL.SUB, f.subeje); set(COL.UNI, f.unidad); set(COL.TIEMPO, f.tiempo_desc);
      set(COL.GPS, f.cond_gps); set(COL.STATUS, f.status);
    });
    log(`✔ Unidades actualizadas: ${actualizadas}`);
    log(`✔ Unidades nuevas agregadas: ${agregadas}`);
    log(`✔ Unidades removidas por ya no aparecer en el PDF (reconectadas): ${reconectadas}`);
    log(`✔ Unidades omitidas por tener menos de 24h de desconexión: ${excluidas}`);
    if (opts.statusDb) log(`✔ Unidades con Status actualizado desde el Excel de Disponibilidad: ${stAct}`);
    log(`✔ Total de filas en el archivo final: ${finales.length} (ordenadas alfabéticamente)`);
    const hoy = opts.hoy || new Date();
    const nombre = `Data_de_desconexion_${U.pad(hoy.getDate(), 2)}${U.pad(hoy.getMonth() + 1, 2)}${hoy.getFullYear()}.xlsx`;
    const buffer = await wb.xlsx.writeBuffer();
    return { buffer, nombre, total: finales.length };
  };
})(typeof window !== 'undefined' ? window : globalThis);
