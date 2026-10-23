/* Herramienta 10 — Resumen de recorrido / paradas de una UT */
(function (root) {
  'use strict';
  const CP = (root.CP = root.CP || {});
  const U = CP.util, IO = CP.io;
  const T = (CP.recorrido = {});
  const MIN_PARADA_SEG = 5 * 60, SALTO_KMH = 150;
  const D = () => root.CPDATA || {};

  /* ── unidades / patios ── */
  T.buscarUnidad = (alias) => (D().UNIDADES || {})[alias] || null;
  T.aliasDesdeNombreArchivo = function (nombre) {
    const m = /unidad[_\s-]+(R-?\d{1,3}|\d{3,4})/i.exec(nombre || '');
    return m ? U.normalizarUnidad(m[1]) : null;
  };
  const EJES = { AM: 'Am', BLV: 'Blv', MET: 'Met', OCM: 'Ocm', PZ: 'Pz', SERV: 'Serv' };
  T.parsearUnidadManual = function (texto) {
    let p = String(texto || '').split(/[,;]/).map((x) => x.trim()).filter(Boolean);
    if (p.length === 2 && p[0].toLowerCase() === 'pz') p = [p[0], 'Plaza Zamora', p[1]];
    if (p.length !== 3) return null;
    const eje = EJES[p[0].toUpperCase()];
    if (!eje) return null;
    const vin = p[2].toUpperCase();
    if (!/^(\d{4}|S\/N)$/.test(vin)) return null;
    const oficiales = {};
    Object.values(D().UNIDADES || {}).forEach((v) => { if (v[0] === eje) oficiales[v[1].toLowerCase()] = v[1]; });
    return [eje, oficiales[p[1].toLowerCase()] || U.title(p[1]), vin];
  };
  const normDir = (a) => U.normalizarComparacion(U.limpiarUbicacion(a));
  let PATIOS = null;
  const patios = () => { if (!PATIOS) { PATIOS = {}; (D().PATIOS_NOMBRADOS || []).forEach(([n, d]) => { PATIOS[normDir(d)] = n; }); } return PATIOS; };
  T.nombrePatio = (dir) => patios()[normDir(dir)] || null;
  const lugar = (dl) => T.nombrePatio(dl) || dl;
  const claveLugar = (dl) => T.nombrePatio(dl) || U.normalizarComparacion(dl);

  function lineaEje(eje, sub) {
    if (eje === 'Pz') return '- Eje *Pz*';
    if (eje === 'Serv') return sub.trim().toLowerCase() === 'cont' ? '- Eje *Serv. Cont*' : '- Eje *Serv Esp*';
    if (eje === 'Met') sub = 'Met';
    return `- Eje *${eje}* - Sub eje *${sub}*`;
  }

  /* ── lectura ── */
  const vacio = (v) => v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v)) || (typeof v === 'string' && !v.trim());
  const normH = (h) => U.sinAcentos(String(h)).toLowerCase().replace(/[^a-z0-9]/g, '');
  function parseCsv(txt, sep) {
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < txt.length; i++) {
      const c = txt[i];
      if (q) { if (c === '"') { if (txt[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true;
      else if (c === sep) { row.push(cur); cur = ''; }
      else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else if (c !== '\r') cur += c;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows;
  }
  function leerTabla(buf, nombre) {
    if (/\.(csv|txt)$/i.test(nombre || '')) {
      const txt = IO.decodeText(buf);
      const primera = txt.split('\n', 1)[0];
      const sep = (primera.split(';').length - 1) >= (primera.split(',').length - 1) ? ';' : ',';
      return parseCsv(txt, sep);
    }
    const sh = IO.readSheets(buf);
    return sh.length ? sh[0].rows : [];
  }
  const UTC = (y, mo, d, h, mi, s) => new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  function parseDt(v) {
    if (vacio(v)) return null;
    if (v instanceof Date) return new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate(), v.getHours(), v.getMinutes(), v.getSeconds()));
    const s = String(v).replace(/[\u00a0\u202f]/g, ' ').trim().toLowerCase();
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(?:([ap])\.?\s*m\.?)?$/.exec(s);
    if (!m) return null;
    let h = parseInt(m[4], 10);
    if (m[7]) h = (h % 12) + (m[7] === 'p' ? 12 : 0);
    return UTC(+m[3], +m[2], +m[1], h, +m[5], +(m[6] || 0));
  }
  function parseDur(v) {
    if (vacio(v)) return null;
    if (v instanceof Date) return v.getUTCHours() * 3600 + v.getUTCMinutes() * 60 + v.getUTCSeconds();
    if (typeof v === 'number') return v < 1 ? Math.round(v * 86400) : Math.trunc(v);
    const m = /^(?:(\d+):)?(\d{1,2}):(\d{2})$/.exec(String(v).trim());
    return m ? parseInt(m[1] || 0, 10) * 3600 + parseInt(m[2], 10) * 60 + parseInt(m[3], 10) : null;
  }
  function parseNum(v) { if (vacio(v)) return null; const m = /-?\d+(?:[.,]\d+)?/.exec(String(v)); return m ? parseFloat(m[0].replace(',', '.')) : null; }
  function haversine(a1, o1, a2, o2) {
    const r = 6371.0, p1 = a1 * Math.PI / 180, p2 = a2 * Math.PI / 180, dp = p2 - p1, dl = (o2 - o1) * Math.PI / 180;
    const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    return 2 * r * Math.asin(Math.sqrt(a));
  }

  T.leerRecorrido = function (buf, nombre, log) {
    log = log || (() => {});
    const tabla = leerTabla(buf, nombre);
    if (!tabla.length) throw new Error('El archivo está vacío.');
    const cols = tabla[0], datos = tabla.slice(1);
    const n = cols.map(normH);
    const ix = (k) => { const i = n.indexOf(k); return i === -1 ? null : i; };
    const iF = ix('fechareporte'), iT = ix('tiempoparada'), iV = ix('velocidad'), iLa = ix('latitud'), iLo = ix('longitud');
    const faltan = [['Fecha Reporte', iF], ['Tiempo parada', iT], ['Velocidad', iV], ['Latitud', iLa]].filter((x) => x[1] === null).map((x) => x[0]);
    if (faltan.length) throw new Error(`Columnas no encontradas: ${faltan.join(', ')}. Columnas detectadas: ${JSON.stringify(cols.map((c) => String(c).trim()))}`);
    let iD = iLa - 1;
    const largo = (i) => { let s = 0; datos.forEach((r) => { s += String(r[i] === undefined || r[i] === null ? '' : r[i]).length; }); return datos.length ? s / datos.length : 0; };
    if (iD < 0 || largo(iD) < 15) { let best = 0, bl = -1; for (let i = 0; i < iLa; i++) { const l = largo(i); if (l > bl) { bl = l; best = i; } } iD = best; }
    log(`  Columna de direccion usada: posicion ${iD + 1} (encabezado '${String(cols[iD]).trim()}')`);
    let filas = [];
    for (const r of datos) {
      const dt = parseDt(r[iF]);
      if (!dt) continue;
      const d = vacio(r[iD]) ? '' : String(r[iD]).trim();
      filas.push({ dt, vel: parseNum(r[iV]) || 0, tp: parseDur(r[iT]), dir: d, dl: U.limpiarUbicacion(d), lat: parseNum(r[iLa]), lon: iLo === null ? null : parseNum(r[iLo]) });
    }
    if (!filas.length) throw new Error("No se pudo leer ninguna fila con 'Fecha Reporte' valida.");
    if (filas[0].dt > filas[filas.length - 1].dt) filas.reverse();
    filas = filas.map((f, i) => [f, i]).sort((a, b) => a[0].dt - b[0].dt || a[1] - b[1]).map((x) => x[0]);
    let desc = 0;
    while (filas.length > 1) {
      const a = filas[0], b = filas[1];
      if ([a.lat, a.lon, b.lat, b.lon].some((x) => x === null)) break;
      const horas = Math.max((b.dt - a.dt) / 1000, 1) / 3600;
      if (haversine(a.lat, a.lon, b.lat, b.lon) / horas > SALTO_KMH) { filas.shift(); desc++; } else break;
    }
    if (desc) log(`  ⚠ ${desc} registro(s) inicial(es) descartado(s) por salto de posicion imposible.`);
    const dias = new Set(filas.map((f) => f.dt.toISOString().slice(0, 10)));
    if (dias.size > 1) log(`  ⚠ El archivo abarca ${dias.size} dias; se usa la fecha del primer registro.`);
    log(`  Registros leidos: ${filas.length}`);
    return filas;
  };

  const hora12 = (dt) => U.hora12(dt.getUTCHours(), dt.getUTCMinutes());
  const duracion = (s) => `${Math.floor(s / 60)}:${U.pad(s % 60, 2)} minutos`;
  const fechaTxt = (dt) => `${U.pad(dt.getUTCDate(), 2)}/${U.pad(dt.getUTCMonth() + 1, 2)}/${dt.getUTCFullYear()}`;

  function resguardoPropio(alias) {
    const dirs = ((D().RUTAS_DB || {}).PUNTOS_RESGUARDO || {})[String(alias).toUpperCase()] || [];
    return dirs.map((x) => U.limpiarUbicacion(x));
  }
  T.analizar = function (df, alias) {
    const res = { alias, fecha: df[0].dt, inicio: null };
    const i0 = df.findIndex((f) => f.vel > 0);
    const propios = [...new Set(resguardoPropio(alias))];
    let paradas;
    if (i0 !== -1) {
      res.inicio = df[i0].dt; res.dir_inicio = lugar(df[i0].dl);
      const previo = df[Math.max(i0 - 1, 0)];
      res.resguardo = propios.length ? propios.join(' / ') : lugar(previo.dl);
      paradas = df.slice(i0);
    } else {
      res.resguardo = propios.length ? propios.join(' / ') : lugar(df[0].dl);
      paradas = [];
    }
    res.paradas = paradas.filter((f) => f.tp !== null && f.tp > MIN_PARADA_SEG).map((f) => ({ dt: f.dt, seg: f.tp, dir: f.dl }));
    const ult = df[df.length - 1], clave = claveLugar(ult.dl);
    let j = df.length - 1;
    while (j > 0 && claveLugar(df[j - 1].dl) === clave) j--;
    res.actual = lugar(ult.dl); res.actual_desde = df[j].dt;
    return res;
  };

  const encabezado = (saludo, info, alias, cts) => [`> ${saludo}`, lineaEje(info[0], info[1]), `- Unidad *${alias}* - Vin *${info[2]}*`, `- Cts: *${cts}*`];
  const bloque = (ps) => ps.map((p) => `*${hora12(p.dt)}* - duración de parada *${duracion(p.seg)}*\n${p.dir}`).join('\n\n');
  T.mensajeRecorrido = function (r, info, cts, saludo) {
    const a = r.alias;
    let l = encabezado(saludo, info, a, cts).concat(['', `*Fecha:* ${fechaTxt(r.fecha)}`, '']);
    if (r.inicio === null) l = l.concat(['*Hora de inicio:* -', '', `*Acción:* La unidad ${a} no registró movimiento en el período.`, '']);
    else l = l.concat([`*Hora de inicio:* ${hora12(r.inicio)}`, '', `*Acción:* La unidad ${a} inició movimiento desde *${r.dir_inicio}*.`, '']);
    l = l.concat([`*Ubicación regular de resguardo:* ${r.resguardo}`, '']);
    l = r.paradas.length ? l.concat(['*Paradas:*', bloque(r.paradas), '']) : l.concat(['*Paradas:* No realizó ninguna.', '']);
    return l.concat([`*Ubicación actual:* Se encuentra ubicada en ${r.actual}.`, '', '*Observación:* -']).join('\n');
  };
  T.mensajeParadas = function (r, info, cts, saludo) {
    let l = encabezado(saludo, info, r.alias, cts).concat(['', `*Inicio de operación:* ${r.inicio ? hora12(r.inicio) : '-'}`, `*Lugar de resguardo:* ${r.resguardo}`]);
    l = r.paradas.length ? l.concat(['*Paradas:*', bloque(r.paradas)]) : l.concat(['*Paradas:* No realizó ninguna.']);
    return l.concat(['', `*Ubicación actual:* ${r.actual} desde las *${hora12(r.actual_desde)}*`]).join('\n');
  };

  /* buf:ArrayBuffer del archivo; nombre: nombre del archivo; tipo: recorrido|paradas|ambos */
  T.generar = function (buf, nombre, alias, cts, tipo, info, log, ahora) {
    info = info || T.buscarUnidad(alias);
    if (!info) throw new Error(`La unidad ${alias} no esta en la lista de ejes/VIN.`);
    ahora = ahora || new Date();
    const saludo = U.saludoPorHora(ahora.getHours(), ahora.getMinutes());
    const ctsF = U.formatearCts(cts);
    const df = T.leerRecorrido(buf, nombre, log);
    const res = T.analizar(df, alias);
    (log || (() => {}))(`  Inicio: ${res.inicio} | paradas > 5 min: ${res.paradas.length} | actual: ${res.actual}`);
    const out = [];
    if (tipo === 'recorrido' || tipo === 'ambos') out.push(T.mensajeRecorrido(res, info, ctsF, saludo));
    if (tipo === 'paradas' || tipo === 'ambos') out.push(T.mensajeParadas(res, info, ctsF, saludo));
    return out;
  };
})(typeof window !== 'undefined' ? window : globalThis);
