// ==========================================================================
// LAST LINE - MARKETPLACE DIGITAL MULTI-VENDEDOR (SISTEMA CORPORATIVO)
// ==========================================================================

// Avatar generico en Base64 con fondo verde oscuro y silueta en verde lima neon
const DEFAULT_AVATAR = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHJlY3Qgd2lkdGg9IjI0IiBoZWlnaHQ9IjI0IiBmaWxsPSIjMjMyZTI1Ii8+PHBhdGggZD0iTTEyIDEyYzIuMjEgMCA0LTEuNzkgNC00cy0xLjc5LTQtNC00LTQgMS43OS00IDQgMS43OSA0IDQgNHptMCAyYy0yLjY3IDAtOCAxLjM0LTggNHYyaDE2di0yYzAtMi42Ni01LjMzLTQtOC00eiIgZmlsbD0iI2Q1ZjU5YyIvPjwvc3ZnPg==';

// QR Bancario de demostración en Base64
const SAMPLE_QR_SVG = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="%23ffffff"/><rect x="20" y="20" width="50" height="50" fill="%23162019"/><rect x="30" y="30" width="30" height="30" fill="%23ffffff"/><rect x="38" y="38" width="14" height="14" fill="%23162019"/><rect x="130" y="20" width="50" height="50" fill="%23162019"/><rect x="140" y="30" width="30" height="30" fill="%23ffffff"/><rect x="148" y="38" width="14" height="14" fill="%23162019"/><rect x="20" y="130" width="50" height="50" fill="%23162019"/><rect x="30" y="140" width="30" height="30" fill="%23ffffff"/><rect x="38" y="148" width="14" height="14" fill="%23162019"/><rect x="90" y="30" width="20" height="40" fill="%23162019"/><rect x="90" y="90" width="20" height="20" fill="%23162019"/><rect x="130" y="90" width="40" height="20" fill="%23162019"/><rect x="90" y="130" width="40" height="40" fill="%23162019"/><rect x="150" y="140" width="20" height="30" fill="%23162019"/><circle cx="100" cy="100" r="10" fill="%23d5f59c"/></svg>';

// Constante de automatizacion: 10 Minutos para auto-confirmacion
const TIEMPO_AUTO_CONFIRMACION_MS = 10 * 60 * 1000;

// Constante: duracion del chat de transaccion cliente-vendedor (7 dias)
const DURACION_CHAT_MS = 7 * 24 * 60 * 60 * 1000;

// Cotizacion oficial de referencia del Banco Central de Bolivia (BCB)
const TASA_BCB_OFICIAL = 6.96;

// Variables de estado
let productoEnCheckout = null;
let categoriaActiva = 'Todos';
let adminTabActiva = 'solicitudes';
let vendedorTabActiva = 'productos';
let chatAbiertoIdPedido = null;
let chatUltimoRender = '';
let terminosOrigen = null;
let terminosAceptadosSesion = false;
let resenaPedidoId = null;
let resenaEstrellasSeleccionadas = 0;
let comprobanteCheckoutTemporal = null;
let reenvioPedidoId = null;
let reenvioComprobanteTemporal = null;

// --- CONTROL DE TASA DE CAMBIO GLOBAL (REQUERIMIENTO 4) ---
function getTasaCambioGlobal() {
    const tasa = parseFloat(localStorage.getItem('tasaCambioGlobal'));
    return (!isNaN(tasa) && tasa > 0) ? tasa : 10.00;
}

function setTasaCambioGlobal(val) {
    localStorage.setItem('tasaCambioGlobal', Number(val).toFixed(2));
}

// Metadatos de la tasa: fuente ('bcb_oficial', 'api_bcb', 'manual') y fecha de actualizacion
function getTasaCambioMeta() {
    try {
        return JSON.parse(localStorage.getItem('tasaCambioMeta')) || null;
    } catch {
        return null;
    }
}

function setTasaCambioMeta(meta) {
    localStorage.setItem('tasaCambioMeta', JSON.stringify(meta));
}

// Cálculo del precio de un producto: Fijo vs Dinámico
function calcularPrecioProducto(prod) {
    if (!prod) return 0;
    if (prod.tipoPrecio === 'dinamico') {
        const precioUSD = Number(prod.precioUSD) || 0;
        const margen = Number(prod.margenGanancia) || 0;
        const tasa = getTasaCambioGlobal();
        // Fórmula requerida: (precioUSD * tasaCambioGlobal) * (1 + (margenGanancia / 100))
        // Redondear al entero superior
        const total = Math.ceil((precioUSD * tasa) * (1 + (margen / 100)));
        return total > 0 ? total : (Number(prod.precio) || 0);
    }
    return Number(prod.precio) || 0;
}

// Historial de Cortes de Caja (Requerimiento 3)
function getHistorialPagosVendedores() {
    try {
        return JSON.parse(localStorage.getItem('historialPagosVendedores')) || [];
    } catch {
        return [];
    }
}

function saveHistorialPagosVendedores(historial) {
    localStorage.setItem('historialPagosVendedores', JSON.stringify(historial));
}

// --- 1. BASE DE DATOS LOCALSTORAGE ---
function initDB() {
    // Migracion de version: navegadores con datos de la etapa demo se limpian una vez
    const DB_VERSION = '2';
    if (localStorage.getItem('dbVersion') !== DB_VERSION) {
        ['usuarios', 'productos', 'pedidos', 'chats', 'resenas',
         'historialPagosVendedores', 'usuarioActual', 'pagoAdminToken'
        ].forEach(k => {
            localStorage.removeItem(k);
            if (typeof _dbCache !== 'undefined') delete _dbCache[k];
        });
        localStorage.setItem('dbVersion', DB_VERSION);
    }

    // 0. Tasa de Cambio Global (referencial BCB), Pagos, Chats y Reseñas
    if (!localStorage.getItem('tasaCambioMeta')) {
        // Si nunca se sincronizo, se parte de la cotizacion oficial del BCB
        localStorage.setItem('tasaCambioGlobal', TASA_BCB_OFICIAL.toFixed(2));
        localStorage.setItem('tasaCambioMeta', JSON.stringify({ fuente: 'bcb_oficial', fecha: Date.now() }));
    }
    if (!localStorage.getItem('historialPagosVendedores')) {
        localStorage.setItem('historialPagosVendedores', JSON.stringify([]));
    }
    if (!localStorage.getItem('chats')) {
        localStorage.setItem('chats', JSON.stringify([]));
    }
    if (!localStorage.getItem('resenas')) {
        localStorage.setItem('resenas', JSON.stringify([]));
    }

    // 1. Usuarios
    const storedUsers = localStorage.getItem('usuarios');
    if (!storedUsers) {
        const defaultUsers = [
            {
                id: 1,
                nombre: 'Bueno17A',
                nombreCompleto: 'Pablo Bueno Rodriguez',
                password: 'Pablobueno17',
                rol: 'admin',
                avatar: '',
                saldoVirtual: 1000,
                esVIP: true,
                estadoCuenta: 'activo',
                fechaExpiracionVIP: Date.now() + (365 * 24 * 60 * 60 * 1000),
                numeroCuenta: 'BCP - Cta 201-51996262-3-57',
                qrBancario: 'qr-bcp.jpg'
            }
        ];
        localStorage.setItem('usuarios', JSON.stringify(defaultUsers));
    } else {
        try {
            let parsedUsers = JSON.parse(storedUsers);
            let needsSave = false;

            parsedUsers = parsedUsers.map(u => {
                if (u.username && !u.nombre) {
                    u.nombre = u.username;
                    needsSave = true;
                }
                if (u.role && !u.rol) {
                    u.rol = u.role === 'admin' ? 'admin' : 'cliente';
                    needsSave = true;
                }
                if (u.saldoVirtual === undefined) {
                    u.saldoVirtual = 0;
                    needsSave = true;
                }
                if (u.esVIP === undefined) {
                    u.esVIP = u.rol === 'admin';
                    needsSave = true;
                }
                if (u.avatar === undefined) {
                    u.avatar = '';
                    needsSave = true;
                }
                if (u.rol === 'vendedor' && !u.numeroCuenta) {
                    u.numeroCuenta = u.cuentaBancaria || 'Banco Mercantil - Cta 4012948210';
                    needsSave = true;
                }
                if (u.rol === 'vendedor' && !u.qrBancario) {
                    u.qrBancario = SAMPLE_QR_SVG;
                    needsSave = true;
                }
                if (u.estadoCuenta === undefined) {
                    u.estadoCuenta = 'activo';
                    needsSave = true;
                }
                return u;
            });

            // Verificar admin oficial
            let adminUser = parsedUsers.find(u => u.nombre && u.nombre.toLowerCase() === 'bueno17a');
            if (!adminUser) {
                parsedUsers.push({
                    id: 1,
                    nombre: 'Bueno17A',
                    nombreCompleto: 'Pablo Bueno Rodriguez',
                    password: 'Pablobueno17',
                    rol: 'admin',
                    avatar: '',
                    estadoCuenta: 'activo',
                    saldoVirtual: 1000,
                    esVIP: true,
                    fechaExpiracionVIP: Date.now() + (365 * 24 * 60 * 60 * 1000),
                    numeroCuenta: 'BCP - Cta 201-51996262-3-57',
                    qrBancario: 'qr-bcp.jpg'
                });
                needsSave = true;
            } else {
                adminUser.password = 'Pablobueno17';
                adminUser.rol = 'admin';
                if (adminUser.qrBancario === SAMPLE_QR_SVG || !adminUser.qrBancario) {
                    adminUser.qrBancario = 'qr-bcp.jpg';
                    adminUser.numeroCuenta = 'BCP - Cta 201-51996262-3-57';
                }
                needsSave = true;
            }

            if (needsSave) {
                localStorage.setItem('usuarios', JSON.stringify(parsedUsers));
            }
        } catch (e) {
            console.error("Error al procesar usuarios:", e);
        }
    }

    // 2. Productos
    const storedProducts = localStorage.getItem('productos');
    if (!storedProducts) {
        localStorage.setItem('productos', JSON.stringify([]));
    } else {
        try {
            let parsedProds = JSON.parse(storedProducts);
            let updated = false;
            parsedProds = parsedProds.map(p => {
                if (!p.tipoPrecio) {
                    p.tipoPrecio = 'fijo';
                    if (p.precio < 90) p.precio = Math.round(p.precio * 10);
                    updated = true;
                }
                return p;
            });
            if (updated) {
                localStorage.setItem('productos', JSON.stringify(parsedProds));
            }
        } catch {
            localStorage.setItem('productos', JSON.stringify([]));
        }
    }

    // 3. Pedidos
    const storedOrders = localStorage.getItem('pedidos');
    if (!storedOrders) {
        localStorage.setItem('pedidos', JSON.stringify([]));
    } else {
        try {
            let parsedOrders = JSON.parse(storedOrders);
            let updated = false;
            parsedOrders = parsedOrders.map(p => {
                if (p.estado === "Entregado_EsperandoConfirmacion" && !p.timestampEntrega) {
                    p.timestampEntrega = Date.now();
                    updated = true;
                }
                return p;
            });

            if (updated) localStorage.setItem('pedidos', JSON.stringify(parsedOrders));
        } catch {}
    }

    // 4. Usuario en sesion
    const currentUser = getUsuarioActual();
    if (currentUser) {
        const freshUser = getUsuarioById(currentUser.id) || getUsuarioByNombre(currentUser.nombre);
        if (freshUser) {
            const estadoSesion = resolverEstadoCuenta(freshUser.id);
            if (estadoSesion === 'activo') {
                const actualizado = getUsuarioById(freshUser.id);
                localStorage.setItem('usuarioActual', JSON.stringify(actualizado || freshUser));
            } else {
                // Cuenta baneada o suspendida: se cierra la sesion
                localStorage.removeItem('usuarioActual');
            }
        } else {
            localStorage.removeItem('usuarioActual');
        }
    }
}

// Helpers de BD — cache en memoria para evitar JSON.parse en cada lectura.
// Las lecturas repiten el mismo array (por referencia); las mutaciones se
// persisten solo cuando el llamador invoca el save* correspondiente.
const _dbCache = {};

function _getTable(key) {
    if (_dbCache[key] === undefined) {
        try {
            _dbCache[key] = JSON.parse(localStorage.getItem(key)) || [];
        } catch {
            _dbCache[key] = [];
        }
    }
    return _dbCache[key];
}

function _setTable(key, data) {
    _dbCache[key] = data;
    localStorage.setItem(key, JSON.stringify(data));
}

function getUsuarios() {
    return _getTable('usuarios');
}

function saveUsuarios(usuarios) {
    _setTable('usuarios', usuarios);
    programarPush('usuarios');
}

function getProductos() {
    return _getTable('productos');
}

function saveProductos(productos) {
    _setTable('productos', productos);
    programarPush('productos');
}

function getPedidos() {
    return _getTable('pedidos');
}

function savePedidos(pedidos) {
    _setTable('pedidos', pedidos);
    programarPush('pedidos');
}

// --- SINCRONIZACIÓN CON LA NUBE (Supabase via /api/sync-*) ---
// Las tablas locales son un espejo: las lecturas siguen siendo síncronas,
// los guardados se suben (push) y cada 5s se bajan los cambios (pull).
const TABLAS_NUBE = ['usuarios', 'productos', 'pedidos', 'chats', 'resenas'];
const _pushPendiente = {};
const _pushTimers = {};
const _borradosNube = {};
let configNube = {};

function credencialesSync() {
    const u = getUsuarioActual();
    if (!u || !u.token) return { usuarioId: 0, token: '' };
    return { usuarioId: u.id, token: u.token };
}

function programarPush(tabla) {
    _pushPendiente[tabla] = true;
    clearTimeout(_pushTimers[tabla]);
    _pushTimers[tabla] = setTimeout(() => pushTabla(tabla), 800);
}

function registrarBorradoNube(tabla, id) {
    (_borradosNube[tabla] = _borradosNube[tabla] || []).push(id);
    programarPush(tabla);
}

async function pushTabla(tabla) {
    if (!TABLAS_NUBE.includes(tabla)) return;
    const creds = credencialesSync();
    if (!creds.token) { _pushPendiente[tabla] = false; return; }
    const filas = _getTable(tabla).map(r => ({ id: r.id, data: r }));
    const borrados = _borradosNube[tabla] || [];
    try {
        const r = await fetch('/api/sync-push', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...creds, tabla, filas, borrados })
        });
        if (r.ok) {
            _pushPendiente[tabla] = false;
            _borradosNube[tabla] = [];
        }
    } catch (e) { /* sin conexión: reintenta en el próximo guardado o ciclo */ }
}

const RENDER_POR_RUTA = {
    '#/': () => { renderHomeStats(); renderCatalogo(); },
    '#/mis-compras': renderCompras,
    '#/admin': renderAdmin,
    '#/dashboard-vendedor': renderVendedor,
    '#/perfil': renderPerfil
};

function renderVistaActual() {
    const h = window.location.hash || '#/';
    const fn = RENDER_POR_RUTA[h];
    if (fn) fn();
    if (chatAbiertoIdPedido) renderChatMensajes();
}

let _pullEnCurso = false;
async function pullNube() {
    if (_pullEnCurso || !TABLAS_NUBE) return;
    _pullEnCurso = true;
    try {
        const creds = credencialesSync();
        const r = await fetch('/api/sync-pull', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(creds)
        });
        if (!r.ok) return;
        const { tablas = {}, config = {} } = await r.json();
        if (config && (config.qrBancario || config.numeroCuenta)) configNube = config;
        let huboCambios = false;
        for (const tabla of Object.keys(tablas)) {
            if (_pushPendiente[tabla]) continue; // no pisar escrituras pendientes
            const remotas = tablas[tabla].map(row => row.data);
            if (JSON.stringify(remotas) !== JSON.stringify(_getTable(tabla))) {
                _setTable(tabla, remotas);
                huboCambios = true;
            }
        }
        if (huboCambios) renderVistaActual();
    } catch (e) { /* sin conexión: la app sigue en modo local */ }
    finally { _pullEnCurso = false; }
}
setInterval(pullNube, 5000);

function getUsuarioActual() {
    try {
        const u = localStorage.getItem('usuarioActual');
        return u ? JSON.parse(u) : null;
    } catch {
        return null;
    }
}

function setUsuarioActual(user) {
    if (user) {
        localStorage.setItem('usuarioActual', JSON.stringify(user));
    } else {
        localStorage.removeItem('usuarioActual');
    }
}

function getUsuarioById(id) {
    return getUsuarios().find(u => u.id == id);
}

function getUsuarioByNombre(nombre) {
    if (!nombre) return null;
    return getUsuarios().find(u => u.nombre.toLowerCase() === nombre.trim().toLowerCase());
}

// --- 2. HASH ROUTING (SPA) ---
const RUTAS = {
    '#/': 'vista-inicio',
    '#/perfil': 'vista-perfil',
    '#/admin': 'vista-admin',
    '#/dashboard-vendedor': 'vista-vendedor',
    '#/mis-compras': 'vista-compras'
};

