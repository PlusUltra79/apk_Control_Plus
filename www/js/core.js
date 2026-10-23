/* ControlPlus CCO — núcleo compartido (port fiel de las herramientas Python del bot).
   Desarrollado por MoussaCorp. 2026 */
(function (root) {
  'use strict';
  const CP = (root.CP = root.CP || {});
  const U = (CP.util = {});
  const D = () => root.CPDATA || {};

  /* ───────── utilidades de texto (equivalentes a Python) ───────── */
  U.sinAcentos = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  U.trim = (s) => String(s).trim();
  U.rstripChars = (s, chars) => {
    let i = s.length;
    while (i > 0 && chars.indexOf(s[i - 1]) !== -1) i--;
    return s.slice(0, i);
  };
  U.lstripChars = (s, chars) => {
    let i = 0;
    while (i < s.length && chars.indexOf(s[i]) !== -1) i++;
    return s.slice(i);
  };
  U.capitalize = (s) => (s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s);
  U.title = (s) => String(s).toLowerCase().replace(/\p{L}+/gu, (w) => w[0].toUpperCase() + w.slice(1));
  U.pad = (n, w) => String(n).padStart(w, '0');
  U.esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  /* difflib.SequenceMatcher(None, a, b).ratio() */
  U.ratio = function (a, b) {
    const la = a.length, lb = b.length;
    if (la + lb === 0) return 1.0;
    const b2j = new Map();
    for (let j = 0; j < lb; j++) {
      const c = b[j];
      if (!b2j.has(c)) b2j.set(c, []);
      b2j.get(c).push(j);
    }
    function longest(alo, ahi, blo, bhi) {
      let besti = alo, bestj = blo, bestsize = 0;
      let j2len = new Map();
      for (let i = alo; i < ahi; i++) {
        const newj2len = new Map();
        const js = b2j.get(a[i]) || [];
        for (const j of js) {
          if (j < blo) continue;
          if (j >= bhi) break;
          const k = (j2len.get(j - 1) || 0) + 1;
          newj2len.set(j, k);
          if (k > bestsize) { besti = i - k + 1; bestj = j - k + 1; bestsize = k; }
        }
        j2len = newj2len;
      }
      return [besti, bestj, bestsize];
    }
    let matches = 0;
    const queue = [[0, la, 0, lb]];
    while (queue.length) {
      const [alo, ahi, blo, bhi] = queue.pop();
      const [i, j, k] = longest(alo, ahi, blo, bhi);
      if (k) {
        matches += k;
        if (alo < i && blo < j) queue.push([alo, i, blo, j]);
        if (i + k < ahi && j + k < bhi) queue.push([i + k, ahi, j + k, bhi]);
      }
    }
    return (2.0 * matches) / (la + lb);
  };

  /* ───────── hora / saludo ───────── */
  U.parsearHora24h = function (texto) {
    const limpio = String(texto).trim();
    let m = limpio.match(/^(\d{1,2}):(\d{2})\s*([ap])\.?\s*m\.?$/i);
    if (m) {
      let hora = parseInt(m[1], 10) % 12;
      const minuto = parseInt(m[2], 10);
      if (!(hora >= 0 && hora <= 11 && minuto >= 0 && minuto <= 59)) throw new Error(`Formato de hora inválido: '${texto}'.`);
      if (m[3].toLowerCase() === 'p') hora += 12;
      return [hora, minuto];
    }
    m = limpio.match(/^(\d{1,2}):(\d{2})$/);
    if (m) {
      const hora = parseInt(m[1], 10), minuto = parseInt(m[2], 10);
      if (!(hora >= 0 && hora <= 23 && minuto >= 0 && minuto <= 59)) throw new Error(`Formato de hora inválido: '${texto}'.`);
      return [hora, minuto];
    }
    throw new Error(`Formato de hora inválido: '${texto}'.\nUsa por ejemplo: 21:15  o  08:02 pm`);
  };
  U.saludoPorHora = function (hora, minuto) {
    const t = hora * 60 + minuto;
    if (t >= 240 && t <= 719) return 'Buenos Días';
    if (t >= 720 && t <= 1139) return 'Buenas Tardes';
    return 'Buenas Noches';
  };
  U.saludoActual = function (ahora) {
    const d = ahora || new Date();
    return U.saludoPorHora(d.getHours(), d.getMinutes());
  };
  U.hora12 = function (h, m) {
    const hh = h % 12 || 12;
    return `${U.pad(hh, 2)}:${U.pad(m, 2)} ${h < 12 ? 'AM' : 'PM'}`;
  };

  /* ───────── alias / CTS / VIN ───────── */
  U.formatearAliasNumerico = function (v) {
    if (typeof v === 'number' && Number.isFinite(v) && Math.floor(v) === v) return U.pad(v, 4);
    return v === null || v === undefined ? 'nan' : String(v);
  };
  U.limpiarAlias = (raw) => U.formatearAliasNumerico(raw).replace(/^ut:\s*/i, '').trim();
  U.normalizarAlias = function (alias) {
    if (alias === null || alias === undefined) return '';
    let t = String(alias).trim();
    t = t.replace(/^\s*ut\s*[:.\-]?\s*/i, '').trim();
    t = t.replace(/[*_`]/g, '').trim();
    return t;
  };
  U.normalizarParaExclusion = function (alias) {
    const a = U.normalizarAlias(alias).toUpperCase().replace(/ /g, '');
    let m = a.match(/^R-?(\d{1,3})$/);
    if (m) return 'R-' + U.pad(parseInt(m[1], 10), 3);
    if (/^\d{1,4}$/.test(a)) return a.padStart(4, '0');
    return a;
  };
  /* "R-066, 0343 y r-7" -> {validas:Set, invalidas:[]} */
  U.parsearListaExclusion = function (texto) {
    const tokens = String(texto || '').split(/[,\n;]+|\s+y\s+/).filter((t) => t.trim());
    const validas = new Set(), invalidas = [];
    for (const t of tokens) {
      const a = U.normalizarUnidad(t);
      if (a) validas.add(a); else invalidas.push(t.trim());
    }
    return { validas, invalidas };
  };
  U.normalizarUnidad = function (texto) {
    if (texto === null || texto === undefined) return null;
    const t = U.normalizarAlias(texto).toUpperCase().replace(/ /g, '');
    let m = t.match(/^R-?(\d{1,3})$/);
    if (m) return 'R-' + U.pad(parseInt(m[1], 10), 3);
    if (/^\d{1,4}$/.test(t)) return t.padStart(4, '0');
    return null;
  };
  U.formatearCts = function (nombre) {
    const partes = String(nombre).trim().split(/\s+/).filter(Boolean);
    if (!partes.length) return String(nombre).trim();
    const primero = U.capitalize(partes[0]);
    if (partes.length === 1) return primero;
    return `${primero} ${partes[1][0].toUpperCase()}.`;
  };
  U.getVin = function (alias) {
    const key = String(alias).trim().toUpperCase();
    const db = D().VIN_DB || {};
    for (const k of Object.keys(db)) if (k.toUpperCase() === key) return db[k];
    return 'S/N';
  };

  /* ───────── sub-eje → eje ───────── */
  U.SUBEJE_A_EJE = {
    NORTE: 'Am', CENTRO: 'Am', SUR: 'Am', Norte: 'Am', Centro: 'Am', Sur: 'Am',
    ACEVEDO: 'Blv', BRION: 'Blv', 'BRIÓN': 'Blv', BUROZ: 'Blv', 'PÁEZ': 'Blv', PAEZ: 'Blv',
    'PEDRO GUAL': 'Blv', 'PÁEZ ANDRÉS BELLO': 'Blv',
    Acevedo: 'Blv', Brion: 'Blv', 'Brión': 'Blv', Buroz: 'Blv', 'Páez': 'Blv', Paez: 'Blv',
    'Pedro Gual': 'Blv', 'Pedro gual': 'Blv',
    MET: 'Met', METRO: 'Met', SUCRE: 'Met', Met: 'Met', Metro: 'Met', Sucre: 'Met',
    'TUY I': 'Ocm', 'TUY II': 'Ocm', 'Tuy I': 'Ocm', 'Tuy II': 'Ocm',
    PZ: 'Pz', 'PLAZA ZAMORA': 'Pz', 'PLAZA SUCRE': 'Pz', Pz: 'Pz', 'Plaza Zamora': 'Pz', 'Plaza Sucre': 'Pz',
    ESP: 'Serv', CONT: 'Serv', Esp: 'Serv', Cont: 'Serv',
  };

  /* ───────── ubicación ───────── */
  const PALABRAS_ADMIN = ['Parroquia', 'Municipio', 'Estado', 'Venezuela'];
  U.limpiarUbicacion = function (texto) {
    if (!texto) return '';
    texto = String(texto).trim();
    const buscar = (prefijo) => {
      let mejor = null;
      for (const p of PALABRAS_ADMIN) {
        const m = new RegExp(prefijo + U.esc(p) + '\\b').exec(texto);
        if (m && (mejor === null || m.index < mejor)) mejor = m.index;
      }
      return mejor;
    };
    let corte = buscar('\\.\\s*');
    if (corte === null) corte = buscar('^');
    if (corte === null) return U.rstripChars(texto.trim(), '.').trim();
    const recorte = U.rstripChars(texto.slice(0, corte).trim(), '.').trim();
    if (recorte) return recorte;
    const resto = U.lstripChars(texto.slice(corte), '. ');
    return resto.split('.')[0].trim();
  };
  U.normalizarComparacion = function (texto) {
    if (!texto) return '';
    let t = U.rstripChars(String(texto).trim(), '.').trim().toLowerCase();
    t = t.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
    return t.replace(/\s+/g, ' ');
  };

  /* ───────── lectura de archivos ───────── */
  const IO = (CP.io = {});
  IO.decodeText = function (buf) {
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let txt = new TextDecoder('utf-8', { fatal: false }).decode(u8);
    if (txt.indexOf('\ufffd') !== -1) txt = new TextDecoder('windows-1252').decode(u8);
    return txt.replace(/^\ufeff/, '');
  };
  /* Libro (xls/xlsx) -> [{name, rows:[[valores]]}] (equivalente a pandas header=None) */
  IO.readSheets = function (buf, opts) {
    const X = root.XLSX;
    const wb = X.read(buf, { type: 'array', cellDates: true, raw: true });
    return wb.SheetNames.map((name) => {
      const ws = wb.Sheets[name];
      let rows = X.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true });
      // pandas descarta las filas/columnas finales completamente vacías
      while (rows.length && rows[rows.length - 1].every((v) => v === null || v === '')) rows.pop();
      return { name, rows };
    });
  };
  /* HTML disfrazado de .xls -> matriz de la tabla más grande */
  IO.readHtmlTable = function (buf) {
    const html = IO.decodeText(buf);
    const doc = new root.DOMParser().parseFromString(html, 'text/html');
    let best = null, bestSize = -1;
    doc.querySelectorAll('table').forEach((t) => {
      const rows = [];
      t.querySelectorAll('tr').forEach((tr) => {
        // solo filas propias de esta tabla
        if (tr.closest('table') !== t) return;
        const cells = [];
        tr.querySelectorAll('th,td').forEach((c) => {
          if (c.closest('tr') !== tr) return;
          cells.push(c.textContent.replace(/\s+/g, ' ').trim());
        });
        if (cells.length) rows.push(cells);
      });
      const w = rows.reduce((m, r) => Math.max(m, r.length), 0);
      rows.forEach((r) => { while (r.length < w) r.push(''); });
      const size = rows.length * w;
      if (size > bestSize) { best = rows; bestSize = size; }
    });
    return { rows: best || [], html };
  };
  /* ¿es un archivo HTML (aunque se llame .xls)? */
  IO.esHtml = function (buf) {
    const u8 = new Uint8Array(buf.slice ? buf.slice(0, 512) : buf);
    const head = new TextDecoder('latin1').decode(u8).toLowerCase();
    return head.indexOf('<html') !== -1 || head.indexOf('<table') !== -1 || head.indexOf('<!doctype') !== -1 || head.indexOf('<?xml') !== -1 && head.indexOf('<table') !== -1;
  };
  /* Tabla genérica (GTR): HTML o Excel -> {header:[...], rows:[[...]]} usando la primera fila con encabezados */
  IO.readTabla = function (buf) {
    if (IO.esHtml(buf)) {
      const { rows } = IO.readHtmlTable(buf);
      return rows;
    }
    const sheets = IO.readSheets(buf);
    return sheets.length ? sheets[0].rows.map((r) => r.map((v) => (v === null ? '' : v))) : [];
  };
  IO.str = (v) => (v === null || v === undefined ? '' : String(v));
  IO.num = function (v) {
    if (typeof v === 'number') return v;
    if (v === null || v === undefined) return NaN;
    const s = String(v).trim().replace(',', '.');
    if (s === '') return NaN;
    const n = Number(s);
    return Number.isNaN(n) ? NaN : n;
  };
})(typeof window !== 'undefined' ? window : globalThis);
