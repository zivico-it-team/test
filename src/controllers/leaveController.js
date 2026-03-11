const { Op } = require("sequelize");
const Leave = require("../models/Leave");
const User = require("../models/User");

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
  annual: "annual",
  casual: "casual",
  medical: "Special",
  unpaid: "Unpaid",
};

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getLeaveTypeKey = (value = "") => LEAVE_TYPE_ALIAS_MAP[String(value).trim().toLowerCase()] || null;

const toLeaveLabel = (typeKey = "") => {
  if (typeKey === "medical") return "Special";
  return typeKey.charAt(0).toUpperCase() + typeKey.slice(1);
};

const buildUserPolicyTotals = (user = {}) => {
  const rawPolicy = user?.professional?.leaveBalance || user?.professional?.leaveBalances || {};
  const normalizedPolicy = { ...EMPTY_POLICY_TOTALS };
  let hasConfiguredTypes = false;

  if (rawPolicy && typeof rawPolicy === "object") {
    for (const [rawType, rawConfig] of Object.entries(rawPolicy)) {
      const typeKey = getLeaveTypeKey(rawType);
      if (!typeKey) continue;

      hasConfiguredTypes = true;
      const configuredTotal =
        rawConfig && typeof rawConfig === "object" ? rawConfig.total : rawConfig;
      normalizedPolicy[typeKey] = Math.max(0, toNumber(configuredTotal, 0));
    }
  }

  if ((user?.role === "admin" || user?.role === "manager") && !hasConfiguredTypes) {
    return { ...LEGACY_POLICY_TOTALS };
  }

  return normalizedPolicy;
};

const getAllBalanceTypes = () => Object.keys(EMPTY_POLICY_TOTALS);

// Helpers
const startOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const isPastDate = (d) => startOfDay(d).getTime() < startOfDay(new Date()).getTime();

const calcDaysInclusive = (fromDate, toDate) => {
  const s = startOfDay(fromDate);
  const e = startOfDay(toDate);
  const diff = e.getTime() - s.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24)) + 1;
};

const toLeaveJson = (l) => {
  const o = typeof l.toJSON === "function" ? l.toJSON() : l;
  o._id = o.id;
  // keep old field names
  o.user = o.userId;
  o.actionBy = o.actionById;
  return o;
};

