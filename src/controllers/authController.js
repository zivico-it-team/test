const User = require("../models/User");
const bcrypt = require("bcryptjs");
const { Op } = require("sequelize");
const generateToken = require("../utils/generateToken");

const toSessionUser = (user) => {
  const u = typeof user.toJSON === "function" ? user.toJSON() : { ...user };
  delete u.password;

  return {
    ...u,
    _id: u.id,
    token: generateToken(u),
  };
};

const login = async (req, res) => {
  try {
    const { userName, password } = req.body;

    const user = await User.findOne({ where: { userName } });
    if (!user) return res.status(401).json({ message: "Invalid Username" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: "Invalid password" });

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

    const normalizedEmail = String(email).trim().toLowerCase();
    const resolvedUserName =
      String(userName || normalizedEmail.split("@")[0])
        .trim()
        .replace(/\s+/g, "")
        .toLowerCase();

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
    });

    return res.status(201).json(toSessionUser(user));
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

module.exports = { login, register };
