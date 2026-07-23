import nodemailer from "nodemailer";

// Envia la nota de bodega (PDF adjunto).
// - Si hay RESEND_API_KEY: usa la API HTTP de Resend (funciona en hosts que bloquean
//   SMTP, como el plan gratis de Render).
// - Si no: usa SMTP con nodemailer (Gmail, etc.).
export async function sendNota({ order, pdfBuffer }) {
  const to = process.env.WAREHOUSE_EMAIL;
  if (!to) throw new Error("Falta WAREHOUSE_EMAIL en tu .env");
  const cc = (process.env.CC_EMAILS || "").split(",").map((s) => s.trim()).filter(Boolean);

  const num = order.name || "#" + (order.order_number || "");
  const filename = `nota-bodega-${String(num).replace(/[^\w.-]/g, "")}.pdf`;
  const subject = `Nueva orden ${num} — preparar en bodega`;
  const text =
    `Se recibio una nueva orden (${num}).\n` +
    `Adjuntamos la nota de bodega con el detalle para preparar el pedido.`;
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;

  if (process.env.RESEND_API_KEY) {
    return sendViaResend({ from, to, cc, subject, text, filename, pdfBuffer });
  }
  return sendViaSmtp({ from, to, cc, subject, text, filename, pdfBuffer });
}

async function sendViaResend({ from, to, cc, subject, text, filename, pdfBuffer }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      cc: cc.length ? cc : undefined,
      subject,
      text,
      attachments: [{ filename, content: pdfBuffer.toString("base64") }],
    }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Resend HTTP ${res.status}: ${body}`);
  try { return JSON.parse(body).id; } catch { return "sent"; }
}

let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    throw new Error("Faltan variables SMTP (SMTP_HOST, SMTP_USER, SMTP_PASS) o RESEND_API_KEY.");
  }
  const port = Number(SMTP_PORT || 465);
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return transporter;
}

async function sendViaSmtp({ from, to, cc, subject, text, filename, pdfBuffer }) {
  const info = await getTransporter().sendMail({
    from,
    to,
    cc: cc.length ? cc : undefined,
    subject,
    text,
    attachments: [{ filename, content: pdfBuffer, contentType: "application/pdf" }],
  });
  return info.messageId;
}
