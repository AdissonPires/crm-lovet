import nodemailer from "nodemailer";

/**
 * Envio de email por SMTP generico — funciona com Gmail (senha de app),
 * SendGrid, SES, ou qualquer provedor. Sem as env vars configuradas, falha
 * com uma mensagem clara em vez de fingir que enviou.
 */
function getTransport() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    throw new Error(
      "Envio de email nao configurado. Defina SMTP_HOST, SMTP_PORT, SMTP_USER e SMTP_PASS " +
      "(para Gmail: smtp.gmail.com, porta 587, e uma senha de app gerada em myaccount.google.com/apppasswords).",
    );
  }
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT ?? 587),
    secure: Number(SMTP_PORT ?? 587) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

export async function sendEmailWithAttachment(opts: {
  to: string; subject: string; text: string; filename: string; content: Buffer; contentType: string;
}) {
  const transport = getTransport();
  await transport.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    attachments: [{ filename: opts.filename, content: opts.content, contentType: opts.contentType }],
  });
}
