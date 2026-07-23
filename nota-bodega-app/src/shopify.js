// Trae la miniatura de cada producto desde la Admin API de Shopify.
// El webhook NO incluye la imagen, por eso hay que pedirla aparte.
// Requiere en el .env: SHOPIFY_SHOP y SHOPIFY_ADMIN_TOKEN (scope read_products).
// Si no estan configurados, la nota se genera sin miniaturas (sin error).

const API_VER = process.env.SHOPIFY_API_VERSION || "2024-07";

export async function attachProductImages(order) {
  const shop = process.env.SHOPIFY_SHOP;
  const token = process.env.SHOPIFY_ADMIN_TOKEN;
  if (!shop || !token) return; // sin credenciales -> sin miniaturas

  const cache = new Map();
  for (const item of order.line_items || []) {
    if (!item.product_id) continue;
    try {
      let product = cache.get(item.product_id);
      if (!product) {
        const url = `https://${shop}/admin/api/${API_VER}/products/${item.product_id}.json?fields=id,image,images`;
        const res = await fetch(url, { headers: { "X-Shopify-Access-Token": token } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        product = (await res.json()).product || {};
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
