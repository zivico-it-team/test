const User = require("../models/User");
const bcrypt = require("bcryptjs");
const { Op } = require("sequelize");
const generateToken = require("../utils/generateToken");
const { toPublicUser } = require("../utils/userNormalizer");

const toSessionUser = (user) => {
  const u = toPublicUser(user);
  return {
    ...u,
    token: generateToken(u),
  };
};

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

    res.json(toSessionUser(user));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const register = async (req, res) => {
  try {
    const { name, email, password, phone, address, userName, role } = req.body;

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
    const requestedRole = String(role || "employee").trim().toLowerCase();
    const allowedSelfRegisterRoles = new Set(["employee", "manager"]);
    const resolvedRole = allowedSelfRegisterRoles.has(requestedRole) ? requestedRole : "employee";

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
      role: resolvedRole,
    });

    return res.status(201).json(toSessionUser(user));
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

module.exports = { login, register };
