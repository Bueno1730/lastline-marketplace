// POST /api/confirmar-pago
// Lo llama MacroDroid en el celular del admin cuando llega la notificacion del banco.
// Body: { token, titulo, texto }
// Extrae el monto del texto y lo cruza con pedidos 'pendiente' por monto exacto.
const { sb } = require('../lib/supabase');

const VENTANA_HORAS = 48;

// Extrae montos candidatos del texto de una notificacion bancaria.
// Soporta "Bs 150,00", "150.00", "1.234,56", "150 Bs", "Bs. 150".
function extraerMontos(texto) {
  const nums = new Set();
  const re = /\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})|\d+/g;
  for (const m of texto.match(re) || []) {
    let s = m;
    const tieneComa = s.includes(','), tienePunto = s.includes('.');
    if (tieneComa && tienePunto) {
      // El ultimo separador es el decimal
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
      else s = s.replace(/,/g, '');
    } else if (tieneComa) {
      s = s.replace(',', '.');
    } else if (tienePunto) {
      const partes = s.split('.');
      // "1.234" es miles; "150.00" es decimal
      if (partes.length === 2 && partes[1].length === 3 && partes[0].length <= 3) s = s.replace('.', '');
    }
    const n = Number(s);
    if (Number.isFinite(n) && n > 0) nums.add(n);
  }
  return [...nums];
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { token, titulo = '', texto = '' } = req.body || {};
  if (!token || token !== process.env.WEBHOOK_TOKEN) {
    return res.status(401).json({ error: 'Token invalido' });
  }
  if (!texto && !titulo) return res.status(400).json({ error: 'Sin texto' });

  const completo = `${titulo} ${texto}`;
  const candidatos = extraerMontos(completo);
  const desde = new Date(Date.now() - VENTANA_HORAS * 3600 * 1000).toISOString();

  // Pedidos pendientes dentro de la ventana de tiempo
  const pend = await sb(
    `pagos_pedidos?estado=eq.pendiente&creado_en=gte.${encodeURIComponent(desde)}&order=creado_en.asc&select=id,monto,cliente`
  );
  if (!pend.ok) return res.status(502).json({ error: 'Error consultando pedidos' });

  const pendientes = Array.isArray(pend.body) ? pend.body : [];
  let match = null;
  for (const cand of candidatos) {
    match = pendientes.find(p => Math.abs(Number(p.monto) - cand) < 0.01);
    if (match) break;
  }

  // Registrar la notificacion SIEMPRE (auditoria antifraude)
  await sb('pagos_notificaciones', {
    method: 'POST',
    body: JSON.stringify({
      titulo: String(titulo).slice(0, 200),
      texto: String(completo).slice(0, 1000),
      monto_detectado: match ? Number(match.monto) : (candidatos[0] || null),
      pedido_asociado: match ? match.id : null,
      resultado: match ? 'confirmado' : 'sin_match',
    }),
  });

  if (!match) {
    return res.status(200).json({ ok: true, confirmado: false, motivo: 'sin pedido pendiente con ese monto', candidatos });
  }

  const upd = await sb(`pagos_pedidos?id=eq.${match.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      estado: 'verificado',
      verificado_en: new Date().toISOString(),
      notif_texto: String(completo).slice(0, 500),
    }),
  });
  if (!upd.ok) return res.status(502).json({ error: 'Error actualizando pedido' });

  return res.status(200).json({ ok: true, confirmado: true, pedido: match.id, monto: match.monto });
};
