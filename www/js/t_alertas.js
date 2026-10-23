/* Herramienta 8 — Data Alertas (texto → Excel) */
(function (root) {
  'use strict';
  const CP = (root.CP = root.CP || {});
  const U = CP.util;
  const T = (CP.alertas = {});

  const COLUMNS = ['Responsable', 'Número de reporte', 'Fecha', 'Hora', 'Eje', 'Sub‑eje', 'Unidad', 'Cts', 'Tipo de reporte', 'Incidencias', 'Niveles', 'Descripción', 'Observación', 'Respuestas', 'Detalle'];
  T.COLUMNS = COLUMNS;
  const VALID_INCIDENCIAS = {
    'exceso de velocidad': 'Exceso de velocidad', 'excesos de velocidad': 'Exceso de velocidad', 'fuera de ruta': 'Fuera de ruta', 'fueras de ruta': 'Fuera de ruta',
    'ruta no atendida': 'Ruta no atendida', 'rutas no atendidas': 'Ruta no atendida', 'movimiento no reportado': 'Movimiento no reportado', 'movimientos no reportados': 'Movimiento no reportado',
    'sin informacion': 'Sin informacion', 'sin información': 'Sin informacion', 'recorrido omitido': 'Recorrido omitido', 'recorridos omitidos': 'Recorrido omitido',
    'falla en gps': 'Falla en Gps', paradas: 'Paradas', 'ubicación': 'Ubicación', ubicacion: 'Ubicación', 'desconexión de batería': 'Desconexión de Batería', 'desconexion de bateria': 'Desconexión de Batería',
  };
  const DISPLAY_INCIDENCIAS = { 'Exceso de velocidad': 'Ex. de velocidad', 'Movimiento no reportado': 'Mov. NR', 'Fuera de ruta': 'Fuera de ruta', 'Recorrido omitido': 'Recorrido omitido', 'Ruta no atendida': 'Ruta no atendida' };
  const EJE_MAP = { am: 'Am', Am: 'Am', AM: 'Am', ocm: 'Ocm', Ocm: 'Ocm', OCM: 'Ocm', blv: 'Blv', Blv: 'Blv', BLV: 'Blv', pz: 'Pz', Pz: 'Pz', PZ: 'Pz', met: 'Met', Met: 'Met', MET: 'Met', serv: 'Serv.', 'serv.': 'Serv.', 'Serv.': 'Serv.', Serv: 'Serv.', SERV: 'Serv.' };
  const SUBEJE_MAP = {
    norte: 'Norte', sur: 'Sur', centro: 'Centro', acevedo: 'Acevedo', brion: 'Brión', 'brión': 'Brión', buroz: 'Buroz', 'pedro gual': 'Pedro Gual',
    paez: 'Páez Andrés Bello', 'páez': 'Páez Andrés Bello', 'paez andres bello': 'Páez Andrés Bello', 'páez andrés bello': 'Páez Andrés Bello', 'páez andres bello': 'Páez Andrés Bello', 'paez andrés bello': 'Páez Andrés Bello',
    met: 'Met', sucre: 'Met', 'plaza sucre': 'Met', suc: 'Met', 'suc.': 'Met', 'tuy i': 'Tuy I', 'tuy 1': 'Tuy I', 'tuy ii': 'Tuy II', 'tuy 2': 'Tuy II', 'plaza zamora': 'Plaza Zamora',
    esp: 'Esp.', 'esp.': 'Esp.', especial: 'Esp.', espc: 'Esp.', 'espc.': 'Esp.', cont: 'Cont.', 'cont.': 'Cont.',
  };
  const SUBEJE_DEFAULT = { Met: 'Met', Pz: 'Plaza Zamora' };
  const RESPONSABLES = ['Maikel Moussa', 'Leonardo Moreno', 'Oriana Moreno', 'Francys Mendoza', 'Francelys Mendoza', 'Jhona Ojeda', 'Lonnell Tovar', 'Nickolth Amarista', 'Adriana Gudiño', 'Natalia Ruza', 'Wilmer Rodríguez', 'María Echenique', 'María Dominguez', 'Hendry Valera'];
  T.RESPONSABLES = RESPONSABLES;
  const UMBRAL = 0.55, MARGEN = 0.04;

  const score = (a, b) => {
    if (a === b) return 1.0;
    if (a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a))) return 0.85;
    return U.ratio(a, b);
  };
  T.normalizarResponsable = function (raw) {
    if (!raw || !raw.trim()) return '-';
    let limpio = raw.replace(/["“”'‘’].*?["“”'‘’]/g, ' ');
    limpio = limpio.replace(/\d+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!limpio) limpio = raw.trim();
    const cand = U.sinAcentos(limpio).toLowerCase();
    const pun = [];
    for (const nombre of RESPONSABLES) {
      const obj = U.sinAcentos(nombre).toLowerCase();
      const partes = obj.split(/\s+/);
      const mejor = Math.max(...partes.concat([obj]).map((p) => score(cand, p)));
      pun.push([nombre, mejor]);
    }
    pun.sort((x, y) => y[1] - x[1]);
    const [mn, ms] = pun[0];
    if (ms < UMBRAL) return '-';
    for (const [n, s] of pun.slice(1)) if (n !== mn && ms - s < MARGEN) return '-';
    return mn;
  };
  T.limpiarTextoWhatsapp = (t) => t.replace(/[\u200b\u200c\u200d\u200e\u200f\u202a\u202b\u202c\u202d\u202e\u2060\u2066\u2067\u2068\u2069\ufeff]/g, '');

  const REPORT_START = /^\s*\[?\s*\d{1,2}:\d{2}(?::\d{2})?\s*(?:a\.\s*m\.|p\.\s*m\.|am|pm|a\.m\.|p\.m\.)/gim;
  T.RE_SALUDO = /^[ \t]*>?[ \t]*\*?[ \t]*Buen(?:[oa]s[ \t]+(?:d[ií]as|tardes|noches)|[ \t]+d[ií]a)\b/gim;
  const RE_EJE_VINETA = /^[ \t]*[*\-•][ \t]*\*?[ \t]*Eje\b/gim;
  const RE_CUERPO = /Incidencia|Validaci[oó]n\s*Parada|Observaci[oó]n|Incumplimiento/i;
  const positions = (re, text) => { re.lastIndex = 0; const o = []; let m; while ((m = re.exec(text))) { o.push(m.index); if (m[0].length === 0) re.lastIndex++; } return o; };

  function subdividir(block) {
    const cands = [...new Set(positions(T.RE_SALUDO, block).concat(positions(RE_EJE_VINETA, block)))].sort((a, b) => a - b);
    if (!cands.length) return [block];
    const partes = []; let inicio = 0;
    for (const pos of cands) {
      if (pos <= inicio) continue;
      if (RE_CUERPO.test(block.slice(inicio, pos))) { partes.push(block.slice(inicio, pos)); inicio = pos; }
    }
    partes.push(block.slice(inicio));
    return partes.filter((p) => p.trim());
  }
  function splitBlocks(text) {
    const starts = positions(REPORT_START, text);
    let bloques;
    if (!starts.length) bloques = [text];
    else bloques = starts.map((s, i) => text.slice(s, i + 1 < starts.length ? starts[i + 1] : text.length));
    const res = [];
    for (const b of bloques) res.push(...subdividir(b));
    return res;
  }
  function extraerRespHeader(block) {
    const lineas = block.split(/\r?\n/);
    const primera = lineas.length ? lineas[0] : '';
    let m = /\]\s*(.+?)\s*:\s*>/.exec(primera) || /\]\s*([A-Za-zÁÉÍÓÚáéíóúÑñ][A-Za-zÁÉÍÓÚáéíóúÑñ\s.]*?)\s*:/.exec(primera);
    if (!m) return '';
    const cand = m[1].trim();
    if (/^buen[ao]s?\b/i.test(cand)) return '';
    return T.normalizarResponsable(cand);
  }
  function normTime(ts, ampm) {
    const clean = ampm.replace(/[.\s]/gu, '').toUpperCase();
    const parts = ts.split(':');
    let h = parseInt(parts[0], 10) % 12; if (h === 0) h = 12;
    const m = parts.length > 1 ? parseInt(parts[1], 10) : 0;
    return `${U.pad(h, 2)}:${U.pad(m, 2)} ${clean === 'AM' ? 'AM' : 'PM'}`;
  }
  function normDate(s) {
    const p = s.split(/[/\-]/);
    if (p.length === 3) { let [d, mo, y] = p; if (y.length === 2) y = '20' + y; return `${U.pad(parseInt(d, 10), 2)}/${U.pad(parseInt(mo, 10), 2)}/${y}`; }
    return s;
  }
  function normEje(raw) {
    const key = U.rstripChars(raw.trim().toLowerCase(), '.');
    for (const [k, v] of Object.entries(EJE_MAP)) if (k.toLowerCase() === key || k.toLowerCase() === key + '.') return v;
    return raw;
  }
  function normSubeje(raw) {
    const key = U.rstripChars(raw.trim().toLowerCase(), '.');
    return Object.prototype.hasOwnProperty.call(SUBEJE_MAP, key) ? SUBEJE_MAP[key] : raw;
  }
  function normIncidencia(raw) {
    const key = U.rstripChars(raw.trim(), '.').trim().toLowerCase();
    if (key in VALID_INCIDENCIAS) return VALID_INCIDENCIAS[key];
    for (const [k, v] of Object.entries(VALID_INCIDENCIAS)) if (key.includes(k) || k.includes(key)) return v;
    return U.rstripChars(raw.trim(), '.').trim();
  }
  const formatoFinal = (c) => { const t = U.rstripChars(c.trim(), '.').trim(); return DISPLAY_INCIDENCIAS[t] || t; };
  const extractSpeed = (t) => { const m = /(\d+)\s*km\/h/i.exec(t); return m ? `${m[1]} km/h` : ''; };
  const extractVia = (t) => { t = t.toLowerCase(); if (t.includes('autopista')) return 'Autopista'; if (t.includes('carretera')) return 'Carretera'; if (t.includes('avenida') || t.includes('av.')) return 'Avenida'; return 'Autopista'; };
  function reglas(inc, ruta, obs) {
    const i = inc.toLowerCase();
    if (i.includes('exceso de velocidad')) { const sp = extractSpeed(obs); return [sp || obs, extractVia(obs)]; }
    if (i.includes('fuera de ruta')) {
      let o = '';
      if (obs) o = /con recorrido|hacia/i.test(obs) ? obs : /visualiza|se encuentra/i.test(obs) ? obs : `Con recorrido hacia ${obs}`;
      return [ruta, o];
    }
    if (i.includes('ruta no atendida')) return [ruta, /sin inicio/i.test(obs) ? 'Sin inicio de operaciones' : 'Ruta no atendida'];
    if (i.includes('recorrido omitido')) {
      let o = '';
      if (obs) o = /sin recorrido/i.test(obs) ? obs : `Sin recorrido hacia ${obs}`;
      return [ruta, o];
    }
    if (i.includes('movimiento no reportado')) return [/reserva/i.test(obs) ? 'Reserva en movimiento' : 'Falla en movimiento', obs];
    if (i.includes('sin informacion') || i.includes('sin información')) return [obs, obs];
    if (i.includes('falla en gps')) {
      if (/salto/i.test(obs)) return ['Salto de ubicación', obs];
      if (/recorrido/i.test(obs)) return ['Recorrido', 'Sin registro de recorrido'];
      return ['Desconexión', obs];
    }
    return [obs, obs];
  }
  function nivel(inc, desc) {
    if (!inc.toLowerCase().includes('exceso de velocidad')) return '-';
    const m = /(\d+)/.exec(desc); if (!m) return '-';
    const s = parseInt(m[1], 10);
    if (s >= 87 && s <= 90) return '1';
    if (s >= 91 && s <= 100) return '2';
    if (s >= 101) return '3';
    return '-';
  }
  const g1 = (re, text) => { const m = re.exec(text); return m ? m[1] : null; };

  function parseBlock(text, responsable) {
    const rec = {}; COLUMNS.forEach((c) => (rec[c] = ''));
    rec['Respuestas'] = 'No'; rec['Detalle'] = ''; rec['Responsable'] = responsable || '';
    text = text.replace(/\*/g, '');
    if (!rec['Responsable']) rec['Responsable'] = extractRespPublic(text);
    let m = /\[?\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*(a\.\s*m\.|p\.\s*m\.|AM|PM|a\.m\.|p\.m\.)/i.exec(text);
    if (m) rec['Hora'] = normTime(m[1], m[2]);
    else { const m2 = /\[?\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*(am|pm)/i.exec(text); if (m2) rec['Hora'] = normTime(m2[1], m2[2]); }
    m = /(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})/.exec(text);
    if (m) rec['Fecha'] = normDate(m[0]);
    m = /\bEje\s*:\s*(.+)/i.exec(text);
    if (m) rec['Eje'] = normEje(U.rstripChars(m[1].trim(), ',;'));
    else { m = /\bEje\s+([A-Za-zÁÉÍÓÚáéíóúÑñ.]+)/i.exec(text); if (m) rec['Eje'] = normEje(U.rstripChars(m[1].trim(), ',;.')); }
    m = /Sub[\-\s]?eje\s*:\s*(.+)/i.exec(text);
    if (m) rec['Sub‑eje'] = normSubeje(U.rstripChars(m[1].trim(), ',;'));
    else {
      m = /Sub[\-\s]?[Ee]je\s+([^\n]+)/i.exec(text);
      rec['Sub‑eje'] = m ? normSubeje(U.rstripChars(m[1].trim(), ',;.')) : '';
    }
    if (!rec['Sub‑eje']) rec['Sub‑eje'] = SUBEJE_DEFAULT[rec['Eje']] || '';
    m = /Unidad\s*:\s*(.+)/i.exec(text);
    if (m) rec['Unidad'] = U.rstripChars(m[1].trim(), ']').trim();
    else { m = /\bUnidad\s+(\S+)/i.exec(text); rec['Unidad'] = m ? U.rstripChars(m[1].trim(), ',;.') : ''; }
    m = /\bCts\s*:\s*(.+)/i.exec(text);
    rec['Cts'] = m ? U.rstripChars(m[1].trim(), ']').trim() : '';

    if (/Validaci[oó]n\s*Parada/i.test(text)) {
      rec['Tipo de reporte'] = 'Validacion'; rec['Incidencias'] = 'Parada'; rec['Niveles'] = '-';
      const mr = /\bRutas?\s*:\s*(.+)/i.exec(text);
      rec['Descripción'] = mr ? U.rstripChars(mr[1].trim(), ']').trim() : '';
      const mu = /Ubicaci[oó]n\s+de\s+Parada\s*:\s*([\s\S]+?)(?:\n\s*¿|$)/i.exec(text);
      rec['Observación'] = mu ? mu[1].replace(/\s+/g, ' ').trim() : '';
      return rec;
    }
    rec['Tipo de reporte'] = 'Incidencia';
    m = /Incidencia\s*:\s*(.+)/i.exec(text);
    const rawInc = m ? U.rstripChars(m[1].trim(), ']').trim() : '';
    rec['Incidencias'] = normIncidencia(rawInc);
    m = /\bRutas?\s*:\s*(.+)/i.exec(text);
    const ruta = m ? U.rstripChars(m[1].trim(), ']').trim() : '';
    m = /Observaci[oó]n\s*:\s*(.+)/i.exec(text);
    let obs = m ? U.rstripChars(m[1].trim(), ']').trim() : '';
    if (!obs) { const mi = /Incumplimiento\s*:?\s*(.+)/i.exec(text); if (mi) obs = U.rstripChars(mi[1].trim(), ']').trim(); }
    [rec['Descripción'], rec['Observación']] = reglas(rec['Incidencias'], ruta, obs);
    rec['Niveles'] = nivel(rec['Incidencias'], rec['Descripción']);
    rec['Incidencias'] = formatoFinal(rec['Incidencias']);
    return rec;
  }
  const extractRespPublic = extraerRespHeader;

  T.parseReports = function (raw) {
    const records = [];
    raw = T.limpiarTextoWhatsapp(raw);
    const secciones = raw.trim().split(/(?=^\s*Responsable\s*:)/im);
    for (let sec of secciones) {
      sec = sec.trim();
      if (!sec) continue;
      let current = '';
      const mr = /^Responsable\s*:\s*(.+)/i.exec(sec);
      if (mr) { current = T.normalizarResponsable(mr[1].trim()); sec = sec.slice(mr[0].length).trim(); }
      for (let block of splitBlocks(sec)) {
        block = block.trim();
        if (!block) continue;
        const cand = extraerRespHeader(block);
        if (cand) current = cand;
        const r = parseBlock(block, current);
        if (r) records.push(r);
      }
    }
    return records;
  };

  /* ── Excel ── */
  const timeKey = (h) => {
    if (!h) return [1, 86399];
    const t = String(h).trim();
    let m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp])\.?\s*[Mm]\.?$/.exec(t);
    if (m) { let hh = parseInt(m[1], 10) % 12; if (m[4].toUpperCase() === 'P') hh += 12; if (hh < 24 && +m[2] < 60) return [0, hh * 3600 + +m[2] * 60 + (+m[3] || 0)]; }
    m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(t);
    if (m && +m[2] < 60) return [0, (parseInt(m[1], 10) % 24) * 3600 + +m[2] * 60 + (+m[3] || 0)];
    return [1, 86399];
  };
  const dateKey = (f) => {
    if (!f) return [9999, 12, 31];
    try { const p = String(f).trim().split(/[/\-]/); if (p.length !== 3) throw 0; const k = [parseInt(p[2], 10), parseInt(p[1], 10), parseInt(p[0], 10)]; if (k.some(Number.isNaN)) throw 0; return k; } catch (e) { return [9999, 12, 31]; }
  };
  const cmp = (a, b) => { for (let i = 0; i < a.length; i++) { if (a[i] < b[i]) return -1; if (a[i] > b[i]) return 1; } return 0; };
  const cellVal = (v) => {
    if (v && typeof v === 'object' && !(v instanceof Date)) { if ('result' in v) return v.result; if (v.richText) return v.richText.map((r) => r.text).join(''); if ('text' in v) return v.text; }
    if (v instanceof Date) return `${U.pad(v.getUTCDate(), 2)}/${U.pad(v.getUTCMonth() + 1, 2)}/${v.getUTCFullYear()}`;
    return v === undefined ? null : v;
  };
  async function cargarExistente(buf) {
    const rows = []; let last = 0;
    try {
      const wb = new root.ExcelJS.Workbook(); await wb.xlsx.load(buf);
      const ws = wb.getWorksheet('Data Alertas');
      if (!ws) return { rows, last };
      ws.eachRow({ includeEmpty: false }, (row, n) => {
        if (n < 2) return;
        const r = []; for (let c = 1; c <= 15; c++) r.push(cellVal(row.getCell(c).value));
        if (r.some((v) => v !== null && v !== '')) {
          rows.push(r);
          if (r[1]) { const m = /\d+/.exec(String(r[1])); if (m) last = Math.max(last, parseInt(m[0], 10)); }
        }
      });
    } catch (e) { /* igual que Python: archivo ilegible -> se ignora */ }
    return { rows, last };
  }
  T.buildExcel = async function (records, existingBuf) {
    let { rows: all, last } = existingBuf ? await cargarExistente(existingBuf) : { rows: [], last: 0 };
    all = all.slice();
    for (const rec of records) {
      last++;
      all.push([rec['Responsable'] || '', `N°${U.pad(last, 3)}`, rec['Fecha'] || '', rec['Hora'] || '', rec['Eje'] || '', rec['Sub‑eje'] || null, rec['Unidad'] || '', rec['Cts'] || null, rec['Tipo de reporte'] || 'Incidencia', rec['Incidencias'] || '', rec['Niveles'] || '-', rec['Descripción'] || '', rec['Observación'] || '', rec['Respuestas'] || 'NO', rec['Detalle'] || null]);
    }
    all.sort((a, b) => cmp(dateKey(a[2]), dateKey(b[2])) || cmp(timeKey(a[3]), timeKey(b[3])));
    all.forEach((r, i) => (r[1] = `N°${U.pad(i + 1, 3)}`));
    const wb = new root.ExcelJS.Workbook();
    const ws = wb.addWorksheet('Data Alertas');
    const thin = { style: 'thin', color: { argb: 'FFBFBFBF' } };
    const border = { left: thin, right: thin, top: thin, bottom: thin };
    const center = { horizontal: 'center', vertical: 'middle', wrapText: true };
    ws.getRow(1).height = 20;
    COLUMNS.forEach((name, i) => {
      const c = ws.getCell(1, i + 1);
      c.value = name; c.font = { name: 'Calibri', size: 11, bold: false, italic: false, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } }; c.alignment = center; c.border = border;
    });
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUMNS.length } };
    all.forEach((rd, idx) => {
      const rowIdx = idx + 2; const dataRow = rowIdx - 1;
      ws.getRow(rowIdx).height = 15;
      const fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: dataRow % 2 === 1 ? 'FFFFFFFF' : 'FFF2F2F2' } };
      rd.forEach((v, ci) => {
        const c = ws.getCell(rowIdx, ci + 1);
        c.value = v === undefined ? null : v;
        c.fill = fill; c.font = { name: 'Calibri', size: 11, bold: false, italic: false, color: { argb: 'FF000000' } }; c.alignment = center; c.border = border;
      });
    });
    const W = { 1: 14, 2: 14, 3: 14, 4: 14, 5: 8, 6: 18, 7: 10, 8: 15, 9: 14, 10: 22, 11: 10, 12: 30, 13: 45, 14: 12, 15: 18 };
    for (const [c, w] of Object.entries(W)) ws.getColumn(+c).width = w;
    return { buffer: await wb.xlsx.writeBuffer(), total: all.length, nombre: 'Data_Alertas_output.xlsx' };
  };

  /* resumen de detección (igual que el bot) */
  T.resumenDeteccion = function (raw, records) {
    const n = records.length;
    const lineas = [`✅ Se detectaron ${n} reporte(s) en total.`];
    const cuenta = {};
    records.forEach((r) => { const k = r['Incidencias'] || '(sin incidencia)'; cuenta[k] = (cuenta[k] || 0) + 1; });
    lineas.push('Por incidencia: ' + Object.entries(cuenta).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${v}`).join(', '));
    const limpio = T.limpiarTextoWhatsapp(raw);
    const saludos = positions(T.RE_SALUDO, limpio).length;
    if (saludos > n) lineas.push(`⚠️ El texto trae ${saludos} saludos ("Buenas…") pero solo se detectaron ${n} reportes: revisa que no falte alguno.`);
    const sf = records.filter((r) => !r['Fecha'] || !r['Hora']).length;
    if (sf) lineas.push(`⚠️ ${sf} reporte(s) sin fecha u hora (el texto no trae la marca [hora, fecha] de WhatsApp): esas columnas quedarán vacías.`);
    const sr = records.filter((r) => !r['Responsable']).length;
    if (sr) lineas.push(`⚠️ ${sr} reporte(s) sin Responsable (el texto no trae el nombre del remitente).`);
    const su = records.filter((r) => !r['Unidad']).length;
    if (su) lineas.push(`⚠️ ${su} reporte(s) sin Unidad: revísalos en el Excel.`);
    return lineas.join('\n');
  };
})(typeof window !== 'undefined' ? window : globalThis);
