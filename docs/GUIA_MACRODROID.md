# Automatizar verificación de pagos con tu Android (MacroDroid)

Cuando un cliente paga por QR a tu cuenta del banco, tu celular recibe la notificación
"abono/transferencia por Bs. XXX". Este flujo convierte esa notificación en la
confirmación automática del pedido en Last Line — sin pagar APIs.

```
Cliente paga QR → Banco te notifica al celular → MacroDroid lee el texto
→ POST a vercel.app/api/confirmar-pago → El pedido se marca "verificado"
→ El cliente ve su chat habilitado solo (polling cada 15 seg)
```

## Paso 1 — Instalar MacroDroid (gratis)
- Play Store → "MacroDroid - Device Automation" (icono de engranaje azul, de ArloSoft).
- Ábrelo y concede los permisos que pida.

## Paso 2 — Crear la macro "Verificar Pago Last Line"

1. En MacroDroid pulsa **"Añadir macro"** y nómbrala `Verificar Pago Last Line`.

2. **Disparador (Trigger)** — pulsa `+` en Disparadores:
   - Categoría: **Eventos de dispositivo** → **Notificación recibida**
   - **Aplicación**: elige la app de tu banco (BCP / Ganadero / Unión / la que uses)
   - **Contenido de texto**: `abono` *(o `transferencia`, `crédito` — según cómo escriba tu banco; puedes añadir varios disparadores copiando la macro después)*

3. **Acción (Action)** — pulsa `+` en Acciones:
   - Categoría: **Conectividad** → **HTTP Request**
   - Configura así:
     - Método: `POST`
     - URL: `https://lastline-marketplace.vercel.app/api/confirmar-pago`
     - Content-Type: `application/json`
     - Cuerpo (pega tal cual):
     ```json
     {"token":"TU_WEBHOOK_TOKEN","titulo":"{not_title}","texto":"{not_text}"}
     ```
     - `{not_title}` y `{not_text}` son **macros de texto** de MacroDroid: púlsalas desde el botón `{...}` junto al campo, NO las escribas a mano con llaves.

4. **Restricciones**: ninguna (o "Solo cuando pantalla apagada" si quieres ahorrar batería).

5. Guarda y prueba: envíate una notificación falsa o espera una real.

## Paso 3 — Tu WEBHOOK_TOKEN
Es la contraseña que evita que cualquiera finja una notificación del banco.
Yo lo genero como variable de entorno en Vercel y te lo paso por privado —
pégalo en `TU_WEBHOOK_TOKEN` de arriba. **Nunca lo publiques ni lo subas al repo.**

## Paso 4 — Ajuste antifraude (recomendado)
El servidor ya hace doble chequeo:
- Solo confirma si hay un pedido **pendiente con el monto EXACTO**.
- Registra TODA notificación en la tabla de auditoría (`pagos_notificaciones`) —
  si alguien intenta mandar un monto falso queda guardado.

Aun así: revisa de vez en cuando el panel **Admin → Pagos por Verificar → auditoría**
para ver qué notificaciones llegaron y qué se confirmó.

## Plan B — si tu banco no manda push
Algunos bancos solo notifican por SMS o correo:
- **SMS**: mismo flujo pero el disparador es "Mensaje de texto recibido" del remitente del banco.
- **Correo**: en Gmail del teléfono también llega como notificación de app — apunta el
  disparador a la app de Gmail filtrando por el remitente del banco.
