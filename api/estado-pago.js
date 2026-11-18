// GET /api/estado-pago?id=1234567890
// El comprador consulta el estado de SU pedido por id exacto.
// Devuelve solo el estado — nunca lista otros pagos.
const { sb } = require('../lib/supabase');

module.exports = async (req, res) => {
  const id = Number(req.query.id);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'id invalido' });

  const r = await sb(`pagos_pedidos?id=eq.${id}&select=id,estado,verificado_en`);
  if (!r.ok) return res.status(502).json({ error: 'Error consultando' });

  const row = Array.isArray(r.body) ? r.body[0] : null;
  if (!row) return res.status(404).json({ estado: 'desconocido' });
  return res.status(200).json({ id: row.id, estado: row.estado });
};
