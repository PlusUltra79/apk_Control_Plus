/* Lectores del Excel de "Disponibilidad" (compartido por Excesos, Desconexión y Ojo de Halcón). */
(function (root) {
  'use strict';
  const CP = (root.CP = root.CP || {});
  const U = CP.util, IO = CP.io;
  const Disp = (CP.disp = {});

  const CTS_VACIOS = new Set(['', 'nan', 'sin cts', 's.i', 's.i.', 's/n', '-', 'none']);
  const STATUS_VACIOS = new Set(['', 'nan', 's.i', 's.i.', 's/n', '-', 'none']);
  const s = (v) => (v === null || v === undefined ? '' : String(v));

  const aliasValida = (t) => { t = s(t).trim().toLowerCase(); return ['ut', 'ut2', 'unidad'].includes(t) || t.includes('numeracion'); };

  /* ── CTS (Excesos de Velocidad) ── */
  function parsearHojaTabularCts(rows) {
    for (let fi = 0; fi < Math.min(3, rows.length); fi++) {
      const fila = rows[fi];
      let ia = null, ic = null;
      fila.forEach((c, i) => {
        const t = c === null || c === undefined ? '' : String(c);
        if (ia === null && aliasValida(t)) ia = i;
        if (ic === null && t.trim().toLowerCase().includes('cts')) ic = i;
      });
      if (ia === null || ic === null) continue;
      const res = {};
      for (let r = fi + 1; r < rows.length; r++) {
        const fd = rows[r];
        if (ia >= fd.length || ic >= fd.length) continue;
        const aliasRaw = fd[ia];
        if (aliasRaw === null || aliasRaw === undefined || !s(aliasRaw).trim()) continue;
        const alias = U.limpiarAlias(aliasRaw).toUpperCase();
        const ctsTxt = fd[ic] === null || fd[ic] === undefined ? '' : s(fd[ic]).trim();
        if (CTS_VACIOS.has(ctsTxt.toLowerCase())) continue;
        res[alias] = ctsTxt;
      }
      return res;
    }
    return null;
  }
  function parsearHojaLibre(rows) {
    const res = {};
    let pendiente = null;
    for (const r of rows) {
      const v = r[0];
      const linea = v === null || v === undefined || s(v).trim().toLowerCase() === 'nan' ? '' : s(v).trim();
      let m = linea.match(/^ut:?\s*(\S+)/i);
      if (m) { pendiente = m[1].trim().toUpperCase(); continue; }
      m = linea.match(/^cts:?\s*(.*)$/i);
      if (m && pendiente) {
        const nombre = m[1].trim();
        if (nombre && !CTS_VACIOS.has(nombre.toLowerCase())) res[pendiente] = nombre;
        pendiente = null;
      }
    }
    return res;
  }
  Disp.leerCts = function (buf, log) {
    log = log || (() => {});
    let sheets;
    try { sheets = IO.readSheets(buf); } catch (e) { throw new Error('No se pudo leer el Excel de CTS: ' + e.message); }
    const db = {};
    for (const sh of sheets) {
      if (!sh.rows.length) { log(`  ⚠ Hoja '${sh.name}' vacía, se omite.`); continue; }
      let datos = parsearHojaTabularCts(sh.rows);
      if (!datos || !Object.keys(datos).length) datos = parsearHojaLibre(sh.rows);
      if (!datos || !Object.keys(datos).length) { log(`  ⚠ Hoja '${sh.name}': no se reconoció ningún formato de CTS, se omite.`); continue; }
      for (const [a, c] of Object.entries(datos)) {
        if (a in db && db[a] !== c) log(`  ⚠ Unidad ${a}: CTS distinto en más de una hoja ('${db[a]}' → '${c}' en '${sh.name}'), se usa el último.`);
        db[a] = c;
      }
      log(`  ✓ Hoja '${sh.name}': ${Object.keys(datos).length} unidad(es) con CTS.`);
    }
    log(`  Total unidades con CTS cargadas: ${Object.keys(db).length}`);
    return db;
  };
  Disp.getCts = function (db, alias) {
    if (!db || !Object.keys(db).length) return 'S.I.';
    const v = db[U.limpiarAlias(alias).toUpperCase()];
    return v ? U.formatearCts(v) : 'S.I.';
  };

  /* ── Status (Actualizar Desconexión) ── */
  const MAPA_SUBEJE = {
    sur: ['Am', 'Sur'], norte: ['Am', 'Norte'], centro: ['Am', 'Centro'], acevedo: ['Blv', 'Acevedo'],
    brion: ['Blv', 'Brión'], buroz: ['Blv', 'Buroz'], paez: ['Blv', 'Páez Andrés Bello'], 'pedro gual': ['Blv', 'Pedro Gual'],
    sucre: ['Met', 'Sucre'], suc: ['Met', 'Sucre'], met: ['Met', 'Met'], 'tuy i': ['Ocm', 'Tuy I'], 'tuy ii': ['Ocm', 'Tuy II'],
    pz: ['Pz', 'Plaza Zamora'], 'plaza zamora': ['Pz', 'Plaza Zamora'], cttd: ['Serv.', 'Cont.'], cont: ['Serv.', 'Cont.'],
    esp: ['Serv.', 'Esp.'], ggm: ['Serv.', 'GGM'], 'bus esc': ['Serv.', 'Bus. Esc.'],
  };
  Disp.MAPA_SUBEJE = MAPA_SUBEJE;
  Disp.quitarTildes = function (t) {
    t = String(t).trim().toLowerCase().replace(/\./g, '').replace(/_/g, ' ');
    t = t.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
    return t.replace(/\s+/g, ' ').trim();
  };
  function mapearHoja(nombre) {
    const clave = Disp.quitarTildes(nombre);
    if (clave in MAPA_SUBEJE) return MAPA_SUBEJE[clave];
    const pal = clave.split(' ');
    for (let tam = pal.length; tam >= 1; tam--) {
      for (let ini = 0; ini <= pal.length - tam; ini++) {
        const sub = pal.slice(ini, ini + tam).join(' ');
        if (sub in MAPA_SUBEJE) return MAPA_SUBEJE[sub];
      }
    }
    return null;
  }
  function parsearHojaStatus(rows) {
    for (let fi = 0; fi < Math.min(3, rows.length); fi++) {
      const fila = rows[fi];
      let ia = null, is = null;
      fila.forEach((c, i) => {
        const t = c === null || c === undefined ? '' : String(c);
        const tl = t.trim().toLowerCase();
        if (ia === null && aliasValida(t)) ia = i;
        if (is === null && (tl.includes('estatus') || tl.includes('status') || tl.includes('disponibilidad'))) is = i;
      });
      if (ia === null || is === null) continue;
      const res = {};
      for (let r = fi + 1; r < rows.length; r++) {
        const fd = rows[r];
        if (ia >= fd.length || is >= fd.length) continue;
        const aliasRaw = fd[ia];
        if (aliasRaw === null || aliasRaw === undefined || !s(aliasRaw).trim()) continue;
        const alias = U.formatearAliasNumerico(aliasRaw).replace(/^ut2?:?\s*/i, '').trim().toUpperCase();
        const st = fd[is] === null || fd[is] === undefined ? '' : s(fd[is]).trim();
        if (STATUS_VACIOS.has(st.toLowerCase())) continue;
        res[alias] = U.capitalize(st);
      }
      return res;
    }
    return null;
  }
  Disp.leerStatus = function (buf, log) {
    log = log || (() => {});
    let sheets;
    try { sheets = IO.readSheets(buf); } catch (e) { throw new Error('No se pudo leer el Excel de Disponibilidad: ' + e.message); }
    const db = { map: {}, ejesSinReportar: new Set() };
    for (const sh of sheets) {
      if (!sh.rows.length) {
        log(`  ⚠ Hoja '${sh.name}' vacía, se omite.`);
        const par = mapearHoja(sh.name);
        if (par) { db.ejesSinReportar.add(par[0] + '|' + par[1]); log(`    → Eje/SubEje '${par[0]}/${par[1]}' sin ninguna información de Disponibilidad (Status = 'Sin Reportar').`); }
        continue;
      }
      const datos = parsearHojaStatus(sh.rows);
      if (!datos || !Object.keys(datos).length) { log(`  ⚠ Hoja '${sh.name}': no se reconoció columna de Estatus/Status/Disponibilidad, se omite.`); continue; }
      Object.assign(db.map, datos);
      log(`  ✓ Hoja '${sh.name}': ${Object.keys(datos).length} unidad(es) con Status.`);
    }
    log(`  Total unidades con Status cargadas: ${Object.keys(db.map).length}`);
    return db;
  };
  Disp.getStatusOSinReportar = function (db, alias, eje, subeje) {
    if (!db || !Object.keys(db.map).length && !db.ejesSinReportar.size) return null;
    const enc = db.map[String(alias).trim().toUpperCase()];
    if (enc !== undefined) return enc;
    if (db.ejesSinReportar.has(eje + '|' + subeje)) return 'Sin Reportar';
    return null;
  };

  /* ── Disponibilidad completa (Ojo de Halcón): estatus + cts + ruta ── */
  const HOJAS_SIN_DATOS_UTILES = new Set(['buroz']);
  Disp.leerDisponibilidad = function (buf, log) {
    log = log || (() => {});
    const sheets = IO.readSheets(buf);
    const res = {};
    for (const sh of sheets) {
      const hn = sh.name.trim().toLowerCase();
      if (HOJAS_SIN_DATOS_UTILES.has(hn)) { log(`ℹ Hoja '${sh.name}' omitida (sin formato de columnas utilizable).`); continue; }
      const rows = sh.rows;
      if (!rows.length) { log(`ℹ Hoja '${sh.name}' vacía, omitida.`); continue; }
      let fh = null, ca = null, ce = null, cc = null, cr = null;
      for (let i = 0; i < Math.min(3, rows.length); i++) {
        const fila = rows[i].map((v) => (v === null || v === undefined ? '' : String(v).trim().toLowerCase()));
        const a = fila.findIndex((v) => ['ut', 'ut2', 'unidad'].includes(v) || v.includes('numeracion'));
        const e = fila.findIndex((v) => ['estatus', 'status', 'disponibilidad'].some((n) => v.startsWith(n)));
        if (a !== -1 && e !== -1) {
          fh = i; ca = a; ce = e;
          const c = fila.findIndex((v) => v === 'cts'); cc = c === -1 ? null : c;
          const r = fila.findIndex((v) => ['ruta', 'ubicacion / ruta / serv. esp', 'servicio'].some((n) => v.startsWith(n))); cr = r === -1 ? null : r;
          break;
        }
      }
      if (fh === null) { log(`ℹ Hoja '${sh.name}' no calza con ningún formato reconocido, omitida.`); continue; }
      for (let r = fh + 1; r < rows.length; r++) {
        const fila = rows[r];
        const aliasRaw = fila[ca];
        if (aliasRaw === null || aliasRaw === undefined || s(aliasRaw).trim() === '') continue;
        let alias = U.formatearAliasNumerico(aliasRaw).trim().toUpperCase();
        alias = U.lstripChars(alias, '.').trim();
        const sr = fila[ce];
        const status = sr === null || sr === undefined ? '' : s(sr).trim();
        const statusNorm = status ? U.capitalize(status.trim()) : '';
        const cts = cc !== null && fila[cc] !== null && fila[cc] !== undefined ? s(fila[cc]).trim() : '';
        const ruta = cr !== null && fila[cr] !== null && fila[cr] !== undefined ? s(fila[cr]).trim() : '';
        res[alias] = { status: statusNorm, cts, ruta, hoja: sh.name };
      }
    }
    return res;
  };
  Disp.getDisponibilidad = (db, alias) => (db ? db[U.normalizarAlias(alias).toUpperCase()] || null : null);
})(typeof window !== 'undefined' ? window : globalThis);
