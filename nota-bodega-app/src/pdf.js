import PDFDocument from "pdfkit";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Datos de la tienda que salen en el pie (configurables por env; defaults = Buhu).
export const DEFAULT_STORE = {
  name: "Buhu Eyewear®",
  address: "Málaga 115, 514, 7550144 Las Condes RM, Chile",
  email: "contacto@buhu.cl",
  web: "www.buhu.cl",
  thanks: "¡Gracias por comprar en nuestra tienda!",
  logoPath: path.join(__dirname, "..", "assets", "logo.png"),
};

// Convierte una orden de Shopify (payload del webhook orders/create) en un PDF (Buffer),
// con el mismo formato que la nota de venta de Buhu (Order Printer).
// Cada line_item puede traer `image` (ruta de archivo o Buffer) para mostrar la miniatura.
export async function buildOrderPdf(order, store = {}) {
  const cfg = { ...DEFAULT_STORE, ...store };
  const logoSrc = await resolveLogo(cfg);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const contentW = right - left;

    // ---- Encabezado: logo (izq) + Pedido/fecha (der) ----
    const headerTop = doc.y;
    if (logoSrc) {
      try {
        doc.image(logoSrc, left, headerTop, { height: 58 });
      } catch { /* si el logo falla, seguir sin el */ }
    }
    const orderNum = order.order_number || String(order.name || "").replace("#", "");
    doc.font("Helvetica").fontSize(11).fillColor("#111111")
      .text(`Pedido ${orderNum}`, left, headerTop + 6, { width: contentW, align: "right" });
    doc.fontSize(10).fillColor("#444444")
      .text(formatDate(order.created_at), { width: contentW, align: "right" });

    doc.y = Math.max(doc.y, headerTop + 75);
    doc.moveDown(1);

    // ---- ENVIAR A / FACTURAR A ----
    const colY = doc.y;
    const colGap = 24;
    const colW = (contentW - colGap) / 2;
    const col2X = left + colW + colGap;

    addrColumn(doc, "ENVIAR A", order.shipping_address, left, colY, colW);
    const afterCol1 = doc.y;
    addrColumn(doc, "FACTURAR A", order.billing_address, col2X, colY, colW, "Sin dirección de facturación");
    const afterCol2 = doc.y;

    doc.y = Math.max(afterCol1, afterCol2);
    doc.moveDown(1);

    // Distancia pupilar (DP) — metafield buhu.distancia_pupilar (solo si existe; ya trae "mm")
    if (order.dp && String(order.dp).trim()) {
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#111111")
        .text("Distancia pupilar (DP): ", left, doc.y, { continued: true })
        .font("Helvetica").fillColor("#333333").text(clean(order.dp));
      doc.moveDown(0.3);
    }

    doc.moveDown(0.9);
    rule(doc, left, right);
    doc.moveDown(0.8);

    // ---- Cabecera de tabla ----
    const thY = doc.y;
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#111111");
    doc.text("ARTÍCULOS", left, thY);
    doc.text("CANTIDAD", left, thY, { width: contentW, align: "right" });
    doc.moveDown(1.2);

    // ---- Items ----
    // "X de Y": unidades de esta linea "de" el total de unidades del pedido.
    const totalUnits = (order.line_items || []).reduce((s, i) => s + (Number(i.quantity) || 0), 0);
    const thumbW = 56, thumbH = 44, thumbGap = 14;

    (order.line_items || []).forEach((item) => {
      if (doc.y > 680) doc.addPage();
      const rowY = doc.y;

      // Miniatura del producto (si viene)
      let textX = left;
      const img = resolveImage(item.image);
      if (img) {
        try {
          doc.image(img, left, rowY, { fit: [thumbW, thumbH] });
          textX = left + thumbW + thumbGap;
        } catch { textX = left; }
      }
      const itemW = right - textX - 55; // deja espacio para la columna CANTIDAD

      // Cantidad (derecha, alineada al tope de la fila)
      doc.font("Helvetica").fontSize(11).fillColor("#111111")
        .text(`${item.quantity} de ${totalUnits}`, left, rowY, { width: contentW, align: "right" });

      // Bloque del articulo
      doc.font("Helvetica").fontSize(11).fillColor("#111111")
        .text(clean(item.title) || "(producto)", textX, rowY, { width: itemW });
      if (item.variant_title && item.variant_title !== "Default Title")
        doc.fontSize(10).fillColor("#444444").text(clean(item.variant_title), textX, doc.y, { width: itemW });
      if (item.sku)
        doc.fontSize(10).fillColor("#444444").text(clean(item.sku), textX, doc.y, { width: itemW });

      // Propiedades de linea visibles (salta las ocultas que empiezan con "_").
      (item.properties || [])
        .filter((p) => p && p.name != null && String(p.value).trim() !== "" && !String(p.name).startsWith("_"))
        .forEach((p) => {
          doc.fontSize(10).fillColor("#444444").text(`${clean(p.name)}: ${clean(p.value)}`, textX, doc.y, { width: itemW });
        });

      // La fila baja hasta lo mas bajo entre el texto y la miniatura
      const bottom = Math.max(doc.y, img ? rowY + thumbH : 0);
      doc.y = bottom;
      doc.moveDown(0.9);
    });

    doc.moveDown(0.2);
    rule(doc, left, right);

    // ---- NOTAS (aqui viaja la dioptria de las ordenes de marketplace) ----
    // Solo el texto de la nota del pedido (como en la nota real de Buhu).
    if (order.note && String(order.note).trim()) {
      doc.moveDown(0.9);
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#111111").text("NOTAS", left);
      doc.moveDown(0.4);
      doc.font("Helvetica").fontSize(10).fillColor("#333333")
        .text(clean(order.note), left, doc.y, { width: contentW });
    }

    // ---- Documento tributario (Boleta/Factura, desde los atributos del pedido) ----
    const docType = noteAttr(order, "Tipo de documento");
    if (docType) {
      if (doc.y > 660) doc.addPage();
      doc.moveDown(1);
      const boxTop = doc.y;
      const padX = 10, padY = 8;
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#111111")
        .text("DOCUMENTO TRIBUTARIO", left + padX, boxTop + padY, { width: contentW - 2 * padX });
      doc.moveDown(0.2);
      doc.font("Helvetica-Bold").fontSize(11).fillColor("#111111")
        .text(clean(docType), left + padX, doc.y, { width: contentW - 2 * padX });
      if (docType.toLowerCase() === "factura") {
        doc.font("Helvetica").fontSize(10).fillColor("#333333");
        [
          ["RUT", noteAttr(order, "RUT")],
          ["Razón social", noteAttr(order, "Razón social")],
          ["Giro", noteAttr(order, "Giro")],
          ["Dirección", noteAttr(order, "Dirección facturación")],
        ].forEach(([label, val]) => {
          if (val) doc.text(`${label}: ${clean(val)}`, left + padX, doc.y, { width: contentW - 2 * padX });
        });
      }
      const boxBottom = doc.y + padY;
      doc.roundedRect(left, boxTop, contentW, boxBottom - boxTop, 6)
        .lineWidth(1).strokeColor("#cccccc").stroke();
      doc.y = boxBottom;
    }

    // ---- Pie de la tienda ----
    doc.moveDown(3);
    doc.font("Helvetica").fontSize(10).fillColor("#444444")
      .text(cfg.thanks, left, doc.y, { width: contentW, align: "center" });
    doc.moveDown(0.8);
    doc.fillColor("#111111").text(cfg.name, { width: contentW, align: "center" });
    doc.fillColor("#444444")
      .text(cfg.address, { width: contentW, align: "center" })
      .text(cfg.email, { width: contentW, align: "center" })
      .text(cfg.web, { width: contentW, align: "center" });

    doc.end();
  });
}

