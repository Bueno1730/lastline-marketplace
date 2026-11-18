// /api/pagos-admin — solo para el administrador (requiere ADMIN_TOKEN).
// GET  ?token=...            -> lista pendientes + ultimas verificaciones
// POST {token, id, accion, motivo} -> confirmar o rechazar manualmente
const { sb } = require('../lib/supabase');

function auth(req) {
  const t = req.method === 'GET' ? req.query.token : (req.body || {}).token;
  return t && t === process.env.ADMIN_TOKEN;
}

module.exports = async (req, res) => {
  if (!auth(req)) return res.status(401).json({ error: 'Token invalido' });

  if (req.method === 'GET') {
    const [pend, notif] = await Promise.all([
      sb('pagos_pedidos?estado=eq.pendiente&order=creado_en.asc&select=id,cliente,producto,monto,creado_en,comprobante'),
      sb('pagos_notificaciones?order=creado_en.desc&limit=20&select=titulo,texto,monto_detectado,pedido_asociado,resultado,creado_en'),
    ]);
    if (!pend.ok) return res.status(502).json({ error: 'Error consultando' });
    return res.status(200).json({ pendientes: pend.body, notificaciones: notif.ok ? notif.body : [] });
  }

  if (req.method === 'POST') {
    const { id, accion, motivo = '' } = req.body || {};
    const pedidoId = Number(id);
    if (!Number.isFinite(pedidoId) || !['confirmar', 'rechazar'].includes(accion)) {
      return res.status(400).json({ error: 'Datos invalidos' });
    }
    const patch = accion === 'confirmar'
      ? { estado: 'verificado', verificado_en: new Date().toISOString(), notif_texto: 'Confirmado manualmente por el administrador' }
      : { estado: 'rechazado', rechazado_motivo: String(motivo).slice(0, 300) };
    const r = await sb(`pagos_pedidos?id=eq.${pedidoId}`, { method: 'PATCH', body: JSON.stringify(patch) });
    if (!r.ok) return res.status(502).json({ error: 'Error actualizando' });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
