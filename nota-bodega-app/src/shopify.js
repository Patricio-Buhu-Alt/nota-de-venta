// Trae la miniatura de cada producto desde la Admin API de Shopify.
// El webhook NO incluye la imagen, por eso hay que pedirla aparte.
//
// Autenticacion (soporta los dos esquemas de Shopify):
//  - NUEVO: SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET -> se intercambian por un
//    token de corta duracion (client credentials, ~24h) que se cachea y renueva solo.
//  - Antiguo: SHOPIFY_ADMIN_TOKEN (token fijo shpat_/shpua_), se usa directo.
// Requiere ademas SHOPIFY_SHOP (ej. buhu-cl.myshopify.com) y que la app tenga scope
// read_products e instalada en la tienda. Sin credenciales -> nota sin miniatura (sin error).

const API_VER = process.env.SHOPIFY_API_VERSION || "2024-07";

let cachedToken = null; // { value, expiresAt }

async function getAccessToken() {
  // Esquema antiguo: token fijo
  if (process.env.SHOPIFY_ADMIN_TOKEN) return process.env.SHOPIFY_ADMIN_TOKEN;

  const shop = process.env.SHOPIFY_SHOP;
  const id = process.env.SHOPIFY_CLIENT_ID;
  const secret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!shop || !id || !secret) return null;

  // Reusar el token cacheado si sigue valido (5 min de margen)
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

export async function attachProductImages(order) {
  const shop = process.env.SHOPIFY_SHOP;
  if (!shop) return; // sin dominio -> sin miniaturas

  let token;
  try {
    token = await getAccessToken();
  } catch (e) {
    console.warn(`[img] no pude obtener token: ${e.message}`);
    return;
  }
  if (!token) return;

  const cache = new Map();
  for (const item of order.line_items || []) {
    if (!item.product_id) continue;
    try {
      let product = cache.get(item.product_id);
      if (!product) {
        const url = `https://${shop}/admin/api/${API_VER}/products/${item.product_id}.json?fields=id,image,images`;
        const r = await fetch(url, { headers: { "X-Shopify-Access-Token": token } });
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