// ✅ Employee → Apply Leave
const applyLeave = async (req, res) => {
  try {
    const userId = req.user._id;
    const { type, fromDate, toDate, reason } = req.body;
    const requestedType = getLeaveTypeKey(type);
    const policyTotals = buildUserPolicyTotals(req.user);

    if (!type) return res.status(400).json({ message: "type is required" });
    if (!requestedType) return res.status(400).json({ message: "Invalid leave type" });

    if (!fromDate || !toDate) {
      return res.status(400).json({ message: "fromDate and toDate are required" });
    }

    const from = new Date(fromDate);
    const to = new Date(toDate);

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return res.status(400).json({ message: "Invalid date format" });
    }

    if (startOfDay(to) < startOfDay(from)) {
      return res.status(400).json({ message: "toDate must be after fromDate" });
    }

    // UI rule: cannot pick past dates
    if (isPastDate(from) || isPastDate(to)) {
      return res.status(400).json({ message: "Cannot select past dates" });
    }

    const totalDays = calcDaysInclusive(from, to);

    // Prevent overlapping leaves (pending/approved)
    const overlap = await Leave.findOne({
      where: {
        userId,
        status: { [Op.in]: ["pending", "approved"] },
        fromDate: { [Op.lte]: to },
        toDate: { [Op.gte]: from },
      },
    });

    if (overlap) {
      return res.status(400).json({ message: "You already have a leave in this date range" });
    }

    const assignedTotal = toNumber(policyTotals[requestedType], 0);
    if (assignedTotal <= 0) {
      return res.status(400).json({
        message: `${toLeaveLabel(requestedType)} leave access is not assigned by admin`,
      });
    }

    const approvedLeaves = await Leave.findAll({
      where: { userId, status: "approved", type: requestedType },
      attributes: ["totalDays"],
    });

    const used = approvedLeaves.reduce((sum, l) => sum + (l.totalDays || 0), 0);
    const available = Math.max(0, assignedTotal - used);

    if (totalDays > available) {
      return res.status(400).json({
        message: `Insufficient ${toLeaveLabel(requestedType).toLowerCase()} leave balance`,
        available,
        requested: totalDays,
      });
    }

    const leave = await Leave.create({
      userId,
      type: requestedType,
      fromDate: from,
      toDate: to,
      totalDays,
      reason: reason || "",
      status: "pending",
    });

    res.status(201).json({ message: "Leave applied", leave: toLeaveJson(leave) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ✅ Employee → My Leaves (list)
const myLeaves = async (req, res) => {
  try {
    const userId = req.user._id;
    const leaves = await Leave.findAll({
      where: { userId },
      order: [["createdAt", "DESC"]],
    });
    res.json({ leaves: leaves.map(toLeaveJson) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ✅ Employee → Leave Summary (UI cards + balances)
const leaveSummary = async (req, res) => {
  try {
    const userId = req.user._id;
    const policyTotals = buildUserPolicyTotals(req.user);

    const [totalApplications, approvedCount, pendingCount] = await Promise.all([
      Leave.count({ where: { userId } }),
      Leave.count({ where: { userId, status: "approved" } }),
      Leave.count({ where: { userId, status: "pending" } }),
    ]);

    const approvedLeaves = await Leave.findAll({
      where: { userId, status: "approved" },
      attributes: ["type", "totalDays"],
    });

    const usedByType = { annual: 0, casual: 0, medical: 0, unpaid: 0 };
    for (const l of approvedLeaves) {
      const typeKey = getLeaveTypeKey(l.type);
      if (!typeKey || !Object.prototype.hasOwnProperty.call(usedByType, typeKey)) continue;
      usedByType[typeKey] += l.totalDays || 0;
    }

    const daysUsed = usedByType.annual + usedByType.casual + usedByType.medical + usedByType.unpaid;

    const balances = getAllBalanceTypes().map((typeKey) => {
      const used = usedByType[typeKey] || 0;
      const total = Math.max(0, toNumber(policyTotals[typeKey], 0));
      const left = Math.max(0, total - used);
      return {
        type: DISPLAY_TYPE_BY_STORAGE[typeKey] || typeKey,
        total,
        used,
        left,
        accessGranted: total > 0,
      };
    });

    res.json({
      cards: {
        totalApplications,
        approved: approvedCount,
        pending: pendingCount,
        daysUsed,
      },
      balances,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ✅ Manager/Admin → Pending Leaves (all)
const pendingLeaves = async (req, res) => {
  try {
    const leaves = await Leave.findAll({
      where: { status: "pending" },
      include: [{ model: User, as: "user", attributes: ["id", "name", "email", "role"] }],
      order: [["createdAt", "DESC"]],
    });

    const out = leaves.map((l) => {
      const o = toLeaveJson(l);
      if (l.user) o.user = { ...l.user.toJSON(), _id: l.user.id };
      return o;
    });

    res.json({ leaves: out });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ✅ Manager/Admin → Approve/Reject (with remark)
const updateLeaveStatus = async (req, res) => {
  try {
    const { leaveId } = req.params;
    const { status, remark } = req.body;

    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({ message: "status must be approved or rejected" });
    }

    const leave = await Leave.findByPk(leaveId);
    if (!leave) return res.status(404).json({ message: "Leave not found" });

    await leave.update({
      status,
      remark: remark || "",
      actionById: req.user._id,
      actionAt: new Date(),
    });

    res.json({ message: `Leave ${status}`, leave: toLeaveJson(leave) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  applyLeave,
  myLeaves,
  leaveSummary,
  pendingLeaves,
  updateLeaveStatus,
};
