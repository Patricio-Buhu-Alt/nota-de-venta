# Puesta en marcha — paso a paso

Objetivo: que cada venta en tu tienda genere el PDF y lo mande al correo de bodega.
Tiempo estimado: ~15 min. Necesitas 3 cosas: un correo de bodega, un Gmail para
enviar, y publicar la app en una URL.

## 1. Correo de envío (Gmail, gratis)

Para que la app envíe desde tu Gmail necesitas una **contraseña de aplicación**
(no es tu clave normal):

1. Entra a https://myaccount.google.com/apppasswords (requiere verificación en 2 pasos activada).
2. Crea una contraseña de aplicación (nómbrala "Nota Bodega"). Google te da 16 caracteres.
3. Esos 16 caracteres van en `SMTP_PASS`, y tu Gmail en `SMTP_USER` y `SMTP_FROM`.

(Sirve cualquier SMTP: Zoho, Outlook, etc. Si prefieres, se puede cambiar a Resend.)

## 2. Publicar la app (elige una)

La app necesita una URL pública para que Shopify le mande los avisos.

**Opción A — Render (recomendada, tiene plan gratis):**
1. Sube esta carpeta a un repo de GitHub.
2. En https://render.com → New → Blueprint → elige el repo. `render.yaml` ya está listo.
3. Render te pedirá las variables (correo de bodega, SMTP, etc.). Complétalas.
4. Deploy. Te queda una URL tipo `https://nota-bodega.onrender.com`.
   (En el plan gratis el servicio "duerme"; Shopify reintenta, así que no se pierden avisos.)

**Opción B — Railway:** New Project → Deploy from GitHub. Usa el `Procfile`. Setea las variables.

**Opción C — Docker** (cualquier VPS): `docker build -t nota-bodega . && docker run -p 3000:3000 --env-file .env nota-bodega`

## 3. Registrar el webhook en Shopify

1. En tu admin: **Configuración → Notificaciones → Webhooks → Crear webhook**.
2. Evento: **Creación de pedido**. Formato: **JSON**.
3. URL: `https://TU-URL/webhooks/orders/create`
4. Al final de esa página, Shopify muestra el **secreto de firma** ("Tus webhooks se firmarán con...").
   Copia ese valor a `SHOPIFY_WEBHOOK_SECRET` en tu deploy y reinicia.

## 4. (Opcional) Miniatura del producto

Para que la nota muestre la foto del producto:
1. Admin → **Configuración → Aplicaciones → Desarrollar apps → Crear app**.
2. Scopes de Admin API: **read_products** (y read_orders). Instálala.
3. Copia el **token de acceso** a `SHOPIFY_ADMIN_TOKEN` y tu dominio a `SHOPIFY_SHOP`
   (ej. `buhu-cl.myshopify.com`). Reinicia.

## 5. Probar

- Crea un pedido de prueba (o reenvía uno) y revisa el correo de bodega.
- Log del deploy: deberías ver `[OK] Nota de #XXXX enviada a bodega`.
- ¿No llega? Revisa spam, que `SMTP_PASS` sea la contraseña de aplicación, y que el
  secreto del webhook coincida (si no, verás `HMAC invalido`).
