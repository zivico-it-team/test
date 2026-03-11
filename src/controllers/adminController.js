const User = require("../models/User");
const bcrypt = require("bcryptjs");

const toPlainObject = (value, fallback = {}) => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return fallback;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch (error) {
      return fallback;
    }
  }

  return fallback;
};

const normalizeProfessional = (value) => {
  const professional = toPlainObject(value, {});
  return {
    ...professional,
    employeeId: String(professional.employeeId ?? "").trim(),
    designation: String(professional.designation ?? "").trim(),
    department: String(professional.department ?? professional.teamName ?? "").trim(),
  };
};

const toPublicUser = (u) => {
  if (!u) return null;
  const obj = typeof u.toJSON === "function" ? u.toJSON() : u;
  const professional = normalizeProfessional(obj.professional);

  obj.professional = professional;
  obj.employeeId = obj.employeeId || professional.employeeId || "";
  obj.designation = obj.designation || professional.designation || "";
  obj.department = obj.department || professional.department || "";
  obj.profilePicture = obj.profileImageUrl || "";
  obj.profileImageVersion = obj.updatedAt ? new Date(obj.updatedAt).getTime() : null;

  obj._id = obj.id;
  delete obj.password;
  return obj;
};

const normalizeOptionalEmail = (email) => {
  const normalized = String(email || "").trim().toLowerCase();
  return normalized || null;
};

const sanitizeStoredImageUrl = (value) => {
  const normalized = String(value || "").trim();
  if (!normalized || /^data:/i.test(normalized)) {
    return "";
  }
  return normalized;
};

const extractProfessional = (payload = {}, existingProfessional = {}) => {
  const professionalPayload = toPlainObject(payload.professional, {});
  const existing = normalizeProfessional(existingProfessional);

  return {
    ...existing,
    ...professionalPayload,
    employeeId:
      professionalPayload.employeeId ??
      payload.employeeId ??
      existing.employeeId ??
      "",
    designation:
      professionalPayload.designation ??
      payload.designation ??
      existing.designation ??
      "",
    department:
      professionalPayload.department ??
      payload.department ??
      existing.department ??
      "",
  };
};

const handleAdminUserError = (res, err) => {
  if (err?.name === "SequelizeUniqueConstraintError") {
    const duplicateField = err.errors?.[0]?.path || "field";
    return res.status(409).json({ message: `${duplicateField} already exists` });
  }

  if (err?.name === "SequelizeValidationError") {
    return res.status(400).json({ message: err.errors?.[0]?.message || "Validation failed" });
  }

  return res.status(500).json({ message: err.message || "Server error" });
};

// Admin → Add Manager
const addManager = async (req, res) => {
  try {
    const { name, userName, email, password, phone } = req.body;

    if (!name || !userName || !email || !password) {
      return res.status(400).json({ message: "name, userName, email and password are required" });
    }

    const hashed = await bcrypt.hash(password, 10);

    const manager = await User.create({
      name,
      email,
      phone,
      userName,
      password: hashed,
      role: "manager",
      professional: extractProfessional(req.body),
      emergencyContact: req.body.emergencyContact || {},
      bank: req.body.bank || {},
      documents: req.body.documents || [],
      profileImageUrl: sanitizeStoredImageUrl(req.body.profileImageUrl),
      profileImageFileName: req.body.profileImageFileName || "",
      dob: req.body.dob || null,
      gender: req.body.gender || "Not specified",
      nationality: req.body.nationality || "",
      addressLine: req.body.addressLine || "",
      city: req.body.city || "",
      state: req.body.state || "",
      postalCode: req.body.postalCode || "",
      bio: req.body.bio || "",
      skills: req.body.skills || [],
    });

    res.status(201).json(toPublicUser(manager));
  } catch (err) {
    return handleAdminUserError(res, err);
  }
};