function router() {
    const hash = window.location.hash || '#/';
    const targetSectionId = RUTAS[hash] || 'vista-inicio';

    document.querySelectorAll('.view-section').forEach(section => {
        section.classList.remove('active');
    });

    const activeSection = document.getElementById(targetSectionId);
    if (activeSection) {
        activeSection.classList.add('active');
    }

    // Actualizar Header dinámico y botones de Hero
    renderHeader(hash);

    // Renderizar la vista correspondiente
    if (targetSectionId === 'vista-inicio') {
        renderHomeStats();
        renderCatalogo(categoriaActiva);
    } else if (targetSectionId === 'vista-perfil') {
        renderPerfil();
    } else if (targetSectionId === 'vista-admin') {
        renderAdmin();
    } else if (targetSectionId === 'vista-vendedor') {
        renderVendedor();
    } else if (targetSectionId === 'vista-compras') {
        renderCompras();
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
    pullNube();
}

window.addEventListener('hashchange', router);
window.addEventListener('DOMContentLoaded', () => {
    initDB();
    pullNube();
    router();
});

// --- 3. HEADER DINÁMICO & OCULTAR BOTONES HERO SI HAY SESIÓN (REQUERIMIENTO 1) ---
function renderHeader(currentHash = window.location.hash || '#/') {
    const nav = document.getElementById('userNav');
    const heroButtons = document.getElementById('heroActionButtons');
    const user = getUsuarioActual();

    // Requerimiento 1: Si hay sesion, oculta los botones del Hero para limpiar la interfaz
    if (heroButtons) {
        heroButtons.style.display = user ? 'none' : 'flex';
    }

    if (!nav) return;

    // Si NO hay sesión
    if (!user) {
        nav.innerHTML = `
            <a href="#/" class="nav-link ${currentHash === '#/' ? 'active' : ''}">Explorar</a>
            <button class="btn btn-ghost" onclick="openModal('modalLogin')">Iniciar Sesión</button>
            <button class="btn btn-neon" onclick="openModal('modalRegistro')">Registrarse</button>
        `;
        return;
    }

    // Si HAY sesión: enlaces limpios sin emojis
    const avatarImg = user.avatar && user.avatar.trim() !== '' ? user.avatar : DEFAULT_AVATAR;

    let roleLinks = '';
    let roleBadge = '';

    if (user.rol === 'admin') {
        roleLinks += `<a href="#/admin" class="nav-link ${currentHash === '#/admin' ? 'active' : ''}">Panel Admin</a>`;
        roleBadge = `<span class="badge-role badge-admin">Admin</span>`;
    } else if (user.rol === 'vendedor') {
        roleLinks += `<a href="#/dashboard-vendedor" class="nav-link ${currentHash === '#/dashboard-vendedor' ? 'active' : ''}">Mi Tienda</a>`;
        roleBadge = `<span class="badge-role badge-vendedor">Vendedor</span>`;
    } else if (user.rol === 'vendedor_pendiente') {
        roleLinks += `<a href="#/dashboard-vendedor" class="nav-link ${currentHash === '#/dashboard-vendedor' ? 'active' : ''}">Mi Solicitud</a>`;
        roleBadge = `<span class="badge-role badge-vendedor_pendiente">En Revisión</span>`;
    } else {
        roleLinks += `<a href="#/mis-compras" class="nav-link ${currentHash === '#/mis-compras' ? 'active' : ''}">Mis Compras</a>`;
        roleBadge = `<span class="badge-role badge-cliente">Cliente</span>`;
    }

    const esVipActivo = user.esVIP && (!user.fechaExpiracionVIP || user.fechaExpiracionVIP > Date.now());

    nav.innerHTML = `
        <a href="#/" class="nav-link ${currentHash === '#/' ? 'active' : ''}">Explorar</a>
        ${roleLinks}
        <a href="#/perfil" class="user-pill" title="Ver mi perfil">
            <img src="${avatarImg}" alt="${user.nombre}" class="user-pill-avatar">
            <div class="user-pill-info">
                <span class="user-pill-name">${escapeHTML(user.nombre)}</span>
                <span class="user-pill-balance">Bs. ${Number(user.saldoVirtual || 0).toFixed(2)}</span>
            </div>
            ${roleBadge}
            ${esVipActivo ? '<span class="badge-vip">VIP</span>' : ''}
        </a>
        <button class="btn btn-ghost btn-sm" onclick="logout()" title="Cerrar Sesión">Salir</button>
    `;
}

// --- 4. CATÁLOGO PRINCIPAL & FILTROS (SIN EMOJIS) ---
function renderCatalogo(filtro = categoriaActiva) {
    categoriaActiva = filtro;
    const grid = document.getElementById('catalogoProductosGrid');
    if (!grid) return;

    const productos = getProductos();
    const usuarios = getUsuarios();

    // Se ocultan del catalogo los productos de cuentas baneadas o suspendidas
    const activos = productos.filter(p => estaCuentaActiva(usuarios.find(u => u.id === p.id_vendedor)));
    const filtrados = filtro === 'Todos' 
        ? activos 
        : activos.filter(p => p.categoria.toLowerCase() === filtro.toLowerCase());

    if (filtrados.length === 0) {
        grid.innerHTML = `
            <div class="placeholder-box" style="grid-column: 1 / -1;">
                <h3 style="margin-bottom: 8px;">No hay productos en esta categoría</h3>
                <p class="placeholder-text">Pronto nuevos vendedores publicaran productos en "${filtro}".</p>
                <button class="btn btn-outline" onclick="filtrarCategoria('Todos')">Ver Todos</button>
            </div>
        `;
        return;
    }

    grid.innerHTML = filtrados.map(p => {
        const vendedor = usuarios.find(u => u.id === p.id_vendedor);
        const vendedorNombre = (vendedor && vendedor.nombre) || p.vendedorNombre || 'Vendedor Verificado';
        const vendedorEsVIP = (vendedor && vendedor.esVIP && (!vendedor.fechaExpiracionVIP || vendedor.fechaExpiracionVIP > Date.now())) || p.vendedorVIP === true;
        const resumenV = getResumenVendedor(p.id_vendedor);
        const precioFinal = calcularPrecioProducto(p);

        return `
            <div class="product-card">
                <div class="product-thumb-wrap">
                    <img src="${p.imagen}" alt="${escapeHTML(p.titulo)}" class="product-thumb" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=600&auto=format&fit=crop&q=80'">
                    <span class="product-cat-tag">${p.categoria}</span>
                    <span class="product-escrow-badge">[Escrow]</span>
                </div>
                <div class="product-content">
                    <h3 class="product-title" title="${escapeHTML(p.titulo)}">${escapeHTML(p.titulo)}</h3>
                    
                    <div class="product-seller-info">
                        <span>Vendedor:</span>
                        <span class="product-seller-name">${escapeHTML(vendedorNombre)}</span>
                        ${vendedorEsVIP ? '<span class="badge-vip" style="font-size:0.6rem;">VIP</span>' : ''}
                        ${resumenV.total > 0 ? `<span class="seller-rating" title="${resumenV.total} reseña(s) de clientes">★ ${resumenV.promedio.toFixed(1)}</span>` : '<span style="font-size:0.7rem; color:var(--text-muted);">Sin reseñas</span>'}
                    </div>

                    <div class="product-bottom-row">
                        <div class="product-price-box">
                            <span class="product-price-label">Precio Digital</span>
                            <span class="product-price-val">Bs. ${precioFinal.toFixed(2)}</span>
                            ${p.tipoPrecio === 'dinamico'
                                ? `<span class="badge-price-type badge-price-dynamic">Precio variable según dólar BCB (actualizado)</span>`
                                : `<span class="badge-price-type badge-price-fixed">Precio Fijo</span>`}
                        </div>
                        <button class="btn-buy" onclick="iniciarCompra(${p.id})">
                            Comprar
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function filtrarCategoria(cat, buttonEl) {
    categoriaActiva = cat;
    document.querySelectorAll('.cat-pill').forEach(btn => btn.classList.remove('active'));
    if (buttonEl) {
        buttonEl.classList.add('active');
    } else {
        document.querySelectorAll('.cat-pill').forEach(btn => {
            if (btn.textContent.trim().toLowerCase() === cat.toLowerCase()) btn.classList.add('active');
        });
    }
    renderCatalogo(cat);
}

// --- 5. CHECKOUT SEGURO & QR DINÁMICO ---
function iniciarCompra(productoId) {
    const user = getUsuarioActual();
    
    if (!user) {
        showToast('Debes iniciar sesión para comprar productos en Last Line.', 'info');
        openModal('modalLogin');
        return;
    }

    const bloqueoCompra = obtenerBloqueoCuenta();
    if (bloqueoCompra) {
        showToast(bloqueoCompra, 'error');
        return;
    }

    const productos = getProductos();
    const prod = productos.find(p => p.id === productoId);
    if (!prod) return;

    productoEnCheckout = prod;

    const usuarios = getUsuarios();
    const vendedor = usuarios.find(u => u.id === prod.id_vendedor);
    const vendedorNombre = (vendedor && vendedor.nombre) || prod.vendedorNombre || 'Vendedor Verificado';
    const precioFinal = calcularPrecioProducto(prod);

    const imgEl = document.getElementById('checkoutProdImg');
    const titleEl = document.getElementById('checkoutProdTitulo');
    const vendorEl = document.getElementById('checkoutProdVendedor');
    const baseEl = document.getElementById('checkoutPriceBase');
    const totalEl = document.getElementById('checkoutTotalVal');
    const qrAmountEl = document.getElementById('checkoutQRAmount');
    const qrWrapper = document.getElementById('checkoutQRWrapper');

    const resumenV = getResumenVendedor(prod.id_vendedor);
    const textoReputacion = resumenV.total > 0
        ? ` — ★ ${resumenV.promedio.toFixed(1)} (${resumenV.total} reseñas)`
        : ' — Sin reseñas';

    if (imgEl) imgEl.src = prod.imagen;
    if (titleEl) titleEl.textContent = prod.titulo;
    if (vendorEl) vendorEl.textContent = vendedorNombre + textoReputacion;
    if (baseEl) baseEl.textContent = `Bs. ${precioFinal.toFixed(2)}`;
    if (totalEl) totalEl.textContent = `Bs. ${precioFinal.toFixed(2)}`;
    if (qrAmountEl) qrAmountEl.textContent = `Bs. ${precioFinal.toFixed(2)}`;

    if (qrWrapper) {
        // El QR del admin llega por configNube (sync) o la tabla local; si no, QR simulado
        const adminCuenta = usuarios.find(u => u.rol === 'admin' && u.qrBancario);
        const qrAdmin = configNube.qrBancario || (adminCuenta && adminCuenta.qrBancario);
        qrWrapper.innerHTML = qrAdmin
            ? `<img src="${qrAdmin}" alt="QR de pago Last Line" style="display: block; width: 160px; height: 160px; object-fit: contain;">`
            : generateRealisticQRSVG(precioFinal, prod.id);
    }

    // Resetear el campo de comprobante por si se reutiliza el modal
    comprobanteCheckoutTemporal = null;
    const fileCheckout = document.getElementById('checkoutComprobanteFile');
    if (fileCheckout) fileCheckout.value = '';
    const prevCheckout = document.getElementById('checkoutComprobantePreview');
    if (prevCheckout) prevCheckout.style.display = 'none';

    openModal('modalCheckout');
}

function generateRealisticQRSVG(amount, refId) {
    const size = 25;
    const seed = (Math.round(amount * 100) + refId) % 99991;
    
    function isDark(r, c) {
        if (r < 7 && c < 7) {
            if (r === 0 || r === 6 || c === 0 || c === 6) return true;
            if (r >= 2 && r <= 4 && c >= 2 && c <= 4) return true;
            return false;
        }
        if (r < 7 && c >= size - 7) {
            const cc = c - (size - 7);
            if (r === 0 || r === 6 || cc === 0 || cc === 6) return true;
            if (r >= 2 && r <= 4 && cc >= 2 && cc <= 4) return true;
            return false;
        }
        if (r >= size - 7 && c < 7) {
            const rr = r - (size - 7);
            if (rr === 0 || rr === 6 || c === 0 || c === 6) return true;
            if (rr >= 2 && rr <= 4 && c >= 2 && c <= 4) return true;
            return false;
        }

        if (r === 6 || c === 6) return (r + c) % 2 === 0;
        if (r >= 10 && r <= 14 && c >= 10 && c <= 14) return false;

        const val = Math.sin(r * 12.9898 + c * 78.233 + seed) * 43758.5453;
        return (val - Math.floor(val)) > 0.44;
    }

    let rects = '';
    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            if (isDark(r, c)) {
                rects += `<rect x="${c}" y="${r}" width="1" height="1" fill="#141c16"/>`;
            }
        }
    }

    return `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">
            <rect width="${size}" height="${size}" fill="#ffffff"/>
            ${rects}
            <rect x="9.5" y="10.5" width="6" height="4" rx="0.6" fill="#162019" stroke="#d5f59c" stroke-width="0.3"/>
            <text x="12.5" y="13.2" font-size="2" font-weight="900" fill="#d5f59c" font-family="sans-serif" text-anchor="middle">LL</text>
        </svg>
    `;
}

function simularPagoExitoso() {
    if (!productoEnCheckout) return;

    const user = getUsuarioActual();
    if (!user) {
        closeModal('modalCheckout');
        openModal('modalLogin');
        return;
    }

    const usuarios = getUsuarios();
    const vendedor = usuarios.find(u => u.id === productoEnCheckout.id_vendedor);
    const vendedorNombre = (vendedor && vendedor.nombre) || productoEnCheckout.vendedorNombre || 'Vendedor Verificado';
    const montoCalculado = calcularPrecioProducto(productoEnCheckout);

    const nuevoPedido = {
        id: Date.now(),
        id_cliente: user.id,
        id_vendedor: productoEnCheckout.id_vendedor,
        id_producto: productoEnCheckout.id,
        montoTotal: montoCalculado,
        estado: "Pagado_EsperandoEntrega",
        fecha: new Date().toLocaleString('es-ES', { 
            day: '2-digit', 
            month: 'short', 
            year: 'numeric', 
            hour: '2-digit', 
            minute: '2-digit' 
        }),
        productoTitulo: productoEnCheckout.titulo,
        productoImagen: productoEnCheckout.imagen,
        vendedorNombre: vendedorNombre,
        timestampEntrega: null
    };

    const pedidos = getPedidos();
    pedidos.unshift(nuevoPedido);
    savePedidos(pedidos);

    // Abrir canal de chat cliente-vendedor con duracion de 7 dias
    crearChatParaPedido(nuevoPedido);

    closeModal('modalCheckout');
    showToast("Pago detectado. Se abrio un chat con el vendedor para coordinar la entrega.", "success");

    productoEnCheckout = null;
    window.location.hash = '#/mis-compras';
    router();
}

// --- 5B. FLUJO REAL: COMPROBANTE DE PAGO Y VERIFICACION MANUAL ---
// El cliente paga por QR a la cuenta de Last Line y sube su comprobante.
// El pedido queda en 'Pago_En_Verificacion' hasta que el admin confirme
// la transferencia (manual o via correo del banco -> webhook).

function previewComprobanteCheckout(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        comprobanteCheckoutTemporal = e.target.result;
        const preview = document.getElementById('checkoutComprobantePreview');
        const img = document.getElementById('checkoutComprobanteImg');
        if (img) img.src = comprobanteCheckoutTemporal;
        if (preview) preview.style.display = 'block';
    };
    reader.readAsDataURL(file);
}

function handleEnviarComprobantePago() {
    if (!productoEnCheckout) return;

    const user = getUsuarioActual();
    if (!user) {
        closeModal('modalCheckout');
        openModal('modalLogin');
        return;
    }

    if (!comprobanteCheckoutTemporal) {
        showToast("Adjunta la captura del comprobante de pago para que podamos verificar tu transferencia.", "error");
        return;
    }

    const usuarios = getUsuarios();
    const vendedor = usuarios.find(u => u.id === productoEnCheckout.id_vendedor);
    const vendedorNombre = (vendedor && vendedor.nombre) || productoEnCheckout.vendedorNombre || 'Vendedor Verificado';
    const montoCalculado = calcularPrecioProducto(productoEnCheckout);

    const nuevoPedido = {
        id: Date.now(),
        id_cliente: user.id,
        id_vendedor: productoEnCheckout.id_vendedor,
        id_producto: productoEnCheckout.id,
        montoTotal: montoCalculado,
        estado: "Pago_En_Verificacion",
        fecha: new Date().toLocaleString('es-ES', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }),
        productoTitulo: productoEnCheckout.titulo,
        productoImagen: productoEnCheckout.imagen,
        vendedorNombre: vendedorNombre,
        clienteNombre: user.nombre,
        comprobantePago: comprobanteCheckoutTemporal,
        timestampEntrega: null
    };

    const pedidos = getPedidos();
    pedidos.unshift(nuevoPedido);
    savePedidos(pedidos);

    // Registrar el pedido en la cola compartida (nube) para verificacion
    registrarPedidoEnNube(nuevoPedido, comprobanteCheckoutTemporal);

    closeModal('modalCheckout');
    showToast("Comprobante enviado. Verificaremos tu pago y habilitaremos el chat.", "success");

    comprobanteCheckoutTemporal = null;
    productoEnCheckout = null;
    window.location.hash = '#/mis-compras';
    router();
}

// Confirmacion del admin (manual o automatizada por correo del banco)
function confirmarPagoManual(pedidoId) {
    const pedidos = getPedidos();
    const pedido = pedidos.find(p => p.id === pedidoId);
    if (!pedido || pedido.estado !== 'Pago_En_Verificacion') return;

    const confirmar = confirm(`Confirmar que el pago del pedido #${pedidoId} (Bs. ${Number(pedido.montoTotal).toFixed(2)}) llegó a la cuenta de Last Line?\n\nSe habilitara el chat con el cliente y el pedido pasara a preparacion.`);
    if (!confirmar) return;

    pedido.estado = 'Pagado_EsperandoEntrega';
    pedido.fechaPagoVerificado = Date.now();
    savePedidos(pedidos);

    crearChatParaPedido(pedido);
    showToast(`Pago del pedido #${pedidoId} verificado. Chat habilitado para el cliente.`, 'success');
    renderAdmin();
}

function rechazarPagoManual(pedidoId) {
    const pedidos = getPedidos();
    const pedido = pedidos.find(p => p.id === pedidoId);
    if (!pedido || pedido.estado !== 'Pago_En_Verificacion') return;

    const motivo = prompt('Motivo del rechazo (se mostrara al cliente):', 'No se encontro la transferencia en la cuenta de Last Line.');
    if (motivo === null) return;

    pedido.estado = 'Pago_Rechazado';
    pedido.motivoRechazoPago = motivo.trim() || 'El pago no pudo ser verificado.';
    savePedidos(pedidos);

    showToast(`Pago del pedido #${pedidoId} rechazado. El cliente podra reenviar su comprobante.`, 'error');
    renderAdmin();
}

// Reenvio de comprobante por parte del cliente tras un rechazo
function abrirModalReenviarComprobante(pedidoId) {
    const pedidos = getPedidos();
    const pedido = pedidos.find(p => p.id === pedidoId);
    if (!pedido) return;

    reenvioPedidoId = pedidoId;
    reenvioComprobanteTemporal = null;

    const sub = document.getElementById('reenvioComprobanteSub');
    if (sub) sub.textContent = `Pedido #${pedidoId} — ${pedido.productoTitulo || 'Producto'}`;

    const motivo = document.getElementById('reenvioMotivoTexto');
    if (motivo) {
        if (pedido.motivoRechazoPago) {
            motivo.textContent = `Rechazo anterior: ${pedido.motivoRechazoPago}`;
            motivo.style.display = 'block';
        } else {
            motivo.style.display = 'none';
        }
    }

    const fileInput = document.getElementById('reenvioComprobanteFile');
    if (fileInput) fileInput.value = '';
    const wrap = document.getElementById('reenvioPreviewWrap');
    if (wrap) wrap.style.display = 'none';

    openModal('modalReenviarComprobante');
}

function previewComprobanteReenvio(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        reenvioComprobanteTemporal = e.target.result;
        const img = document.getElementById('reenvioPreviewImg');
        const wrap = document.getElementById('reenvioPreviewWrap');
        if (img) img.src = reenvioComprobanteTemporal;
        if (wrap) wrap.style.display = 'block';
    };
    reader.readAsDataURL(file);
}

function handleReenviarComprobante() {
    if (!reenvioComprobanteTemporal) {
        showToast('Adjunta el nuevo comprobante antes de enviar.', 'error');
        return;
    }
    const pedidos = getPedidos();
    const pedido = pedidos.find(p => p.id === reenvioPedidoId);
    if (!pedido) return;

    pedido.comprobantePago = reenvioComprobanteTemporal;
    pedido.estado = 'Pago_En_Verificacion';
    pedido.fechaReenvio = Date.now();
    delete pedido.motivoRechazoPago;
    savePedidos(pedidos);

    // Actualizar el registro en la nube con el nuevo comprobante
    registrarPedidoEnNube(pedido, reenvioComprobanteTemporal);

    closeModal('modalReenviarComprobante');
    showToast('Comprobante reenviado. Lo verificaremos nuevamente.', 'success');
    reenvioPedidoId = null;
    reenvioComprobanteTemporal = null;
    renderCompras();
}

// --- 5C. SINCRONIZACION DE PAGOS CON LA NUBE (Supabase via API de Vercel) ---
// El estado 'pendiente' del pago vive en la nube compartida; el frontend solo
// refleja el resultado. La confirmacion real la hace el servidor cuando
// MacroDroid envia la notificacion del banco, o el admin la confirma a mano.

function registrarPedidoEnNube(pedido, comprobanteBase64) {
    try {
        fetch('/api/registrar-pedido', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: pedido.id,
                cliente: pedido.clienteNombre || 'Cliente',
                producto: pedido.productoTitulo || 'Producto',
                monto: pedido.montoTotal,
                comprobante: comprobanteBase64 || null
            })
        }).catch(() => {});
    } catch (e) { /* sin nube: sigue funcionando en local */ }
}

// Consulta periodicamente si el servidor ya verifico los pagos pendientes
function verificarPagosPendientesNube() {
    const pendientes = getPedidos().filter(p => p.estado === 'Pago_En_Verificacion');
    if (!pendientes.length) return;
    pendientes.forEach(async ped => {
        try {
            const r = await fetch(`/api/estado-pago?id=${ped.id}`);
            if (!r.ok) return;
            const data = await r.json();
            const lista = getPedidos();
            const p2 = lista.find(x => x.id === ped.id);
            if (!p2) return;
            if (data.estado === 'verificado') {
                p2.estado = 'Pagado_EsperandoEntrega';
                p2.fechaPagoVerificado = Date.now();
                savePedidos(lista);
                crearChatParaPedido(p2);
                showToast(`Pago del pedido #${p2.id} verificado automaticamente. Chat habilitado.`, 'success');
                if (window.location.hash === '#/mis-compras') renderCompras();
            } else if (data.estado === 'rechazado') {
                p2.estado = 'Pago_Rechazado';
                savePedidos(lista);
                if (window.location.hash === '#/mis-compras') renderCompras();
            }
        } catch (e) { /* sin conexion: reintenta en el proximo ciclo */ }
    });
}
setInterval(verificarPagosPendientesNube, 15000);

// --- Cola de pagos compartida en el panel admin ---
function getPagoAdminToken() {
    let t = localStorage.getItem('pagoAdminToken');
    if (t === null) {
        t = prompt('Token de administrador para acceder a los pagos compartidos (se guarda en este navegador):') || '';
        localStorage.setItem('pagoAdminToken', t);
    }
    return t;
}

let pagosNubeCache = {};

async function cargarPagosNubeAdmin() {
    const cont = document.getElementById('adminPagosNube');
    if (!cont) return;
    cont.innerHTML = '<p style="color: var(--text-muted); font-size: 0.85rem;">Cargando pagos compartidos…</p>';
    try {
        const r = await fetch('/api/pagos-admin?token=' + encodeURIComponent(getPagoAdminToken()));
        const data = await r.json();
        if (!r.ok) {
            cont.innerHTML = `<p style="color: var(--danger); font-size: 0.85rem;">Acceso denegado. <a href="#" onclick="localStorage.removeItem('pagoAdminToken'); cargarPagosNubeAdmin(); return false;">Cambiar token</a></p>`;
            return;
        }
        pagosNubeCache = {};
        (data.pendientes || []).forEach(p => { pagosNubeCache[p.id] = p; });
        const pend = data.pendientes || [];
        const notifs = data.notificaciones || [];
        cont.innerHTML = `
            ${pend.length === 0 ? `<p style="color: var(--text-muted); font-size: 0.85rem;">Sin pagos compartidos pendientes.</p>` : `
                <table class="crud-table" style="margin-top: 8px;">
                    <thead><tr><th>Pedido / Fecha</th><th>Cliente</th><th>Producto</th><th>Monto</th><th>Comprobante</th><th style="text-align: right;">Accion</th></tr></thead>
                    <tbody>
                        ${pend.map(p => `
                            <tr>
                                <td><strong>#${p.id}</strong><br><span style="font-size:0.75rem; color:var(--text-muted);">${new Date(p.creado_en).toLocaleString('es-ES')}</span></td>
                                <td>${escapeHTML(p.cliente)}</td>
                                <td style="font-size:0.85rem;">${escapeHTML(p.producto)}</td>
                                <td style="font-weight:700; color: var(--accent);">Bs. ${Number(p.monto).toFixed(2)}</td>
                                <td>${p.comprobante ? `<button class="btn btn-outline btn-sm" onclick="verComprobanteNube(${p.id})">Ver</button>` : '-'}</td>
                                <td style="text-align: right;">
                                    <button class="btn btn-neon btn-sm" onclick="accionPagoNube(${p.id}, 'confirmar')">Confirmar</button>
                                    <button class="btn btn-danger btn-sm" onclick="accionPagoNube(${p.id}, 'rechazar')" style="margin-left: 6px;">Rechazar</button>
                                </td>
                            </tr>`).join('')}
                    </tbody>
                </table>`}
            ${notifs.length > 0 ? `
                <h4 style="margin-top: 18px; color: var(--accent); font-size: 0.95rem;">Notificaciones del banco recibidas (auditoria)</h4>
                <table class="crud-table" style="margin-top: 8px;">
                    <thead><tr><th>Fecha</th><th>Texto</th><th>Monto</th><th>Resultado</th></tr></thead>
                    <tbody>
                        ${notifs.map(n => `
                            <tr>
                                <td style="font-size:0.75rem; color:var(--text-muted); white-space:nowrap;">${new Date(n.creado_en).toLocaleString('es-ES')}</td>
                                <td style="font-size:0.8rem; max-width: 340px;">${escapeHTML((n.texto || '').slice(0, 140))}</td>
                                <td>${n.monto_detectado ? 'Bs. ' + Number(n.monto_detectado).toFixed(2) : '-'}</td>
                                <td style="font-size:0.8rem; color:${n.resultado === 'confirmado' ? 'var(--accent)' : 'var(--text-muted)'};">${n.resultado === 'confirmado' ? 'Pedido #' + n.pedido_asociado : 'Sin coincidencia'}</td>
                            </tr>`).join('')}
                    </tbody>
                </table>` : ''}
        `;
    } catch (e) {
        cont.innerHTML = '<p style="color: var(--text-muted); font-size: 0.85rem;">Sin conexion a la nube de pagos.</p>';
    }
}

function verComprobanteNube(id) {
    const p = pagosNubeCache[id];
    if (p && p.comprobante) abrirModalVerImagen(p.comprobante, `Comprobante — Pedido #${id}`);
}

