# Nota de Bodega

App simple para Shopify: en **cada venta**, toma la orden, genera un **PDF con el detalle** y lo **envia por email** a bodega para que preparen el pedido.

El PDF replica el formato de la nota de venta de Buhu (logo, ENVIAR A / FACTURAR A,
ARTICULOS / CANTIDAD, NOTAS, pie de la tienda). Incluye: datos del cliente, direccion
de envio, productos con cantidades y SKU, **todas las propiedades de linea** y las
**NOTAS** del pedido. La dioptria sale sola en los dos casos: como propiedad de linea
(venta del sitio) o dentro de las NOTAS (orden de MercadoLibre).

El logo va en `assets/logo.png` (ya incluido el de Buhu; reemplazalo por el tuyo si
quieres). Los datos del pie se pueden cambiar por variables `STORE_*` en el `.env`.
La cantidad se muestra como "X de Y" (unidades de la linea de el total del pedido).

**Miniatura del producto:** para que bodega tenga referencia visual, la nota muestra
la foto del producto. Como el webhook no trae la imagen, se pide a la Admin API: setea
`SHOPIFY_SHOP` y `SHOPIFY_ADMIN_TOKEN` (app personalizada con scope `read_products`)
en el `.env`. Sin esas variables, la nota se genera igual pero sin miniatura.

No es documento tributario. Es una nota interna para bodega.

## Como funciona

1. Shopify llama al webhook `orders/create` cada vez que entra una venta.
2. La app verifica la firma, arma el PDF y lo manda por correo.
3. Responde rapido a Shopify y hace el envio en segundo plano.

## Puesta en marcha

### 1. Instalar
```bash
npm install
cp .env.example .env   # y completa los valores
```

### 2. Configurar el `.env`
- `SHOPIFY_WEBHOOK_SECRET`: el secreto del webhook (ver paso 4).
- `WAREHOUSE_EMAIL`: correo de bodega que recibe la nota. `CC_EMAILS` opcional.
- SMTP: para enviar gratis desde Gmail crea una **contrasena de aplicacion**
  en https://myaccount.google.com/apppasswords y usa:
  - `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`
  - `SMTP_USER` = tu Gmail, `SMTP_PASS` = la contrasena de aplicacion
  - `SMTP_FROM` = como quieres que aparezca el remitente
  (Sirve cualquier SMTP: Zoho, Outlook, etc. Tambien podrias cambiar a Resend.)

### 3. Ver un ejemplo del PDF (sin enviar nada)
```bash
npm run sample      # crea sample-nota-bodega.pdf
```

### 4. Registrar el webhook en Shopify
La app tiene que estar publicada en una URL publica (deploy en Fly.io, Railway,
Render, etc.). Con esa URL, crea el webhook apuntando a
`https://TU-DOMINIO/webhooks/orders/create`.

Dos formas:
- **Admin** (mas simple): Shopify Admin > Configuracion > Notificaciones >
  Webhooks > "Crear webhook", evento *Creacion de pedido*, formato JSON, pega la
  URL. Shopify te muestra el **secreto de firma**: ponlo en `SHOPIFY_WEBHOOK_SECRET`.
- **API**, si prefieres hacerlo desde tu app.

### 5. Correr
```bash
npm start
```

Prueba local: expone el puerto con un tunel (ngrok/cloudflared) y usa esa URL
publica al registrar el webhook.

## Archivos
- `src/server.js` — recibe el webhook, verifica la firma, dispara el proceso.
- `src/pdf.js` — arma el PDF de la orden.
- `src/email.js` — envia el correo con el PDF adjunto (SMTP / Gmail).
- `scripts/sample.js` — genera un PDF de ejemplo para previsualizar.
