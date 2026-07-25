import express from "express";
import crypto from "node:crypto";
import { buildOrderPdf } from "./pdf.js";
import { sendNota } from "./email.js";
import { enrichOrder } from "./shopify.js";

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET = process.env.SHOPIFY_WEBHOOK_SECRET || "";

app.get("/health", (_req, res) => res.send("ok"));

// Webhook de Shopify: se dispara con cada venta (orders/create).
// Importante: usamos el cuerpo CRUDO para poder verificar la firma HMAC.
app.post(
  "/webhooks/orders/create",
  express.raw({ type: "*/*" }),
  async (req, res) => {
    if (!verifyHmac(req)) return res.status(401).send("HMAC invalido");

    let order;
    try {
      order = JSON.parse(req.body.toString("utf8"));
    } catch {
      return res.status(400).send("JSON invalido");
    }

    // Responder rapido a Shopify (< 5s) y procesar en segundo plano.
    res.status(200).send("ok");

    processOrder(order).catch((err) =>
      console.error(`[ERROR] orden ${order?.name}:`, err.message)
    );
  }
);

// Anti-duplicados: no procesar dos veces la misma orden. Cubre webhooks duplicados
// (dos suscripciones) y reintentos de Shopify (ej. cuando Render estaba dormido).
// La verificacion + registro es sincrona (antes del primer await), asi que dos avisos
// casi simultaneos no se cuelan. Se guarda en memoria; basta para un solo proceso.
const seen = new Set();
function alreadyProcessed(order) {
  const key = String(order.id || order.name || "");
  if (!key) return false;
  if (seen.has(key)) return true;
  seen.add(key);
  if (seen.size > 1000) seen.delete(seen.values().next().value); // acota memoria
  return false;
}

async function processOrder(order) {
  if (alreadyProcessed(order)) {
    console.log(`[skip] Orden ${order.name} ya procesada (aviso duplicado)`);
    return;
  }
  await enrichOrder(order); // DP + miniaturas (si hay credenciales de Admin API)
  const pdfBuffer = await buildOrderPdf(order, storeFromEnv());
  const messageId = await sendNota({ order, pdfBuffer });
  console.log(`[OK] Nota de ${order.name} enviada a bodega (messageId ${messageId})`);
}

// Datos de la tienda para el pie del PDF (opcionales; si no se setean, usa Buhu).
function storeFromEnv() {
  const s = {};
  if (process.env.STORE_NAME) s.name = process.env.STORE_NAME;
  if (process.env.STORE_ADDRESS) s.address = process.env.STORE_ADDRESS;
  if (process.env.STORE_EMAIL) s.email = process.env.STORE_EMAIL;
  if (process.env.STORE_WEB) s.web = process.env.STORE_WEB;
  if (process.env.STORE_LOGO) s.logoPath = process.env.STORE_LOGO;
  return s;
}

function verifyHmac(req) {
  const hmac = req.get("X-Shopify-Hmac-Sha256") || "";
  const digest = crypto
    .createHmac("sha256", SECRET)
    .update(req.body) // Buffer crudo
    .digest("base64");
  const a = Buffer.from(digest);
  const b = Buffer.from(hmac);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

app.listen(PORT, () => {
  console.log(`Nota de Bodega escuchando en puerto ${PORT}`);
  console.log(`Webhook: POST /webhooks/orders/create`);
});
