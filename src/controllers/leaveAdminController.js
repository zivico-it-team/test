const { Op } = require("sequelize");
const Leave = require("../models/Leave");
const User = require("../models/User");
const { matchesEmploymentStatus } = require("../utils/employmentStatus");

const LEGACY_POLICY_TOTALS = {
  annual: 21,
  casual: 7,
  medical: 14,
  unpaid: 0,
};

const EMPTY_POLICY_TOTALS = {
  annual: 0,
  casual: 0,
  medical: 0,
  unpaid: 0,
};

const LEAVE_TYPE_ALIAS_MAP = {
  annual: "annual",
  casual: "casual",
  medical: "medical",
  special: "medical",
  unpaid: "unpaid",
};

const DISPLAY_TYPE_BY_STORAGE = {
  annual: "Annual",
  casual: "Casual",
  medical: "Special",
  unpaid: "Unpaid",
};

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
    } catch (_) {
      return fallback;
    }
  }

  return fallback;
};

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getLeaveTypeKey = (value = "") =>
  LEAVE_TYPE_ALIAS_MAP[String(value).trim().toLowerCase()] || null;

const buildUserPolicyBalances = (user = {}) => {
  const professional = toPlainObject(user?.professional, {});
  const rawPolicySource = professional?.leaveBalance ?? professional?.leaveBalances ?? {};
  const rawPolicy = toPlainObject(rawPolicySource, {});
  const normalizedPolicy = {
    annual: { total: 0, used: 0 },
    casual: { total: 0, used: 0 },
    medical: { total: 0, used: 0 },
    unpaid: { total: 0, used: 0 },
  };
  let hasConfiguredTypes = false;

  if (rawPolicy && typeof rawPolicy === "object") {
    for (const [rawType, rawConfig] of Object.entries(rawPolicy)) {
      const typeKey = getLeaveTypeKey(rawType);
      if (!typeKey) continue;

      hasConfiguredTypes = true;
      const configObject = toPlainObject(rawConfig, null);
      const totalSource =
        configObject && typeof configObject === "object"
          ? configObject.total ?? configObject.assigned ?? configObject.allocation ?? rawConfig
          : rawConfig;
      const total = Math.max(0, toNumber(totalSource, 0));
      const remainingSource =
        configObject?.left ??
        configObject?.remaining ??
        configObject?.available ??
        configObject?.balance;
      const explicitUsedSource =
        configObject?.used ??
        configObject?.usedDays ??
        configObject?.taken ??
        configObject?.spent;
      const effectiveUsed =
        explicitUsedSource !== undefined
          ? Math.max(0, toNumber(explicitUsedSource, 0))
          : Math.max(0, total - Math.max(0, toNumber(remainingSource, total)));

      normalizedPolicy[typeKey] = {
        total,
        used: effectiveUsed,
      };
    }
  }

  if ((user?.role === "admin" || user?.role === "manager") && !hasConfiguredTypes) {
    return Object.fromEntries(
      Object.entries(LEGACY_POLICY_TOTALS).map(([typeKey, total]) => [
        typeKey,
        { total, used: 0 },
      ])
    );
  }

  return normalizedPolicy;
};

const getAllBalanceTypes = () => Object.keys(EMPTY_POLICY_TOTALS);

const toLeaveJson = (l) => {
  const o = typeof l.toJSON === "function" ? l.toJSON() : l;
  const includedUser =
    o.user && typeof o.user === "object" ? { ...o.user, _id: o.user.id || o.user._id || o.userId } : null;
  const includedActionBy =
    o.actionBy && typeof o.actionBy === "object"
      ? { ...o.actionBy, _id: o.actionBy.id || o.actionBy._id || o.actionById }
      : null;
  o._id = o.id;
  o.user = includedUser || o.userId;
  o.actionBy = includedActionBy || o.actionById;
  o.actionByName = includedActionBy?.name || "";
  return o;
};