async function accionPagoNube(id, accion) {
    let motivo = '';
    if (accion === 'rechazar') {
        motivo = prompt('Motivo del rechazo (visible para el cliente):') || '';
        if (motivo === null) return;
    } else if (!confirm(`Confirmar el pago del pedido #${id} en la nube? El cliente vera su pedido como verificado.`)) {
        return;
    }
    await fetch('/api/pagos-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: getPagoAdminToken(), id, accion, motivo })
    }).catch(() => showToast('Sin conexion a la nube.', 'error'));
    cargarPagosNubeAdmin();
}

// --- 6. AUTOMATIZACIÓN DE ENTREGA (10 MIN) Y ESCROW (REQUERIMIENTO 3) ---
function formatearTiempo(ms) {
    if (ms <= 0) return "00:00";
    const totalSegundos = Math.floor(ms / 1000);
    const minutos = Math.floor(totalSegundos / 60);
    const segundos = totalSegundos % 60;
    return `${String(minutos).padStart(2, '0')}:${String(segundos).padStart(2, '0')}`;
}

// Intervalo cada 1 segundo para verificar cuenta regresiva de 10 minutos
setInterval(verificarYActualizarEntregas, 1000);

function verificarYActualizarEntregas() {
    const pedidos = getPedidos();
    let pedidosModificados = false;

    pedidos.forEach(p => {
        if (p.estado === "Entregado_EsperandoConfirmacion" && p.timestampEntrega) {
            const restanteMs = (p.timestampEntrega + TIEMPO_AUTO_CONFIRMACION_MS) - Date.now();
            
            // Si pasan los 10 minutos exactos y el cliente no presiono nada -> Auto-completar
            if (restanteMs <= 0) {
                ejecutarConfirmacionPedido(p.id, true);
                pedidosModificados = true;
            } else {
                // Actualizar texto en tiempo real si el elemento existe en el DOM
                const timerEl = document.getElementById(`timer-digits-${p.id}`);
                if (timerEl) {
                    timerEl.textContent = formatearTiempo(restanteMs);
                }
            }
        }
    });

    if (pedidosModificados) {
        renderCompras();
        renderHeader();
        renderHomeStats();
    }

    // Refrescar el chat abierto si llegaron mensajes nuevos
    if (chatAbiertoIdPedido !== null) {
        renderChatMensajes();
    }
}

// Acción del vendedor: Marcar como Entregado
function marcarPedidoEntregado(pedidoId) {
    const pedidos = getPedidos();
    const pedido = pedidos.find(p => p.id === pedidoId);
    if (!pedido) return;

    // Guarda el timestampEntrega para iniciar el reloj de 10 minutos
    pedido.estado = "Entregado_EsperandoConfirmacion";
    pedido.timestampEntrega = Date.now();
    savePedidos(pedidos);

    showToast("Pedido marcado como Entregado. Se inicio el temporizador de confirmacion.", "success");
    renderVendedor();
}

// Confirmar recepción manual del cliente
function confirmarRecepcionPedido(pedidoId) {
    const confirmacion = confirm(
        "¿Confirmas que recibiste el producto digital en perfecto estado?\n\nAl confirmar, los fondos en Escrow se liberaran de inmediato al vendedor."
    );
    if (!confirmacion) return;

    ejecutarConfirmacionPedido(pedidoId, false);
}

// Lógica de liberación de fondos (manual o automática al expirar 10 min)
function ejecutarConfirmacionPedido(pedidoId, esAutomatico = false) {
    const pedidos = getPedidos();
    const pedido = pedidos.find(p => p.id === pedidoId);
    if (!pedido || pedido.estado !== "Entregado_EsperandoConfirmacion") return;

    const usuarios = getUsuarios();
    const vendedor = usuarios.find(u => u.id === pedido.id_vendedor);

    // a) Verificar VIP: Si es VIP, comision = 2%. Si no, 8%
    const esVIP = vendedor && vendedor.esVIP === true && (!vendedor.fechaExpiracionVIP || vendedor.fechaExpiracionVIP > Date.now());
    const porcentajeComision = esVIP ? 0.02 : 0.08;
    const montoTotal = Number(pedido.montoTotal) || 0;

    // b) Ganancia vendedor = Monto Total * (1 - porcentaje)
    const ganancia = Number((montoTotal * (1 - porcentajeComision)).toFixed(2));
    const comisionPlataforma = Number((montoTotal * porcentajeComision).toFixed(2));

    // c) Sumar ganancia al saldoVirtual del vendedor en localStorage
    if (vendedor) {
        vendedor.saldoVirtual = Number(((Number(vendedor.saldoVirtual) || 0) + ganancia).toFixed(2));
        saveUsuarios(usuarios);

        const act = getUsuarioActual();
        if (act && act.id === vendedor.id) {
            act.saldoVirtual = vendedor.saldoVirtual;
            setUsuarioActual(act);
        }
    }

    // Actualizar pedido a Completado
    pedido.estado = "Completado";
    pedido.gananciaVendedor = ganancia;
    pedido.comisionPlataforma = comisionPlataforma;
    pedido.porcentajeComision = porcentajeComision;
    pedido.fechaCompletado = Date.now();
    pedido.confirmadoPor = esAutomatico ? "sistema_auto_10min" : "cliente";
    savePedidos(pedidos);

    // d) Alerta y mensaje obligatorio
    if (!esAutomatico) {
        alert("Compra finalizada. Dinero liberado al vendedor.");
    }
    showToast(
        esAutomatico 
            ? "Tiempo de confirmacion expirado (10 min). Fondos liberados al vendedor automaticamente." 
            : "Compra finalizada. Dinero liberado al vendedor. ¡Califica a tu vendedor!", 
        "success"
    );

    renderCompras();
    renderHeader();
    renderHomeStats();

    // e) Al confirmar manualmente, invitar al cliente a calificar al vendedor
    if (!esAutomatico) {
        setTimeout(() => abrirModalResena(pedidoId), 600);
    }
}

// Botón rojo: Reportar Problema (Disputa)
function reportarProblemaPedido(pedidoId) {
    const confirmacion = confirm(
        "¿Deseas reportar un problema con este pedido?\n\nAl abrir una disputa, el temporizador de 10 minutos se detendra y los fondos permaneceran congelados en custodia hasta que administracion revise el caso."
    );
    if (!confirmacion) return;

    const pedidos = getPedidos();
    const pedido = pedidos.find(p => p.id === pedidoId);
    if (!pedido) return;

    pedido.estado = "En_Disputa";
    pedido.fechaDisputa = Date.now();
    savePedidos(pedidos);

    showToast("Pedido marcado en disputa. Temporizador detenido y fondos retenidos.", "error");
    renderCompras();
}