function resolveImage(image) {
  if (!image) return null;
  if (Buffer.isBuffer(image)) return image;
  if (typeof image === "string" && fs.existsSync(image)) return image;
  return null;
}

function addrColumn(doc, heading, addr, x, y, w, emptyText) {
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#111111").text(heading, x, y, { width: w });
  doc.moveDown(0.5);
  doc.font("Helvetica").fontSize(10).fillColor("#333333");
  if (!addr) {
    doc.text(emptyText || "—", x, doc.y, { width: w });
    return;
  }
  addressLines(addr).forEach((ln) => doc.text(clean(ln), x, doc.y, { width: w }));
}

function addressLines(a) {
  const lines = [];
  const name = a.name || [a.first_name, a.last_name].filter(Boolean).join(" ");
  if (name) lines.push(name);
  if (a.company) lines.push(a.company);
  if (a.address1) lines.push(a.address1);
  if (a.address2) lines.push(a.address2);
  const cityLine = [a.zip, a.city, a.province_code || a.province].filter(Boolean).join(" ");
  if (cityLine) lines.push(cityLine);
  if (a.country) lines.push(a.country);
  if (a.phone) lines.push(a.phone);
  return lines;
}

function rule(doc, x1, x2) {
  doc.moveTo(x1, doc.y).lineTo(x2, doc.y).lineWidth(1).strokeColor("#111111").stroke();
}

// Deja solo caracteres que la fuente base (WinAnsi) puede dibujar; quita emojis y
// simbolos raros (ej. el 📏 de las notas del Medidor) que si no salen como basura.
function clean(s) {
  if (s == null) return "";
  return String(s)
    .replace(
      /[^\x09\x0A\x0D\x20-\x7E -ÿ–—‘’“”•…€™]/g,
      ""
    )
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

// Lee un atributo del pedido (note_attributes) por nombre, sin distinguir mayusculas.
function noteAttr(order, name) {
  const list = order.note_attributes || [];
  const found = list.find(
    (a) => a && String(a.name).trim().toLowerCase() === String(name).toLowerCase()
  );
  return found && String(found.value).trim() !== "" ? String(found.value).trim() : null;
}

// Resuelve el logo: buffer explicito > LOGO_URL (cacheado) > archivo local. Null si no hay.
let _logoCache = null; // null = no intentado, false = fallo
async function resolveLogo(cfg) {
  if (cfg.logoBuffer) return cfg.logoBuffer;
  const url = process.env.LOGO_URL;
  if (url) {
    if (_logoCache === null) {
      try {
        const r = await fetch(url);
        _logoCache = r.ok ? Buffer.from(await r.arrayBuffer()) : false;
      } catch { _logoCache = false; }
    }
    if (_logoCache) return _logoCache;
  }
  if (cfg.logoPath && fs.existsSync(cfg.logoPath)) return cfg.logoPath;
  return null;
}

function formatDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("es-CL", {
      timeZone: "America/Santiago",
      day: "numeric", month: "long", year: "numeric",
    });
  } catch {
    return iso;
  }
}