const adminEmployeeLeaveBalances = async (req, res) => {
  try {
    const employees = await User.findAll({
      where: {
        role: "employee",
        approvalStatus: "approved",
      },
      attributes: [
        "id",
        "name",
        "email",
        "role",
        "professional",
        "profileImageUrl",
        "profileImageFileName",
        "updatedAt",
      ],
      order: [["name", "ASC"]],
    });

    const activeEmployees = employees.filter((employee) => matchesEmploymentStatus(employee, "active"));
    const employeeIds = activeEmployees.map((employee) => employee.id).filter(Boolean);
    const approvedLeaves = employeeIds.length
      ? await Leave.findAll({
          where: {
            status: "approved",
            userId: { [Op.in]: employeeIds },
          },
          attributes: ["userId", "type", "totalDays"],
        })
      : [];

    const approvedUsageByEmployee = new Map();

    for (const leave of approvedLeaves) {
      const typeKey = getLeaveTypeKey(leave.type);
      if (!typeKey) continue;

      const employeeUsage = approvedUsageByEmployee.get(leave.userId) || {
        annual: 0,
        casual: 0,
        medical: 0,
        unpaid: 0,
      };

      employeeUsage[typeKey] += Math.max(0, toNumber(leave.totalDays, 0));
      approvedUsageByEmployee.set(leave.userId, employeeUsage);
    }

    const rows = activeEmployees.map((employeeRecord) => {
      const employee =
        typeof employeeRecord.toJSON === "function" ? employeeRecord.toJSON() : employeeRecord;
      const professional = toPlainObject(employee.professional, {});
      const configuredBalances = buildUserPolicyBalances(employee);
      const approvedUsage = approvedUsageByEmployee.get(employee.id) || EMPTY_POLICY_TOTALS;

      const balances = getAllBalanceTypes().map((typeKey) => {
        const total = Math.max(0, toNumber(configuredBalances[typeKey]?.total, 0));
        const configuredUsed = Math.max(0, toNumber(configuredBalances[typeKey]?.used, 0));
        const approvedUsed = Math.max(0, toNumber(approvedUsage[typeKey], 0));
        const used = Math.max(configuredUsed, approvedUsed);
        const left = Math.max(0, total - used);

        return {
          type: typeKey,
          label: DISPLAY_TYPE_BY_STORAGE[typeKey] || typeKey,
          total,
          used,
          left,
          unlimited: typeKey === "unpaid",
        };
      });

      const summary = balances.reduce(
        (acc, balance) => ({
          allocated: acc.allocated + balance.total,
          used: acc.used + balance.used,
          remaining: acc.remaining + balance.left,
          unpaidUsed: acc.unpaidUsed + (balance.unlimited ? balance.used : 0),
        }),
        { allocated: 0, used: 0, remaining: 0, unpaidUsed: 0 }
      );

      return {
        id: employee.id,
        name: employee.name || "Unknown Employee",
        email: employee.email || "",
        employeeId: professional.employeeId || "",
        department: professional.department || "Unassigned Department",
        designation: professional.designation || "Employee",
        profileImageUrl: employee.profileImageUrl || "",
        profileImageFileName: employee.profileImageFileName || "",
        updatedAt: employee.updatedAt || null,
        balances,
        summary,
      };
    });

    res.json({ employees: rows });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ✅ Manager/Admin → Leave Summary counts (Total / Pending / Approved / Rejected)
const adminLeaveSummary = async (req, res) => {
  try {
    const [total, pending, approved, rejected] = await Promise.all([
      Leave.count(),
      Leave.count({ where: { status: "pending" } }),
      Leave.count({ where: { status: "approved" } }),
      Leave.count({ where: { status: "rejected" } }),
    ]);

    res.json({ total, pending, approved, rejected });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ✅ Manager/Admin → List leaves by status (All/Pending/Approved/Rejected) + pagination
const adminLeaveList = async (req, res) => {
  try {
    const { status = "all", page = 1, limit = 10 } = req.query;

    const where = {};
    if (status !== "all") where.status = status;

    const p = Math.max(1, Number(page));
    const l = Math.min(100, Math.max(1, Number(limit)));
    const offset = (p - 1) * l;

    const { count: total, rows } = await Leave.findAndCountAll({
      where,
      include: [
        { model: User, as: "user", attributes: ["id", "name", "email", "role"] },
        { model: User, as: "actionBy", attributes: ["id", "name", "email", "role"] },
      ],
      order: [["createdAt", "DESC"]],
      offset,
      limit: l,
    });

    const leaves = rows.map((x) => toLeaveJson(x));

    res.json({ page: p, limit: l, total, leaves });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ✅ Manager/Admin → Clear Records button (by status or all)
const clearLeaveRecords = async (req, res) => {
  try {
    const { status = "all" } = req.query;

    const where = {};
    if (status !== "all") where.status = status;

    const deletedCount = await Leave.destroy({ where });
    res.json({ message: "Records cleared", deletedCount });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  adminEmployeeLeaveBalances,
  adminLeaveSummary,
  adminLeaveList,
  clearLeaveRecords,
};
