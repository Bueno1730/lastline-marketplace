// POST /api/registrar-pedido
// El navegador del comprador registra su pedido con comprobante.
// Solo inserta pedidos 'pendiente' — no permite confirmar nada.
const { sb } = require('../lib/supabase');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { id, cliente, producto, monto, comprobante } = req.body || {};
  const montoNum = Number(monto);
  if (!id || !cliente || !producto || !Number.isFinite(montoNum) || montoNum <= 0) {
    return res.status(400).json({ error: 'Datos incompletos' });
  }

  const r = await sb('pagos_pedidos', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      id: Number(id),
      cliente: String(cliente).slice(0, 120),
      producto: String(producto).slice(0, 200),
      monto: montoNum,
      comprobante: comprobante ? String(comprobante) : null,
      estado: 'pendiente',
    }),
  });

  if (!r.ok) return res.status(502).json({ error: 'Error al registrar', detalle: r.body });
  return res.status(200).json({ ok: true });
};
