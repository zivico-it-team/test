const ItDailyWork = require("../models/ItDailyWork");

const value = (item) => String(item || "").trim().toLowerCase();
const professionalOf = (user) => {
  if (user?.professional && typeof user.professional === "object") return user.professional;
  try { return JSON.parse(user?.professional || "{}"); } catch (_) { return {}; }
};
const departmentOf = (user) => value(professionalOf(user).department || professionalOf(user).teamName || user?.department);
const isItEmployee = (user) => value(user?.role) === "employee" && departmentOf(user) === "it";
const canReviewAll = (user) => ["admin", "master"].includes(value(user?.role)) || (value(user?.role) === "manager" && departmentOf(user) === "it");
const hasAccess = (user) => isItEmployee(user) || canReviewAll(user);
const requireAccess = (req, res) => {
  if (!hasAccess(req.user)) { res.status(403).json({ message: "IT Daily Work is restricted to IT employees and authorized reviewers" }); return false; }
  return true;
};

const listWork = async (req, res) => {
  if (!requireAccess(req, res)) return;
  try {
    const where = canReviewAll(req.user) ? {} : { submittedById: req.user.id };
    const records = await ItDailyWork.findAll({ where, order: [["workDate", "DESC"], ["createdAt", "DESC"]] });
    res.json(records);
  } catch (_) { res.status(500).json({ message: "Failed to load IT daily work" }); }
};

const createWork = async (req, res) => {
  if (!requireAccess(req, res)) return;
  if (!isItEmployee(req.user)) return res.status(403).json({ message: "Only IT employees can submit daily work" });
  const workDate = String(req.body?.workDate || "").trim();
  const workItems = (Array.isArray(req.body?.workItems) ? req.body.workItems : []).map((item) => String(item || "").trim()).filter(Boolean);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate) || !workItems.length) return res.status(400).json({ message: "Choose a work date and enter at least one work item" });
  if (workItems.length > 100) return res.status(400).json({ message: "A maximum of 100 work items can be submitted at once" });
  try {
    const record = await ItDailyWork.create({ submittedById: req.user.id, submittedByName: req.user.name || req.user.userName || "IT employee", workDate, workItems });
    res.status(201).json(record);
  } catch (_) { res.status(500).json({ message: "Failed to submit IT daily work" }); }
};

module.exports = { listWork, createWork };
