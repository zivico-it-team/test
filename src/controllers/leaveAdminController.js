const { Op } = require("sequelize");
const Leave = require("../models/Leave");
const User = require("../models/User");

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
  adminLeaveSummary,
  adminLeaveList,
  clearLeaveRecords,
};
