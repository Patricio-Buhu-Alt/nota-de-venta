import nodemailer from "nodemailer";

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    throw new Error(
      "Faltan variables SMTP (SMTP_HOST, SMTP_USER, SMTP_PASS). Revisa tu .env"
    );
  }
  const port = Number(SMTP_PORT || 465);
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465, // 465 = SSL; 587 = STARTTLS
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return transporter;
}

// Envia la nota de bodega (PDF adjunto) al correo configurado.
export async function sendNota({ order, pdfBuffer }) {
  const to = process.env.WAREHOUSE_EMAIL;
  if (!to) throw new Error("Falta WAREHOUSE_EMAIL en tu .env");
  const cc = (process.env.CC_EMAILS || "")
    .split(",").map((s) => s.trim()).filter(Boolean);

  const num = order.name || "#" + (order.order_number || "");
  const info = await getTransporter().sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    cc: cc.length ? cc : undefined,
    subject: `Nueva orden ${num} — preparar en bodega`,
    text:
      `Se recibio una nueva orden (${num}).\n` +
      `Adjuntamos la nota de bodega con el detalle para preparar el pedido.`,
    attachments: [
      {
        filename: `nota-bodega-${String(num).replace(/[^\w.-]/g, "")}.pdf`,
        content: pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  });
  return info.messageId;
}