// Admin + Manager → Add Employee
const addEmployee = async (req, res) => {
  try {
    const { name, userName, email, password, phone } = req.body;

    if (!name || !userName || !password) {
      return res.status(400).json({ message: "name, userName and password are required" });
    }

    const normalizedEmail = normalizeOptionalEmail(email);

    const hashed = await bcrypt.hash(password, 10);

    const employee = await User.create({
      name,
      email: normalizedEmail,
      phone,
      userName,
      password: hashed,
      role: "employee",
      professional: extractProfessional(req.body),
      emergencyContact: req.body.emergencyContact || {},
      bank: req.body.bank || {},
      documents: req.body.documents || [],
      profileImageUrl: sanitizeStoredImageUrl(req.body.profileImageUrl),
      profileImageFileName: req.body.profileImageFileName || "",
      dob: req.body.dob || null,
      gender: req.body.gender || "Not specified",
      nationality: req.body.nationality || "",
      addressLine: req.body.addressLine || "",
      city: req.body.city || "",
      state: req.body.state || "",
      postalCode: req.body.postalCode || "",
      bio: req.body.bio || "",
      skills: req.body.skills || [],
    });

    res.status(201).json(toPublicUser(employee));
  } catch (err) {
    return handleAdminUserError(res, err);
  }
};

