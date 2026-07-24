// Enriquece la orden con datos que el webhook NO trae, pidiendolos a la Admin API:
//   - metafield de la orden `buhu.distancia_pupilar` (DP total, ej. "62.0 mm")
//   - miniatura de cada producto
//
// Autenticacion (soporta los dos esquemas de Shopify):
//  - NUEVO: SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET -> se intercambian por un
//    token de corta duracion (client credentials, ~24h) que se cachea y renueva solo.
//  - Antiguo: SHOPIFY_ADMIN_TOKEN (token fijo shpat_/shpua_), se usa directo.
// Requiere SHOPIFY_SHOP (ej. buhu-cl.myshopify.com) y que la app tenga scopes
// **read_orders** (para el metafield DP) y **read_products** (para las fotos).
// Sin credenciales -> la nota se genera igual, sin DP ni miniatura (sin error).

const API_VER = process.env.SHOPIFY_API_VERSION || "2024-07";

let cachedToken = null; // { value, expiresAt }

async function getAccessToken() {
  // Esquema antiguo: token fijo
  if (process.env.SHOPIFY_ADMIN_TOKEN) return process.env.SHOPIFY_ADMIN_TOKEN;

  const shop = process.env.SHOPIFY_SHOP;
  const id = process.env.SHOPIFY_CLIENT_ID;
  const secret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!shop || !id || !secret) return null;

  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt - 5 * 60 * 1000 > now) {
    return cachedToken.value;
  }

  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: id,
      client_secret: secret,
    }),
  });
  if (!res.ok) throw new Error(`OAuth ${res.status}: ${await res.text()}`);
  const data = await res.json();
  cachedToken = {
    value: data.access_token,
    expiresAt: now + Number(data.expires_in || 86399) * 1000,
  };
  return cachedToken.value;
}

// Punto de entrada: agrega DP y miniaturas a la orden (in-place).
export async function enrichOrder(order) {
  const shop = process.env.SHOPIFY_SHOP;
  if (!shop) return; // sin dominio -> nada que pedir

  let token;
  try {
    token = await getAccessToken();
  } catch (e) {
    console.warn(`[admin] token: ${e.message}`);
    return;
  }
  if (!token) return;

  const headers = { "X-Shopify-Access-Token": token };
  await attachDp(order, shop, headers);
  await attachProductImages(order, shop, headers);
}

// Metafield de la orden: buhu.distancia_pupilar (solo el total, ya con "mm").
async function attachDp(order, shop, headers) {
  if (!order.id) return;
  try {
    const url = `https://${shop}/admin/api/${API_VER}/orders/${order.id}/metafields.json?namespace=buhu`;
    const r = await fetch(url, { headers });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const mfs = (await r.json()).metafields || [];
    const dp = mfs.find((m) => m.key === "distancia_pupilar");
    if (dp && String(dp.value).trim()) order.dp = String(dp.value).trim();
  } catch (e) {
    console.warn(`[dp] orden ${order.id}: ${e.message}`);
  }
}

async function attachProductImages(order, shop, headers) {
  const cache = new Map();
  for (const item of order.line_items || []) {
    if (!item.product_id) continue;
    try {
      let product = cache.get(item.product_id);
      if (!product) {
        const url = `https://${shop}/admin/api/${API_VER}/products/${item.product_id}.json?fields=id,image,images`;
        const r = await fetch(url, { headers });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        product = (await r.json()).product || {};
        cache.set(item.product_id, product);
      }
      const src = pickImage(product, item.variant_id);
      if (src) {
        const imgRes = await fetch(src);
        if (imgRes.ok) item.image = Buffer.from(await imgRes.arrayBuffer());
      }
    } catch (e) {
      console.warn(`[img] producto ${item.product_id}: ${e.message}`);
    }
  }
}

// Elige la imagen de la variante (color correcto) o, si no hay, la principal del producto.
function pickImage(product, variantId) {
  const imgs = product.images || [];
  if (variantId) {
    const match = imgs.find((im) => (im.variant_ids || []).includes(variantId));
    if (match) return match.src;
  }
  return (product.image && product.image.src) || (imgs[0] && imgs[0].src) || null;
}
