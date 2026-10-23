/* Herramienta 9 — Ojo de Halcón (validación en tiempo real de UT) */
(function (root) {
  'use strict';
  const CP = (root.CP = root.CP || {});
  const U = CP.util, IO = CP.io, Disp = CP.disp;
  const T = (CP.ojo = {});
  const D = () => root.CPDATA || {};

  const UMBRAL_ULTIMO = 3600, UMBRAL_ULTIMO_MAX = 12 * 3600, UMBRAL_PARADA = 30 * 60, UMBRAL_PARADA_FR = 10 * 60, UMBRAL_PARADA_MAX = 12 * 3600;
  const UMBRAL_VEL = 87, UMBRAL_KM = 1.0, UMBRAL_SIM = 0.9;
  const RUTA_NO_ASIGNADA = ['S.R', 'S-OP', 'S/OP', 'S.S', 'SS', ''];
  const ORDEN_EJES = ['Am', 'Blv', 'Met', 'Ocm', 'Pz', 'Serv Cont', 'Serv Esp'];
  const ORDEN_INC = ['Fuera de ruta', 'Ruta no reconocida', 'Movimiento no reportado', 'Sin información', 'Exceso de velocidad', 'Sin movimiento', 'UT pegada'];
  const nc = U.normalizarComparacion;

  /* redondeos / formatos equivalentes a Python */
  const roundHalfEven = (x) => { const f = Math.floor(x), d = x - f; if (d < 0.5) return f; if (d > 0.5) return f + 1; return f % 2 === 0 ? f : f + 1; };
  const fmt2 = (x) => {
    if (Math.abs(x * 8 - Math.round(x * 8)) < 1e-9 && Math.round(x * 1000) % 10 === 5) {
      const f = Math.floor(x * 100);
      return ((f % 2 === 0 ? f : f + 1) / 100).toFixed(2);
    }
    return x.toFixed(2);
  };
  const trimChars = (s, chars) => U.lstripChars(U.rstripChars(s, chars), chars);

  T.formatearDuracion = function (seg) {
    seg = Math.trunc(seg);
    const dias = Math.floor(seg / 86400); let resto = seg % 86400;
    const horas = Math.floor(resto / 3600); resto %= 3600;
    const min = Math.floor(resto / 60);
    const p = [];
    if (dias) p.push(`${dias} día${dias !== 1 ? 's' : ''}`);
    if (horas) p.push(`${horas} hora${horas !== 1 ? 's' : ''}`);
    return p.length ? `${p.join(' ')} con ${U.pad(min, 2)} min.` : `${min} min.`;
  };
  const esNotaOperativa = (t) => { const n = nc(t); return (D().OJO_NOTAS || []).some((k) => n.includes(k)); };

  function extraerInfoEje(matricula, log) {
    if (!matricula) return null;
    let t = String(matricula).replace(/^\s*vin\s*:\s*\d+\s*/i, '').trim();
    const info = (D().OJO_ETIQUETA_INFO || {})[t.trim().toLowerCase()];
    if (!info) { log(`⚠ etiqueta sin clasificar en Matrícula: '${matricula}'`); return null; }
    return { eje: info[0], subeje: info[1] };
  }
  const parseVel = (t) => { if (t === null || t === undefined) return 0; const m = /[\d.,]+/.exec(String(t)); if (!m) return 0; const n = parseFloat(m[0].replace(',', '.')); return Number.isNaN(n) ? 0 : n; };
  function parseDurSeg(t) {
    if (!t || ['nan', 'none', ''].includes(String(t).trim().toLowerCase())) return null;
    const mul = { d: 86400, h: 3600, m: 60, s: 1 };
    let total = 0, ok = false;
    for (const m of String(t).matchAll(/(\d+)\s*([dhms])/gi)) { total += parseInt(m[1], 10) * mul[m[2].toLowerCase()]; ok = true; }
    return ok ? total : null;
  }

  T.leerEstatus = function (buf, log) {
    log = log || (() => {});
    const { rows } = IO.readHtmlTable(buf);
    if (!rows.length) throw new Error('No se encontró ninguna tabla en el Reporte de Estatus Actual.');
    const head = rows[0].map((c) => String(c).trim());
    const col = (...ns) => { for (const n of ns) { const i = head.indexOf(n); if (i !== -1) return i; } return -1; };
    const iA = col('Alias'), iM = col('Matrícula', 'Matricula'), iU = col('Ubicación', 'Ubicacion'), iV = col('Vel.', 'Vel', 'Velocidad'), iK = col('Km del día', 'Km del dia'), iUR = col('Último Reporte', 'Ultimo Reporte');
    const falt = [['Alias', iA], ['Matrícula', iM], ['Ubicación', iU], ['Vel.', iV], ['Km del día', iK]].filter((x) => x[1] === -1).map((x) => x[0]);
    if (falt.length) throw new Error(`Columnas no encontradas en el reporte: ${JSON.stringify(falt)}`);
    if (iUR === -1) log("ℹ El reporte no trae columna 'Último Reporte' -- se omite el chequeo de 'UT pegada'.");
    return rows.slice(1).map((r) => {
      const kmN = Number(String(r[iK]).trim());
      const txt = iUR !== -1 ? String(r[iUR]).trim() : null;
      return { Alias: String(r[iA]).trim(), Matricula: r[iM], Ubicacion: r[iU], Vel_kmh: parseVel(r[iV]), Km_dia: String(r[iK]).trim() === '' || Number.isNaN(kmN) ? 0 : kmN, Ultimo_Reporte_Texto: txt, Ultimo_Reporte_Seg: iUR !== -1 ? parseDurSeg(txt) : null };
    });
  };

  /* ── rutas_db normalizado ── */
  let RDB = null;
  T.cargarRutasDb = function () {
    if (RDB) return RDB;
    const crudo = Object.assign({}, D().RUTAS_DB || {});
    const take = (k, def) => { const v = k in crudo ? crudo[k] : def; delete crudo[k]; return v; };
    const patios = take('PATIOS', []), alias = take('ALIAS_RUTAS', {}), abast = take('ABASTECIMIENTO', []), sedes = take('SEDES', []), resg = take('PUNTOS_RESGUARDO', {});
    const norm = {};
    for (const [eje, rutas] of Object.entries(crudo)) {
      norm[eje] = {};
      for (const [n, dirs] of Object.entries(rutas)) norm[eje][n] = dirs.map((d) => [d, nc(U.limpiarUbicacion(d))]);
    }
    const lst = (a) => a.map((d) => [d, nc(U.limpiarUbicacion(d))]);
    norm.PATIOS = lst(patios); norm.ABASTECIMIENTO = lst(abast); norm.SEDES = lst(sedes);
    norm.PUNTOS_RESGUARDO = {};
    for (const [a, ds] of Object.entries(resg)) norm.PUNTOS_RESGUARDO[a.trim().toUpperCase()] = ds.map((d) => nc(U.limpiarUbicacion(d)));
    norm.ALIAS_RUTAS = {};
    for (const [eje, mapeo] of Object.entries(alias)) { norm.ALIAS_RUTAS[eje] = {}; for (const [a, c] of Object.entries(mapeo)) norm.ALIAS_RUTAS[eje][nc(a)] = c; }
    RDB = norm;
    return RDB;
  };
  T.esUbicacionPatio = function (ub, db, alias) {
    const n = nc(U.limpiarUbicacion(ub));
    if (!n) return false;
    for (const k of ['PATIOS', 'ABASTECIMIENTO', 'SEDES']) if ((db[k] || []).some((x) => x[1] === n)) return true;
    if (alias) { const p = (db.PUNTOS_RESGUARDO || {})[String(alias).trim().toUpperCase()] || []; if (p.includes(n)) return true; }
    return false;
  };

  const slug = (t) => t.replace(/[^a-z0-9]/g, '');
  const palabras = (t) => t.replace(/[^a-z0-9]+/g, ' ').trim();
  function buscarPorPrefijo(rutas, alias, obj) {
    obj = palabras(obj);
    let mejor = null;
    let conocidos = Object.keys(rutas).map((n) => [palabras(nc(n)), n]);
    if (alias) conocidos = conocidos.concat(Object.entries(alias).filter(([, c]) => c in rutas).map(([a, c]) => [palabras(a), c]));
    for (const [k, correcto] of conocidos) {
      if (k.replace(/ /g, '').length < 8) continue;
      if (obj === k || obj.startsWith(k + ' ')) if (mejor === null || k.length > mejor[0]) mejor = [k.length, correcto];
    }
    return mejor ? [mejor[1], rutas[mejor[1]]] : null;
  }
  function buscarEnAlias(alias, tn, ts) {
    const d = alias[tn];
    if (d) return d;
    if (ts) for (const [k, v] of Object.entries(alias)) if (slug(k) === ts) return v;
    return null;
  }
  function candidatosTruncados(obj) {
    const cortes = [];
    const m = /\bapoy[\p{L}\p{N}_]*/u.exec(obj);
    if (m && m.index > 0) cortes.push(obj.slice(0, m.index));
    if (obj.includes('/')) cortes.push(obj.split('/')[0]);
    const base = cortes.concat([obj]);
    for (const b of base) { const idx = []; for (let i = 0; i < b.length; i++) if (b[i] === '-') idx.push(i); idx.reverse().forEach((i) => cortes.push(b.slice(0, i))); }
    const vistos = new Set(), salida = [];
    for (let c of cortes) {
      c = trimChars(c, ' -/,.:;()').replace(/\s+y$/, '');
      c = trimChars(c, ' -/,.:;()');
      if (slug(c).length >= 4 && !vistos.has(c) && c !== obj) { vistos.add(c); salida.push(c); }
    }
    return salida;
  }
  function buscarRuta(rutas, nombre, alias) {
    if (!nombre) return null;
    const obj = nc(nombre);
    if (!obj) return null;
    const os = slug(obj);
    if (alias) { const c = buscarEnAlias(alias, obj, os); if (c && c in rutas) return [c, rutas[c]]; }
    for (const [n, d] of Object.entries(rutas)) if (slug(nc(n)) === os) return [n, d];
    const pref = buscarPorPrefijo(rutas, alias, obj);
    if (pref) return pref;
    for (const cand of candidatosTruncados(obj)) {
      const cs = slug(cand);
      if (alias) { const c = buscarEnAlias(alias, cand, cs); if (c && c in rutas) return [c, rutas[c]]; }
      for (const [n, d] of Object.entries(rutas)) if (slug(nc(n)) === cs) return [n, d];
    }
    let mn = null, mr = 0.0;
    for (const n of Object.keys(rutas)) { const r = U.ratio(obj, nc(n)); if (r > mr) { mn = n; mr = r; } }
    if (alias) for (const [an, c] of Object.entries(alias)) { if (!(c in rutas)) continue; const r = U.ratio(obj, an); if (r > mr) { mn = c; mr = r; } }
    return mn !== null && mr >= UMBRAL_SIM ? [mn, rutas[mn]] : null;
  }
  const claveEje = (eje) => (eje === 'Serv Cont' || eje === 'Serv Esp' ? 'SERV' : eje.toUpperCase());
  function resolverNombre(eje, nombre, db) {
    if (!nombre) return nombre;
    const k = claveEje(eje), rutas = db[k];
    if (!rutas || !Object.keys(rutas).length) return nombre;
    const m = buscarRuta(rutas, nombre, (db.ALIAS_RUTAS || {})[k]);
    return m ? m[0] : nombre;
  }
  function esFueraDeRuta(eje, nombre, ub, db) {
    const k = claveEje(eje), rutas = db[k];
    if (!rutas || !Object.keys(rutas).length) return null;
    if (!nombre || RUTA_NO_ASIGNADA.includes(nombre.trim().toUpperCase())) return null;
    const m = buscarRuta(rutas, nombre, (db.ALIAS_RUTAS || {})[k]);
    if (m === null) return null;
    const dirs = m[1];
    if (!dirs || !dirs.length) return null;
    const un = nc(U.limpiarUbicacion(ub));
    if (!un) return null;
    for (const [, dn] of dirs) if (un.includes(dn) || dn.includes(un)) return false;
    return true;
  }
  const encabezadoEje = (eje, sub) => (eje === 'Serv Cont' ? 'Eje *Serv* *Cont.*' : eje === 'Serv Esp' ? 'Eje *Serv* *Esp.*' : sub ? `Eje *${eje}* - Sub eje *${sub}*` : `Eje *${eje}*`);
  const formato = (saludo, eje, sub, uni, vin, cts, cuerpo) => [saludo, `* ${encabezadoEje(eje, sub)}`, `* Unidad *${uni}* - Vin *${vin}*`, `* CTS: *${cts}*`, '', cuerpo].join('\n');
  const ctsOjo = (n) => { if (!n) return 'S.I.'; n = String(n).trim(); if (!n || ['sin cts', '***', 'nan'].includes(n.toLowerCase())) return 'S.I.'; return U.formatearCts(n); };

  /* opts: {estatus:ArrayBuffer, disponibilidad:ArrayBuffer, excluir:Set, ahora:Date} -> list[str] */
  T.generar = function (opts, log) {
    log = log || (() => {});
    const excl = opts.excluir && opts.excluir.size ? new Set([...opts.excluir].map(U.normalizarParaExclusion)) : null;
    const df = T.leerEstatus(opts.estatus, log);
    const disp = Disp.leerDisponibilidad(opts.disponibilidad, log);
    const db = T.cargarRutasDb();
    const ahora = opts.ahora || new Date();
    const saludo = U.saludoPorHora(ahora.getHours(), ahora.getMinutes());
    const entradas = [];
    let oSinDisp = 0, oStatus = 0, oMan = 0;
    for (const fila of df) {
      const alias = U.normalizarAlias(fila.Alias);
      if (!alias) continue;
      if (excl && excl.has(U.normalizarParaExclusion(alias))) { oMan++; continue; }
      const info = extraerInfoEje(fila.Matricula, log);
      if (!info) continue;
      const { eje, subeje } = info;
      const d = Disp.getDisponibilidad(disp, alias);
      const km = fila.Km_dia;
      const idxEje = ORDEN_EJES.includes(eje) ? ORDEN_EJES.indexOf(eje) : ORDEN_EJES.length;
      const clave = [idxEje, subeje || ''];
      const push = (inc, msg) => entradas.push([clave, ORDEN_INC.indexOf(inc), msg]);
      if (!d) {
        oSinDisp++;
        if (km > UMBRAL_KM) {
          const cuerpo = `*Incidencia:* Sin información\n*Observación:* No se ha recibido información *(${fmt2(km)} km recorridos).* y se visualiza en *${U.limpiarUbicacion(fila.Ubicacion)}.*`;
          push('Sin información', formato(saludo, eje, subeje, alias, U.getVin(alias), 'S.I', cuerpo));
        }
        continue;
      }
      const status = d.status;
      if (!(status === 'Operativa' || (status === 'Inoperativa' && km > UMBRAL_KM))) { oStatus++; continue; }
      const cts = ctsOjo(d.cts), rutaAs = d.ruta, vin = U.getVin(alias), ub = fila.Ubicacion, vel = fila.Vel_kmh;
      const urSeg = fila.Ultimo_Reporte_Seg, urTxt = fila.Ultimo_Reporte_Texto;
      const agregar = (inc, cuerpo) => push(inc, formato(saludo, eje, subeje, alias, vin, cts, cuerpo));
      if (vel >= UMBRAL_VEL) agregar('Exceso de velocidad', `*Incidencia:* Exceso de velocidad \n*Incumplimiento:* *${roundHalfEven(vel)} km/h* en *autopista*`);
      if (status === 'Inoperativa' && km > UMBRAL_KM) agregar('Movimiento no reportado', `*Incidencia:* Movimiento no reportado \n*Observación:* *Falla* en movimiento *(${fmt2(km)} km recorridos)*`);
      const enPatio = T.esUbicacionPatio(ub, db, alias);
      const rutaValida = !!rutaAs && !RUTA_NO_ASIGNADA.includes(rutaAs.trim().toUpperCase());
      const rutasEje = rutaValida ? db[claveEje(eje)] : null;
      let rutaRec = null;
      if (rutaValida && rutasEje && Object.keys(rutasEje).length) {
        const m = buscarRuta(rutasEje, rutaAs, (db.ALIAS_RUTAS || {})[claveEje(eje)]);
        if (m) rutaRec = m[0];
      }
      if (rutaValida && rutasEje && Object.keys(rutasEje).length && rutaRec === null && !esNotaOperativa(rutaAs)) {
        entradas.push([clave, ORDEN_INC.indexOf('Ruta no reconocida'), `Ut :${alias}, ruta : ${rutaAs} (Ruta no reconocida)`]);
      }
      const rutaMostrar = rutaAs ? resolverNombre(eje, rutaAs, db) : rutaAs;
      let fuera;
      if (enPatio && rutaRec) { agregar('Fuera de ruta', `*Incidencia:* Fuera de ruta\n *Ruta:* ${rutaRec}\n*Observación:* Se visualiza en *Patio*`); fuera = true; }
      else if (!enPatio) {
        fuera = esFueraDeRuta(eje, rutaAs, ub, db) === true;
        if (fuera) agregar('Fuera de ruta', `*Incidencia:* Fuera de ruta\n *Ruta:* ${rutaMostrar}\n*Observación:* Se visualiza en *${U.limpiarUbicacion(ub)}.*`);
      } else fuera = false;
      if (vel === 0 && !enPatio && urSeg !== null && urSeg <= UMBRAL_PARADA_MAX) {
        const dispara = urSeg > UMBRAL_PARADA || (urSeg > UMBRAL_PARADA_FR && fuera);
        if (dispara) agregar('Sin movimiento', `Validación Parada\nRuta: ${rutaMostrar || 'S.I.'}\nUbicación de Parada:\n${U.limpiarUbicacion(ub)}. (${T.formatearDuracion(urSeg)} aproximadamente)\n¿Nos podrían indicar si hay algún inconveniente con la UT?`);
      }
      if (urSeg !== null && UMBRAL_ULTIMO < urSeg && urSeg <= UMBRAL_ULTIMO_MAX) agregar('UT pegada', `*Incidencia:* La siguiente ut tiene ya ${urTxt} pegada`);
    }
    entradas.sort((a, b) => (a[0][0] - b[0][0]) || (a[0][1] < b[0][1] ? -1 : a[0][1] > b[0][1] ? 1 : 0) || (a[1] - b[1]));
    if (oStatus) log(`ℹ ${oStatus} unidad(es) omitida(s) por no cumplir el filtro Operativa / Inoperativa con Km del día > ${UMBRAL_KM}.`);
    if (oSinDisp) log(`ℹ ${oSinDisp} unidad(es) omitida(s) por no tener registro en el Excel de Disponibilidad (no se puede confirmar su Estatus).`);
    if (oMan) log(`ℹ ${oMan} unidad(es) omitida(s) por pedido explícito del usuario.`);
    return entradas.map((e) => e[2]);
  };
})(typeof window !== 'undefined' ? window : globalThis);
