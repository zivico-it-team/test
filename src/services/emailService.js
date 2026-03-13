const nodemailer = require("nodemailer");

let transporter;

const getTransporter = () => {
  if (transporter) {
    return transporter;
  }

  const host = String(process.env.MAIL_HOST || "").trim();
  const port = Number(process.env.MAIL_PORT || 587);
  const user = String(process.env.MAIL_USER || "").trim();
  const pass = String(process.env.MAIL_PASS || "").trim();
  const secureEnv = String(process.env.MAIL_SECURE || "").trim().toLowerCase();
  const secure = secureEnv ? secureEnv === "true" : port === 465;

  if (!host || !port || !user || !pass) {
    throw new Error("MAIL_HOST, MAIL_PORT, MAIL_USER and MAIL_PASS must be configured");
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
  });

  return transporter;
};

const sendPasswordResetEmail = async ({ to, name, resetLink, expiresMinutes = 15 }) => {
  const from = String(process.env.MAIL_FROM || process.env.MAIL_USER || "").trim();
  if (!from) {
    throw new Error("MAIL_FROM or MAIL_USER must be configured");
  }

  const mailTransporter = getTransporter();
  const safeName = String(name || "User").trim() || "User";
  const minutesText = Number(expiresMinutes) || 15;

  await mailTransporter.sendMail({
    from,
    to,
    subject: "Reset your password",
    text: `Hi ${safeName},\n\nUse this link to reset your password: ${resetLink}\n\nThis link expires in ${minutesText} minutes.\n\nIf you did not request this, you can ignore this email.`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
        <p>Hi ${safeName},</p>
        <p>You requested a password reset.</p>
        <p>
          <a href="${resetLink}" style="display:inline-block;padding:10px 14px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;">
            Reset Password
          </a>
        </p>
        <p>Or copy and paste this URL:</p>
        <p><a href="${resetLink}">${resetLink}</a></p>
        <p>This link expires in <strong>${minutesText} minutes</strong>.</p>
        <p>If you did not request this, you can ignore this email.</p>
      </div>
    `,
  });
};

module.exports = {
  sendPasswordResetEmail,
};
