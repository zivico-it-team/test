const User = require("../models/User");
const bcrypt = require("bcryptjs");
const { Op } = require("sequelize");
const LeaderboardPerformance = require("../models/LeaderboardPerformance");
const { sequelize } = require("../config/db");
const Activity = require("../models/Activity");
const Attendance = require("../models/Attendance");
const Leave = require("../models/Leave");
const Upload = require("../models/Upload");
const FileShare = require("../models/FileShare");
const PasswordReset = require("../models/PasswordReset");
const Lead = require("../models/Lead");
const {
  toPublicUser,
  toPlainObject,
  toPlainArray,
  normalizeProfessional,
  normalizeStoredImageUrl,
} = require("../utils/userNormalizer");

const normalizeOptionalEmail = (email) => {
  const normalized = String(email || "").trim().toLowerCase();
  return normalized || null;
};

const sanitizeStoredImageUrl = (value) => {
  return normalizeStoredImageUrl(value);
};

const normalizeApprovalStatus = (value, fallback = "approved") => {
  const normalized = String(value || fallback).trim().toLowerCase();
  return ["pending", "approved"].includes(normalized) ? normalized : fallback;
};

const extractProfessional = (payload = {}, existingProfessional = {}) => {
  const professionalPayload = toPlainObject(payload.professional, {});
  const existing = normalizeProfessional(existingProfessional);
  const payloadLeaveBalance =
    professionalPayload.leaveBalance ||
    professionalPayload.leaveBalances ||
    payload.leaveBalance ||
    payload.leaveBalances;

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
    ...(payloadLeaveBalance !== undefined ? { leaveBalance: toPlainObject(payloadLeaveBalance, {}) } : {}),
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

const purgeUserRecords = async (userId, transaction) => {
  const id = String(userId || "").trim();
  if (!id) return;

  await PasswordReset.destroy({ where: { userId: id }, transaction });
  await LeaderboardPerformance.destroy({ where: { employeeId: id }, transaction });

  // Remove leave action reference before deleting manager/admin actors.
  await Leave.update({ actionById: null }, { where: { actionById: id }, transaction });
  await Leave.destroy({ where: { userId: id }, transaction });

  await Attendance.destroy({ where: { userId: id }, transaction });
  await Activity.destroy({ where: { userId: id }, transaction });

  const userUploads = await Upload.findAll({
    where: { userId: id },
    attributes: ["id"],
    transaction,
  });
  const uploadIds = userUploads.map((item) => item.id).filter(Boolean);
  if (uploadIds.length > 0) {
    await FileShare.destroy({
      where: { fileId: { [Op.in]: uploadIds } },
      transaction,
    });
  }

  // Shares created by user should be removed.
  await FileShare.destroy({ where: { sharedById: id }, transaction });

  // Remove user from targeted share lists.
  const scopedShares = await FileShare.findAll({
    where: { scope: "users" },
    attributes: ["id", "sharedWith"],
    transaction,
  });
  for (const share of scopedShares) {
    const sharedWith = Array.isArray(share.sharedWith) ? share.sharedWith : [];
    if (!sharedWith.some((entry) => String(entry) === id)) continue;
    const nextSharedWith = sharedWith.filter((entry) => String(entry) !== id);
    await share.update({ sharedWith: nextSharedWith }, { transaction });
  }

  await Upload.destroy({ where: { userId: id }, transaction });

  // Leads are business records, so detach user references instead of deleting leads.
  await Lead.update(
    {
      assignedTo: "",
      assignedToId: "",
      assignedDate: null,
      leadPool: "SL_EMP_UNASSIGNED",
      wasEverAssigned: true,
    },
    { where: { assignedToId: id }, transaction }
  );

  await Lead.update(
    {
      followUp: "",
      followUpSetById: "",
      followUpSetBy: "",
      followUpSetAt: null,
      followUpHandled: true,
      followUpHandledAt: new Date(),
      followUpHandledById: "",
    },
    { where: { followUpSetById: id }, transaction }
  );

  await Lead.update(
    { followUpHandledById: "" },
    { where: { followUpHandledById: id }, transaction }
  );
};

// Admin → Add Manager
const addManager = async (req, res) => {
  try {
    const { name, userName, email, password, phone } = req.body;

    if (!name || !userName || !email || !password) {
      return res.status(400).json({ message: "name, userName, email and password are required" });
    }

    const normalizedEmail = normalizeOptionalEmail(email);
    const hashed = await bcrypt.hash(password, 10);

    const manager = await User.create({
      name,
      email: normalizedEmail,
      phone,
      userName,
      password: hashed,
      role: "manager",
      approvalStatus: "approved",
      approvedAt: new Date(),
      professional: extractProfessional(req.body),
      emergencyContact: toPlainObject(req.body.emergencyContact, {}),
      bank: toPlainObject(req.body.bank, {}),
      documents: toPlainArray(req.body.documents, []),
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
      skills: toPlainArray(req.body.skills, []),
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
    const requestedRole = String(req.body?.role || "employee").trim().toLowerCase();

    if (!name || !userName || !password) {
      return res.status(400).json({ message: "name, userName and password are required" });
    }

    if (!["employee", "manager"].includes(requestedRole)) {
      return res.status(400).json({ message: "Invalid role. Allowed roles: employee, manager" });
    }

    const normalizedEmail = normalizeOptionalEmail(email);

    const hashed = await bcrypt.hash(password, 10);

    const employee = await User.create({
      name,
      email: normalizedEmail,
      phone,
      userName,
      password: hashed,
      role: requestedRole,
      approvalStatus: "approved",
      approvedAt: new Date(),
      professional: extractProfessional(req.body),
      emergencyContact: toPlainObject(req.body.emergencyContact, {}),
      bank: toPlainObject(req.body.bank, {}),
      documents: toPlainArray(req.body.documents, []),
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
      skills: toPlainArray(req.body.skills, []),
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
      const nextImage = sanitizeStoredImageUrl(req.body.profileImageUrl);
      if (nextImage || req.body.profileImageUrl === null) {
        update.profileImageUrl = nextImage;
      }
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

    if (req.body.documents !== undefined) {
      update.documents = toPlainArray(req.body.documents, []);
    }

    if (req.body.bank !== undefined) {
      update.bank = toPlainObject(req.body.bank, {});
    }

    if (req.body.emergencyContact !== undefined) {
      update.emergencyContact = toPlainObject(req.body.emergencyContact, {});
    }

    if (req.body.skills !== undefined) {
      update.skills = toPlainArray(req.body.skills, []);
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

    const deleted = await sequelize.transaction(async (transaction) => {
      await purgeUserRecords(id, transaction);
      return User.destroy({ where: { id, role: "manager" }, transaction });
    });
    if (!deleted) return res.status(404).json({ message: "Manager not found" });
    res.json({ message: "Manager deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET all employees
const getEmployees = async (req, res) => {
  try {
    const approvalStatus = normalizeApprovalStatus(req.query?.approvalStatus, "approved");
    const requestedStatus = String(req.query?.approvalStatus || "approved").trim().toLowerCase();
    const where = { role: "employee" };

    if (requestedStatus !== "all") {
      if (!["pending", "approved", ""].includes(requestedStatus)) {
        return res.status(400).json({ message: "approvalStatus must be pending, approved, or all" });
      }
      where.approvalStatus = approvalStatus;
    }

    const employees = await User.findAll({
      where,
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

    const employee = await User.findOne({ where: { id, role: "employee" } });
    if (!employee) return res.status(404).json({ message: "Employee not found" });

    const update = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }

    if (req.body.profileImageUrl !== undefined) {
      const nextImage = sanitizeStoredImageUrl(req.body.profileImageUrl);
      if (nextImage || req.body.profileImageUrl === null) {
        update.profileImageUrl = nextImage;
      }
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

    if (req.body.documents !== undefined) {
      update.documents = toPlainArray(req.body.documents, []);
    }

    if (req.body.bank !== undefined) {
      update.bank = toPlainObject(req.body.bank, {});
    }

    if (req.body.emergencyContact !== undefined) {
      update.emergencyContact = toPlainObject(req.body.emergencyContact, {});
    }

    if (req.body.skills !== undefined) {
      update.skills = toPlainArray(req.body.skills, []);
    }

    if (req.body.password && String(req.body.password).trim()) {
      update.password = await bcrypt.hash(req.body.password, 10);
    }

    if (req.body.role !== undefined) {
      const nextRole = String(req.body.role || "").trim().toLowerCase();
      if (!["employee", "manager"].includes(nextRole)) {
        return res.status(400).json({ message: "Invalid role. Allowed roles: employee, manager" });
      }

      if (nextRole === "manager") {
        const actorRole = String(req.user?.role || "").trim().toLowerCase();
        if (actorRole !== "admin") {
          return res.status(403).json({ message: "Only admin can convert employee to manager" });
        }
      }

      update.role = nextRole;
    }

    if (req.body.approvalStatus !== undefined) {
      const actorRole = String(req.user?.role || "").trim().toLowerCase();
      if (actorRole !== "admin") {
        return res.status(403).json({ message: "Only admin can change employee access approval" });
      }

      const nextApprovalStatus = normalizeApprovalStatus(req.body.approvalStatus, "approved");
      update.approvalStatus = nextApprovalStatus;
      update.approvedAt = nextApprovalStatus === "approved" ? new Date() : null;
    }

    await employee.update(update);

    const updated = await User.findByPk(id, { attributes: { exclude: ["password"] } });
    res.json(toPublicUser(updated));
  } catch (err) {
    return handleAdminUserError(res, err);
  }
};

const getPendingEmployeeAccess = async (req, res) => {
  try {
    const employees = await User.findAll({
      where: { role: "employee", approvalStatus: "pending" },
      attributes: { exclude: ["password"] },
      order: [["createdAt", "DESC"]],
    });

    res.json(employees.map(toPublicUser));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const approveEmployeeAccess = async (req, res) => {
  try {
    const employee = await User.findOne({
      where: { id: req.params.id, role: "employee" },
    });

    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    await employee.update({
      approvalStatus: "approved",
      approvedAt: new Date(),
    });

    res.json({
      message: "Employee access approved successfully",
      employee: toPublicUser(employee),
    });
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

    const deleted = await sequelize.transaction(async (transaction) => {
      await purgeUserRecords(id, transaction);
      return User.destroy({ where: { id, role: "employee" }, transaction });
    });
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
      "userName",
      "email",
      "phone",
      "dob",
      "gender",
      "city",
      "state",
      "nationality",
      "addressLine",
      "postalCode",
      "professional",
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
      const nextImage = sanitizeStoredImageUrl(req.body.profileImageUrl);
      if (nextImage || req.body.profileImageUrl === null) {
        update.profileImageUrl = nextImage;
      }
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
      const existingProfessional = toPlainObject(admin.professional, {});
      const mergedProfessional = extractProfessional(req.body, existingProfessional);
      update.professional = {
        ...existingProfessional,
        ...mergedProfessional,
        designation: mergedProfessional.designation || existingProfessional.designation || "",
      };
    }

    await admin.update(update);

    const updated = await User.findByPk(adminId, { attributes: { exclude: ["password"] } });
    res.json({ message: "Profile updated", user: toPublicUser(updated) });
  } catch (err) {
    return handleAdminUserError(res, err);
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
  getPendingEmployeeAccess,
  approveEmployeeAccess,

  getAdminProfile,
  updateAdminProfile,
  changeAdminPassword,
};
