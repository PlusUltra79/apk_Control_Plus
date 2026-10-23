/* Herramienta 1 — Excesos de Velocidad (PDF) */
(function (root) {
  'use strict';
  const CP = (root.CP = root.CP || {});
  const U = CP.util, Disp = CP.disp;
  const T = (CP.excesos = {});
  const UNIDADES_FORZADAS = { 'R-036': ['Serv', 'Esp'] };

  T.esAgenteVelocidad = (v) => { const n = String(v).trim().toLowerCase(); return n === 'agente de velocidad' || n === 'exceso de velocidad' || n.includes('velocidad'); };
  T.extraerSubejeEje = function (desc) {
    let m = /\(VIN:\s*\d+\s+([^)]+)\)/i.exec(desc) || /\(Vin:\s*\d+\s+([^)]+)\)/i.exec(desc);
    if (!m) return ['', ''];
    const raw = m[1].trim(), M = U.SUBEJE_A_EJE;
    const eje = M[raw] || M[raw.toUpperCase()] || M[U.title(raw)] || '';
    return [U.title(raw), eje];
  };
  T.formatearLineaEje = function (eje, sub) {
    if (eje === 'Pz') return `* Eje *${eje}*`;
    if (eje === 'Serv') {
      const s = sub.trim().toLowerCase();
      if (s === 'cont') return '* Eje *Serv. Cont*';
      if (s === 'esp') return '* Eje *Serv Esp*';
    }
    return `* Eje *${eje}* Sub Eje *${sub}*`;
  };
  const num = (v) => { const s = String(v).replace(',', '.').trim(); return /^[+-]?(\d+\.?\d*|\.\d+)$/.test(s) ? parseFloat(s) : 0; };

  /* Devuelve la lista de mensajes (uno por unidad) */
  T.procesarPdf = async function (buf, horaTexto, ctsDb, log, ahora) {
    log = log || (() => {});
    const [h, mi] = U.parsearHora24h(horaTexto);
    const saludo = U.saludoPorHora(h, mi);
    const pdf = await CP.pdf.extract(buf);
    log(`  Páginas en el PDF: ${pdf.pages.length}`);
    const reg = {};
    let totalFilas = 0, filasVel = 0;
    for (const tb of pdf.tables) {
      const tabla = tb.rows;
      if (!tabla || tabla.length < 2) continue;
      const header = tabla[0].map((c) => (c ? String(c).trim().toLowerCase() : ''));
      if (!header.includes('unidad')) continue;
      const fi = (k) => { const i = header.findIndex((x) => x.includes(k)); return i === -1 ? null : i; };
      const iU = fi('unidad'), iV = fi('velocidad'), iD = fi('descripci'), iA = fi('agente');
      if (iU === null || iV === null) continue;
      for (const fila of tabla.slice(1)) {
        if (!fila || !fila[iU]) continue;
        totalFilas++;
        const agente = iA !== null && fila[iA] ? String(fila[iA]).trim() : '';
        if (!T.esAgenteVelocidad(agente)) continue;
        filasVel++;
        const alias = U.limpiarAlias(String(fila[iU]).trim());
        const vel = num(fila[iV]);
        const desc = iD !== null && fila[iD] ? String(fila[iD]).replace(/\s*\n\s*/g, ' ').trim() : '';
        let [sub, eje] = T.extraerSubejeEje(desc);
        const f = UNIDADES_FORZADAS[alias.toUpperCase()];
        if (f) { eje = f[0]; sub = f[1]; }
        if (!(alias in reg) || vel > reg[alias].vel) reg[alias] = { vel, sub, eje };
      }
    }
    log(`  Total filas leídas: ${totalFilas}`);
    log(`  Filas de velocidad: ${filasVel}`);
    log(`  Unidades únicas con exceso: ${Object.keys(reg).length}`);
    const msgs = [];
    for (const alias of Object.keys(reg).sort()) {
      const r = reg[alias];
      const eje = r.eje || 'S/E', sub = r.sub || 'S/E';
      const velStr = Number.isInteger(r.vel) ? `${r.vel} km/h` : `${r.vel.toFixed(1)} km/h`;
      msgs.push(`${saludo}\n${T.formatearLineaEje(eje, sub)}\n* Unidad *${alias}* - Vin *${U.getVin(alias)}*\n* CTS: *${Disp.getCts(ctsDb, alias)}*\n*Incidencia:* Exceso de velocidad\n*Incumplimiento:* *${velStr}* en *autopista*`);
      log(`  ✓ ${alias} | ${eje} / ${sub} | ${velStr}`);
    }
    return msgs;
  };
})(typeof window !== 'undefined' ? window : globalThis);
