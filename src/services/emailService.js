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

const sendLeaveApplicationEmail = async ({ to, employeeName, leaveType, fromDate, toDate, isHalfDay, session, reason, actionLink: actionLinkRaw }) => {
  const from = String(process.env.MAIL_FROM || process.env.MAIL_USER || "").trim();
  if (!from) {
    throw new Error("MAIL_FROM or MAIL_USER must be configured");
  }

  const mailTransporter = getTransporter();
  const safeEmployeeName = String(employeeName || "An employee").trim() || "An employee";
  const leaveLabel = String(leaveType || "leave").trim();
  const formatDate = (d) => {
    const date = new Date(d);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };
  const dateFrom = formatDate(fromDate);
  const dateTo = formatDate(toDate);
  const leaveDetails = isHalfDay 
    ? `${leaveLabel} half day leave (${session} session) on ${dateFrom}`
    : `${leaveLabel} leave from ${dateFrom} to ${dateTo}`;
  const reasonText = reason ? `\n\nReason: ${reason}` : '';
  const actionLink = String(actionLinkRaw || process.env.CLIENT_URL || "").replace(/\/$/, "");

  await mailTransporter.sendMail({
    from,
    to,
    subject: "New Leave Application",
    text: `Hi,\n\n${safeEmployeeName} has applied for ${leaveDetails}.${reasonText}\n\nPlease review the application in the system: ${actionLink}\n`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
        <p>Hi,</p>
        <p><strong>${safeEmployeeName}</strong> has applied for <strong>${leaveDetails}</strong>.</p>
        ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
        <p>Please review the application in the system.</p>
        ${actionLink ? `
          <p>
            <a href="${actionLink}" style="display:inline-block;padding:10px 18px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;">View in CRM</a>
          </p>
        ` : ''}
      </div>
    `,
  });
};

module.exports = {
  sendPasswordResetEmail,
  sendLeaveApplicationEmail,
};
