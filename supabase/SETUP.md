# Setup Supabase para Last Line (10-15 min)

## Paso 1 — Crear cuenta y proyecto
1. Entra a https://supabase.com → "Start your project" → "Continue with GitHub" (tu cuenta Bueno1730).
2. Click "New project":
   - Name: `lastline`
   - Database password: genera una fuerte y GUÁRDALA.
   - Region: `South America (São Paulo)` — la más cercana a Bolivia.
   - Plan: Free.

## Paso 2 — Crear la tabla
1. En el panel de Supabase → SQL Editor → "New query".
2. Pega TODO el contenido de `supabase/schema.sql` → Run.
3. Debe decir "Success. No rows returned".

## Paso 3 — Pasarme las llaves
En Settings → API encontrarás:
- `Project URL` (ej: https://abcdefgh.supabase.co)
- `service_role` key (secreta — solo la uso en el servidor de Vercel, nunca en el frontend)
- `anon` public key

Pásame la URL y las dos keys y yo las configuro como variables de entorno en Vercel
(quedan cifradas, no van al código ni al repo).

## Qué hace esto
- `pagos_pedidos`: cada comprobante que sube un cliente queda aquí, visible para tu
  verificación (manual desde el admin o automática por la notificación del banco).
- `pagos_notificaciones`: bitácora de todas las notificaciones que llegan del banco —
  auditoría por si alguien intenta confirmar un pago falso.
