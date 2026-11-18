-- ============================================================
-- LAST LINE - Sincronizacion compartida (fase 2)
-- Tablas "ll_*": cada fila guarda el objeto completo en data (jsonb).
-- Las columnas desnormalizadas (id_vendedor, id_cliente, estado) son
-- solo para filtrar en el servidor; la fuente de verdad es data.
-- RLS activado SIN politicas = nadie accede directo; todo pasa por
-- las API routes de Vercel con la service key.
-- ============================================================

create table if not exists public.ll_usuarios (
  id          bigint primary key,
  data        jsonb not null,
  actualizado bigint not null default 0
);

create table if not exists public.ll_productos (
  id          bigint primary key,
  id_vendedor bigint,
  data        jsonb not null,
  actualizado bigint not null default 0
);

create table if not exists public.ll_pedidos (
  id          bigint primary key,
  id_cliente  bigint,
  id_vendedor bigint,
  estado      text,
  data        jsonb not null,
  actualizado bigint not null default 0
);

create table if not exists public.ll_chats (
  id          bigint primary key,
  id_pedido   bigint,
  id_cliente  bigint,
  id_vendedor bigint,
  data        jsonb not null,
  actualizado bigint not null default 0
);

create table if not exists public.ll_resenas (
  id          bigint primary key,
  id_vendedor bigint,
  data        jsonb not null,
  actualizado bigint not null default 0
);

alter table public.ll_usuarios enable row level security;
alter table public.ll_productos enable row level security;
alter table public.ll_pedidos enable row level security;
alter table public.ll_chats enable row level security;
alter table public.ll_resenas enable row level security;

-- Sin policies: la anon key no puede leer ni escribir nada.
-- Solo el service_role (en las API routes) accede a estas tablas.
