/* Control Plus CCO — interfaz. Desarrollado por MoussaCorp. 2026 */
(function (root) {
  'use strict';
  const CP = root.CP, U = CP.util, N = CP.native;
  const VERSION = '1.0.0';
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const LS = {
    get(k, d) { try { const v = root.localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { root.localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } },
  };
  const p2 = (n) => U.pad(n, 2);
  const nowHHMM = () => { const d = new Date(); return `${p2(d.getHours())}:${p2(d.getMinutes())}`; };
  const nowFechaHora = () => { const d = new Date(); return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()} ${nowHHMM()}`; };
  const hoyTxt = () => { const d = new Date(); return `${p2(d.getDate())}${p2(d.getMonth() + 1)}${d.getFullYear()}`; };
  const MIME_X = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const fmtSize = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');

  /* ───────── definición de herramientas ───────── */
  const F = {
    file: (id, label, o) => Object.assign({ id, type: 'file', label, req: true }, o),
    text: (id, label, o) => Object.assign({ id, type: 'text', label }, o),
    area: (id, label, o) => Object.assign({ id, type: 'area', label }, o),
    sw: (id, label, o) => Object.assign({ id, type: 'switch', label }, o),
    seg: (id, label, opts, o) => Object.assign({ id, type: 'seg', label, opts }, o),
  };
  const excluirFields = (ejemplo) => [
    F.sw('excluir', 'Obviar alguna UT en este reporte'),
    F.area('excluirLista', 'UT(s) a obviar (separadas por coma)', { showIf: (v) => v.excluir, placeholder: ejemplo, min: 70, preview: (t) => { const r = U.parsearListaExclusion(t); return (r.validas.size ? `✅ Se obviarán: ${[...r.validas].sort().join(', ')}` : '') + (r.invalidas.length ? `\n⚠️ No reconocí: ${r.invalidas.join(', ')}` : ''); } }),
  ];
  const exclSet = (v) => (v.excluir ? U.parsearListaExclusion(v.excluirLista || '').validas : null);
  const gr = (title, items) => ({ title, items: items.map((x) => (typeof x === 'string' ? { text: x } : x)) });
  const tituloOjo = (m) => {
    let u = /Unidad \*([^*]+)\*/.exec(m) || /Ut :(\S+),/.exec(m); u = u ? u[1] : '';
    let i = /\*Incidencia:\*\s*([^\n*]+)/.exec(m);
    i = i ? i[1].trim() : /^Validación Parada/.test(m) ? 'Sin movimiento (Validación Parada)' : /Ruta no reconocida/.test(m) ? 'Ruta no reconocida' : '';
    return [u, i].filter(Boolean).join(' · ');
  };

  const TOOLS = [
    { id: 'excesos', icon: '🚨', color: '#ef4444', title: 'Excesos de Velocidad', desc: 'PDF de alarmas del GTRMax → un mensaje por unidad.',
      fields: [F.file('pdf', 'PDF de alarmas del GTRMax', { hint: '.pdf' }), F.text('hora', 'Hora actual (define el saludo)', { def: nowHHMM, placeholder: '21:15  ó  08:02 pm', req: true }),
        F.sw('usarDisp', 'Adjuntar Excel de Disponibilidad para buscar el CTS'), F.file('disp', 'Excel de Disponibilidad', { showIf: (v) => v.usarDisp })],
      async run(v, log) {
        const cts = v.usarDisp ? CP.disp.leerCts(v.disp.buf, log) : null;
        const msgs = await CP.excesos.procesarPdf(v.pdf.buf, v.hora, cts, log);
        if (!msgs.length) return { notes: [{ t: 'No se encontraron excesos de velocidad en el PDF.', k: 'ok' }] };
        return { chips: [`${msgs.length} unidad(es)`], groups: [gr('Excesos de velocidad', msgs.map((m) => ({ title: (/Unidad \*([^*]+)\*/.exec(m) || [])[1], text: m })))] };
      } },
    { id: 'sininfo', icon: '📋', color: '#f59e0b', title: 'Sin Información (Top 5)', desc: 'Reporte diario GTR → las 5 unidades con más km por sub-eje.',
      fields: [F.file('gtr', 'Reporte diario GTR', { hint: '.xls / .xlsx' })],
      async run(v) {
        const res = CP.gtr.sinInformacion(CP.gtr.leerArchivo(v.gtr.buf));
        const groups = res.filter(([, m]) => m.length).map(([eje, m]) => gr(`Eje ${eje}`, m.map((t) => ({ title: (/Unidad \*([^*]+)\*/.exec(t) || [])[1], text: t }))));
        const tot = groups.reduce((a, g) => a + g.items.length, 0);
        return tot ? { chips: [`${tot} unidad(es)`], groups } : { notes: [{ t: 'No hay unidades con kilómetros recorridos en este reporte.', k: 'ok' }] };
      } },
    { id: 'ultimas', icon: '🕒', color: '#3b82f6', title: 'Últimas UT en Movimiento', desc: '“Reporte de Estatus Actual” → UT en movimiento por eje.',
      fields: [F.file('est', 'Reporte de Estatus Actual', { hint: '.xls' }), F.text('hora', 'Hora del reporte', { def: nowHHMM, placeholder: '21:15  ó  08:02 pm', req: true })].concat(excluirFields('R-066, 0343')),
      async run(v, log) {
        const df = CP.ultimas.leerArchivo(v.est.buf);
        const res = CP.ultimas.generarReporte(df, v.hora, log, exclSet(v));
        return { chips: ['7 grupos'], groups: [gr('Reporte por eje', res.map(([e, m]) => ({ title: e, text: m })))] };
      } },
    { id: 'subeje', icon: '🛣️', color: '#10b981', title: 'UT en Movimiento + Sub-eje', desc: 'Reporte GTR → resumen por eje y “sin información” por sub-eje.',
      fields: [F.file('gtr', 'Reporte diario GTR', { hint: '.xls / .xlsx' }), F.text('hora', 'Hora del reporte', { def: nowHHMM, placeholder: '21:00', req: true })],
      async run(v) {
        const df = CP.gtr.leerArchivo(v.gtr.buf);
        return { groups: [gr('Reporte por eje', [CP.gtr.reportePorEje(df, v.hora)]), gr('Sin información por sub-eje', CP.gtr.reportesSubeje(df, v.hora).map(([e, m]) => ({ title: `Eje ${e}`, text: m })))] };
      } },
    { id: 'semanal', icon: '📆', color: '#8b5cf6', title: 'Consolidador Semanal', desc: 'Une los Excel diarios en un único Excel semanal.',
      fields: [F.file('files', 'Excel diarios (6 a 7 archivos)', { multiple: true, hint: '.xlsx' })],
      async run(v, log) { return consolidar('Semanal', v, log); } },
    { id: 'mensual', icon: '🗓️', color: '#ec4899', title: 'Consolidador Mensual', desc: 'Une los Excel semanales en un único Excel mensual.',
      fields: [F.file('files', 'Excel semanales (3 a 4 archivos)', { multiple: true, hint: '.xlsx' })],
      async run(v, log) { return consolidar('Mensual', v, log); } },
    { id: 'desconexion', icon: '🔌', color: '#06b6d4', title: 'Actualizar Desconexión', desc: 'PDF de unidades sin reportar + Excel → desconexión actualizada.',
      fields: [F.file('pdf', 'PDF “Unidades que No Han Reportado”', { hint: '.pdf' }),
        F.seg('modo', '¿Tienes un Excel de Desconexión para actualizar?', [['existente', 'Sí, actualizar'], ['nuevo', 'No, crear nuevo']]),
        F.file('excel', 'Excel de Desconexión a actualizar', { showIf: (v) => v.modo === 'existente' }),
        F.text('resp', 'Responsable', { showIf: (v) => v.modo === 'nuevo', placeholder: 'Nombre del responsable', req: true }),
        F.text('corte', 'Corte', { showIf: (v) => v.modo === 'nuevo', placeholder: 'Nombre del corte', req: true }),
        F.text('fecha', 'Fecha actual', { def: nowFechaHora, placeholder: 'DD/MM/AAAA  ó  DD/MM/AAAA HH:MM', req: true }),
        F.sw('usarDisp', 'Adjuntar Excel de Disponibilidad para actualizar el Status'), F.file('disp', 'Excel de Disponibilidad', { showIf: (v) => v.usarDisp })],
      async run(v, log) {
        const fa = CP.desconexion.parsearFechaActual(v.fecha);
        const statusDb = v.usarDisp ? CP.disp.leerStatus(v.disp.buf, log) : null;
        const r = await CP.desconexion.actualizar({ pdf: v.pdf.buf, excel: v.modo === 'existente' ? v.excel.buf : null, fechaActual: fa, responsable: v.resp, corte: v.corte, statusDb }, log);
        return { chips: [`${r.total} unidad(es)`], files: [{ name: r.nombre, mime: MIME_X, data: r.buffer }] };
      } },
    { id: 'alertas', icon: '📝', color: '#f97316', title: 'Data Alertas', desc: 'Pega los reportes de WhatsApp → Excel de Data Alertas.',
      fields: [F.area('texto', 'Pega aquí los reportes (copiados de WhatsApp)', { min: 170, placeholder: '[3:34 p. m., 15/9/2026] Nombre: > Buenas Tardes…', req: false }),
        F.file('archivo', 'o carga un archivo .txt (opcional)', { req: false, hint: '.txt' }),
        F.sw('usarExistente', 'Agregar a un Excel de Data Alertas existente'), F.file('existente', 'Excel de Data Alertas existente', { showIf: (v) => v.usarExistente })],
      async run(v) {
        const texto = (v.texto || '').trim() ? v.texto : v.archivo ? CP.io.decodeText(v.archivo.buf) : '';
        if (!texto.trim()) throw new Error('Pega el texto de los reportes o carga un archivo .txt.');
        const recs = CP.alertas.parseReports(texto);
        if (!recs.length) throw new Error('No detecté ningún reporte. Cada reporte debe iniciar con su hora (ej: 9:05 a. m., 31/3/2026) o con su saludo (> Buenas Tardes).');
        const r = await CP.alertas.buildExcel(recs, v.usarExistente ? v.existente.buf : null);
        const lineas = CP.alertas.resumenDeteccion(texto, recs).split('\n');
        return { chips: [`${recs.length} reporte(s)`, `${r.total} filas en el Excel`], notes: lineas.map((t) => ({ t, k: t.startsWith('⚠') ? 'warn' : 'ok' })),
          groups: [gr('Reportes detectados', recs.map((x) => ({ title: [x['Unidad'], x['Incidencias']].filter(Boolean).join(' · '), text: [x['Responsable'], x['Fecha'], x['Hora'], x['Eje'], x['Sub‑eje'], x['Unidad'], x['Incidencias'], x['Descripción'], x['Observación']].filter(Boolean).join(' | ') })))],
          collapse: true, files: [{ name: `Data_Alertas_${hoyTxt()}.xlsx`, mime: MIME_X, data: r.buffer }] };
      } },
    { id: 'ojo', icon: '🦅', color: '#eab308', title: 'Ojo de Halcón', desc: 'Cruza Estatus Actual + Disponibilidad + rutas → 7 tipos de incidencia.',
      fields: [F.file('est', 'Reporte de Estatus Actual', { hint: '.xls' }), F.file('disp', 'Excel de Disponibilidad', { hint: '.xlsx' })].concat(excluirFields('R-036, 0140')),
      async run(v, log) {
        const msgs = CP.ojo.generar({ estatus: v.est.buf, disponibilidad: v.disp.buf, excluir: exclSet(v) }, log);
        if (!msgs.length) return { notes: [{ t: '✅ Sin incidencias detectadas en este reporte.', k: 'ok' }] };
        return { chips: [`${msgs.length} incidencia(s)`], groups: [gr('Incidencias detectadas', msgs.map((m) => ({ title: tituloOjo(m), text: m })))] };
      } },
    { id: 'recorrido', icon: '🧭', color: '#14b8a6', title: 'Resumen de recorrido / paradas', desc: 'Historial de una UT → resumen del recorrido y de sus paradas.',
      fields: [F.file('csv', 'Historial de la unidad del GTRMax', { hint: '.csv / .xls / .xlsx' }),
        F.text('unidad', 'Unidad', { placeholder: 'R-066  ó  0343', req: true }),
        F.text('manual', 'Esta unidad no está en la lista: escribe Eje, Sub eje, VIN', { showIf: (v) => { const a = U.normalizarUnidad(v.unidad); return !!a && !CP.recorrido.buscarUnidad(a); }, placeholder: 'Blv, Acevedo, 1234   (Pz: Pz, 1234)', req: true }),
        F.text('cts', 'Nombre del CTS', { placeholder: 'Nombre y apellido', req: true }),
        F.seg('tipo', '¿Qué reporte necesitas?', [['recorrido', 'Recorrido'], ['paradas', 'Paradas'], ['ambos', 'Ambos']], { def: 'ambos' })],
      async run(v, log) {
        const alias = U.normalizarUnidad(v.unidad);
        if (!alias) throw new Error('No reconozco esa unidad. Escríbela como R-066 o 0343.');
        let info = CP.recorrido.buscarUnidad(alias);
        if (!info) { info = CP.recorrido.parsearUnidadManual(v.manual); if (!info) throw new Error('Formato de Eje, Sub eje, VIN inválido. Ej: Blv, Acevedo, 1234 (ejes: Am, Blv, Met, Ocm, Pz, Serv).'); }
        const aviso = [];
        const deArchivo = CP.recorrido.aliasDesdeNombreArchivo(v.csv.name);
        if (deArchivo && deArchivo !== alias) aviso.push({ t: `⚠️ El nombre del archivo indica la unidad ${deArchivo}, pero escribiste ${alias}. Se usó ${alias}.`, k: 'warn' });
        const msgs = CP.recorrido.generar(v.csv.buf, v.csv.name, alias, v.cts, v.tipo, info, log);
        const tit = v.tipo === 'recorrido' ? ['Resumen del recorrido'] : v.tipo === 'paradas' ? ['Resumen de paradas'] : ['Resumen del recorrido', 'Resumen de paradas'];
        return { notes: aviso, groups: [gr(`Unidad ${alias}`, msgs.map((m, i) => ({ title: tit[i], text: m })))] };
      } },
  ];
  async function consolidar(tipo, v, log) {
    if (!v.files.length) throw new Error('Carga al menos un archivo.');
    const t = tipo === 'Semanal' ? CP.consolidar.consolidarSemanal(v.files, log) : CP.consolidar.consolidarMensual(v.files, log);
    if (!t) throw new Error('No se pudo leer ningún archivo. Revisa el registro.');
    const g = await CP.consolidar.guardar(t, tipo);
    return { chips: [`${g.total} filas`, `${v.files.length} archivo(s)`], files: [{ name: g.base + '.xlsx', mime: MIME_X, data: g.xlsx }, { name: g.base + '.csv', mime: 'text/csv', data: new TextEncoder().encode(g.csv) }] };
  }
  TOOLS.forEach((t, i) => (t.n = i + 1));

  /* ───────── estado y utilidades de UI ───────── */
  let cur = null, vals = {}, store = [];
  const view = () => $('#view');
  function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2000); }
  const stats = () => LS.get('cpcco.stats.v1', {});
  function bump(id) { const s = stats(); s[id] = (s[id] || 0) + 1; LS.set('cpcco.stats.v1', s); }
  function setTheme(l) { document.body.classList.toggle('light', l); LS.set('cpcco.theme.v1', l ? 'light' : 'dark'); const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = l ? '#eef3fb' : '#06142f'; }
  const fmtMsg = (t) => esc(t).replace(/\*([^*\n]+)\*/g, '<b>$1</b>');

  function drawTop() {
    const t = $('#top');
    t.innerHTML = (cur ? '<button class="ibtn" data-act="back" aria-label="Volver">←</button>' : '') + `<div class="ttl">${cur ? esc(cur.title) : ''}</div><button class="ibtn" data-act="theme" aria-label="Tema">${document.body.classList.contains('light') ? '🌙' : '☀️'}</button><button class="ibtn" data-act="about" aria-label="Acerca de">ℹ️</button>`;
  }

  /* ───────── inicio ───────── */
  function renderHome() {
    cur = null; drawTop();
    const st = stats(), total = Object.values(st).reduce((a, b) => a + b, 0);
    view().innerHTML = `<section class="hero"><div class="orbit"><i></i><i class="b"></i><img src="img/emblem.png" alt="Control Plus"></div><h1 class="brand">CONTROL <b>PLUS</b></h1><div class="sub">C C O</div>
      <div class="chips"><span class="chip"><b>${TOOLS.length}</b> herramientas</span><span class="chip">📴 <b>sin internet</b></span><span class="chip">🔒 <b>100% local</b></span>${total ? `<span class="chip">⚡ <b>${total}</b> reportes</span>` : ''}</div></section>
      <input class="search" id="q" type="search" placeholder="🔎 Buscar herramienta…" autocomplete="off"><div class="grid" id="grid"></div>`;
    drawGrid('');
  }
  function drawGrid(q) {
    const st = stats(), n = U.sinAcentos(q).toLowerCase().trim();
    const list = TOOLS.filter((t) => !n || U.sinAcentos(t.title + ' ' + t.desc).toLowerCase().includes(n));
    $('#grid').innerHTML = list.length ? list.map((t, i) => `<button class="tool" data-tool="${t.id}" style="--c:${t.color};animation-delay:${i * 45}ms"><span class="n">${p2(t.n)}</span><div class="ic">${t.icon}</div><h3>${esc(t.title)}</h3><p>${esc(t.desc)}</p>${st[t.id] ? `<div class="u">✔ usada ${st[t.id]} ${st[t.id] === 1 ? 'vez' : 'veces'}</div>` : ''}</button>`).join('') : '<div class="empty" style="grid-column:1/-1">Sin resultados 🔭</div>';
  }

  /* ───────── herramienta ───────── */
  function fieldHTML(f) {
    let h = '';
    if (f.type === 'switch') h = `<div class="sw" data-sw="${f.id}"><span>${esc(f.label)}</span><span class="t"></span></div>`;
    else {
      h = `<label class="l">${esc(f.label)}${f.req === false ? ' <span style="opacity:.6">(opcional)</span>' : ''}</label>`;
      if (f.type === 'text') h += `<input type="text" data-in="${f.id}" placeholder="${esc(f.placeholder || '')}" value="${esc(vals[f.id] || '')}" autocomplete="off" autocapitalize="off" spellcheck="false">`;
      else if (f.type === 'area') h += `<textarea data-in="${f.id}" placeholder="${esc(f.placeholder || '')}" style="min-height:${f.min || 110}px"></textarea>${f.preview ? `<div class="note ok" data-pv="${f.id}" style="display:none;white-space:pre-line"></div>` : ''}`;
      else if (f.type === 'seg') h += `<div class="seg" data-seg="${f.id}">${f.opts.map(([k, l]) => `<button type="button" data-v="${k}" class="${vals[f.id] === k ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>`;
      else if (f.type === 'file') h += `<div class="file" data-file="${f.id}"><span class="fi">📄</span><span class="fn" data-fn>Ningún archivo seleccionado${f.hint ? `<small>${esc(f.hint)}</small>` : ''}</span><button type="button" class="pick" data-pick="${f.id}">Elegir</button><input type="file" hidden data-fi="${f.id}"${f.multiple ? ' multiple' : ''}></div>`;
    }
    return `<div class="fld" data-f="${f.id}">${h}</div>`;
  }
  function openTool(id, push) {
    cur = TOOLS.find((t) => t.id === id); if (!cur) return renderHome();
    if (push !== false) { try { history.pushState({ t: id }, ''); } catch (e) { /* sin historial */ } }
    vals = {}; store = [];
    cur.fields.forEach((f) => { vals[f.id] = f.type === 'switch' ? false : f.type === 'seg' ? (f.def || f.opts[0][0]) : f.type === 'file' ? (f.multiple ? [] : null) : (f.def ? f.def() : ''); });
    drawTop();
    view().innerHTML = `<div class="card" style="--c:${cur.color}"><div style="display:flex;gap:12px;align-items:center"><div class="tool ic" style="--c:${cur.color};width:50px;height:50px;font-size:1.7rem;display:grid;place-items:center;border-radius:15px;padding:0;animation:none;box-shadow:none">${cur.icon}</div><div style="color:var(--mut);font-size:.85rem;line-height:1.35">${esc(cur.desc)}</div></div></div><div class="card" id="form">${cur.fields.map(fieldHTML).join('')}<button class="go" id="run">⚡ Generar</button></div><div id="res"></div>`;
    refreshVis(); if (root.scrollTo) { try { root.scrollTo(0, 0); } catch (e) { /* jsdom */ } }
  }
  function refreshVis() { cur.fields.forEach((f) => { const el = $(`[data-f="${f.id}"]`); if (el) el.style.display = !f.showIf || f.showIf(vals) ? '' : 'none'; }); }
  async function readFile(file) { return { name: file.name, size: file.size, buf: new Uint8Array(await file.arrayBuffer()) }; }
  function paintFile(id, v) {
    const box = $(`[data-file="${id}"]`); if (!box) return;
    const arr = Array.isArray(v) ? v : v ? [v] : [];
    box.classList.toggle('has', arr.length > 0);
    $('[data-fn]', box).innerHTML = arr.length ? `${esc(arr.length > 1 ? arr.length + ' archivos' : arr[0].name)}<small>${arr.length > 1 ? esc(arr.map((a) => a.name).join(', ')) : fmtSize(arr[0].size)}</small>` : 'Ningún archivo seleccionado';
    $('.fi', box).textContent = arr.length ? '✅' : '📄';
    $('.pick', box).textContent = arr.length ? 'Cambiar' : 'Elegir';
  }
  function validar() {
    for (const f of cur.fields) {
      if (f.showIf && !f.showIf(vals)) continue;
      if (f.req === false || f.type === 'switch' || f.type === 'seg' || f.type === 'area' && f.preview) continue;
      const v = vals[f.id];
      const vacio = f.type === 'file' ? (f.multiple ? !v.length : !v) : !String(v || '').trim();
      if (vacio) { const el = $(`[data-f="${f.id}"]`); if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); toast(`Falta: ${f.label}`); return false; }
    }
    if (cur.id === 'ultimas' || cur.id === 'ojo') { if (vals.excluir && !U.parsearListaExclusion(vals.excluirLista || '').validas.size) { toast('Escribe al menos una UT a obviar (o apaga la opción)'); return false; } }
    return true;
  }
  async function run() {
    if (!validar()) return;
    const btn = $('#run'), res = $('#res'), logs = [];
    btn.disabled = true; btn.classList.add('busy'); btn.textContent = 'Procesando…'; res.innerHTML = '';
    await new Promise((r) => setTimeout(r, 60));
    try {
      const out = await cur.run(vals, (m) => logs.push(m));
      bump(cur.id); showResult(out, logs);
      toast('✅ Listo');
    } catch (e) {
      res.innerHTML = `<div class="note err"><b>No se pudo generar el reporte</b><br>${esc(e && e.message ? e.message : e)}</div>${logHTML(logs, true)}`;
    }
    btn.disabled = false; btn.classList.remove('busy'); btn.textContent = '⚡ Generar';
    if (res.scrollIntoView) res.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  const logHTML = (logs, open) => (logs.length ? `<details${open ? ' open' : ''}><summary>Registro del proceso (${logs.length})</summary><div class="log">${esc(logs.join('\n'))}</div><button class="mini" data-act="copylog" style="margin-top:6px">📋 Copiar registro</button></details>` : '');
  let lastLog = '';
  function showResult(o, logs) {
    store = []; lastLog = logs.join('\n');
    let h = '';
    if (o.chips) h += `<div class="chips" style="justify-content:flex-start">${o.chips.map((c) => `<span class="chip"><b>${esc(c)}</b></span>`).join('')}</div>`;
    (o.notes || []).forEach((n) => (h += `<div class="note ${n.k === 'ok' ? 'ok' : n.k === 'err' ? 'err' : ''}" style="white-space:pre-line">${esc(n.t)}</div>`));
    (o.files || []).forEach((f, i) => { store.push({ file: f }); h += `<div class="card fcard"><span class="fi">${f.name.endsWith('.csv') ? '🧾' : '📊'}</span><div class="fn">${esc(f.name)}<small>${fmtSize(f.data.byteLength || f.data.length)}</small></div><button class="mini" data-act="sfile" data-i="${store.length - 1}">📤 Guardar / compartir</button></div>`; });
    (o.groups || []).forEach((g, gi) => {
      const idx = g.items.map((it) => { store.push({ text: it.text }); return store.length - 1; });
      const all = idx.join(',');
      const body = g.items.map((it, k) => `<div class="msg" style="animation-delay:${Math.min(k, 12) * 30}ms"><div class="mh"><span>${esc(it.title || `Mensaje ${k + 1}`)}</span><button class="mini" data-act="copy" data-i="${idx[k]}">📋</button><button class="mini" data-act="share" data-i="${idx[k]}">📤</button></div><pre>${fmtMsg(it.text)}</pre></div>`).join('');
      h += `<div class="grp"><h4>${esc(g.title)} <span style="color:var(--mut);font-weight:400">(${g.items.length})</span></h4><button class="mini" data-act="copyall" data-i="${all}">📋 Copiar todo</button><button class="mini" data-act="shareall" data-i="${all}">📤</button></div>${o.collapse ? `<details><summary>Ver ${g.items.length} reporte(s) detectados</summary>${body}</details>` : body}`;
    });
    if (!o.groups && !o.files && !(o.notes || []).length) h += '<div class="empty">Sin resultados.</div>';
    h += logHTML(logs, false);
    $('#res').innerHTML = h;
  }
  const getTexts = (s) => s.split(',').map((i) => store[+i].text);

  /* ───────── eventos ───────── */
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act],[data-tool],[data-pick],[data-sw],[data-seg] button,#run,#aboutClose');
    if (!b) return;
    if (b.id === 'run') return run();
    if (b.id === 'aboutClose') return $('#about').classList.remove('show');
    if (b.dataset.tool) return openTool(b.dataset.tool);
    if (b.dataset.pick) { const i = $(`[data-fi="${b.dataset.pick}"]`); if (i) i.click(); return; }
    if (b.dataset.sw) { vals[b.dataset.sw] = !vals[b.dataset.sw]; b.classList.toggle('on', vals[b.dataset.sw]); return refreshVis(); }
    if (b.parentElement && b.parentElement.dataset.seg) { const id = b.parentElement.dataset.seg; vals[id] = b.dataset.v; [...b.parentElement.children].forEach((c) => c.classList.toggle('on', c === b)); return refreshVis(); }
    const a = b.dataset.act;
    if (a === 'back') { if (history.state && history.state.t) history.back(); else renderHome(); }
    else if (a === 'theme') { setTheme(!document.body.classList.contains('light')); drawTop(); }
    else if (a === 'about') $('#about').classList.add('show');
    else if (a === 'copy') toast((await N.copy(store[+b.dataset.i].text)) ? 'Copiado ✔' : 'No se pudo copiar');
    else if (a === 'copyall') toast((await N.copy(getTexts(b.dataset.i).join('\n\n'))) ? 'Todo copiado ✔' : 'No se pudo copiar');
    else if (a === 'share' || a === 'shareall') { const r = await N.shareText(a === 'share' ? store[+b.dataset.i].text : getTexts(b.dataset.i).join('\n\n')); if (r === 'copied') toast('Copiado al portapapeles ✔'); }
    else if (a === 'sfile') { const f = store[+b.dataset.i].file; const r = await N.shareFile(f.name, f.data, f.mime); if (r === 'download') toast('Archivo descargado'); }
    else if (a === 'copylog') toast((await N.copy(lastLog)) ? 'Registro copiado ✔' : 'No se pudo copiar');
  });
  document.addEventListener('input', (e) => {
    const el = e.target; const id = el.dataset && el.dataset.in; if (!id || !cur) return;
    vals[id] = el.value;
    const f = cur.fields.find((x) => x.id === id);
    if (f && f.preview) { const pv = $(`[data-pv="${id}"]`); const t = f.preview(el.value); pv.style.display = t ? '' : 'none'; pv.textContent = t; }
    refreshVis();
  });
  document.addEventListener('change', async (e) => {
    const el = e.target; const id = el.dataset && el.dataset.fi; if (!id || !cur) return;
    const f = cur.fields.find((x) => x.id === id);
    try {
      const files = [...el.files]; if (!files.length) return;
      if (f.multiple) { const nuevos = []; for (const fl of files) nuevos.push(await readFile(fl)); vals[id] = (vals[id] || []).concat(nuevos); }
      else vals[id] = await readFile(files[0]);
      paintFile(id, vals[id]);
      if (cur.id === 'recorrido' && id === 'csv') { const a = CP.recorrido.aliasDesdeNombreArchivo(vals.csv.name); const inp = $('[data-in="unidad"]'); if (a && inp && !inp.value) { inp.value = a; vals.unidad = a; refreshVis(); } }
    } catch (err) { toast('No se pudo leer el archivo'); }
    el.value = '';
  });
  root.addEventListener('popstate', (e) => { const t = e.state && e.state.t; if (t) openTool(t, false); else renderHome(); });

  /* ───────── arranque ───────── */
  function init() {
    setTheme(LS.get('cpcco.theme.v1', 'dark') === 'light');
    $('#ver').textContent = VERSION;
    if (root.pdfjsLib && root.pdfjsLib.GlobalWorkerOptions) CP.pdf.setWorker('lib/pdf.worker.min.js');
    N.stars();
    renderHome();
    $('#view').addEventListener('input', (e) => { if (e.target.id === 'q') drawGrid(e.target.value); });
    setTimeout(() => $('#splash').classList.add('hide'), 1500);
    $('#about').addEventListener('click', (e) => { if (e.target.id === 'about') e.target.classList.remove('show'); });
  }
  CP.ui = { TOOLS, openTool, renderHome, init };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(typeof window !== 'undefined' ? window : globalThis);
