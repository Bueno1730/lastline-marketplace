// POST /api/sync-pull
// El frontend consulta periodicamente; devuelve las tablas que el usuario puede ver.
// Body: { usuarioId, token }
//   - usuarioId 0 (anonimo): solo productos + resenas (catalogo publico).
//   - usuario normal: catalogo + sus pedidos + sus chats.
//   - admin: todas las tablas completas (incluye usuarios).
// Siempre incluye `config` (QR/cuenta del admin) para mostrar en el checkout.
const { sb } = require('../lib/supabase');

async function getUsuariosTodos() {
  const r = await sb('ll_usuarios?select=id,data');
  return r.ok && Array.isArray(r.body) ? r.body : [];
}

async function getTabla(nombre, extra = '') {
  const r = await sb(`${nombre}?select=id,data${extra}`);
  return r.ok && Array.isArray(r.body) ? r.body : [];
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { usuarioId = 0, token = '' } = req.body || {};
  const uid = Number(usuarioId) || 0;

  const usuarios = await getUsuariosTodos();
  const yo = uid ? usuarios.find(u => u.id === uid) : null;

  // Si pidio como usuario, validar token
  if (uid && (!yo || !yo.data.token || yo.data.token !== token)) {
    return res.status(401).json({ error: 'Credenciales de sync invalidas' });
  }

  const esAdmin = !!(yo && yo.data.rol === 'admin');
  const sancionados = new Set(
    usuarios
      .filter(u => u.data.estadoCuenta === 'baneado' ||
        (u.data.estadoCuenta === 'suspendido' && (u.data.suspensionHasta || 0) > Date.now()))
      .map(u => u.id)
  );

  // QR/cuenta del admin para el checkout (dato publico del marketplace)
  const admin = usuarios.find(u => u.data.rol === 'admin');
  const config = admin
    ? { qrBancario: admin.data.qrBancario || '', numeroCuenta: admin.data.numeroCuenta || '' }
    : {};

  // Catalogo publico: productos de vendedores no sancionados + resenas
  const productos = (await getTabla('ll_productos')).filter(p => !sancionados.has(p.id_vendedor));
  const resenas = await getTabla('ll_resenas');

  const tablas = { productos, resenas };

  if (uid && yo) {
    // Pedidos y chats donde participa (cliente o vendedor)
    const filtro = `or=(id_cliente.eq.${uid},id_vendedor.eq.${uid})`;
    tablas.pedidos = await getTabla('ll_pedidos', `&${filtro}`);
    tablas.chats = await getTabla('ll_chats', `&${filtro}`);
    if (esAdmin) {
      tablas.usuarios = usuarios;
      // El admin ve TODOS los pedidos y chats (soporte/disputas)
      tablas.pedidos = await getTabla('ll_pedidos');
      tablas.chats = await getTabla('ll_chats');
    }
  }

  return res.json({ ok: true, tablas, config });
};