// GET all managers
const getManagers = async (req, res) => {
  try {
    const managers = await User.findAll({
      where: { role: "manager" },
      attributes: { exclude: ["password"] },
      order: [["createdAt", "DESC"]],
    });

    res.json(managers.map(toPublicUser));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET single manager by id
const getManagerById = async (req, res) => {
  try {
    const manager = await User.findOne({
      where: { id: req.params.id, role: "manager" },
      attributes: { exclude: ["password"] },
    });

    if (!manager) return res.status(404).json({ message: "Manager not found" });
    res.json(toPublicUser(manager));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// UPDATE manager by id (Admin only)
const updateManager = async (req, res) => {
  try {
    const id = req.params.id;

    const allowed = [
      "name",
      "userName",
      "email",
      "phone",
      "dob",
      "gender",
      "nationality",
      "addressLine",
      "city",
      "state",
      "postalCode",
      "professional",
      "bank",
      "documents",
      "emergencyContact",
      "profileImageUrl",
      "profileImageFileName",
      "bio",
      "skills",
    ];

    if (req.body.role && req.body.role !== "manager") {
      return res.status(400).json({ message: "Role change not allowed here" });
    }

    const manager = await User.findOne({ where: { id, role: "manager" } });
    if (!manager) return res.status(404).json({ message: "Manager not found" });

    const update = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }

    if (req.body.profileImageUrl !== undefined) {
      update.profileImageUrl = sanitizeStoredImageUrl(req.body.profileImageUrl);
    }

    if (req.body.email !== undefined) {
      update.email = normalizeOptionalEmail(req.body.email);
    }

    if (
      req.body.professional !== undefined ||
      req.body.employeeId !== undefined ||
      req.body.designation !== undefined ||
      req.body.department !== undefined
    ) {
      update.professional = extractProfessional(req.body, manager.professional || {});
    }

    if (req.body.password && String(req.body.password).trim()) {
      update.password = await bcrypt.hash(req.body.password, 10);
    }

    await manager.update(update);

    const updated = await User.findByPk(id, { attributes: { exclude: ["password"] } });
    res.json(toPublicUser(updated));
  } catch (err) {
    return handleAdminUserError(res, err);
  }
};

// DELETE manager by id (Admin only)
const deleteManager = async (req, res) => {
  try {
    const id = req.params.id;

    if (req.user && String(req.user._id) === String(id)) {
      return res.status(400).json({ message: "You can't delete your own account" });
    }

    const deleted = await User.destroy({ where: { id, role: "manager" } });
    if (!deleted) return res.status(404).json({ message: "Manager not found" });

    res.json({ message: "Manager deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET all employees
const getEmployees = async (req, res) => {
  try {
    const employees = await User.findAll({
      where: { role: "employee" },
      attributes: { exclude: ["password"] },
      order: [["createdAt", "DESC"]],
    });
    res.json(employees.map(toPublicUser));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET single employee by id
const getEmployeeById = async (req, res) => {
  try {
    const employee = await User.findOne({
      where: { id: req.params.id, role: "employee" },
      attributes: { exclude: ["password"] },
    });
    if (!employee) return res.status(404).json({ message: "Employee not found" });
    res.json(toPublicUser(employee));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// UPDATE employee by id (Admin/Manager)
const updateEmployee = async (req, res) => {
  try {
    const id = req.params.id;

    const allowed = [
      "name",
      "userName",
      "email",
      "phone",
      "dob",
      "gender",
      "nationality",
      "addressLine",
      "city",
      "state",
      "postalCode",
      "professional",
      "bank",
      "documents",
      "emergencyContact",
      "profileImageUrl",
      "profileImageFileName",
      "bio",
      "skills",
    ];

    if (req.body.role && req.body.role !== "employee") {
      return res.status(400).json({ message: "Role change not allowed here" });
    }

    const employee = await User.findOne({ where: { id, role: "employee" } });
    if (!employee) return res.status(404).json({ message: "Employee not found" });

    const update = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }

    if (req.body.profileImageUrl !== undefined) {
      update.profileImageUrl = sanitizeStoredImageUrl(req.body.profileImageUrl);
    }

    if (req.body.email !== undefined) {
      update.email = normalizeOptionalEmail(req.body.email);
    }

    if (
      req.body.professional !== undefined ||
      req.body.employeeId !== undefined ||
      req.body.designation !== undefined ||
      req.body.department !== undefined
    ) {
      update.professional = extractProfessional(req.body, employee.professional || {});
    }

    if (req.body.password && String(req.body.password).trim()) {
      update.password = await bcrypt.hash(req.body.password, 10);
    }

    await employee.update(update);

    const updated = await User.findByPk(id, { attributes: { exclude: ["password"] } });
    res.json(toPublicUser(updated));
  } catch (err) {
    return handleAdminUserError(res, err);
  }
};

// DELETE employee by id (Admin/Manager)
const deleteEmployee = async (req, res) => {
  try {
    const id = req.params.id;

    if (req.user && String(req.user._id) === String(id)) {
      return res.status(400).json({ message: "You can't delete your own account" });
    }

    const deleted = await User.destroy({ where: { id, role: "employee" } });
    if (!deleted) return res.status(404).json({ message: "Employee not found" });

    res.json({ message: "Employee deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET admin profile (Admin only)
const getAdminProfile = async (req, res) => {
  try {
    const admin = await User.findByPk(req.user._id, { attributes: { exclude: ["password"] } });
    if (!admin) return res.status(404).json({ message: "Admin not found" });
    if (admin.role !== "admin") return res.status(403).json({ message: "Admin only" });
    res.json({ user: toPublicUser(admin) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// UPDATE admin profile (Admin only)
const updateAdminProfile = async (req, res) => {
  try {
    const adminId = req.user._id;

    const admin = await User.findByPk(adminId);
    if (!admin) return res.status(404).json({ message: "Admin not found" });
    if (admin.role !== "admin") return res.status(403).json({ message: "Admin only" });

    const allowed = [
      "name",
      "phone",
      "dob",
      "gender",
      "city",
      "state",
      "nationality",
      "addressLine",
      "postalCode",
      "profileImageUrl",
      "profileImageFileName",
      "bio",
      "skills",
    ];

    const update = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }

    if (req.body.profileImageUrl !== undefined) {
      update.profileImageUrl = sanitizeStoredImageUrl(req.body.profileImageUrl);
    }

    if (req.body.email && req.body.email !== admin.email) {
      return res.status(400).json({ message: "Email cannot be changed" });
    }

    await admin.update(update);

    const updated = await User.findByPk(adminId, { attributes: { exclude: ["password"] } });
    res.json({ message: "Profile updated", user: toPublicUser(updated) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// CHANGE admin password (Admin only)
const changeAdminPassword = async (req, res) => {
  try {
    const adminId = req.user._id;
    const { currentPassword, newPassword, confirmNewPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmNewPassword) {
      return res.status(400).json({
        message: "currentPassword, newPassword, confirmNewPassword are required",
      });
    }

    if (newPassword !== confirmNewPassword) {
      return res.status(400).json({ message: "New passwords do not match" });
    }

    if (String(newPassword).length < 6) {
      return res.status(400).json({ message: "New password must be at least 6 characters" });
    }

    const admin = await User.findByPk(adminId);
    if (!admin) return res.status(404).json({ message: "Admin not found" });
    if (admin.role !== "admin") return res.status(403).json({ message: "Admin only" });

    const ok = await bcrypt.compare(currentPassword, admin.password);
    if (!ok) return res.status(400).json({ message: "Current password is incorrect" });

    await admin.update({ password: await bcrypt.hash(newPassword, 10) });

    res.json({ message: "Password changed successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  addManager,
  addEmployee,

  getManagers,
  getManagerById,
  updateManager,
  deleteManager,

  getEmployees,
  getEmployeeById,
  updateEmployee,
  deleteEmployee,

  getAdminProfile,
  updateAdminProfile,
  changeAdminPassword,
};