// --- 7. VISTA "MIS COMPRAS" (REQUERIMIENTO 3) ---
function renderCompras() {
    const container = document.getElementById('misComprasContent');
    if (!container) return;

    const user = getUsuarioActual();

    if (!user) {
        container.innerHTML = `
            <div class="card" style="text-align: center; max-width: 500px; margin: 40px auto; padding: 40px 20px;">
                <h2 style="margin-bottom: 10px;">Mis Compras</h2>
                <p style="color: var(--text-secondary); margin-bottom: 25px;">Inicia sesión para ver tu historial de compras y claves digitales adquiridas.</p>
                <button class="btn btn-neon" onclick="openModal('modalLogin')">Iniciar Sesión</button>
            </div>
        `;
        return;
    }

    const pedidos = getPedidos();
    const misPedidos = pedidos.filter(p => p.id_cliente === user.id);
    const resenasAll = getResenas();

    container.innerHTML = `
        <div class="view-header">
            <h2 class="view-title">Mis <span>Compras</span></h2>
            <span style="color: var(--text-muted); font-size: 0.9rem;">Total de pedidos: ${misPedidos.length}</span>
        </div>

        ${misPedidos.length === 0 ? `
            <div class="placeholder-box">
                <h3 style="margin-bottom: 8px;">Aún no tienes compras realizadas</h3>
                <p class="placeholder-text">Cuando compres claves digitales o licencias en el marketplace, apareceran aquí con sus detalles de entrega y garantia Escrow.</p>
                <a href="#/" class="btn btn-outline" style="margin-top: 10px;">Explorar Catálogo</a>
            </div>
        ` : `
            <div class="orders-list">
                ${misPedidos.map(ped => {
                    let estadoUI = '';
                    let actionUI = '';

                    // Caso 0: Pago_En_Verificacion (comprobante enviado, esperando confirmacion del admin)
                    if (ped.estado === 'Pago_En_Verificacion') {
                        estadoUI = `<span class="order-status-pill" style="background: rgba(69, 170, 242, 0.15); border: 1px solid #45aaf2; color: #45aaf2;">Verificando Pago</span>`;
                        actionUI = `
                            <div style="margin-top: 12px; background: rgba(69, 170, 242, 0.1); border: 1px solid rgba(69, 170, 242, 0.35); border-radius: var(--radius-sm); padding: 12px 16px;">
                                <strong style="color: #45aaf2; font-size: 0.95rem;">Comprobante enviado — pago en verificación</strong>
                                <p style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 4px;">
                                    Estamos confirmando tu transferencia con el banco. Cuando se verifique, se habilitara el chat con el vendedor para coordinar la entrega.
                                </p>
                            </div>
                        `;
                    }
                    // Caso 0B: Pago_Rechazado (el admin no encontro la transferencia)
                    else if (ped.estado === 'Pago_Rechazado') {
                        estadoUI = `<span class="order-status-pill order-status-disputa">Pago Rechazado</span>`;
                        actionUI = `
                            <div style="margin-top: 12px; background: rgba(255, 107, 107, 0.1); border: 1px solid var(--danger); border-radius: var(--radius-sm); padding: 12px 16px;">
                                <strong style="color: var(--danger); font-size: 0.95rem;">Tu comprobante fue rechazado</strong>
                                <p style="font-size: 0.85rem; color: #ffc4c4; margin-top: 4px;">
                                    ${escapeHTML(ped.motivoRechazoPago || 'El pago no pudo ser verificado.')}
                                </p>
                                <button class="btn btn-outline btn-sm" onclick="abrirModalReenviarComprobante(${ped.id})" style="margin-top: 8px;">Subir nuevo comprobante</button>
                            </div>
                        `;
                    }
                    // Caso 1: Pagado_EsperandoEntrega
                    else if (ped.estado === 'Pagado_EsperandoEntrega') {
                        estadoUI = `<span class="order-status-pill order-status-pagado">Pagado</span>`;
                        actionUI = `
                            <div style="margin-top: 12px; background: rgba(255, 177, 66, 0.1); border: 1px solid rgba(255, 177, 66, 0.3); border-radius: var(--radius-sm); padding: 12px 16px;">
                                <div style="font-size: 0.95rem; font-weight: 600; color: #ffb142;">
                                    El vendedor está preparando tu pedido
                                </div>
                                <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 4px;">
                                    Tus fondos se encuentran protegidos en custodia Escrow hasta que confirmes la recepcion.
                                </div>
                            </div>
                        `;
                    }
                    // Caso 2: Entregado_EsperandoConfirmacion (Con temporizador de 10 min y boton gigante)
                    else if (ped.estado === 'Entregado_EsperandoConfirmacion') {
                        estadoUI = `<span class="order-status-pill order-status-entregado">Entregado</span>`;
                        
                        const restanteMs = Math.max(0, ((ped.timestampEntrega || Date.now()) + TIEMPO_AUTO_CONFIRMACION_MS) - Date.now());
                        const tiempoStr = formatearTiempo(restanteMs);

                        actionUI = `
                            <div style="margin-top: 14px;">
                                <div class="order-timer-box">
                                    <span class="order-timer-label">Tiempo restante para confirmación automática:</span>
                                    <span class="order-timer-digits" id="timer-digits-${ped.id}">${tiempoStr}</span>
                                </div>

                                <div style="display: flex; gap: 12px; margin-top: 12px; flex-wrap: wrap;">
                                    <button class="btn btn-confirm-received" onclick="confirmarRecepcionPedido(${ped.id})" style="flex: 2; min-width: 260px;">
                                        Confirmar Producto Recibido
                                    </button>
                                    <button class="btn btn-danger" onclick="reportarProblemaPedido(${ped.id})" style="flex: 1; padding: 14px 20px; font-weight: 700;">
                                        Reportar Problema
                                    </button>
                                </div>
                            </div>
                        `;
                    }
                    // Caso 3: En_Disputa
                    else if (ped.estado === 'En_Disputa') {
                        estadoUI = `<span class="order-status-pill order-status-disputa">En Disputa</span>`;
                        actionUI = `
                            <div style="margin-top: 12px; background: rgba(255, 107, 107, 0.1); border: 1px solid var(--danger); border-radius: var(--radius-sm); padding: 12px 16px;">
                                <strong style="color: var(--danger); font-size: 0.95rem;">Pedido en Disputa</strong>
                                <p style="font-size: 0.85rem; color: #ffc4c4; margin-top: 4px;">
                                    El temporizador se ha detenido y los fondos permanecen retenidos. El equipo de soporte analizara el reclamo para resolver la transaccion.
                                </p>
                            </div>
                        `;
                    }
                    // Caso 4: Cancelado_Reembolsado (Requerimiento 1)
                    else if (ped.estado === 'Cancelado_Reembolsado') {
                        estadoUI = `<span class="order-status-pill" style="background: rgba(255, 107, 107, 0.2); border: 1px solid var(--danger); color: var(--danger);">Reembolsado</span>`;
                        actionUI = `
                            <div style="margin-top: 12px; background: rgba(255, 107, 107, 0.08); border: 1px solid rgba(255, 107, 107, 0.3); border-radius: var(--radius-sm); padding: 12px 16px;">
                                <strong style="color: var(--danger); font-size: 0.95rem;">Pedido Cancelado y Reembolsado</strong>
                                <p style="font-size: 0.85rem; color: #ffc4c4; margin-top: 4px;">
                                    ${ped.resolucionDisputa || 'La disputa ha sido resuelta a favor del cliente. Fondos reembolsados al comprador.'}
                                </p>
                            </div>
                        `;
                    }
                    // Caso 5: Completado
                    else {
                        estadoUI = `<span class="order-status-pill order-status-completado">Completado</span>`;
                        const resenaHecha = resenasAll.find(r => r.id_pedido === ped.id);
                        actionUI = `
                            <div style="margin-top: 12px; font-size: 0.85rem; color: #7bed9f;">
                                ${ped.resolucionDisputa ? ped.resolucionDisputa : 'Compra finalizada. Dinero liberado al vendedor.'}
                            </div>
                            ${resenaHecha ? `
                                <div style="margin-top: 10px; font-size: 0.85rem; color: var(--text-secondary);">
                                    Tu calificación: ${estrellasHTML(resenaHecha.estrellas)}
                                    ${resenaHecha.comentario ? `<span style="color: var(--text-muted);"> — "${escapeHTML(resenaHecha.comentario)}"</span>` : ''}
                                </div>
                            ` : `
                                <button class="btn btn-neon btn-sm" onclick="abrirModalResena(${ped.id})" style="margin-top: 10px;">Calificar Vendedor</button>
                            `}
                        `;
                    }

                    // Boton de chat de transaccion (solo con pago ya confirmado)
                    const pagoConfirmado = ped.estado !== 'Pago_En_Verificacion' && ped.estado !== 'Pago_Rechazado';
                    const chatPedido = pagoConfirmado ? getChatPorPedido(ped.id) : null;
                    const chatNoLeidos = chatPedido ? contarNoLeidosChat(chatPedido, 'cliente') : 0;
                    const chatBtnHTML = pagoConfirmado ? `
                        <div style="margin-top: 10px;">
                            <button class="btn btn-outline btn-sm" onclick="abrirChatPedido(${ped.id})">
                                Chat con el Vendedor${chatNoLeidos > 0 ? ` <span class="tab-badge-counter" style="margin-left: 6px;">${chatNoLeidos}</span>` : ''}
                            </button>
                        </div>
                    ` : '';

                    return `
                        <div class="order-card-detailed">
                            <img src="${ped.productoImagen || 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=600&auto=format&fit=crop&q=80'}" alt="${escapeHTML(ped.productoTitulo || 'Producto')}" class="order-card-thumb" onerror="this.src='https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=600&auto=format&fit=crop&q=80'">
                            <div class="order-card-details">
                                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; margin-bottom: 6px; flex-wrap: wrap;">
                                    <h4>${escapeHTML(ped.productoTitulo || 'Producto Digital #' + ped.id_producto)}</h4>
                                    ${estadoUI}
                                </div>
                                
                                <div class="order-meta-info">
                                    <span><strong>ID Pedido:</strong> #${ped.id}</span>
                                    <span><strong>Fecha:</strong> ${ped.fecha || 'Reciente'}</span>
                                    <span><strong>Vendedor:</strong> ${escapeHTML(ped.vendedorNombre || 'Vendedor')}</span>
                                    <span><strong>Total Pagado:</strong> <strong style="color: var(--accent); font-size: 1.05rem;">Bs. ${Number(ped.montoTotal).toFixed(2)}</strong></span>
                                </div>

                                <div class="order-escrow-notice">
                                    <span>Proteccion de Fideicomiso Last Line</span>
                                </div>

                                ${actionUI}
                                ${chatBtnHTML}
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `}
    `;
}

// --- 8. DASHBOARD DEL VENDEDOR & SUSCRIPCIÓN VIP (REQUERIMIENTO 4) ---
function cambiarVendedorTab(tab) {
    vendedorTabActiva = tab;
    renderVendedor();
}

function renderVendedor() {
    const container = document.getElementById('vendedorContent');
    if (!container) return;

    const user = getUsuarioActual();

    if (!user) {
        container.innerHTML = `
            <div class="card" style="text-align: center; max-width: 500px; margin: 40px auto; padding: 40px 20px;">
                <h2 style="margin-bottom: 10px;">Mi Tienda Digital</h2>
                <p style="color: var(--text-secondary); margin-bottom: 25px;">Debes iniciar sesión con tu cuenta de vendedor para acceder a tu panel de publicaciones.</p>
                <button class="btn btn-neon" onclick="openModal('modalLogin')">Iniciar Sesión</button>
            </div>
        `;
        return;
    }

    if (user.rol === 'vendedor_pendiente') {
        container.innerHTML = `
            <div class="card" style="text-align: center; max-width: 600px; margin: 40px auto; padding: 40px 30px;">
                <h2 style="color: #ff9f43; margin-bottom: 12px;">Solicitud de Vendedor en Revisión</h2>
                <p style="color: var(--text-secondary); line-height: 1.6; margin-bottom: 24px;">
                    Tu cuenta está registrada como <strong>Vendedor Pendiente</strong>. La administración de Last Line está validando tus datos comerciales.
                </p>
                <div style="background: rgba(255, 159, 67, 0.1); border: 1px solid rgba(255, 159, 67, 0.3); border-radius: var(--radius-sm); padding: 14px; margin-bottom: 24px; font-size: 0.9rem; color: #ff9f43;">
                    Recibirás una respuesta de la administración en un plazo de 24 a 48 horas.
                </div>
                <div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
                    <button class="btn btn-danger" onclick="cancelarSolicitudVendedor()">Cancelar Solicitud de Vendedor</button>
                    <button class="btn btn-outline" onclick="window.location.hash = '#/'">Explorar Marketplace</button>
                </div>
            </div>
        `;
        return;
    }

    if (user.rol === 'cliente') {
        container.innerHTML = `
            <div class="card" style="text-align: center; max-width: 600px; margin: 40px auto; padding: 40px 30px;">
                <h2 style="margin-bottom: 12px;">Comienza a Vender en Last Line</h2>
                <p style="color: var(--text-secondary); line-height: 1.6; margin-bottom: 24px;">
                    Publica tus claves digitales, suscripciones y software. Comisiones bajas y pagos seguros mediante saldo virtual en Bs.
                </p>
                <button class="btn btn-neon" onclick="abrirModalSolicitudVendedor()">Convertirme en Vendedor</button>
            </div>
        `;
        return;
    }

    const productos = getProductos().filter(p => p.id_vendedor === user.id || user.rol === 'admin');
    const pedidos = getPedidos();
    
    const ventasActivas = pedidos.filter(p => (p.id_vendedor === user.id || user.rol === 'admin') && p.estado === 'Pagado_EsperandoEntrega');
    const ventasEnConfirmacion = pedidos.filter(p => (p.id_vendedor === user.id || user.rol === 'admin') && p.estado === 'Entregado_EsperandoConfirmacion');
    const ventasCompletadas = pedidos.filter(p => (p.id_vendedor === user.id || user.rol === 'admin') && p.estado === 'Completado');

    const esVipActivo = user.esVIP && (!user.fechaExpiracionVIP || user.fechaExpiracionVIP > Date.now());
    const comisionRate = esVipActivo ? '2% (VIP)' : '8% (Estándar)';

    const usuariosAll = getUsuarios();
    const misChats = getChats().filter(c => c.id_vendedor === user.id || user.rol === 'admin');
    const noLeidosVendedor = misChats.reduce((acc, c) => acc + contarNoLeidosChat(c, 'vendedor'), 0);
    const misResenas = getResenas().filter(r => r.id_vendedor === user.id || user.rol === 'admin');
    const resumenVendedor = getResumenVendedor(user.id);

    container.innerHTML = `
        <div class="view-header">
            <h2 class="view-title">Mi Tienda / <span>Dashboard Vendedor</span></h2>
            <div>
                <span class="badge-role badge-vendedor">Vendedor Verificado</span>
                ${esVipActivo ? '<span class="badge-vip" style="margin-left: 6px;">VIP</span>' : ''}
            </div>
        </div>

        <!-- Tarjeta de Resumen Financiero en Bs. -->
        <div class="grid-3" style="margin-bottom: 28px;">
            <div class="card" style="border-left: 4px solid var(--accent);">
                <span style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase;">Saldo Virtual Actual</span>
                <h3 style="font-size: 2.2rem; color: var(--accent); margin: 6px 0;">Bs. ${Number(user.saldoVirtual || 0).toFixed(2)}</h3>
                <p style="font-size: 0.8rem; color: var(--text-secondary);">Disponible para compras o retiro bancario</p>
            </div>
            <div class="card" style="border-left: 4px solid #ffb142;">
                <span style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase;">Pedidos por Entregar</span>
                <h3 style="font-size: 2.2rem; color: ${ventasActivas.length > 0 ? '#ffb142' : 'var(--accent)'}; margin: 6px 0;">${ventasActivas.length}</h3>
                <p style="font-size: 0.8rem; color: var(--text-secondary);">${ventasEnConfirmacion.length} en espera de confirmacion</p>
            </div>
            <div class="card" style="border-left: 4px solid ${esVipActivo ? '#ffd700' : '#45aaf2'};">
                <span style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase;">Tasa de Comisión</span>
                <h3 style="font-size: 2.2rem; color: ${esVipActivo ? '#ffd700' : '#fff'}; margin: 6px 0;">${comisionRate}</h3>
                <p style="font-size: 0.8rem; color: var(--text-secondary);">${esVipActivo ? 'Comision reducida activa' : 'Comision estandar aplicada'}</p>
            </div>
            <div class="card" style="border-left: 4px solid #ffd700;">
                <span style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase;">Reputación</span>
                <h3 style="font-size: 2.2rem; color: #ffd700; margin: 6px 0;">${resumenVendedor.total > 0 ? `★ ${resumenVendedor.promedio.toFixed(1)}` : '—'}</h3>
                <p style="font-size: 0.8rem; color: var(--text-secondary);">${resumenVendedor.total} reseña(s) de clientes</p>
            </div>
        </div>

        <!-- SECCIÓN: MEJORAR A VIP (REQUERIMIENTO 4) -->
        <div class="card" style="margin-bottom: 28px; background: linear-gradient(135deg, rgba(35, 51, 41, 0.9) 0%, rgba(22, 32, 25, 0.9) 100%); border: 1px solid var(--accent);">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px;">
                <div>
                    <h3 style="color: var(--accent); margin-bottom: 4px;">
                        ${esVipActivo ? 'Suscripción VIP Activa (2% de Comisión)' : 'Mejorar a VIP (Comisión reducida al 2%)'}
                    </h3>
                    <p style="font-size: 0.9rem; color: var(--text-secondary);">
                        ${esVipActivo 
                            ? `Tu membresia VIP vence el: ${new Date(user.fechaExpiracionVIP).toLocaleDateString('es-ES')}. Puedes renovarla por 30 dias adicionales.` 
                            : 'Reduce tu comision de venta del 8% al 2% durante 30 dias continuos por solo Bs. 30.00.'}
                    </p>
                </div>
                <button class="btn btn-neon" onclick="abrirModalSuscripcionVIP()">
                    ${esVipActivo ? 'Renovar Suscripción VIP' : 'Mejorar a VIP (Bs. 30)'}
                </button>
            </div>
        </div>

        <!-- Pestañas del Dashboard -->
        <div class="dashboard-tabs">
            <button class="dash-tab-btn ${vendedorTabActiva === 'productos' ? 'active' : ''}" onclick="cambiarVendedorTab('productos')">
                Mis Productos (${productos.length})
            </button>
            <button class="dash-tab-btn ${vendedorTabActiva === 'ventas' ? 'active' : ''}" onclick="cambiarVendedorTab('ventas')">
                Ventas Activas
                ${ventasActivas.length > 0 ? `<span class="tab-badge-counter">${ventasActivas.length}</span>` : ''}
            </button>
            <button class="dash-tab-btn ${vendedorTabActiva === 'historial' ? 'active' : ''}" onclick="cambiarVendedorTab('historial')">
                Historial de Ventas (${ventasCompletadas.length})
            </button>
            <button class="dash-tab-btn ${vendedorTabActiva === 'mensajes' ? 'active' : ''}" onclick="cambiarVendedorTab('mensajes')">
                Mensajes
                ${noLeidosVendedor > 0 ? `<span class="tab-badge-counter">${noLeidosVendedor}</span>` : ''}
            </button>
            <button class="dash-tab-btn ${vendedorTabActiva === 'resenas' ? 'active' : ''}" onclick="cambiarVendedorTab('resenas')">
                Reseñas (${misResenas.length})
            </button>
            <button class="dash-tab-btn ${vendedorTabActiva === 'cobro' ? 'active' : ''}" onclick="cambiarVendedorTab('cobro')">
                Mis Datos de Cobro
            </button>
        </div>

        <!-- PESTAÑA 1: CRUD MIS PRODUCTOS -->
        <div class="dash-tab-panel ${vendedorTabActiva === 'productos' ? 'active' : ''}">
            <div class="card">
                <div class="vendor-actions-bar">
                    <div>
                        <h3 style="color: var(--accent);">Mis Productos Publicados</h3>
                        <p style="font-size: 0.85rem; color: var(--text-secondary);">Agrega, edita y gestiona tus productos en el marketplace.</p>
                    </div>
                    <button class="btn btn-neon" onclick="abrirModalCrearProducto()">
                        + Publicar Nuevo Producto
                    </button>
                </div>

                ${productos.length === 0 ? `
                    <div class="placeholder-box">
                        <h4 style="margin-bottom: 6px;">Aún no tienes productos publicados</h4>
                        <p class="placeholder-text">Empieza agregando tu primer producto digital para la venta.</p>
                        <button class="btn btn-neon btn-sm" onclick="abrirModalCrearProducto()" style="margin-top: 10px;">Publicar Producto</button>
                    </div>
                ` : `
                    <div class="crud-table-wrap">
                        <table class="crud-table">
                            <thead>
                                <tr>
                                    <th>Producto</th>
                                    <th>Categoría</th>
                                    <th>Precio de Venta</th>
                                    <th>Estado</th>
                                    <th style="text-align: right;">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${productos.map(p => {
                                    const pFinal = calcularPrecioProducto(p);
                                    const infoTipo = p.tipoPrecio === 'dinamico'
                                        ? `<span class="badge-price-type badge-price-dynamic" style="font-size:0.65rem;">Dinámico ($${Number(p.precioUSD).toFixed(2)} + ${p.margenGanancia}%)</span>`
                                        : `<span class="badge-price-type badge-price-fixed" style="font-size:0.65rem;">Fijo</span>`;

                                    return `
                                        <tr>
                                            <td>
                                                <div style="display: flex; align-items: center;">
                                                    <img src="${p.imagen}" alt="${escapeHTML(p.titulo)}" class="crud-thumb-mini" onerror="this.src='https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=600&auto=format&fit=crop&q=80'">
                                                    <span style="font-weight: 600; color: #fff;">${escapeHTML(p.titulo)}</span>
                                                </div>
                                            </td>
                                            <td><span class="badge-role badge-cliente">${p.categoria}</span></td>
                                            <td>
                                                <strong style="color: var(--accent); font-size: 1rem;">Bs. ${pFinal.toFixed(2)}</strong><br>
                                                ${infoTipo}
                                            </td>
                                            <td><span style="color: #2ed573; font-size: 0.8rem; font-weight: 700;">Publicado</span></td>
                                            <td style="text-align: right;">
                                                <button class="btn btn-outline btn-sm" onclick="abrirModalCrearProducto(${p.id})">Editar</button>
                                                <button class="btn btn-danger btn-sm" onclick="eliminarProducto(${p.id})" style="margin-left: 6px;">Eliminar</button>
                                            </td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                `}
            </div>
        </div>

        <!-- PESTAÑA 2: VENTAS ACTIVAS -->
        <div class="dash-tab-panel ${vendedorTabActiva === 'ventas' ? 'active' : ''}">
            <div class="card">
                <h3 style="color: var(--accent); margin-bottom: 6px;">Ventas en Curso</h3>
                <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 20px;">
                    El cliente pago y los fondos están en custodia Escrow. Entrega la clave y marca el pedido como entregado.
                </p>

                ${ventasActivas.length === 0 && ventasEnConfirmacion.length === 0 ? `
                    <div class="placeholder-box">
                        <h4 style="margin-bottom: 6px;">No tienes pedidos pendientes de entrega</h4>
                        <p class="placeholder-text">Cuando un cliente compre uno de tus productos, aparecera aquí.</p>
                    </div>
                ` : `
                    <div style="display: flex; flex-direction: column; gap: 16px;">
                        ${ventasActivas.map(v => {
                            const chatV = getChatPorPedido(v.id);
                            const noLeidosV = chatV ? contarNoLeidosChat(chatV, 'vendedor') : 0;
                            return `
                            <div class="order-card-detailed" style="border-left: 4px solid #ffb142;">
                                <img src="${v.productoImagen || 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=600&auto=format&fit=crop&q=80'}" alt="${escapeHTML(v.productoTitulo)}" class="order-card-thumb">
                                <div class="order-card-details">
                                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; margin-bottom: 6px; flex-wrap: wrap;">
                                        <h4>${escapeHTML(v.productoTitulo || 'Producto #' + v.id_producto)}</h4>
                                        <span class="order-status-pill order-status-pagado">Pagado - Pendiente Entrega</span>
                                    </div>
                                    <div class="order-meta-info">
                                        <span><strong>Pedido:</strong> #${v.id}</span>
                                        <span><strong>Fecha:</strong> ${v.fecha || 'Reciente'}</span>
                                        <span><strong>Monto a Cobrar:</strong> <strong style="color: var(--accent); font-size: 1.05rem;">Bs. ${Number(v.montoTotal).toFixed(2)}</strong></span>
                                    </div>
                                    <div style="margin-top: 10px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                                        <div style="font-size: 0.8rem; color: #ffb142;">
                                            Fondos retenidos en Escrow. Entrega la clave digital para habilitar la confirmacion.
                                        </div>
                                        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                                            <button class="btn btn-outline" onclick="abrirChatPedido(${v.id})">
                                                Chat con el Cliente${noLeidosV > 0 ? ` <span class="tab-badge-counter" style="margin-left: 6px;">${noLeidosV}</span>` : ''}
                                            </button>
                                            <button class="btn btn-neon" onclick="marcarPedidoEntregado(${v.id})">
                                                Marcar como Entregado
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        `;
                        }).join('')}

                        ${ventasEnConfirmacion.map(v => {
                            const restanteMs = Math.max(0, ((v.timestampEntrega || Date.now()) + TIEMPO_AUTO_CONFIRMACION_MS) - Date.now());
                            const chatV = getChatPorPedido(v.id);
                            const noLeidosV = chatV ? contarNoLeidosChat(chatV, 'vendedor') : 0;
                            return `
                                <div class="order-card-detailed" style="border-left: 4px solid #2ed573;">
                                    <img src="${v.productoImagen || 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=600&auto=format&fit=crop&q=80'}" alt="${escapeHTML(v.productoTitulo)}" class="order-card-thumb">
                                    <div class="order-card-details">
                                        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; margin-bottom: 6px; flex-wrap: wrap;">
                                            <h4>${escapeHTML(v.productoTitulo || 'Producto #' + v.id_producto)}</h4>
                                            <span class="order-status-pill order-status-entregado">Entregado - En Espera</span>
                                        </div>
                                        <div class="order-meta-info">
                                            <span><strong>Pedido:</strong> #${v.id}</span>
                                            <span><strong>Monto Total:</strong> Bs. ${Number(v.montoTotal).toFixed(2)}</span>
                                        </div>
                                        <div class="order-timer-box" style="margin-top: 8px;">
                                            <span class="order-timer-label">Confirmación automática del sistema en:</span>
                                            <span class="order-timer-digits" id="timer-digits-vend-${v.id}">${formatearTiempo(restanteMs)}</span>
                                        </div>
                                        <div style="margin-top: 8px;">
                                            <button class="btn btn-outline btn-sm" onclick="abrirChatPedido(${v.id})">
                                                Chat con el Cliente${noLeidosV > 0 ? ` <span class="tab-badge-counter" style="margin-left: 6px;">${noLeidosV}</span>` : ''}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                `}
            </div>
        </div>

        <!-- PESTAÑA 3: HISTORIAL DE VENTAS COMPLETADAS -->
        <div class="dash-tab-panel ${vendedorTabActiva === 'historial' ? 'active' : ''}">
            <div class="card">
                <h3 style="color: var(--accent); margin-bottom: 16px;">Ventas Finalizadas y Acreditadas</h3>
                ${ventasCompletadas.length === 0 ? `
                    <div class="placeholder-box">
                        <p class="placeholder-text">Aún no tienes ventas completadas con dinero liberado.</p>
                    </div>
                ` : `
                    <div class="crud-table-wrap">
                        <table class="crud-table">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Producto</th>
                                    <th>Fecha</th>
                                    <th>Total Venta</th>
                                    <th>Comisión Last Line</th>
                                    <th style="color: #7bed9f;">Ganancia Neta</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${ventasCompletadas.map(v => {
                                    const com = v.comisionPlataforma !== undefined ? v.comisionPlataforma : (v.montoTotal * (esVipActivo ? 0.02 : 0.08));
                                    const gan = v.gananciaVendedor !== undefined ? v.gananciaVendedor : (v.montoTotal - com);
                                    return `
                                        <tr>
                                            <td style="color: var(--text-muted);">#${v.id}</td>
                                            <td style="font-weight: 600;">${escapeHTML(v.productoTitulo || 'Producto #' + v.id_producto)}</td>
                                            <td>${v.fecha || 'Reciente'}</td>
                                            <td>Bs. ${Number(v.montoTotal).toFixed(2)}</td>
                                            <td style="color: var(--danger);">- Bs. ${Number(com).toFixed(2)}</td>
                                            <td style="color: #7bed9f; font-weight: 800;">+ Bs. ${Number(gan).toFixed(2)}</td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                `}
            </div>
        </div>

        <!-- PESTAÑA 4: MENSAJES / CHATS CON CLIENTES -->
        <div class="dash-tab-panel ${vendedorTabActiva === 'mensajes' ? 'active' : ''}">
            <div class="card">
                <h3 style="color: var(--accent); margin-bottom: 6px;">Chats con Clientes</h3>
                <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 18px;">
                    Cada venta pagada abre un canal de comunicación de 7 días con el cliente. Úsalo para coordinar entregas (códigos de amigo de Steam, claves, datos de cuenta).
                </p>
                ${misChats.length === 0 ? `
                    <div class="placeholder-box">
                        <h4 style="margin-bottom: 6px;">Aún no tienes conversaciones</h4>
                        <p class="placeholder-text">Los chats se abrirán automáticamente cuando un cliente pague uno de tus productos.</p>
                    </div>
                ` : `
                    <div style="display: flex; flex-direction: column; gap: 12px;">
                        ${misChats.map(c => {
                            const cli = usuariosAll.find(u => u.id === c.id_cliente);
                            const ultimo = c.mensajes && c.mensajes.length > 0 ? c.mensajes[c.mensajes.length - 1] : null;
                            const expiradoC = Date.now() > c.fechaExpiracion;
                            const noL = contarNoLeidosChat(c, 'vendedor');
                            const diasRest = Math.max(0, Math.ceil((c.fechaExpiracion - Date.now()) / 86400000));
                            return `
                                <div class="review-mini-card" style="display: flex; justify-content: space-between; align-items: center; gap: 14px; flex-wrap: wrap;">
                                    <div style="flex: 1; min-width: 220px;">
                                        <div style="font-weight: 700; color: #fff;">${escapeHTML(c.productoTitulo)}</div>
                                        <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 2px;">
                                            Pedido #${c.id_pedido} · Cliente: ${escapeHTML(cli ? cli.nombre : 'Cliente')} ·
                                            ${expiradoC ? '<span style="color: var(--danger);">Chat archivado</span>' : `Disponible ${diasRest} día(s) más`}
                                        </div>
                                        ${ultimo ? `<div style="font-size: 0.82rem; color: var(--text-secondary); margin-top: 4px;">"${escapeHTML(ultimo.texto.substring(0, 70))}${ultimo.texto.length > 70 ? '…' : ''}"</div>` : ''}
                                    </div>
                                    <div style="display: flex; align-items: center; gap: 8px;">
                                        ${noL > 0 ? `<span class="tab-badge-counter">${noL} nuevo(s)</span>` : ''}
                                        <button class="btn btn-neon btn-sm" onclick="abrirChatPedido(${c.id_pedido})">Abrir Chat</button>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                `}
            </div>
        </div>

        <!-- PESTAÑA 5: RESEÑAS Y CALIFICACIONES -->
        <div class="dash-tab-panel ${vendedorTabActiva === 'resenas' ? 'active' : ''}">
            <div class="card">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 18px;">
                    <div>
                        <h3 style="color: var(--accent); margin-bottom: 4px;">Reseñas de tus Clientes</h3>
                        <p style="font-size: 0.85rem; color: var(--text-secondary); margin: 0;">Calificaciones recibidas al finalizar compras. Tu reputación se muestra en el catálogo.</p>
                    </div>
                    <div style="text-align: right; background: rgba(0,0,0,0.35); padding: 10px 18px; border-radius: var(--radius-sm); border: 1px solid rgba(255,215,0,0.25);">
                        <div style="font-size: 1.6rem; color: #ffd700; font-weight: 800;">${misResenas.length > 0 ? `★ ${resumenVendedor.promedio.toFixed(1)}` : '—'}</div>
                        <div style="font-size: 0.75rem; color: var(--text-muted);">${misResenas.length} reseña(s)</div>
                    </div>
                </div>
                ${misResenas.length === 0 ? `
                    <div class="placeholder-box">
                        <h4 style="margin-bottom: 6px;">Aún no tienes reseñas</h4>
                        <p class="placeholder-text">Cuando un cliente confirme su compra, podrá calificarte con estrellas y dejar un comentario.</p>
                    </div>
                ` : `
                    <div style="display: flex; flex-direction: column; gap: 10px;">
                        ${misResenas.map(r => `
                            <div class="review-mini-card">
                                <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap;">
                                    <div>${estrellasHTML(r.estrellas)} <strong style="color: #fff; margin-left: 6px;">${escapeHTML(r.nombreCliente || 'Cliente')}</strong></div>
                                    <span style="font-size: 0.75rem; color: var(--text-muted);">${r.fecha || ''}</span>
                                </div>
                                <div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 3px;">${escapeHTML(r.productoTitulo || '')}</div>
                                ${r.comentario ? `<p style="font-size: 0.88rem; color: var(--text-secondary); margin-top: 6px;">"${escapeHTML(r.comentario)}"</p>` : ''}
                            </div>
                        `).join('')}
                    </div>
                `}
            </div>
        </div>

        <!-- PESTAÑA 6: MIS DATOS DE COBRO (REQUERIMIENTO 2) -->
        <div class="dash-tab-panel ${vendedorTabActiva === 'cobro' ? 'active' : ''}">
            <div class="card" style="max-width: 650px; margin: 0 auto;">
                <div style="margin-bottom: 20px;">
                    <h3 style="color: var(--accent); margin-bottom: 4px;">Mis Datos de Cobro Bancario</h3>
                    <p style="font-size: 0.85rem; color: var(--text-secondary);">
                        Configura tu número de cuenta y tu código QR bancario para recibir los cortes de caja y liquidaciones de tus ventas.
                    </p>
                </div>

                <form onsubmit="handleGuardarDatosCobro(event)">
                    <div class="form-group">
                        <label for="cobroNumeroCuenta">Número de Cuenta Bancaria / Datos de Transferencia</label>
                        <input type="text" id="cobroNumeroCuenta" class="form-control" value="${escapeHTML(user.numeroCuenta || user.cuentaBancaria || '')}" placeholder="Ej: Banco Mercantil Santa Cruz - Cta 40129... - Titular" required>
                    </div>

                    <div class="form-group">
                        <label>Código QR Bancario Actual</label>
                        <div id="cobroQrActualContainer" style="margin-bottom: 12px;">
                            ${user.qrBancario ? `
                                <div style="display: flex; align-items: center; gap: 16px; background: rgba(0, 0, 0, 0.35); padding: 14px; border-radius: var(--radius-sm); border: 1px solid rgba(213, 245, 156, 0.2);">
                                    <img src="${user.qrBancario}" alt="QR Bancario" style="width: 100px; height: 100px; object-fit: contain; background: #ffffff; border-radius: 4px; padding: 4px; cursor: pointer;" onclick="abrirModalVerImagen('${user.qrBancario}', 'Mi Código QR Bancario')">
                                    <div>
                                        <p style="font-size: 0.9rem; color: #ffffff; font-weight: 600; margin-bottom: 4px;">Código QR Registrado</p>
                                        <p style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 8px;">Este QR es el que escaneará la administración al realizarte el corte de caja diario.</p>
                                        <button type="button" class="btn btn-outline btn-sm" onclick="abrirModalVerImagen('${user.qrBancario}', 'Mi Código QR Bancario')">Ver en Grande</button>
                                    </div>
                                </div>
                            ` : `
                                <div class="placeholder-box" style="padding: 16px; margin: 0;">
                                    <p class="placeholder-text">Aún no has registrado un código QR bancario de cobro.</p>
                                </div>
                            `}
                        </div>
                    </div>

                    <div class="form-group">
                        <label for="cobroNuevoQR">Subir / Actualizar Imagen de QR Bancario</label>
                        <input type="file" id="cobroNuevoQR" class="form-control" accept="image/*" onchange="previewNuevoQRCobro(event)">
                        <div id="cobroNuevoQRPreviewContainer" style="display: none; margin-top: 10px; text-align: center;">
                            <span style="font-size: 0.75rem; color: var(--accent); display: block; margin-bottom: 6px;">Nuevo QR seleccionado:</span>
                            <img id="cobroNuevoQRPreviewImg" src="" alt="Vista previa de nuevo QR" style="max-height: 140px; border-radius: 6px; border: 1px solid var(--accent); padding: 4px; background: #ffffff;">
                        </div>
                    </div>

                    <button type="submit" class="btn btn-neon" style="width: 100%; margin-top: 15px; padding: 12px; font-size: 1rem;">
                        Guardar Datos de Cobro
                    </button>
                </form>
            </div>
        </div>
    `;
}

// Handlers para datos de cobro del vendedor (Requerimiento 2)
let nuevoQRVendedorTemporal = null;

function previewNuevoQRCobro(event) {
    const file = event.target.files[0];
    const previewContainer = document.getElementById('cobroNuevoQRPreviewContainer');
    const previewImg = document.getElementById('cobroNuevoQRPreviewImg');

    if (!file) {
        nuevoQRVendedorTemporal = null;
        if (previewContainer) previewContainer.style.display = 'none';
        return;
    }

    if (!file.type.startsWith('image/')) {
        showToast("Por favor selecciona un archivo de imagen válido.", "error");
        event.target.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        nuevoQRVendedorTemporal = e.target.result;
        if (previewImg) previewImg.src = e.target.result;
        if (previewContainer) previewContainer.style.display = 'block';
    };
    reader.readAsDataURL(file);
}

function handleGuardarDatosCobro(event) {
    event.preventDefault();
    const user = getUsuarioActual();
    if (!user) return;

    const numCuenta = document.getElementById('cobroNumeroCuenta').value.trim();
    if (!numCuenta) {
        showToast("El número de cuenta bancaria es obligatorio.", "error");
        return;
    }

    const usuarios = getUsuarios();
    const u = usuarios.find(x => x.id === user.id);
    if (!u) return;

    u.numeroCuenta = numCuenta;
    u.cuentaBancaria = numCuenta;
    user.numeroCuenta = numCuenta;
    user.cuentaBancaria = numCuenta;

    if (nuevoQRVendedorTemporal) {
        u.qrBancario = nuevoQRVendedorTemporal;
        user.qrBancario = nuevoQRVendedorTemporal;
        nuevoQRVendedorTemporal = null;
    }

    saveUsuarios(usuarios);
    setUsuarioActual(user);

    showToast("Datos de cobro bancario actualizados exitosamente.", "success");
    renderVendedor();
}

// Modal y simulación de Suscripción VIP
function abrirModalSuscripcionVIP() {
    const user = getUsuarioActual();
    if (!user) return;

    const qrWrap = document.getElementById('vipQRWrapper');
    if (qrWrap) {
        qrWrap.innerHTML = generateRealisticQRSVG(30.00, user.id);
    }

    openModal('modalSuscripcionVIP');
}

function simularPagoSuscripcionVIP() {
    const user = getUsuarioActual();
    if (!user) return;

    const usuarios = getUsuarios();
    const u = usuarios.find(x => x.id === user.id);
    if (!u) return;

    // Sumar 30 días a la fecha actual o extender si ya era VIP
    const baseTime = (u.fechaExpiracionVIP && u.fechaExpiracionVIP > Date.now()) ? u.fechaExpiracionVIP : Date.now();
    const nuevaExpiracion = baseTime + (30 * 24 * 60 * 60 * 1000);

    u.esVIP = true;
    u.fechaExpiracionVIP = nuevaExpiracion;
    saveUsuarios(usuarios);

    user.esVIP = true;
    user.fechaExpiracionVIP = nuevaExpiracion;
    setUsuarioActual(user);

    closeModal('modalSuscripcionVIP');
    showToast("Suscripción VIP activada exitosamente por 30 días. Tu comisión ahora es del 2%.", "success");

    renderVendedor();
    renderHeader();
    renderPerfil();
}

// --- 9. SOLICITUD DE VENDEDOR Y CANCELACIÓN (REQUERIMIENTO 2) ---
let solicitudQRTemporal = null;

function previewSolicitudQR(event) {
    const file = event.target.files[0];
    const previewContainer = document.getElementById('solicitudQrPreviewContainer');
    const previewImg = document.getElementById('solicitudQrPreviewImg');

    if (!file) {
        solicitudQRTemporal = null;
        if (previewContainer) previewContainer.style.display = 'none';
        return;
    }

    if (!file.type.startsWith('image/')) {
        showToast("Por favor selecciona un archivo de imagen válido para el código QR.", "error");
        event.target.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        solicitudQRTemporal = e.target.result;
        if (previewImg) previewImg.src = e.target.result;
        if (previewContainer) previewContainer.style.display = 'block';
    };
    reader.readAsDataURL(file);
}

function abrirModalSolicitudVendedor() {
    const user = getUsuarioActual();
    if (!user) {
        openModal('modalLogin');
        return;
    }

    const bloqueoSolicitud = obtenerBloqueoCuenta();
    if (bloqueoSolicitud) {
        showToast(bloqueoSolicitud, 'error');
        return;
    }

    const form = document.getElementById('formSolicitudVendedor');
    if (form) form.reset();

    solicitudQRTemporal = null;
    const previewContainer = document.getElementById('solicitudQrPreviewContainer');
    if (previewContainer) previewContainer.style.display = 'none';

    const alertBox = document.getElementById('solicitudVendedorAlert');
    if (alertBox) alertBox.style.display = 'none';

    openModal('modalSolicitudVendedor');
}

function handleEnviarSolicitudVendedor(event) {
    event.preventDefault();
    const user = getUsuarioActual();
    if (!user) return;

    const nombreCompleto = document.getElementById('solicitudNombreCompleto').value.trim();
    const numeroCuenta = document.getElementById('solicitudNumeroCuenta').value.trim();
    const acepto = document.getElementById('solicitudAceptoReglamento').checked;

    if (!nombreCompleto || !numeroCuenta) {
        showToast("Por favor completa todos los campos requeridos.", "error");
        return;
    }

    if (!solicitudQRTemporal) {
        showToast("Debes adjuntar la imagen de tu código QR de cobro bancario.", "error");
        return;
    }

    if (!acepto) {
        showToast("Debes leer y aceptar los Términos y el Reglamento de Vendedores.", "error");
        return;
    }

    const usuarios = getUsuarios();
    const u = usuarios.find(x => x.id === user.id);
    if (u) {
        u.rol = "vendedor_pendiente";
        u.nombreCompleto = nombreCompleto;
        u.numeroCuenta = numeroCuenta;
        u.cuentaBancaria = numeroCuenta;
        u.qrBancario = solicitudQRTemporal;
        u.fechaSolicitud = Date.now();
        u.fechaAceptacionReglamento = Date.now();
        saveUsuarios(usuarios);
    }

    user.rol = "vendedor_pendiente";
    user.nombreCompleto = nombreCompleto;
    user.numeroCuenta = numeroCuenta;
    user.cuentaBancaria = numeroCuenta;
    user.qrBancario = solicitudQRTemporal;
    setUsuarioActual(user);

    closeModal('modalSolicitudVendedor');
    showToast("Solicitud de vendedor con datos bancarios y QR enviada a revisión.", "success");

    renderPerfil();
    renderHeader();
}

function cancelarSolicitudVendedor() {
    const confirmacion = confirm("¿Deseas cancelar tu solicitud de vendedor y volver a cuenta cliente?");
    if (!confirmacion) return;

    const user = getUsuarioActual();
    if (!user) return;

    const usuarios = getUsuarios();
    const u = usuarios.find(x => x.id === user.id);
    if (u) {
        u.rol = "cliente";
        delete u.nombreCompleto;
        delete u.numeroCuenta;
        delete u.cuentaBancaria;
        delete u.qrBancario;
        delete u.fechaSolicitud;
        saveUsuarios(usuarios);
    }

    user.rol = "cliente";
    delete user.nombreCompleto;
    delete user.numeroCuenta;
    delete user.cuentaBancaria;
    delete user.qrBancario;
    delete user.fechaSolicitud;
    setUsuarioActual(user);

    showToast("Solicitud cancelada. Tu rol actual es cliente.", "info");
    renderPerfil();
    renderHeader();
}

// --- 10. CRUD PRODUCTOS PARA VENDEDOR (CONTROL DE PRECIOS FIJOS VS DINÁMICOS - REQUERIMIENTO 4) ---
function toggleTipoPrecioCampos() {
    const select = document.getElementById('crudProdTipoPrecio');
    if (!select) return;
    const tipo = select.value;
    const grupoFijo = document.getElementById('crudGrupoPrecioFijo');
    const grupoDinamico = document.getElementById('crudGrupoPrecioDinamico');

    if (tipo === 'dinamico') {
        if (grupoFijo) grupoFijo.style.display = 'none';
        if (grupoDinamico) grupoDinamico.style.display = 'block';
        actualizarCalculoPrecioDinamicoPreview();
    } else {
        if (grupoFijo) grupoFijo.style.display = 'block';
        if (grupoDinamico) grupoDinamico.style.display = 'none';
    }
}

function actualizarCalculoPrecioDinamicoPreview() {
    const usdInput = document.getElementById('crudProdPrecioUSD');
    const margenInput = document.getElementById('crudProdMargenGanancia');
    const previewEl = document.getElementById('crudDinamicoPreview');
    if (!usdInput || !margenInput || !previewEl) return;

    const usd = parseFloat(usdInput.value) || 0;
    const margen = parseFloat(margenInput.value) || 0;
    const tasa = getTasaCambioGlobal();
    const finalCalculado = Math.ceil((usd * tasa) * (1 + (margen / 100)));
    previewEl.innerHTML = `Precio final estimado: <span style="color: var(--accent); font-size: 0.95rem;">Bs. ${finalCalculado.toFixed(2)}</span> (Cálculo: [${usd} USD * ${tasa} Bs] + ${margen}% margen)`;
}

function abrirModalCrearProducto(prodId = null) {
    const user = getUsuarioActual();
    if (!user || (user.rol !== 'vendedor' && user.rol !== 'admin')) {
        showToast('Debes ser un vendedor autorizado para publicar productos.', 'error');
        return;
    }

    const bloqueoVenta = obtenerBloqueoCuenta();
    if (bloqueoVenta) {
        showToast(bloqueoVenta, 'error');
        return;
    }

    const form = document.getElementById('formCrearProducto');
    if (form) form.reset();

    const idInput = document.getElementById('crudProdId');
    const alertBox = document.getElementById('crearProductoAlert');
    if (alertBox) alertBox.style.display = 'none';

    if (prodId) {
        const prod = getProductos().find(p => p.id === prodId);
        if (prod) {
            idInput.value = prod.id;
            document.getElementById('crudProdTitulo').value = prod.titulo;
            document.getElementById('crudProdCategoria').value = prod.categoria;
            document.getElementById('crudProdImagen').value = prod.imagen;
            
            const tipo = prod.tipoPrecio || 'fijo';
            document.getElementById('crudProdTipoPrecio').value = tipo;

            if (tipo === 'dinamico') {
                document.getElementById('crudProdPrecioUSD').value = prod.precioUSD || '';
                document.getElementById('crudProdMargenGanancia').value = prod.margenGanancia || '';
                document.getElementById('crudProdPrecioBs').value = '';
            } else {
                document.getElementById('crudProdPrecioBs').value = prod.precio || '';
                document.getElementById('crudProdPrecioUSD').value = '';
                document.getElementById('crudProdMargenGanancia').value = '';
            }

            document.getElementById('btnGuardarProd').textContent = 'Actualizar Producto';
            toggleTipoPrecioCampos();
        }
    } else {
        idInput.value = '';
        document.getElementById('crudProdTipoPrecio').value = 'fijo';
        document.getElementById('crudProdPrecioBs').value = '';
        document.getElementById('crudProdPrecioUSD').value = '';
        document.getElementById('crudProdMargenGanancia').value = '';
        document.getElementById('btnGuardarProd').textContent = 'Guardar y Publicar';
        toggleTipoPrecioCampos();
    }

    openModal('modalCrearProducto');
}

function handleGuardarProducto(event) {
    event.preventDefault();
    const user = getUsuarioActual();
    if (!user) return;

    const idVal = document.getElementById('crudProdId').value;
    const titulo = document.getElementById('crudProdTitulo').value.trim();
    const categoria = document.getElementById('crudProdCategoria').value;
    const imagen = document.getElementById('crudProdImagen').value.trim();
    const tipoPrecio = document.getElementById('crudProdTipoPrecio').value;

    let precioFinal = 0;
    let precioUSD = null;
    let margenGanancia = null;

    if (!titulo || !imagen) {
        showToast('Por favor completa el título y la URL de imagen.', 'error');
        return;
    }

    if (tipoPrecio === 'fijo') {
        const precioBs = parseFloat(document.getElementById('crudProdPrecioBs').value);
        if (isNaN(precioBs) || precioBs <= 0) {
            showToast('Por favor ingresa un precio final en Bs. válido.', 'error');
            return;
        }
        precioFinal = precioBs;
    } else {
        precioUSD = parseFloat(document.getElementById('crudProdPrecioUSD').value);
        margenGanancia = parseFloat(document.getElementById('crudProdMargenGanancia').value);

        if (isNaN(precioUSD) || precioUSD <= 0) {
            showToast('Por favor ingresa un precio base en USD válido.', 'error');
            return;
        }
        if (isNaN(margenGanancia) || margenGanancia < 0) {
            showToast('Por favor ingresa un margen de ganancia válido.', 'error');
            return;
        }
        const tasa = getTasaCambioGlobal();
        precioFinal = Math.ceil((precioUSD * tasa) * (1 + (margenGanancia / 100)));
    }

    let productos = getProductos();

    if (idVal) {
        const idx = productos.findIndex(p => p.id == idVal);
        if (idx !== -1) {
            productos[idx].titulo = titulo;
            productos[idx].tipoPrecio = tipoPrecio;
            productos[idx].precio = precioFinal;
            productos[idx].precioUSD = precioUSD;
            productos[idx].margenGanancia = margenGanancia;
            productos[idx].categoria = categoria;
            productos[idx].imagen = imagen;
            saveProductos(productos);
            showToast('Producto actualizado correctamente.', 'success');
        }
    } else {
        const nuevoProd = {
            id: Date.now(),
            id_vendedor: user.id,
            vendedorNombre: user.nombre,
            vendedorVIP: !!(user.esVIP && (!user.fechaExpiracionVIP || user.fechaExpiracionVIP > Date.now())),
            titulo: titulo,
            tipoPrecio: tipoPrecio,
            precio: precioFinal,
            precioUSD: precioUSD,
            margenGanancia: margenGanancia,
            imagen: imagen,
            categoria: categoria
        };
        productos.unshift(nuevoProd);
        saveProductos(productos);
        showToast('Producto publicado con éxito en el catálogo.', 'success');
    }

    closeModal('modalCrearProducto');
    renderVendedor();
    renderHomeStats();
}

function eliminarProducto(prodId) {
    const confirmacion = confirm('¿Estás seguro de que deseas eliminar este producto del marketplace?');
    if (!confirmacion) return;

    let productos = getProductos();
    productos = productos.filter(p => p.id !== prodId);
    saveProductos(productos);
    registrarBorradoNube('productos', prodId);

    showToast('Producto eliminado del catálogo.', 'info');
    renderVendedor();
    renderHomeStats();
}

function setDemoImg(preset) {
    const input = document.getElementById('crudProdImagen');
    if (!input) return;
    if (preset === 1) input.value = 'https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/1091500/header.jpg';
    if (preset === 2) input.value = 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600&auto=format&fit=crop&q=80';
    if (preset === 3) input.value = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80';
}

// --- 11. PANEL DE ADMIN (SOLICITUDES & FINANZAS) ---
function cambiarAdminTab(tab) {
    adminTabActiva = tab;
    renderAdmin();
}

function renderAdmin() {
    const container = document.getElementById('adminContent');
    if (!container) return;

    const user = getUsuarioActual();

    if (!user || user.rol !== 'admin') {
        container.innerHTML = `
            <div class="card" style="text-align: center; max-width: 550px; margin: 40px auto; padding: 40px 20px;">
                <h2 style="color: var(--danger); margin-bottom: 10px;">Acceso Denegado</h2>
                <p style="color: var(--text-secondary); margin-bottom: 25px;">Esta sección es exclusiva para usuarios con rol de <strong>Administrador</strong>.</p>
                <button class="btn btn-neon" onclick="window.location.hash = '#/'">Ir al Inicio</button>
            </div>
        `;
        return;
    }

    const usuarios = getUsuarios();
    const productos = getProductos();
    const pedidos = getPedidos();
    const pendientes = usuarios.filter(u => u.rol === 'vendedor_pendiente');
    const disputas = pedidos.filter(p => p.estado === 'En_Disputa');
    const pagosPendientes = pedidos.filter(p => p.estado === 'Pago_En_Verificacion');
    const vendedoresConSaldo = usuarios.filter(u => (u.rol === 'vendedor' || u.rol === 'admin') && (Number(u.saldoVirtual) || 0) > 0);
    const historialPagos = getHistorialPagosVendedores();

    const pedidosCompletados = pedidos.filter(p => p.estado === 'Completado');
    const totalComisionesPlataforma = pedidosCompletados.reduce((acc, p) => {
        if (p.comisionPlataforma !== undefined) return acc + Number(p.comisionPlataforma);
        const vend = usuarios.find(u => u.id === p.id_vendedor);
        const rate = (vend && vend.esVIP) ? 0.02 : 0.08;
        return acc + (Number(p.montoTotal) * rate);
    }, 0);

    const volumenTotalVentas = pedidosCompletados.reduce((acc, p) => acc + Number(p.montoTotal || 0), 0);
    const pedidosEnEscrow = pedidos.filter(p => p.estado === 'Pagado_EsperandoEntrega' || p.estado === 'Entregado_EsperandoConfirmacion');
    const totalEnEscrow = pedidosEnEscrow.reduce((acc, p) => acc + Number(p.montoTotal || 0), 0);
    const totalPendienteLiquidacion = vendedoresConSaldo.reduce((acc, v) => acc + (Number(v.saldoVirtual) || 0), 0);

    const metaTasa = getTasaCambioMeta();
    const fuenteTasaTxt = metaTasa && metaTasa.fuente === 'api_bcb'
        ? 'API de cotizaciones en línea'
        : (metaTasa && metaTasa.fuente === 'manual' ? 'Ajuste manual del administrador' : 'Cotización oficial BCB');
    const fechaTasaTxt = metaTasa && metaTasa.fecha
        ? new Date(metaTasa.fecha).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
        : '';

    container.innerHTML = `
        <div class="view-header">
            <h2 class="view-title">Panel de <span>Administración</span></h2>
            <span class="badge-role badge-admin">Super Admin</span>
        </div>

        <!-- CONTROL DE TASA DE CAMBIO GLOBAL REFERENCIAL BCB (REQUERIMIENTO 4) -->
        <div class="exchange-rate-banner">
            <div>
                <h3 style="color: var(--accent); margin-bottom: 4px;">Tasa de Cambio del Dólar (BCB)</h3>
                <p style="font-size: 0.85rem; color: var(--text-secondary); margin: 0;">
                    Los precios dinámicos en USD se convierten a Bs. según la cotización de referencia del Banco Central de Bolivia. Tasa activa: <strong style="color: #ffffff;">1 USD = Bs. ${getTasaCambioGlobal().toFixed(2)}</strong><br>
                    <span style="font-size: 0.75rem; color: var(--text-muted);">Fuente: ${fuenteTasaTxt}${fechaTasaTxt ? ` · Actualizada: ${fechaTasaTxt}` : ''}</span>
                </p>
            </div>
            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                <button class="btn btn-outline" onclick="sincronizarTasaBCB()">
                    Sincronizar con BCB
                </button>
                <div style="position: relative; display: flex; align-items: center;">
                    <span style="position: absolute; left: 12px; color: var(--text-muted); font-size: 0.85rem; font-weight: 700;">Bs.</span>
                    <input type="number" id="inputTasaCambioGlobal" class="form-control" value="${getTasaCambioGlobal()}" step="0.10" min="0.01" style="width: 130px; padding-left: 40px; font-weight: 700;">
                </div>
                <button class="btn btn-neon" onclick="handleActualizarTasaCambio()">
                    Ajuste Manual
                </button>
            </div>
        </div>

        <!-- PESTAÑAS DEL PANEL ADMIN -->
        <div class="dashboard-tabs">
            <button class="dash-tab-btn ${adminTabActiva === 'solicitudes' ? 'active' : ''}" onclick="cambiarAdminTab('solicitudes')">
                Solicitudes de Vendedores
                ${pendientes.length > 0 ? `<span class="tab-badge-counter">${pendientes.length}</span>` : ''}
            </button>
            <button class="dash-tab-btn ${adminTabActiva === 'pagos' ? 'active' : ''}" onclick="cambiarAdminTab('pagos')">
                Pagos por Verificar
                ${pagosPendientes.length > 0 ? `<span class="tab-badge-counter" style="background: #45aaf2; color: #fff;">${pagosPendientes.length}</span>` : ''}
            </button>
            <button class="dash-tab-btn ${adminTabActiva === 'disputas' ? 'active' : ''}" onclick="cambiarAdminTab('disputas')">
                Reportes y Disputas
                ${disputas.length > 0 ? `<span class="tab-badge-counter" style="background: var(--danger); color: #fff;">${disputas.length}</span>` : ''}
            </button>
            <button class="dash-tab-btn ${adminTabActiva === 'cortes' ? 'active' : ''}" onclick="cambiarAdminTab('cortes')">
                Pagos a Vendedores (Cierre del Día)
                ${vendedoresConSaldo.length > 0 ? `<span class="tab-badge-counter" style="background: #ffd700; color: #141c16;">${vendedoresConSaldo.length}</span>` : ''}
            </button>
            <button class="dash-tab-btn ${adminTabActiva === 'finanzas' ? 'active' : ''}" onclick="cambiarAdminTab('finanzas')">
                Finanzas y Comisiones
            </button>
            <button class="dash-tab-btn ${adminTabActiva === 'usuarios' ? 'active' : ''}" onclick="cambiarAdminTab('usuarios')">
                Todos los Usuarios (${usuarios.length})
            </button>
        </div>

        <!-- PESTAÑA 1: SOLICITUDES DE VENDEDORES -->
        <div class="dash-tab-panel ${adminTabActiva === 'solicitudes' ? 'active' : ''}">
            <div class="card">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <h3 style="color: var(--accent);">Solicitudes de Vendedor Pendientes</h3>
                    <span style="font-size: 0.85rem; color: var(--text-muted);">${pendientes.length} por revisar</span>
                </div>

                ${pendientes.length === 0 ? `
                    <div class="placeholder-box" style="margin: 10px 0;">
                        <h4 style="margin-bottom: 4px;">No hay solicitudes pendientes</h4>
                        <p class="placeholder-text">Todas las solicitudes de vendedor han sido procesadas.</p>
                    </div>
                ` : `
                    <div style="overflow-x: auto;">
                        <table class="crud-table">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Usuario</th>
                                    <th>Nombre Titular</th>
                                    <th>Cuenta Bancaria</th>
                                    <th>QR Bancario</th>
                                    <th>Estado</th>
                                    <th style="text-align: right;">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${pendientes.map(p => `
                                    <tr>
                                        <td style="color: var(--text-muted);">#${p.id}</td>
                                        <td style="font-weight: 700; color: #fff;">${escapeHTML(p.nombre)}</td>
                                        <td>${escapeHTML(p.nombreCompleto || 'No especificado')}</td>
                                        <td style="font-size: 0.85rem; color: var(--accent); font-family: monospace;">${escapeHTML(p.numeroCuenta || p.cuentaBancaria || 'Sin datos')}</td>
                                        <td>
                                            ${p.qrBancario ? `
                                                <button class="btn btn-outline btn-sm" onclick="abrirModalVerImagen('${p.qrBancario}', 'QR Bancario - ${escapeHTML(p.nombre)}')">
                                                    Ver QR
                                                </button>
                                            ` : `
                                                <span style="color: var(--text-muted); font-size: 0.8rem;">Sin QR</span>
                                            `}
                                        </td>
                                        <td><span class="badge-role badge-vendedor_pendiente">Pendiente</span></td>
                                        <td style="text-align: right;">
                                            <button class="btn btn-neon btn-sm" onclick="aprobarVendedor(${p.id})">
                                                Aprobar
                                            </button>
                                            <button class="btn btn-danger btn-sm" onclick="rechazarVendedor(${p.id})" style="margin-left: 6px;">
                                                Rechazar
                                            </button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `}
            </div>
        </div>

        <!-- PESTAÑA: PAGOS POR VERIFICAR (comprobantes subidos por clientes) -->
        <div class="dash-tab-panel ${adminTabActiva === 'pagos' ? 'active' : ''}">
            <div class="card">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 10px;">
                    <div>
                        <h3 style="color: var(--accent); margin-bottom: 4px;">Comprobantes de Pago por Verificar</h3>
                        <p style="font-size: 0.85rem; color: var(--text-secondary); margin: 0;">
                            Compara cada comprobante con las notificaciones/extracto de tu banco. Al confirmar, el pedido entra a Escrow y se habilita el chat cliente-vendedor.
                        </p>
                    </div>
                    <span style="font-size: 0.85rem; color: var(--text-muted);">${pagosPendientes.length} por verificar</span>
                </div>

                ${pagosPendientes.length === 0 ? `
                    <div class="placeholder-box" style="margin: 10px 0;">
                        <h4 style="margin-bottom: 4px;">No hay pagos pendientes</h4>
                        <p class="placeholder-text">Todos los comprobantes recibidos ya fueron procesados.</p>
                    </div>
                ` : `
                    <div class="crud-table-wrap">
                        <table class="crud-table">
                            <thead>
                                <tr>
                                    <th>Pedido / Fecha</th>
                                    <th>Cliente</th>
                                    <th>Producto</th>
                                    <th>Monto Esperado</th>
                                    <th>Comprobante</th>
                                    <th style="text-align: right; min-width: 240px;">Verificación</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${pagosPendientes.map(ped => {
                                    const cliente = usuarios.find(u => u.id === ped.id_cliente);
                                    return `
                                        <tr>
                                            <td>
                                                <strong style="color: #fff;">#${ped.id}</strong><br>
                                                <span style="font-size: 0.8rem; color: var(--text-muted);">${ped.fecha || ''}${ped.fechaReenvio ? ' · reenviado' : ''}</span>
                                            </td>
                                            <td style="font-weight: 600;">${escapeHTML(cliente ? cliente.nombre : (ped.vendedorNombre || 'Cliente'))}</td>
                                            <td style="font-size: 0.85rem;">${escapeHTML(ped.productoTitulo || 'Producto')}</td>
                                            <td style="font-weight: 700; color: var(--accent);">Bs. ${Number(ped.montoTotal).toFixed(2)}</td>
                                            <td>
                                                ${ped.comprobantePago ? `
                                                    <button class="btn btn-outline btn-sm" onclick="verComprobantePago(${ped.id})">Ver Comprobante</button>
                                                ` : `<span style="color: var(--text-muted); font-size: 0.8rem;">Sin imagen</span>`}
                                            </td>
                                            <td style="text-align: right;">
                                                <button class="btn btn-neon btn-sm" onclick="confirmarPagoManual(${ped.id})">Confirmar Pago</button>
                                                <button class="btn btn-danger btn-sm" onclick="rechazarPagoManual(${ped.id})" style="margin-left: 6px;">Rechazar</button>
                                            </td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                `}
            </div>

            <!-- Cola compartida en la nube: pedidos de TODOS los dispositivos + auditoria de notificaciones bancarias -->
            <div class="card" style="margin-top: 16px;">
                <div style="margin-bottom: 10px;">
                    <h3 style="color: var(--accent); margin-bottom: 4px;">Pagos Compartidos en la Nube</h3>
                    <p style="font-size: 0.85rem; color: var(--text-secondary); margin: 0;">
                        Pedidos enviados por clientes desde cualquier dispositivo. La notificacion del banco los confirma automaticamente; aqui tambien puedes verificar a mano.
                    </p>
                </div>
                <div id="adminPagosNube"></div>
            </div>
        </div>

        <!-- PESTAÑA 2: GESTIÓN DE DISPUTAS (REQUERIMIENTO 1) -->
        <div class="dash-tab-panel ${adminTabActiva === 'disputas' ? 'active' : ''}">
            <div class="card">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 10px;">
                    <div>
                        <h3 style="color: var(--accent); margin-bottom: 4px;">Reportes y Disputas de Transacciones</h3>
                        <p style="font-size: 0.85rem; color: var(--text-secondary); margin: 0;">
                            Pedidos donde el cliente reportó problemas. Reembolsa el monto total al cliente o libera el pago al vendedor calculando su comisión.
                        </p>
                    </div>
                    <span style="font-size: 0.85rem; color: var(--text-muted);">${disputas.length} caso(s) en curso</span>
                </div>

                ${disputas.length === 0 ? `
                    <div class="placeholder-box" style="margin: 10px 0;">
                        <h4 style="margin-bottom: 4px;">No hay disputas activas</h4>
                        <p class="placeholder-text">Todas las transacciones en custodia Escrow se desarrollan con normalidad.</p>
                    </div>
                ` : `
                    <div class="crud-table-wrap">
                        <table class="crud-table">
                            <thead>
                                <tr>
                                    <th>Pedido / Fecha</th>
                                    <th>Producto</th>
                                    <th>Comprador</th>
                                    <th>Vendedor</th>
                                    <th>Monto Total</th>
                                    <th>Estado</th>
                                    <th style="text-align: right; min-width: 300px;">Resolución Administrativa</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${disputas.map(ped => {
                                    const vend = usuarios.find(u => u.id === ped.id_vendedor);
                                    const vendNombre = vend ? vend.nombre : 'Vendedor';
                                    const vendEsVIP = vend && vend.esVIP && (!vend.fechaExpiracionVIP || vend.fechaExpiracionVIP > Date.now());
                                    const clien = usuarios.find(u => u.id === ped.id_cliente);
                                    const clienNombre = clien ? clien.nombre : 'Cliente';
                                    const chatD = getChatPorPedido(ped.id);

                                    return `
                                        <tr>
                                            <td>
                                                <strong style="color: #ffffff;">#${ped.id}</strong><br>
                                                <small style="color: var(--text-muted);">${ped.fecha || 'Reciente'}</small>
                                            </td>
                                            <td>
                                                <div style="display: flex; align-items: center;">
                                                    <img src="${ped.productoImagen}" class="crud-thumb-mini" alt="" onerror="this.src='https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=600&auto=format&fit=crop&q=80'">
                                                    <span style="font-weight: 500; color: #fff;">${escapeHTML(ped.productoTitulo)}</span>
                                                </div>
                                            </td>
                                            <td>${escapeHTML(clienNombre)}</td>
                                            <td>
                                                ${escapeHTML(vendNombre)}
                                                ${vendEsVIP ? '<span class="badge-vip" style="font-size:0.6rem; margin-left:4px;">VIP</span>' : ''}
                                            </td>
                                            <td>
                                                <strong style="color: var(--accent); font-size: 1.05rem;">Bs. ${Number(ped.montoTotal || 0).toFixed(2)}</strong>
                                            </td>
                                            <td>
                                                <span class="order-status-pill order-status-disputa">En Disputa</span>
                                            </td>
                                            <td style="text-align: right;">
                                                <div style="display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap;">
                                                    <button class="btn btn-outline btn-sm" onclick="abrirChatPedido(${ped.id})" title="Revisar la conversación cliente-vendedor como evidencia">
                                                        ${chatD ? 'Ver Chat' : 'Chat (sin registro)'}
                                                    </button>
                                                    <button class="btn btn-outline btn-sm" style="border-color: var(--danger); color: var(--danger);" onclick="resolverDisputaAdmin(${ped.id}, 'reembolso')">
                                                        Reembolsar al Cliente
                                                    </button>
                                                    <button class="btn btn-neon btn-sm" onclick="resolverDisputaAdmin(${ped.id}, 'liberar')">
                                                        Liberar Pago al Vendedor
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                `}
            </div>
        </div>

        <!-- PESTAÑA 3: PAGOS A VENDEDORES / CORTE DE CAJA (REQUERIMIENTO 3) -->
        <div class="dash-tab-panel ${adminTabActiva === 'cortes' ? 'active' : ''}">
            <div class="card" style="margin-bottom: 24px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 12px;">
                    <div>
                        <h3 style="color: var(--accent); margin-bottom: 4px;">Corte de Caja Diario - Liquidación a Vendedores</h3>
                        <p style="font-size: 0.85rem; color: var(--text-secondary); margin: 0;">
                            Vendedores con saldo virtual acumulado por ventas completadas. Realiza la transferencia, sube el comprobante y liquida el saldo a Bs. 0.00.
                        </p>
                    </div>
                    <div style="text-align: right; background: rgba(0, 0, 0, 0.35); padding: 10px 18px; border-radius: var(--radius-sm); border: 1px solid rgba(213, 245, 156, 0.2);">
                        <span style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; display: block;">Total Pendiente de Liquidación</span>
                        <strong style="font-size: 1.4rem; color: #ffd700;">Bs. ${totalPendienteLiquidacion.toFixed(2)}</strong>
                    </div>
                </div>

                ${vendedoresConSaldo.length === 0 ? `
                    <div class="placeholder-box" style="margin: 10px 0;">
                        <h4 style="margin-bottom: 4px;">No hay pagos pendientes a vendedores</h4>
                        <p class="placeholder-text">Todos los vendedores tienen su saldo virtual liquidado al día.</p>
                    </div>
                ` : `
                    <div class="crud-table-wrap">
                        <table class="crud-table">
                            <thead>
                                <tr>
                                    <th>Vendedor</th>
                                    <th>Monto a Pagar</th>
                                    <th>Número de Cuenta Bancaria</th>
                                    <th>Código QR Bancario</th>
                                    <th style="text-align: right;">Acción de Liquidación</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${vendedoresConSaldo.map(v => `
                                    <tr>
                                        <td>
                                            <div style="display: flex; align-items: center; gap: 10px;">
                                                <img src="${v.avatar || DEFAULT_AVATAR}" class="avatar-sm" alt="" style="width: 36px; height: 36px; border-radius: 50%;">
                                                <div>
                                                    <strong style="color: #ffffff;">${escapeHTML(v.nombre)}</strong>
                                                    ${v.esVIP ? '<span class="badge-vip" style="font-size: 0.6rem; margin-left: 4px;">VIP</span>' : ''}
                                                    <br><small style="color: var(--text-muted);">${escapeHTML(v.nombreCompleto || 'Sin nombre titular')}</small>
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            <strong style="color: var(--accent); font-size: 1.15rem;">Bs. ${Number(v.saldoVirtual || 0).toFixed(2)}</strong>
                                        </td>
                                        <td>
                                            <span style="font-family: monospace; font-size: 0.88rem; color: #ffffff;">
                                                ${escapeHTML(v.numeroCuenta || v.cuentaBancaria || 'Sin cuenta registrada')}
                                            </span>
                                        </td>
                                        <td>
                                            ${v.qrBancario ? `
                                                <div style="display: flex; align-items: center; gap: 8px;">
                                                    <img src="${v.qrBancario}" alt="QR" style="width: 44px; height: 44px; object-fit: contain; background: #ffffff; border-radius: 4px; padding: 2px; cursor: pointer;" onclick="abrirModalVerImagen('${v.qrBancario}', 'QR Bancario - ${escapeHTML(v.nombre)}')">
                                                    <button class="btn btn-outline btn-sm" onclick="abrirModalVerImagen('${v.qrBancario}', 'QR Bancario - ${escapeHTML(v.nombre)}')">Ver QR</button>
                                                </div>
                                            ` : `
                                                <span style="font-size: 0.8rem; color: var(--text-muted);">Sin QR adjunto</span>
                                            `}
                                        </td>
                                        <td style="text-align: right;">
                                            <button class="btn btn-neon btn-sm" onclick="abrirModalRegistrarPago(${v.id})">
                                                Registrar Pago Realizado
                                            </button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `}
            </div>

            <!-- TABLA DE HISTORIAL DE PAGOS A VENDEDORES -->
            <div class="card">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
                    <h3 style="color: var(--accent);">Historial de Pagos y Cortes Realizados</h3>
                    <span style="font-size: 0.85rem; color: var(--text-muted);">${historialPagos.length} cortes registrados</span>
                </div>

                ${historialPagos.length === 0 ? `
                    <div class="placeholder-box" style="margin: 6px 0;">
                        <p class="placeholder-text">Aún no se han registrado cierres de caja ni pagos de liquidación en el sistema.</p>
                    </div>
                ` : `
                    <div class="crud-table-wrap">
                        <table class="crud-table">
                            <thead>
                                <tr>
                                    <th>Fecha de Corte</th>
                                    <th>Vendedor</th>
                                    <th>Monto Liquidado</th>
                                    <th>Cuenta Bancaria</th>
                                    <th>Referencia</th>
                                    <th style="text-align: right;">Comprobante de Pago</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${historialPagos.map(pago => `
                                    <tr>
                                        <td>${pago.fecha || new Date(pago.id).toLocaleString('es-ES')}</td>
                                        <td><strong style="color: #fff;">${escapeHTML(pago.nombre_vendedor)}</strong></td>
                                        <td><strong style="color: var(--accent); font-size: 1rem;">Bs. ${Number(pago.monto || 0).toFixed(2)}</strong></td>
                                        <td style="font-family: monospace; font-size: 0.85rem;">${escapeHTML(pago.numeroCuenta || 'N/A')}</td>
                                        <td style="font-size: 0.85rem; color: var(--text-secondary);">${escapeHTML(pago.referencia || 'Corte de Caja')}</td>
                                        <td style="text-align: right;">
                                            ${pago.comprobanteBase64 ? `
                                                <button class="receipt-thumb-btn" onclick="abrirModalVerImagen('${pago.comprobanteBase64}', 'Comprobante de Pago - ${escapeHTML(pago.nombre_vendedor)}')">
                                                    Ver Comprobante
                                                </button>
                                            ` : `
                                                <span style="color: var(--text-muted); font-size: 0.8rem;">Sin comprobante</span>
                                            `}
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `}
            </div>
        </div>

        <!-- PESTAÑA 4: FINANZAS Y COMISIONES -->
        <div class="dash-tab-panel ${adminTabActiva === 'finanzas' ? 'active' : ''}">
            <div class="finance-kpi-grid">
                <div class="finance-kpi-card">
                    <div class="finance-kpi-label">Comisiones Ganadas por Plataforma</div>
                    <div class="finance-kpi-val">Bs. ${totalComisionesPlataforma.toFixed(2)}</div>
                    <div class="finance-kpi-sub">Suma total de comisiones (2% VIP / 8% Estandar)</div>
                </div>
                <div class="finance-kpi-card">
                    <div class="finance-kpi-label">Volumen Total Transaccionado</div>
                    <div class="finance-kpi-val" style="color: #fff;">Bs. ${volumenTotalVentas.toFixed(2)}</div>
                    <div class="finance-kpi-sub">${pedidosCompletados.length} pedidos completados</div>
                </div>
                <div class="finance-kpi-card">
                    <div class="finance-kpi-label">Fondos en Custodia (Escrow)</div>
                    <div class="finance-kpi-val" style="color: #ffb142;">Bs. ${totalEnEscrow.toFixed(2)}</div>
                    <div class="finance-kpi-sub">${pedidosEnEscrow.length} pedidos en transito</div>
                </div>
            </div>

            <div class="card">
                <h3 style="margin-bottom: 16px; color: var(--accent);">Auditoría de Comisiones por Pedidos Completados</h3>
                ${pedidosCompletados.length === 0 ? `
                    <div class="placeholder-box">
                        <p class="placeholder-text">Aún no se registran transacciones finalizadas.</p>
                    </div>
                ` : `
                    <div style="overflow-x: auto;">
                        <table class="crud-table">
                            <thead>
                                <tr>
                                    <th>ID Pedido</th>
                                    <th>Producto</th>
                                    <th>Vendedor</th>
                                    <th>Monto Venta</th>
                                    <th>Comisión Aplicada</th>
                                    <th>Pago al Vendedor</th>
                                    <th style="color: var(--accent);">Ganancia Plataforma</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${pedidosCompletados.map(ped => {
                                    const vend = usuarios.find(u => u.id === ped.id_vendedor);
                                    const esV = (vend && vend.esVIP);
                                    const rateText = ped.porcentajeComision ? `${(ped.porcentajeComision * 100).toFixed(0)}%` : (esV ? '2% (VIP)' : '8%');
                                    const ganVend = ped.gananciaVendedor !== undefined ? ped.gananciaVendedor : (ped.montoTotal * (1 - (esV ? 0.02 : 0.08)));
                                    const comPlat = ped.comisionPlataforma !== undefined ? ped.comisionPlataforma : (ped.montoTotal * (esV ? 0.02 : 0.08));

                                    return `
                                        <tr>
                                            <td style="color: var(--text-muted);">#${ped.id}</td>
                                            <td style="font-weight: 600;">${escapeHTML(ped.productoTitulo || 'Producto #' + ped.id_producto)}</td>
                                            <td>${escapeHTML(ped.vendedorNombre || (vend ? vend.nombre : 'Vendedor'))} ${esV ? '<span class="badge-vip">VIP</span>' : ''}</td>
                                            <td style="font-weight: 700;">Bs. ${Number(ped.montoTotal).toFixed(2)}</td>
                                            <td><span class="badge-role badge-cliente">${rateText}</span></td>
                                            <td style="color: #7bed9f;">Bs. ${Number(ganVend).toFixed(2)}</td>
                                            <td style="color: var(--accent); font-weight: 800;">+ Bs. ${Number(comPlat).toFixed(2)}</td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                `}
            </div>
        </div>

        <!-- PESTAÑA 5: TODOS LOS USUARIOS -->
        <div class="dash-tab-panel ${adminTabActiva === 'usuarios' ? 'active' : ''}">
            <div class="card">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <h3 style="color: var(--text-primary);">Usuarios Registrados</h3>
                    <span style="font-size: 0.85rem; color: var(--text-muted);">${usuarios.length} cuentas</span>
                </div>
                <div style="overflow-x: auto;">
                    <table class="crud-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Nombre</th>
                                <th>Rol</th>
                                <th>Estado de Cuenta</th>
                                <th>Saldo Virtual</th>
                                <th>Membresía VIP</th>
                                <th style="text-align: right; min-width: 320px;">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${usuarios.map(u => {
                                // Resolver estado visible sin escribir en la BD
                                let estadoC = u.estadoCuenta || 'activo';
                                if (estadoC === 'suspendido' && u.suspensionHasta && u.suspensionHasta <= Date.now()) {
                                    estadoC = 'activo';
                                }
                                const estadoBadge = estadoC === 'baneado'
                                    ? '<span class="badge-role badge-baneado">Baneado</span>'
                                    : estadoC === 'suspendido'
                                        ? `<span class="badge-role badge-suspendido">Suspendido hasta ${new Date(u.suspensionHasta).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}</span>`
                                        : '<span class="badge-role badge-activo">Activo</span>';

                                let sancionBtns = '';
                                if (u.rol !== 'admin') {
                                    if (estadoC === 'activo') {
                                        sancionBtns = `
                                            <button class="btn btn-outline btn-sm" style="border-color: #ff9f43; color: #ff9f43;" onclick="suspenderUsuario(${u.id})">Suspender</button>
                                            <button class="btn btn-danger btn-sm" onclick="banearUsuario(${u.id})">Banear</button>
                                        `;
                                    } else if (estadoC === 'suspendido') {
                                        sancionBtns = `
                                            <button class="btn btn-neon btn-sm" onclick="reactivarUsuario(${u.id})">Reactivar</button>
                                            <button class="btn btn-danger btn-sm" onclick="banearUsuario(${u.id})">Banear</button>
                                        `;
                                    } else {
                                        sancionBtns = `<button class="btn btn-neon btn-sm" onclick="reactivarUsuario(${u.id})">Reactivar</button>`;
                                    }
                                } else {
                                    sancionBtns = '<span style="font-size: 0.75rem; color: var(--text-muted);">Cuenta protegida</span>';
                                }

                                return `
                                <tr>
                                    <td style="color: var(--text-muted);">#${u.id}</td>
                                    <td style="font-weight: 700; color: #fff;">${escapeHTML(u.nombre)}</td>
                                    <td><span class="badge-role badge-${u.rol}">${u.rol.replace('_', ' ')}</span></td>
                                    <td>${estadoBadge}</td>
                                    <td style="color: var(--accent); font-weight: 700;">Bs. ${Number(u.saldoVirtual || 0).toFixed(2)}</td>
                                    <td>${u.esVIP ? '<span class="badge-vip">VIP</span>' : '<span style="color: var(--text-muted);">Estandar</span>'}</td>
                                    <td style="text-align: right;">
                                        <div style="display: flex; gap: 6px; justify-content: flex-end; flex-wrap: wrap;">
                                            <button class="btn btn-outline btn-sm" onclick="toggleVipUser(${u.id})">
                                                ${u.esVIP ? 'Quitar VIP' : 'Asignar VIP'}
                                            </button>
                                            ${sancionBtns}
                                        </div>
                                    </td>
                                </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    // Cargar la cola de pagos compartidos (nube) si la pestaña activa lo requiere
    if (adminTabActiva === 'pagos') cargarPagosNubeAdmin();
}

// Handlers administrativos para Tasa de Cambio, Disputas y Cortes de Caja
function handleActualizarTasaCambio() {
    const input = document.getElementById('inputTasaCambioGlobal');
    if (!input) return;

    const nuevaTasa = parseFloat(input.value);
    if (isNaN(nuevaTasa) || nuevaTasa <= 0) {
        showToast("Por favor ingresa una tasa de cambio numérica válida superior a 0.", "error");
        return;
    }

    setTasaCambioGlobal(nuevaTasa);
    setTasaCambioMeta({ fuente: 'manual', fecha: Date.now() });
    showToast(`Tasa de cambio ajustada manualmente a Bs. ${nuevaTasa.toFixed(2)} por USD.`, "success");
    renderAdmin();
    renderCatalogo();
}

// Sincronizacion de la cotizacion del dolar con referencia al BCB
async function sincronizarTasaBCB() {
    showToast('Consultando cotización del dólar en línea...', 'info');
    try {
        const opciones = {};
        if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
            opciones.signal = AbortSignal.timeout(8000);
        }
        const resp = await fetch('https://open.er-api.com/v6/latest/USD', opciones);
        const data = await resp.json();
        const bob = data && data.rates && data.rates.BOB;
        if (typeof bob !== 'number' || bob <= 0) {
            throw new Error('Cotización BOB no disponible');
        }
        setTasaCambioGlobal(bob);
        setTasaCambioMeta({ fuente: 'api_bcb', fecha: Date.now() });
        showToast(`Cotización actualizada: 1 USD = Bs. ${bob.toFixed(2)} (fuente en línea, referencial al BCB).`, 'success');
    } catch (e) {
        setTasaCambioGlobal(TASA_BCB_OFICIAL);
        setTasaCambioMeta({ fuente: 'bcb_oficial', fecha: Date.now() });
        showToast(`Sin conexión a la API. Se aplicó la cotización oficial del BCB: 1 USD = Bs. ${TASA_BCB_OFICIAL.toFixed(2)}.`, 'info');
    }

    const user = getUsuarioActual();
    if (user && user.rol === 'admin') {
        renderAdmin();
    }
    renderCatalogo();
}

function resolverDisputaAdmin(pedidoId, accion) {
    const pedidos = getPedidos();
    const pedido = pedidos.find(p => p.id === pedidoId);
    if (!pedido || pedido.estado !== "En_Disputa") return;

    const usuarios = getUsuarios();
    const vendedor = usuarios.find(u => u.id === pedido.id_vendedor);

    if (accion === 'reembolso') {
        const confirmar = confirm(`¿Estás seguro de REEMBOLSAR el pedido #${pedido.id} al cliente?\n\nEl estado cambiará a Cancelado_Reembolsado.`);
        if (!confirmar) return;

        pedido.estado = "Cancelado_Reembolsado";
        pedido.fechaResolucion = Date.now();
        pedido.resolucionDisputa = "Reembolso emitido al cliente por resolución de administración.";
        savePedidos(pedidos);

        showToast(`Disputa resuelta: Pedido #${pedido.id} cancelado y fondos reembolsados al cliente.`, "info");
        renderAdmin();
        renderCompras();
    } else if (accion === 'liberar') {
        const confirmar = confirm(`¿Estás seguro de LIBERAR EL PAGO del pedido #${pedido.id} al vendedor?\n\nSe calculará la comisión correspondiente y se acreditará a su saldo virtual.`);
        if (!confirmar) return;

        const esVIP = vendedor && vendedor.esVIP === true && (!vendedor.fechaExpiracionVIP || vendedor.fechaExpiracionVIP > Date.now());
        const porcentajeComision = esVIP ? 0.02 : 0.08;
        const montoTotal = Number(pedido.montoTotal) || 0;
        const ganancia = Number((montoTotal * (1 - porcentajeComision)).toFixed(2));
        const comisionPlataforma = Number((montoTotal * porcentajeComision).toFixed(2));

        if (vendedor) {
            vendedor.saldoVirtual = Number(((Number(vendedor.saldoVirtual) || 0) + ganancia).toFixed(2));
            saveUsuarios(usuarios);

            const act = getUsuarioActual();
            if (act && act.id === vendedor.id) {
                act.saldoVirtual = vendedor.saldoVirtual;
                setUsuarioActual(act);
            }
        }

        pedido.estado = "Completado";
        pedido.gananciaVendedor = ganancia;
        pedido.comisionPlataforma = comisionPlataforma;
        pedido.porcentajeComision = porcentajeComision;
        pedido.fechaCompletado = Date.now();
        pedido.fechaResolucion = Date.now();
        pedido.resolucionDisputa = "Fondos liberados al vendedor por resolución de administración.";
        savePedidos(pedidos);

        showToast(`Disputa resuelta: Se liberaron Bs. ${ganancia.toFixed(2)} al vendedor (Comisión plataforma: Bs. ${comisionPlataforma.toFixed(2)}).`, "success");
        renderAdmin();
        renderCompras();
    }
}

// Modal y comprobante para Corte de Caja
let comprobantePagoTemporal = null;

function abrirModalRegistrarPago(vendedorId) {
    const usuarios = getUsuarios();
    const vendor = usuarios.find(u => u.id === vendedorId);
    if (!vendor) return;

    document.getElementById('pagoVendedorId').value = vendor.id;
    document.getElementById('pagoVendedorNombre').textContent = vendor.nombre;
    document.getElementById('pagoVendedorMonto').textContent = `Bs. ${Number(vendor.saldoVirtual || 0).toFixed(2)}`;
    document.getElementById('pagoVendedorCuenta').textContent = vendor.numeroCuenta || vendor.cuentaBancaria || 'Sin cuenta registrada';

    const qrWrap = document.getElementById('pagoVendedorQRWrap');
    const qrImg = document.getElementById('pagoVendedorQRImg');
    if (vendor.qrBancario) {
        qrImg.src = vendor.qrBancario;
        qrWrap.style.display = 'block';
    } else {
        qrWrap.style.display = 'none';
    }

    const form = document.getElementById('formRegistrarPagoVendedor');
    if (form) form.reset();

    comprobantePagoTemporal = null;
    const previewContainer = document.getElementById('pagoComprobantePreviewContainer');
    if (previewContainer) previewContainer.style.display = 'none';

    const alertBox = document.getElementById('pagoVendedorAlert');
    if (alertBox) alertBox.style.display = 'none';

    openModal('modalRegistrarPagoVendedor');
}

function previewComprobantePago(event) {
    const file = event.target.files[0];
    const previewContainer = document.getElementById('pagoComprobantePreviewContainer');
    const previewImg = document.getElementById('pagoComprobantePreviewImg');

    if (!file) {
        comprobantePagoTemporal = null;
        if (previewContainer) previewContainer.style.display = 'none';
        return;
    }

    if (!file.type.startsWith('image/')) {
        showToast("Por favor selecciona un archivo de imagen válido para el comprobante.", "error");
        event.target.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        comprobantePagoTemporal = e.target.result;
        if (previewImg) previewImg.src = e.target.result;
        if (previewContainer) previewContainer.style.display = 'block';
    };
    reader.readAsDataURL(file);
}

function handleConfirmarPagoVendedor(event) {
    event.preventDefault();
    const vendorId = Number(document.getElementById('pagoVendedorId').value);
    const refInput = document.getElementById('pagoReferenciaInput');

    if (!comprobantePagoTemporal) {
        showToast("Por favor adjunta la imagen del comprobante de transferencia bancaria.", "error");
        return;
    }

    const usuarios = getUsuarios();
    const vendor = usuarios.find(u => u.id === vendorId);
    if (!vendor) return;

    const montoPagado = Number(vendor.saldoVirtual || 0);

    // 1. Guardar en historialPagosVendedores
    const historial = getHistorialPagosVendedores();
    const nuevoPago = {
        id: Date.now(),
        fecha: new Date().toLocaleString('es-ES', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }),
        timestamp: Date.now(),
        id_vendedor: vendor.id,
        nombre_vendedor: vendor.nombre,
        monto: montoPagado,
        numeroCuenta: vendor.numeroCuenta || vendor.cuentaBancaria || '',
        referencia: refInput ? refInput.value.trim() : '',
        comprobanteBase64: comprobantePagoTemporal
    };
    historial.unshift(nuevoPago);
    saveHistorialPagosVendedores(historial);

    // 2. Resetear saldoVirtual del vendedor a 0
    vendor.saldoVirtual = 0;
    saveUsuarios(usuarios);

    const actual = getUsuarioActual();
    if (actual && actual.id === vendor.id) {
        actual.saldoVirtual = 0;
        setUsuarioActual(actual);
    }

    closeModal('modalRegistrarPagoVendedor');
    showToast(`Corte de caja registrado con éxito. Se liquidaron Bs. ${montoPagado.toFixed(2)} al vendedor.`, "success");
    renderAdmin();
}

function ampliarQRVendedorEnPago() {
    const qrImg = document.getElementById('pagoVendedorQRImg');
    if (qrImg && qrImg.src) {
        abrirModalVerImagen(qrImg.src, 'Código QR Bancario del Vendedor');
    }
}

// Modal visor de imagen full size
function abrirModalVerImagen(src, titulo = 'Visualizador de Documento') {
    const imgEl = document.getElementById('visorImagenSrc');
    const titleEl = document.getElementById('visorImagenTitulo');
    if (imgEl) imgEl.src = src;
    if (titleEl) titleEl.textContent = titulo;
    openModal('modalVerImagen');
}

// Abrir el comprobante de pago subido por el cliente en el pedido
function verComprobantePago(pedidoId) {
    const pedido = getPedidos().find(p => p.id === pedidoId);
    if (!pedido || !pedido.comprobantePago) {
        showToast('Este pedido no tiene comprobante adjunto.', 'error');
        return;
    }
    abrirModalVerImagen(pedido.comprobantePago, `Comprobante de Pago — Pedido #${pedidoId} (Bs. ${Number(pedido.montoTotal).toFixed(2)})`);
}

function toggleVipUser(userId) {
    const usuarios = getUsuarios();
    const u = usuarios.find(x => x.id === userId);
    if (!u) return;

    u.esVIP = !u.esVIP;
    u.fechaExpiracionVIP = u.esVIP ? Date.now() + (30 * 24 * 60 * 60 * 1000) : null;
    saveUsuarios(usuarios);

    const act = getUsuarioActual();
    if (act && act.id === userId) {
        act.esVIP = u.esVIP;
        act.fechaExpiracionVIP = u.fechaExpiracionVIP;
        setUsuarioActual(act);
    }

    showToast(`Estado VIP de "${u.nombre}" actualizado a: ${u.esVIP ? 'VIP (2% Comision)' : 'Estandar (8% Comision)'}.`, 'info');
    renderAdmin();
    renderHeader();
}

function aprobarVendedor(userId) {
    const usuarios = getUsuarios();
    const target = usuarios.find(u => u.id === userId);
    if (!target) return;

    target.rol = 'vendedor';
    saveUsuarios(usuarios);

    const act = getUsuarioActual();
    if (act && act.id === userId) {
        act.rol = 'vendedor';
        setUsuarioActual(act);
    }

    showToast(`El usuario "${target.nombre}" fue aprobado como Vendedor oficial.`, 'success');
    renderAdmin();
    renderHeader();
}

function rechazarVendedor(userId) {
    const usuarios = getUsuarios();
    const target = usuarios.find(u => u.id === userId);
    if (!target) return;

    target.rol = 'cliente';
    saveUsuarios(usuarios);

    const act = getUsuarioActual();
    if (act && act.id === userId) {
        act.rol = 'cliente';
        setUsuarioActual(act);
    }

    showToast(`Solicitud de "${target.nombre}" rechazada. Rol asignado: cliente.`, 'info');
    renderAdmin();
    renderHeader();
}

// --- SANCIONES DE CUENTA: SUSPENSIÓN TEMPORAL Y BANEO PERMANENTE ---
// Devuelve 'activo', 'suspendido' o 'baneado'. Si una suspension vencio, reactiva automaticamente.
function resolverEstadoCuenta(userId) {
    const usuarios = getUsuarios();
    const u = usuarios.find(x => x.id === userId);
    if (!u) return 'activo';

    if (u.estadoCuenta === 'suspendido' && u.suspensionHasta && u.suspensionHasta <= Date.now()) {
        u.estadoCuenta = 'activo';
        u.suspensionHasta = null;
        u.motivoSancion = null;
        saveUsuarios(usuarios);

        const act = getUsuarioActual();
        if (act && act.id === userId) {
            act.estadoCuenta = 'activo';
            act.suspensionHasta = null;
            act.motivoSancion = null;
            setUsuarioActual(act);
        }
    }

    return u.estadoCuenta || 'activo';
}

// Chequeo ligero sin escrituras: usado para ocultar productos de cuentas sancionadas
function estaCuentaActiva(u) {
    if (!u) return true;
    if (u.estadoCuenta === 'baneado') return false;
    if (u.estadoCuenta === 'suspendido' && u.suspensionHasta && u.suspensionHasta > Date.now()) return false;
    return true;
}

// Mensaje de bloqueo si la cuenta del usuario actual esta sancionada (null = sin bloqueo)
function obtenerBloqueoCuenta() {
    const user = getUsuarioActual();
    if (!user) return null;
    const estado = resolverEstadoCuenta(user.id);
    if (estado === 'activo') return null;
    if (estado === 'baneado') {
        return 'Tu cuenta fue baneada permanentemente por infringir los Términos y Condiciones de Last Line.';
    }
    const u = getUsuarioById(user.id);
    const fin = u && u.suspensionHasta
        ? new Date(u.suspensionHasta).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
        : '';
    return `Tu cuenta está suspendida hasta el ${fin}. Motivo: ${(u && u.motivoSancion) || 'Infracción de reglas de la plataforma'}.`;
}

function suspenderUsuario(userId) {
    const usuarios = getUsuarios();
    const u = usuarios.find(x => x.id === userId);
    if (!u) return;
    if (u.rol === 'admin') {
        showToast('No puedes sancionar a una cuenta de administrador.', 'error');
        return;
    }

    const diasStr = prompt(`¿Cuántos días deseas suspender a "${u.nombre}"?\n\nIngresa un número entre 1 y 365.`, '7');
    if (diasStr === null) return;
    const dias = parseInt(diasStr, 10);
    if (isNaN(dias) || dias < 1 || dias > 365) {
        showToast('Número de días inválido. Debe ser entre 1 y 365.', 'error');
        return;
    }

    const motivo = prompt('Motivo de la suspensión (opcional):', 'Incumplimiento de los Términos y Condiciones');
    if (motivo === null) return;

    u.estadoCuenta = 'suspendido';
    u.suspensionHasta = Date.now() + dias * 24 * 60 * 60 * 1000;
    u.motivoSancion = motivo.trim() || 'Incumplimiento de los Términos y Condiciones';
    saveUsuarios(usuarios);

    // Si la cuenta sancionada tiene sesion abierta en este navegador, cerrarla
    const act = getUsuarioActual();
    if (act && act.id === userId) {
        setUsuarioActual(null);
        renderHeader();
    }

    showToast(`La cuenta "${u.nombre}" fue suspendida por ${dias} día(s).`, 'info');
    renderAdmin();
}

function banearUsuario(userId) {
    const usuarios = getUsuarios();
    const u = usuarios.find(x => x.id === userId);
    if (!u) return;
    if (u.rol === 'admin') {
        showToast('No puedes sancionar a una cuenta de administrador.', 'error');
        return;
    }

    const confirmar = confirm(
        `¿BANEAR PERMANENTEMENTE a "${u.nombre}"?\n\nEl usuario no podrá iniciar sesión y sus productos saldrán del catálogo. Usa esta medida solo ante fraude o infracción grave.`
    );
    if (!confirmar) return;

    u.estadoCuenta = 'baneado';
    u.suspensionHasta = null;
    u.motivoSancion = 'Cuenta baneada por infracción grave de los Términos y Condiciones.';
    saveUsuarios(usuarios);

    const act = getUsuarioActual();
    if (act && act.id === userId) {
        setUsuarioActual(null);
        renderHeader();
    }

    showToast(`La cuenta "${u.nombre}" fue baneada permanentemente.`, 'error');
    renderAdmin();
    renderCatalogo();
}

function reactivarUsuario(userId) {
    const usuarios = getUsuarios();
    const u = usuarios.find(x => x.id === userId);
    if (!u) return;

    u.estadoCuenta = 'activo';
    u.suspensionHasta = null;
    u.motivoSancion = null;
    saveUsuarios(usuarios);

    showToast(`La cuenta "${u.nombre}" fue reactivada y vuelve a estar operativa.`, 'success');
    renderAdmin();
    renderCatalogo();
}

// --- 12. VISTA MI PERFIL (REQUERIMIENTO 2: SOLICITUD Y CANCELACIÓN) ---
function renderHomeStats() {
    const usuarios = getUsuarios();
    const productos = getProductos();
    const vendedores = usuarios.filter(u => u.rol === 'vendedor' || u.rol === 'admin');

    const elUsers = document.getElementById('statsUsuariosCount');
    const elProds = document.getElementById('statsProductosCount');
    const elVends = document.getElementById('statsVendedoresCount');

    if (elUsers) elUsers.textContent = usuarios.length;
    if (elProds) elProds.textContent = productos.length;
    if (elVends) elVends.textContent = vendedores.length;
}

function renderPerfil() {
    const container = document.getElementById('perfilContent');
    if (!container) return;

    const user = getUsuarioActual();

    if (!user) {
        container.innerHTML = `
            <div class="card" style="text-align: center; max-width: 500px; margin: 40px auto; padding: 40px 20px;">
                <h2 style="margin-bottom: 10px;">Acceso a Mi Perfil</h2>
                <p style="color: var(--text-secondary); margin-bottom: 25px;">Debes iniciar sesión para visualizar los datos de tu cuenta y gestionar tu perfil.</p>
                <div style="display: flex; gap: 12px; justify-content: center;">
                    <button class="btn btn-neon" onclick="openModal('modalLogin')">Iniciar Sesión</button>
                    <button class="btn btn-outline" onclick="openModal('modalRegistro')">Crear Cuenta</button>
                </div>
            </div>
        `;
        return;
    }

    const avatarSrc = user.avatar && user.avatar.trim() !== '' ? user.avatar : DEFAULT_AVATAR;

    let roleTag = '';
    let roleDescription = '';

    if (user.rol === 'admin') {
        roleTag = `<span class="badge-role badge-admin">Administrador</span>`;
        roleDescription = `Tienes control total del marketplace, finanzas y moderacion.`;
    } else if (user.rol === 'vendedor') {
        roleTag = `<span class="badge-role badge-vendedor">Vendedor Verificado</span>`;
        roleDescription = `Habilitado para publicar y vender productos digitales en el marketplace.`;
    } else if (user.rol === 'vendedor_pendiente') {
        roleTag = `<span class="badge-role badge-vendedor_pendiente">Vendedor Pendiente</span>`;
        roleDescription = `Tu solicitud está siendo revisada por los administradores de Last Line.`;
    } else {
        roleTag = `<span class="badge-role badge-cliente">Cliente</span>`;
        roleDescription = `Puedes adquirir productos digitales de vendedores verificados con proteccion Escrow.`;
    }

    const esVipActivo = user.esVIP && (!user.fechaExpiracionVIP || user.fechaExpiracionVIP > Date.now());

    container.innerHTML = `
        <div class="profile-card">
            <div class="profile-top">
                <div class="profile-avatar-wrap">
                    <img src="${avatarSrc}" alt="${user.nombre}" id="profileAvatarImg">
                </div>
                <div class="profile-meta">
                    <h2>
                        ${escapeHTML(user.nombre)}
                        ${roleTag}
                        ${esVipActivo ? '<span class="badge-vip">VIP (2% Comision)</span>' : ''}
                    </h2>
                    <p style="color: var(--text-secondary); font-size: 0.95rem;">${roleDescription}</p>
                    <div style="margin-top: 12px;">
                        <label for="avatarUploadInput" class="btn btn-outline btn-sm" style="cursor: pointer;">
                            Cambiar Foto de Perfil
                        </label>
                        <input type="file" id="avatarUploadInput" accept="image/*" style="display: none;" onchange="handleAvatarFileSelect(event)">
                    </div>
                </div>
            </div>

            <div class="profile-data-grid">
                <div class="profile-data-item">
                    <div class="label">ID de Usuario</div>
                    <div class="value">#${user.id}</div>
                </div>
                <div class="profile-data-item">
                    <div class="label">Saldo Virtual</div>
                    <div class="value" style="color: var(--accent);">Bs. ${Number(user.saldoVirtual || 0).toFixed(2)}</div>
                </div>
                <div class="profile-data-item">
                    <div class="label">Rol en el Marketplace</div>
                    <div class="value" style="text-transform: capitalize;">${user.rol.replace('_', ' ')}</div>
                </div>
                <div class="profile-data-item">
                    <div class="label">Membresía VIP</div>
                    <div class="value">${esVipActivo ? 'Activa (2% Comision)' : 'Estandar (8% Comision)'}</div>
                </div>
            </div>

            <!-- Acciones según rol (Requerimiento 2: Solicitud y Cancelación de Vendedor) -->
            <div style="background: rgba(0,0,0,0.2); border-radius: var(--radius-sm); padding: 20px; border: 1px solid var(--border-color); margin-bottom: 24px;">
                ${user.rol === 'cliente' ? `
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 15px;">
                        <div>
                            <h4 style="color: var(--accent); margin-bottom: 4px;">Convertirme en Vendedor</h4>
                            <p style="font-size: 0.85rem; color: var(--text-secondary);">Publica tus productos digitales con bajas comisiones y recepcion de fondos protegida.</p>
                        </div>
                        <button class="btn btn-neon" onclick="abrirModalSolicitudVendedor()">Convertirme en Vendedor</button>
                    </div>
                ` : user.rol === 'vendedor_pendiente' ? `
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 15px;">
                        <div>
                            <strong style="color: #ff9f43; font-size: 0.95rem;">Solicitud de Vendedor en Revisión</strong>
                            <p style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 3px;">Tus datos bancarios y comerciales estan siendo evaluados por el equipo administrativo.</p>
                        </div>
                        <button class="btn btn-danger btn-sm" onclick="cancelarSolicitudVendedor()">Cancelar Solicitud de Vendedor</button>
                    </div>
                ` : `
                    <div style="color: var(--accent); font-size: 0.9rem;">
                        Cuenta autorizada con privilegios de vendedor en Last Line.
                    </div>
                `}
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
                <button class="btn btn-ghost" onclick="window.location.hash = '#/'">Volver al Marketplace</button>
                <button class="btn btn-danger" onclick="logout()">Cerrar Sesión</button>
            </div>
        </div>
    `;
}

function handleAvatarFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        showToast('Por favor selecciona un archivo de imagen válido.', 'error');
        return;
    }

    if (file.size > 2 * 1024 * 1024) {
        showToast('La imagen no debe superar los 2MB de tamaño.', 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        const base64Data = e.target.result;
        const user = getUsuarioActual();
        if (!user) return;

        const usuarios = getUsuarios();
        const idx = usuarios.findIndex(u => u.id === user.id);
        if (idx !== -1) {
            usuarios[idx].avatar = base64Data;
            saveUsuarios(usuarios);
        }

        user.avatar = base64Data;
        setUsuarioActual(user);

        showToast('Foto de perfil actualizada con éxito.', 'success');
        renderHeader();
        renderPerfil();
    };
    reader.readAsDataURL(file);
}

// --- 13. MODALES Y AUTENTICACIÓN ---
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    
    const alertBox = modal.querySelector('.form-alert');
    if (alertBox) {
        alertBox.style.display = 'none';
        alertBox.textContent = '';
    }

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';

    const firstInput = modal.querySelector('input:not([type="checkbox"])');
    if (firstInput) {
        setTimeout(() => firstInput.focus(), 100);
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.remove('active');
    // Solo restaurar el scroll si ningun otro modal sigue abierto
    if (!document.querySelector('.modal-overlay.active')) {
        document.body.style.overflow = 'auto';
    }
}

function switchModal(fromId, toId) {
    closeModal(fromId);
    setTimeout(() => openModal(toId), 150);
}

function handleBackdropClick(event, modalId) {
    if (event.target.id === modalId) {
        closeModal(modalId);
    }
}

window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.active').forEach(modal => {
            closeModal(modal.id);
        });
    }
});

// Registro: Solo para clientes sin checkbox de vendedor (Requerimiento 2)
async function handleRegisterSubmit(event) {
    event.preventDefault();
    const alertBox = document.getElementById('registroAlert');
    alertBox.style.display = 'none';

    const nombreInput = document.getElementById('regNombre');
    const passInput = document.getElementById('regPassword');
    const terminosCheckbox = document.getElementById('regTerminos');

    const nombre = nombreInput.value.trim();
    const password = passInput.value;
    const aceptaTerminos = terminosCheckbox.checked;

    if (!nombre || !password) {
        showFormAlert(alertBox, 'Por favor, completa todos los campos requeridos.');
        return;
    }

    if (password.length < 4) {
        showFormAlert(alertBox, 'La contraseña debe tener al menos 4 caracteres.');
        return;
    }

    if (!aceptaTerminos) {
        showFormAlert(alertBox, 'Debes leer y aceptar los Términos y Condiciones completos para crear tu cuenta.');
        return;
    }

    // Intentar registro en la nube (cuenta compartida entre dispositivos)
    try {
        const r = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accion: 'registro', nombre, password })
        });
        const data = await r.json();
        if (!r.ok) {
            showFormAlert(alertBox, data.error || 'No se pudo registrar la cuenta.');
            return;
        }
        finalizarRegistro(data.usuario, event, alertBox);
        return;
    } catch (e) { /* sin conexión: registro local de respaldo */ }

    const usuarios = getUsuarios();
    const existe = usuarios.some(u => u.nombre.toLowerCase() === nombre.toLowerCase());
    if (existe) {
        showFormAlert(alertBox, 'Ese nombre de usuario ya está registrado. Por favor, elige otro.');
        return;
    }

    // Rol por defecto: cliente (modo local, sin sincronizacion)
    const nuevoUsuario = {
        id: Date.now(),
        token: '',
        nombre: nombre,
        password: password,
        rol: 'cliente',
        avatar: '',
        saldoVirtual: 0,
        esVIP: false,
        estadoCuenta: 'activo',
        fechaExpiracionVIP: null,
        fechaAceptacionTerminos: Date.now()
    };

    finalizarRegistro(nuevoUsuario, event, alertBox);
}

// Cierre comun del registro (nube o local): guarda el usuario y abre sesion
function finalizarRegistro(nuevoUsuario, event, alertBox) {
    const usuarios = getUsuarios();
    if (!usuarios.some(u => u.id === nuevoUsuario.id)) {
        usuarios.push(nuevoUsuario);
        saveUsuarios(usuarios);
    }

    setUsuarioActual(nuevoUsuario);

    event.target.reset();
    closeModal('modalRegistro');

    showToast(`Bienvenido a Last Line, ${nuevoUsuario.nombre}. Tu cuenta fue creada exitosamente.`, 'success');
    renderHeader();
    pullNube();
    router();
}

async function handleLoginSubmit(event) {
    event.preventDefault();
    const alertBox = document.getElementById('loginAlert');
    alertBox.style.display = 'none';

    const nombre = document.getElementById('loginNombre').value.trim();
    const password = document.getElementById('loginPassword').value;

    if (!nombre || !password) {
        showFormAlert(alertBox, 'Por favor ingresa usuario y contraseña.');
        return;
    }

    let user = null;

    // Login contra la nube (funciona en cualquier dispositivo)
    try {
        const r = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accion: 'login', nombre, password })
        });
        const data = await r.json();
        if (r.ok && data.usuario) {
            user = data.usuario;
            // Guardar/actualizar la fila en el espejo local
            const lista = getUsuarios();
            const idx = lista.findIndex(u => u.id === user.id || u.nombre.toLowerCase() === user.nombre.toLowerCase());
            if (idx >= 0) lista[idx] = user; else lista.push(user);
            saveUsuarios(lista);
        }
    } catch (e) { /* sin conexión: se intenta con el espejo local */ }

    if (!user) {
        const usuarios = getUsuarios();
        user = usuarios.find(u => u.nombre.toLowerCase() === nombre.toLowerCase() && u.password === password) || null;
    }

    if (!user) {
        showFormAlert(alertBox, 'Usuario o contraseña incorrectos. Verifica tus datos.');
        return;
    }

    // Verificar sancion de la cuenta (baneo permanente o suspension temporal)
    const estadoLogin = resolverEstadoCuenta(user.id);
    if (estadoLogin === 'baneado') {
        showFormAlert(alertBox, 'Tu cuenta fue suspendida permanentemente por infringir los Términos y Condiciones de Last Line.');
        return;
    }
    if (estadoLogin === 'suspendido') {
        const uFresco = getUsuarioById(user.id);
        const fin = uFresco && uFresco.suspensionHasta
            ? new Date(uFresco.suspensionHasta).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
            : '';
        showFormAlert(alertBox, `Tu cuenta está suspendida hasta el ${fin}. Motivo: ${(uFresco && uFresco.motivoSancion) || 'Infracción de reglas de la plataforma'}.`);
        return;
    }

    setUsuarioActual(user);
    event.target.reset();
    closeModal('modalLogin');

    showToast(`Bienvenido de vuelta, ${user.nombre}.`, 'success');
    renderHeader();
    pullNube();
    router();
}

function logout() {
    setUsuarioActual(null);
    showToast('Sesión cerrada correctamente.', 'info');
    window.location.hash = '#/';
    renderHeader('#/');
    router();
}

function showFormAlert(el, message) {
    el.textContent = message;
    el.style.display = 'block';
}

// --- 14. SISTEMA CORPORATIVO DE TOAST NOTIFICATIONS (SIN EMOJIS) ---
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';

    let prefix = '[INFO]';
    if (type === 'success') prefix = '[OK]';
    if (type === 'error') prefix = '[AVISO]';

    toast.innerHTML = `
        <span style="font-weight: 800; font-size: 0.8rem; color: var(--accent); margin-right: 4px;">${prefix}</span>
        <span>${escapeHTML(message)}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(60px)';
        setTimeout(() => toast.remove(), 400);
    }, 4000);
}

function escapeHTML(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ==========================================================================
// FASE 5: TÉRMINOS LEGALES, CHAT DE TRANSACCIÓN (7 DÍAS) Y RESEÑAS
// ==========================================================================

// --- 15. TÉRMINOS Y CONDICIONES (LECTURA OBLIGATORIA) ---
function abrirModalTerminos(origen = 'lectura') {
    terminosOrigen = origen;

    openModal('modalTerminos');

    const scrollEl = document.getElementById('terminosScrollContent');
    const btn = document.getElementById('btnAceptarTerminos');
    const aviso = document.getElementById('terminosAviso');

    if (scrollEl) scrollEl.scrollTop = 0;

    // Si ya acepto en esta sesion, habilitar de inmediato el boton
    if (btn) btn.disabled = !terminosAceptadosSesion;
    if (aviso) {
        aviso.textContent = 'Desplázate hasta el final del documento para habilitar el botón de aceptación.';
        aviso.style.display = terminosAceptadosSesion ? 'none' : 'block';
    }

    verificarScrollTerminos();
}

function verificarScrollTerminos() {
    const el = document.getElementById('terminosScrollContent');
    const btn = document.getElementById('btnAceptarTerminos');
    const aviso = document.getElementById('terminosAviso');
    if (!el || !btn) return;

    // Habilitar cuando se llega al final o si el documento no requiere scroll
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 15) {
        btn.disabled = false;
        if (aviso) aviso.style.display = 'none';
    }
}

function aceptarTerminos() {
    terminosAceptadosSesion = true;

    const cbReg = document.getElementById('regTerminos');
    if (cbReg) cbReg.disabled = false;

    const cbSol = document.getElementById('solicitudAceptoReglamento');
    if (cbSol) cbSol.disabled = false;

    if (terminosOrigen === 'registro' && cbReg) cbReg.checked = true;
    if (terminosOrigen === 'vendedor' && cbSol) cbSol.checked = true;

    closeModal('modalTerminos');
    if (terminosOrigen !== 'lectura') {
        showToast('Términos y Condiciones aceptados.', 'success');
    }
}

// --- 16. CHAT DE TRANSACCIÓN CLIENTE-VENDEDOR (DURACIÓN 7 DÍAS) ---
function getChats() {
    return _getTable('chats');
}

function saveChats(chats) {
    _setTable('chats', chats);
    programarPush('chats');
}

function getChatPorPedido(pedidoId) {
    return getChats().find(c => c.id_pedido === pedidoId) || null;
}

function crearChatParaPedido(pedido) {
    const chats = getChats();
    const existente = chats.find(c => c.id_pedido === pedido.id);
    if (existente) return existente;

    const ahora = Date.now();
    const nuevoChat = {
        id: ahora,
        id_pedido: pedido.id,
        id_cliente: pedido.id_cliente,
        id_vendedor: pedido.id_vendedor,
        productoTitulo: pedido.productoTitulo || 'Producto Digital',
        fechaCreacion: ahora,
        fechaExpiracion: ahora + DURACION_CHAT_MS,
        ultimaLecturaCliente: ahora,
        ultimaLecturaVendedor: 0,
        ultimaLecturaAdmin: 0,
        mensajes: [
            {
                id: ahora,
                sistema: true,
                texto: 'Chat de transacción abierto. Cliente y vendedor pueden coordinar aquí la entrega (códigos de amigo, claves, usuarios, etc.). Disponible por 7 días y conservado como evidencia para soporte.',
                timestamp: ahora
            },
            {
                id: ahora + 1,
                sistema: false,
                emisorId: pedido.id_cliente,
                emisorNombre: (getUsuarioById(pedido.id_cliente) || {}).nombre || 'Cliente',
                rolEmisor: 'cliente',
                texto: 'Pago confirmado en Escrow. Quedo atento para coordinar la entrega del producto.',
                timestamp: ahora
            }
        ]
    };

    chats.unshift(nuevoChat);
    saveChats(chats);
    return nuevoChat;
}

// Rol del usuario dentro del chat: 'cliente', 'vendedor', 'admin' o null (sin acceso)
function rolEnChat(chat, user) {
    if (!chat || !user) return null;
    if (user.id === chat.id_cliente) return 'cliente';
    if (user.id === chat.id_vendedor) return 'vendedor';
    if (user.rol === 'admin') return 'admin';
    return null;
}

function contarNoLeidosChat(chat, rol) {
    if (!chat || !chat.mensajes) return 0;
    const clave = rol === 'cliente' ? 'ultimaLecturaCliente' : (rol === 'vendedor' ? 'ultimaLecturaVendedor' : 'ultimaLecturaAdmin');
    const ultima = chat[clave] || 0;
    return chat.mensajes.filter(m => !m.sistema && m.timestamp > ultima).length;
}

function marcarChatLeido(chatId, rol) {
    const chats = getChats();
    const c = chats.find(x => x.id === chatId);
    if (!c) return;
    const clave = rol === 'cliente' ? 'ultimaLecturaCliente' : (rol === 'vendedor' ? 'ultimaLecturaVendedor' : 'ultimaLecturaAdmin');
    c[clave] = Date.now();
    saveChats(chats);
}

function abrirChatPedido(pedidoId) {
    const user = getUsuarioActual();
    if (!user) {
        showToast('Debes iniciar sesión para acceder al chat.', 'info');
        openModal('modalLogin');
        return;
    }

    const pedido = getPedidos().find(p => p.id === pedidoId);
    if (!pedido) {
        showToast('Pedido no encontrado.', 'error');
        return;
    }

    if (pedido.estado === 'Pago_En_Verificacion' || pedido.estado === 'Pago_Rechazado') {
        showToast('El chat con el vendedor se habilitara cuando tu pago sea verificado.', 'info');
        return;
    }

    let chat = getChatPorPedido(pedidoId);
    if (!chat) {
        chat = crearChatParaPedido(pedido);
    }

    const rol = rolEnChat(chat, user);
    if (!rol) {
        showToast('No tienes acceso a este chat de transacción.', 'error');
        return;
    }

    chatAbiertoIdPedido = pedidoId;
    chatUltimoRender = '';
    marcarChatLeido(chat.id, rol);

    const input = document.getElementById('chatInputTexto');
    if (input) input.value = '';

    openModal('modalChat');
    renderChatMensajes(true);
}

function cerrarChat() {
    chatAbiertoIdPedido = null;
    chatUltimoRender = '';
    closeModal('modalChat');

    // Refrescar badges de no leidos en la vista actual
    const hash = window.location.hash || '#/';
    if (hash === '#/mis-compras') renderCompras();
    else if (hash === '#/dashboard-vendedor') renderVendedor();
    else if (hash === '#/admin') renderAdmin();
}

function renderChatMensajes(forceScroll = false) {
    if (chatAbiertoIdPedido === null) return;

    const modalEl = document.getElementById('modalChat');
    const cont = document.getElementById('chatMensajesContainer');
    const user = getUsuarioActual();

    // Si el modal se cerro por otra via, limpiar estado
    if (!modalEl || !modalEl.classList.contains('active')) {
        chatAbiertoIdPedido = null;
        chatUltimoRender = '';
        return;
    }

    const chat = getChatPorPedido(chatAbiertoIdPedido);
    if (!chat || !user || !cont) return;

    const rol = rolEnChat(chat, user);
    if (!rol) return;

    const ahora = Date.now();
    const expirado = ahora > chat.fechaExpiracion;
    const horasRestantes = Math.max(0, Math.floor((chat.fechaExpiracion - ahora) / 3600000));
    const diasRestantes = Math.max(0, Math.ceil((chat.fechaExpiracion - ahora) / 86400000));

    // Evitar re-render innecesario: solo si cambio algo
    const ultimo = chat.mensajes[chat.mensajes.length - 1];
    const firma = `${chat.mensajes.length}-${ultimo ? ultimo.timestamp : 0}-${expirado}-${horasRestantes}`;
    if (firma === chatUltimoRender && !forceScroll) return;
    chatUltimoRender = firma;

    // Marcar como leido mientras se esta viendo el chat
    marcarChatLeido(chat.id, rol);

    // Encabezado y banner de estado
    const subt = document.getElementById('chatSubtitulo');
    if (subt) {
        subt.textContent = `Pedido #${chat.id_pedido} — ${chat.productoTitulo}`;
    }

    const estadoEl = document.getElementById('chatEstadoBanner');
    if (estadoEl) {
        if (rol === 'admin') {
            estadoEl.innerHTML = `<div class="chat-info-banner"><strong>Acceso administrativo (solo lectura):</strong> estás revisando esta conversación como evidencia para la resolución de reportes o disputas.</div>`;
        } else if (expirado) {
            estadoEl.innerHTML = `<div class="chat-expired-banner"><strong>Chat archivado:</strong> el periodo de 7 días concluyó. La conversación queda guardada como evidencia para soporte.</div>`;
        } else {
            estadoEl.innerHTML = `<div class="chat-info-banner">Coordina aquí la entrega con tu ${rol === 'cliente' ? 'vendedor' : 'cliente'}. Chat disponible por ${diasRestantes} día(s). La conversación queda registrada como evidencia ante reportes.</div>`;
        }
    }

    // Mensajes
    const estabaAbajo = cont.scrollTop + cont.clientHeight >= cont.scrollHeight - 50;
    cont.innerHTML = chat.mensajes.map(m => {
        if (m.sistema) {
            return `<div class="chat-msg chat-msg-system">${escapeHTML(m.texto)}</div>`;
        }
        const esMio = m.emisorId === user.id;
        const hora = new Date(m.timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        const nombre = esMio ? 'Tú' : (m.emisorNombre || (m.rolEmisor === 'vendedor' ? 'Vendedor' : 'Cliente'));
        return `
            <div class="chat-msg ${esMio ? 'chat-msg-own' : 'chat-msg-other'}">
                <span style="display: block; font-size: 0.7rem; font-weight: 700; opacity: 0.75; margin-bottom: 2px;">${escapeHTML(nombre)}</span>
                ${escapeHTML(m.texto)}
                <span class="chat-msg-meta">${hora}</span>
            </div>
        `;
    }).join('');

    // Caja de texto: oculta para admin (solo lectura) o si el chat expiro
    const inputArea = document.getElementById('chatInputArea');
    if (inputArea) {
        inputArea.style.display = (expirado || rol === 'admin') ? 'none' : 'flex';
    }

    if (forceScroll || estabaAbajo) {
        cont.scrollTop = cont.scrollHeight;
    }
}

function enviarMensajeChat() {
    const input = document.getElementById('chatInputTexto');
    const texto = input ? input.value.trim() : '';
    if (!texto) return;

    const user = getUsuarioActual();
    const chats = getChats();
    const chat = chats.find(c => c.id_pedido === chatAbiertoIdPedido);
    if (!chat || !user) return;

    const rol = rolEnChat(chat, user);
    if (!rol || rol === 'admin') {
        showToast('Solo el cliente y el vendedor pueden enviar mensajes en este chat.', 'error');
        return;
    }

    const bloqueoChat = obtenerBloqueoCuenta();
    if (bloqueoChat) {
        showToast(bloqueoChat, 'error');
        return;
    }

    if (Date.now() > chat.fechaExpiracion) {
        showToast('Este chat expiró (7 días). La conversación queda solo como evidencia.', 'error');
        renderChatMensajes(true);
        return;
    }

    chat.mensajes.push({
        id: Date.now(),
        sistema: false,
        emisorId: user.id,
        emisorNombre: user.nombre,
        rolEmisor: rol,
        texto: texto,
        timestamp: Date.now()
    });

    const clave = rol === 'cliente' ? 'ultimaLecturaCliente' : 'ultimaLecturaVendedor';
    chat[clave] = Date.now();
    saveChats(chats);

    input.value = '';
    renderChatMensajes(true);
}

// --- 17. CALIFICACIONES Y RESEÑAS DEL VENDEDOR ---
function getResenas() {
    return _getTable('resenas');
}

function saveResenas(resenas) {
    _setTable('resenas', resenas);
    programarPush('resenas');
}

// Promedio y total de reseñas de un vendedor
function getResumenVendedor(vendedorId) {
    const rs = getResenas().filter(r => r.id_vendedor === vendedorId);
    if (rs.length === 0) return { promedio: 0, total: 0 };
    const prom = rs.reduce((acc, r) => acc + (Number(r.estrellas) || 0), 0) / rs.length;
    return { promedio: Math.round(prom * 10) / 10, total: rs.length };
}

// Estrellas renderizadas (llenas/vacias) sin emojis
function estrellasHTML(valor) {
    const llenas = Math.round(Number(valor) || 0);
    let html = '';
    for (let i = 1; i <= 5; i++) {
        html += i <= llenas ? '★' : '<span class="star-empty">★</span>';
    }
    return `<span class="stars-display">${html}</span>`;
}

function abrirModalResena(pedidoId) {
    const pedido = getPedidos().find(p => p.id === pedidoId);
    if (!pedido) return;

    resenaPedidoId = pedidoId;
    resenaEstrellasSeleccionadas = 0;

    document.querySelectorAll('#resenaEstrellasInput .star-btn').forEach(b => b.classList.remove('active'));
    const txt = document.getElementById('resenaTexto');
    if (txt) txt.value = '';

    const subt = document.getElementById('resenaSubtitulo');
    if (subt) {
        subt.textContent = `Pedido #${pedido.id} — ${pedido.vendedorNombre || 'Vendedor'}`;
    }

    openModal('modalResena');
}

function seleccionarEstrellas(n) {
    resenaEstrellasSeleccionadas = n;
    document.querySelectorAll('#resenaEstrellasInput .star-btn').forEach((b, i) => {
        b.classList.toggle('active', i < n);
    });
}

function handleEnviarResena() {
    const user = getUsuarioActual();
    if (!user || resenaPedidoId === null) return;

    if (resenaEstrellasSeleccionadas < 1) {
        showToast('Selecciona una calificación de 1 a 5 estrellas.', 'error');
        return;
    }

    const pedido = getPedidos().find(p => p.id === resenaPedidoId);
    if (!pedido) return;

    const resenas = getResenas();
    if (resenas.some(r => r.id_pedido === pedido.id)) {
        showToast('Ya calificaste este pedido.', 'info');
        closeModal('modalResena');
        return;
    }

    resenas.unshift({
        id: Date.now(),
        id_pedido: pedido.id,
        id_vendedor: pedido.id_vendedor,
        id_cliente: user.id,
        nombreCliente: user.nombre,
        vendedorNombre: pedido.vendedorNombre,
        productoTitulo: pedido.productoTitulo,
        estrellas: resenaEstrellasSeleccionadas,
        comentario: (document.getElementById('resenaTexto').value || '').trim(),
        fecha: new Date().toLocaleString('es-ES', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }),
        timestamp: Date.now()
    });
    saveResenas(resenas);

    closeModal('modalResena');
    showToast('Gracias por tu calificación. Tu reseña fue publicada.', 'success');

    resenaPedidoId = null;
    renderCompras();
    renderCatalogo();
}
