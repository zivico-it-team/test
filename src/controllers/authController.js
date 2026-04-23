const User = require("../models/User");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { Op } = require("sequelize");
const PasswordReset = require("../models/PasswordReset");
const generateToken = require("../utils/generateToken");
const { toPublicUser } = require("../utils/userNormalizer");
const { isInactiveUser } = require("../utils/employmentStatus");
const { sendPasswordResetEmail } = require("../services/emailService");

const RESET_TOKEN_EXPIRY_MINUTES = Number(process.env.RESET_TOKEN_EXPIRES_MINUTES || 15);
const FORGOT_PASSWORD_GENERIC_MESSAGE = "If that email exists, a reset link has been sent.";
const hashResetToken = (token) =>
  crypto.createHash("sha256").update(String(token || "")).digest("hex");
const normalizeClientUrl = (value) => {
  const raw = String(value || "").trim().replace(/\/+$/, "");
  if (!raw) return "";

  // Guard against the common domain typo: revorglobal -> revoraglobal
  const corrected = raw.replace(/revorglobal\.com/gi, "revoraglobal.com");
  if (corrected !== raw) {
    console.warn(`CLIENT_URL had a typo (${raw}). Using ${corrected} for password reset links.`);
  }

  return corrected;
};

const toSessionUser = (user) => {
  const u = toPublicUser(user);
  return {
    ...u,
    token: generateToken(u),
  };
};

const isPendingEmployee = (user) =>
  String(user?.role || "").trim().toLowerCase() === "employee" &&
  String(user?.approvalStatus || "approved").trim().toLowerCase() !== "approved";

const login = async (req, res) => {
  try {
    const { userName, email, identifier, password } = req.body;
    const loginIdentifier = String(identifier || userName || email || "").trim();

    if (!loginIdentifier || !password) {
      return res.status(400).json({ message: "Username/email and password are required" });
    }

    const loweredIdentifier = loginIdentifier.toLowerCase();
    const user = await User.findOne({
      where: {
        [Op.or]: [{ userName: loginIdentifier }, { userName: loweredIdentifier }, { email: loweredIdentifier }],
      },
    });
    if (!user) return res.status(401).json({ message: "Invalid username or email" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: "Invalid password" });
    if (isPendingEmployee(user)) {
      return res.status(403).json({ message: "Your account is waiting for admin approval" });
    }
    if (isInactiveUser(user)) {
      return res.status(403).json({ message: "Your account has been deactivated. Please contact HR or admin." });
    }

    res.json(toSessionUser(user));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const register = async (req, res) => {
  try {
    const { name, email, password, phone, address, userName } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "name, email, password are required" });
    }

    if (String(password).length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const resolvedUserName =
      String(userName || normalizedEmail.split("@")[0])
        .trim()
        .replace(/\s+/g, "")
        .toLowerCase();

    if (!/^[a-z0-9._-]{3,30}$/.test(resolvedUserName)) {
      return res.status(400).json({
        message: "Username must be 3-30 chars and can include letters, numbers, dot, underscore, hyphen",
      });
    }

    const existingUser = await User.findOne({
      where: {
        [Op.or]: [{ email: normalizedEmail }, { userName: resolvedUserName }],
      },
    });

    if (existingUser) {
      return res.status(409).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name: String(name).trim(),
      email: normalizedEmail,
      userName: resolvedUserName,
      password: hashedPassword,
      phone: phone || "",
      addressLine: address || "",
      role: "employee",
      approvalStatus: "pending",
      approvedAt: null,
    });

    return res.status(201).json({
      message: "Registration submitted successfully. Wait for admin approval before logging in.",
      user: toPublicUser(user),
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

const forgotPassword = async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();

    if (!email) {
      return res.status(200).json({ message: FORGOT_PASSWORD_GENERIC_MESSAGE });
    }

    const user = await User.findOne({ where: { email } });

    if (!user || !user.email) {
      return res.status(200).json({ message: FORGOT_PASSWORD_GENERIC_MESSAGE });
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashResetToken(rawToken);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_MINUTES * 60 * 1000);

    await PasswordReset.destroy({ where: { userId: user.id } });
    await PasswordReset.create({
      userId: user.id,
      tokenHash,
      expiresAt,
    });

    const clientUrl = normalizeClientUrl(process.env.CLIENT_URL);
    if (!clientUrl) {
      console.error("CLIENT_URL is not configured for password reset links");
      return res.status(200).json({ message: FORGOT_PASSWORD_GENERIC_MESSAGE });
    }

    const resetLink = `${clientUrl}/reset-password/${rawToken}`;

    try {
      await sendPasswordResetEmail({
        to: user.email,
        name: user.name,
        resetLink,
        expiresMinutes: RESET_TOKEN_EXPIRY_MINUTES,
      });
    } catch (mailError) {
      console.error("Failed to send password reset email", {
        email: user.email,
        error: mailError.message,
        code: mailError.code || null,
        command: mailError.command || null,
        response: mailError.response || null,
      });
    }

    return res.status(200).json({ message: FORGOT_PASSWORD_GENERIC_MESSAGE });
  } catch (err) {
    return res.status(200).json({ message: FORGOT_PASSWORD_GENERIC_MESSAGE });
  }
};

const resetPassword = async (req, res) => {
  try {
    const token = String(req.body?.token || "").trim();
    const newPassword = String(req.body?.newPassword || "");
    const confirmPassword = String(req.body?.confirmPassword || "");

    if (!token || !newPassword || !confirmPassword) {
      return res.status(400).json({ message: "token, newPassword, confirmPassword are required" });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: "New password and confirm password do not match" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: "New password must be at least 6 characters" });
    }

    const tokenHash = hashResetToken(token);
    const passwordReset = await PasswordReset.findOne({
      where: {
        tokenHash,
        expiresAt: { [Op.gt]: new Date() },
      },
    });

    if (!passwordReset) {
      return res.status(400).json({ message: "Invalid or expired reset token" });
    }

    const user = await User.findByPk(passwordReset.userId);
    if (!user) {
      await PasswordReset.destroy({ where: { tokenHash } });
      return res.status(400).json({ message: "Invalid or expired reset token" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await user.update({ password: hashedPassword });

    await PasswordReset.destroy({ where: { userId: user.id } });

    return res.status(200).json({ message: "Password reset successful" });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

module.exports = { login, register, forgotPassword, resetPassword };
