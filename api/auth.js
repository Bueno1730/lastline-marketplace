// POST /api/auth
// Registro e inicio de sesion contra la tabla compartida ll_usuarios.
// Body: { accion: 'registro'|'login', nombre, password }
// Devuelve { ok, usuario } — el usuario incluye `token` (credencial de sync).
const { sb } = require('../lib/supabase');
const crypto = require('crypto');

const ADMIN_NOMBRE = 'bueno17a';
const ADMIN_PASS = 'Pablobueno17';

function usuarioBase(nombre, password) {
  return {
    id: Date.now(),
    nombre,
    password,
    rol: 'cliente',
    avatar: '',
    saldoVirtual: 0,
    esVIP: false,
    estadoCuenta: 'activo',
    fechaExpiracionVIP: null,
    fechaAceptacionTerminos: Date.now(),
    token: crypto.randomUUID(),
  };
}

async function buscarPorNombre(nombre) {
  const r = await sb(`ll_usuarios?data->>nombre=ilike.${encodeURIComponent(nombre)}&select=id,data`);
  if (!r.ok || !Array.isArray(r.body)) return null;
  return r.body.find(u => (u.data.nombre || '').toLowerCase() === nombre.toLowerCase()) || null;
}

async function upsertUsuario(user) {
  await sb('ll_usuarios', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify([{ id: user.id, data: user, actualizado: Date.now() }]),
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { accion, nombre = '', password = '' } = req.body || {};
  const nom = String(nombre).trim();
  if (!nom || !password) return res.status(400).json({ error: 'Faltan datos' });
  if (nom.length > 40) return res.status(400).json({ error: 'Nombre demasiado largo' });

  if (accion === 'registro') {
    const existe = await buscarPorNombre(nom);
    if (existe) return res.status(409).json({ error: 'Ese nombre de usuario ya está registrado.' });
    const user = usuarioBase(nom, password);
    await upsertUsuario(user);
    return res.json({ ok: true, usuario: user });
  }

  if (accion === 'login') {
    const row = await buscarPorNombre(nom);
    if (row) {
      const u = row.data;
      if (u.password !== password) return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
      if (!u.token) { u.token = crypto.randomUUID(); await upsertUsuario(u); }
      return res.json({ ok: true, usuario: u });
    }
    // Bootstrap del administrador: primera vez que entra, se crea en la nube
    if (nom.toLowerCase() === ADMIN_NOMBRE && password === ADMIN_PASS) {
      const admin = {
        id: 1,
        nombre: 'Bueno17A',
        nombreCompleto: 'Pablo Bueno Rodriguez',
        password: ADMIN_PASS,
        rol: 'admin',
        avatar: '',
        saldoVirtual: 1000,
        esVIP: true,
        estadoCuenta: 'activo',
        fechaExpiracionVIP: Date.now() + 365 * 24 * 60 * 60 * 1000,
        numeroCuenta: 'BCP - Cta 201-51996262-3-57',
        qrBancario: 'qr-bcp.jpg',
        token: crypto.randomUUID(),
      };
      await upsertUsuario(admin);
      return res.json({ ok: true, usuario: admin });
    }
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
  }

  return res.status(400).json({ error: 'Accion no valida' });
};
