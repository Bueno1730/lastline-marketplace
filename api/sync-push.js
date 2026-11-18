// POST /api/sync-push
// El frontend envia su copia local de una tabla; el servidor hace upsert
// de las filas que el usuario tiene derecho a escribir, y borra las filas
// propias que ya no existen localmente (borrados de productos).
// Body: { usuarioId, token, tabla, filas: [{id, data}] }
const { sb } = require('../lib/supabase');

const TABLAS = {
  usuarios: 'll_usuarios',
  productos: 'll_productos',
  pedidos: 'll_pedidos',
  chats: 'll_chats',
  resenas: 'll_resenas',
};

// Reglas: que filas puede escribir un usuario NO admin en cada tabla
function puedeEscribir(tabla, dato, uid) {
  switch (tabla) {
    case 'usuarios': return dato.id === uid;                       // solo su propia fila
    case 'productos': return dato.id_vendedor === uid;
    case 'pedidos': return dato.id_cliente === uid || dato.id_vendedor === uid;
    case 'chats': return dato.id_cliente === uid || dato.id_vendedor === uid;
    case 'resenas': return dato.id_cliente === uid;
    default: return false;
  }
}

function columnasSync(tabla, dato) {
  switch (tabla) {
    case 'productos': return { id_vendedor: dato.id_vendedor || null };
    case 'pedidos': return { id_cliente: dato.id_cliente || null, id_vendedor: dato.id_vendedor || null, estado: dato.estado || null };
    case 'chats': return { id_pedido: dato.id_pedido || null, id_cliente: dato.id_cliente || null, id_vendedor: dato.id_vendedor || null };
    case 'resenas': return { id_vendedor: dato.id_vendedor || null };
    default: return {};
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { usuarioId, token = '', tabla, filas = [] } = req.body || {};
  const uid = Number(usuarioId) || 0;
  const tablaDb = TABLAS[tabla];
  if (!uid || !tablaDb || !Array.isArray(filas)) {
    return res.status(400).json({ error: 'Solicitud invalida' });
  }

  // Validar identidad
  const r = await sb(`ll_usuarios?id=eq.${uid}&select=data`);
  const yo = r.ok && Array.isArray(r.body) && r.body[0] ? r.body[0].data : null;
  if (!yo || !yo.token || yo.token !== token) {
    return res.status(401).json({ error: 'Credenciales de sync invalidas' });
  }
  const esAdmin = yo.rol === 'admin';

  // Filtrar filas permitidas y construir el upsert
  const ahora = Date.now();
  const upserts = [];
  for (const f of filas.slice(0, 500)) {
    const d = f && f.data;
    if (!d || !d.id) continue;
    if (!esAdmin && !puedeEscribir(tabla, d, uid)) continue;
    upserts.push({ id: d.id, ...columnasSync(tabla, d), data: d, actualizado: ahora });
  }

  if (upserts.length) {
    const wr = await sb(tablaDb, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify(upserts),
    });
    if (!wr.ok) return res.status(502).json({ error: 'Error guardando en la nube', detalle: wr.body });
  }

  // Borrados explicitos: el frontend envia los ids eliminados localmente.
  // Un vendedor solo puede borrar sus productos; el admin cualquiera.
  const borrados = Array.isArray(req.body.borrados) ? req.body.borrados.slice(0, 200) : [];
  if (borrados.length && tabla === 'productos') {
    const vigentes = await sb(`${tablaDb}?id=in.(${borrados.join(',')})&select=id,id_vendedor`);
    if (vigentes.ok && Array.isArray(vigentes.body)) {
      const permitidos = vigentes.body.filter(v => esAdmin || v.id_vendedor === uid).map(v => v.id);
      if (permitidos.length) {
        await sb(`${tablaDb}?id=in.(${permitidos.join(',')})`, { method: 'DELETE' });
      }
    }
  }

  return res.json({ ok: true, escritas: upserts.length });
};
