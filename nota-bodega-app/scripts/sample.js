// Genera PDFs de ejemplo (sin enviar correo) para ver como queda la nota.
// Reproduce los dos casos reales de Buhu:
//   - Pedido con dioptria como PROPIEDAD de linea (venta del sitio).
//   - Pedido con dioptria en las NOTAS (venta importada de MercadoLibre).
// Uso: npm run sample
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildOrderPdf } from "../src/pdf.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const demo = (f) => path.join(here, "demo", f);

const base = {
  created_at: "2026-07-12T15:00:00-04:00",
};

// Caso 1: dioptria como propiedad de linea
const order1292 = {
  ...base,
  name: "#1292",
  order_number: 1292,
  shipping_address: {
    name: "Claudio Fuenzalida Becerra",
    address1: "Saturno 12947",
    address2: "Casa",
    zip: "8822800", city: "La Pintana", province_code: "RM",
    country: "Chile", phone: "+56934333141",
  },
  billing_address: {
    name: "Claudio Fuenzalida Becerra",
    address1: "Saturno 12947", address2: "Casa",
    city: "Santiago", province_code: "RM", country: "Chile",
  },
  line_items: [
    {
      title: "Toti", variant_title: "Azul", sku: "BUHUR801046C3", quantity: 1,
      image: demo("prod-1292.png"),
      properties: [{ name: "Aumento (Dioptría)", value: "Sin aumento (+0.00)" }],
    },
  ],
};

// Caso 2: dioptria en las notas (orden de MercadoLibre)
const order1294 = {
  ...base,
  name: "#1294",
  order_number: 1294,
  shipping_address: {
    name: "Mirian Andrea Carvajal Colina",
    address1: "El Oliveto 3992",
    address2: "Las Palmas Del Oliveto 2 Parcela 19",
    city: "Talagante", province_code: "RM", country: "Chile",
    phone: "+56989638436",
  },
  billing_address: null,
  line_items: [
    { title: "Vicky", variant_title: "Púrpura", sku: "BUHUR801021C1", quantity: 1, image: demo("prod-1294.png"), properties: [] },
  ],
  note: "Dioptria +1.00 MercadoLibre orden #2000017386317502",
};

fs.writeFileSync("sample-nota-1292.pdf", await buildOrderPdf(order1292));
fs.writeFileSync("sample-nota-1294.pdf", await buildOrderPdf(order1294));
console.log("Generados: sample-nota-1292.pdf y sample-nota-1294.pdf");
