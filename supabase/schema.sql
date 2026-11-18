-- ============================================================
-- LAST LINE - Cola de pagos pendientes de verificacion
-- Ejecutar en: Supabase > SQL Editor > New query > pegar > Run
-- ============================================================

create table if not exists public.pagos_pedidos (
  id          bigint primary key,           -- mismo id del pedido en la web (Date.now())
  cliente     text not null,
  producto    text not null,
  monto       numeric(10,2) not null,        -- monto exacto en Bs. a verificar
  estado      text not null default 'pendiente'
              check (estado in ('pendiente','verificado','rechazado')),
  comprobante text,                           -- imagen base64 subida por el cliente
  notif_texto text,                           -- texto de la notificacion bancaria que confirmo
  creado_en   timestamptz not null default now(),
  verificado_en timestamptz,
  rechazado_motivo text
);

-- Bitacora de notificaciones del banco recibidas (auditoria antifraude)
create table if not exists public.pagos_notificaciones (
  id          bigint generated always as identity primary key,
  titulo      text,
  texto       text not null,
  monto_detectado numeric(10,2),
  pedido_asociado bigint,
  resultado   text not null default 'sin_match',
  creado_en   timestamptz not null default now()
);

-- RLS: la tabla la lee/escribe solo el backend (service key).
-- Nadie con la anon key puede listar ni modificar pagos.
alter table public.pagos_pedidos enable row level security;
alter table public.pagos_notificaciones enable row level security;

-- Solo permitimos INSERT publico del pedido (el comprador registra su comprobante).
create policy "cualquiera registra su pago pendiente"
  on public.pagos_pedidos for insert
  with check (estado = 'pendiente');

-- SELECT solo para consultar SU propio pedido por id exacto se hace via la funcion
-- serverless (no hay politica de select publica: evita enumerar pagos ajenos).
