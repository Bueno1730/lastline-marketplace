// POST /api/registrar-pedido
// El navegador del comprador registra su pedido con comprobante.
// Solo inserta pedidos 'pendiente' — no permite confirmar nada.
const { sb } = require('../lib/supabase');
const { extraerMontos } = require('../lib/montos');

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

  // Cruce retroactivo: si la notificacion del banco llego ANTES de que el
  // cliente subiera su comprobante (caso normal), quedo como 'sin_match'.
  // Buscamos una notificacion reciente con el mismo monto y la usamos
  // para verificar este pedido recien registrado.
  const desde = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
  const notifs = await sb(
    `pagos_notificaciones?resultado=eq.sin_match&creado_en=gte.${encodeURIComponent(desde)}&order=creado_en.desc&select=id,monto_detectado,texto&limit=50`
  );
  if (notifs.ok && Array.isArray(notifs.body)) {
    // Compara contra TODOS los montos extraidos del texto, no solo el primero
    const notif = notifs.body.find(n =>
      extraerMontos(n.texto || '').some(c => Math.abs(c - montoNum) < 0.01)
    );
    if (notif) {
      const upd = await sb(`pagos_pedidos?id=eq.${Number(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          estado: 'verificado',
          verificado_en: new Date().toISOString(),
          notif_texto: String(notif.texto || '').slice(0, 500),
        }),
      });
      if (upd.ok) {
        await sb(`pagos_notificaciones?id=eq.${notif.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ pedido_asociado: Number(id), resultado: 'confirmado' }),
        });
        return res.status(200).json({ ok: true, verificadoPorNotificacionPrevia: true });
      }
    }
  }

  return res.status(200).json({ ok: true });
};
