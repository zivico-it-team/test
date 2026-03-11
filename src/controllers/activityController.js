const { Op } = require("sequelize");
const Activity = require("../models/Activity");
const Attendance = require("../models/Attendance");

const getDateKey = (d = new Date()) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const getMonthPrefix = (year, month) => {
  const mm = String(month).padStart(2, "0");
  return `${year}-${mm}-`;
};

const toActivityJson = (a) => {
  const o = typeof a.toJSON === "function" ? a.toJSON() : a;
  o._id = o.id;
  o.user = o.userId;
  return o;
};

// POST /api/activity/start
exports.startActivity = async (req, res) => {
  try {
    const userId = req.user._id;
    const { type } = req.body;
    const dateKey = getDateKey();

    if (!type) return res.status(400).json({ message: "type is required" });

    const attendance = await Attendance.findOne({ where: { userId, dateKey } });
    if (!attendance?.checkInAt || attendance?.checkOutAt) {
      return res.status(400).json({ message: "Please check in first" });
    }

    const active = await Activity.findOne({ where: { userId, dateKey, isActive: true } });
    if (active) {
      return res.status(400).json({ message: "Another activity is already active", active: toActivityJson(active) });
    }

    const activity = await Activity.create({
      userId,
      dateKey,
      type,
      startedAt: new Date(),
      isActive: true,
    });

    res.status(201).json({ message: "Activity started", activity: toActivityJson(activity) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/activity/end
exports.endActivity = async (req, res) => {
  try {
    const userId = req.user._id;
    const dateKey = getDateKey();

    const active = await Activity.findOne({ where: { userId, dateKey, isActive: true } });
    if (!active) return res.status(400).json({ message: "No active activity" });

    const now = new Date();
    await active.update({
      endedAt: now,
      durationSeconds: Math.max(0, Math.floor((now - new Date(active.startedAt)) / 1000)),
      isActive: false,
    });

    res.json({ message: "Activity ended", activity: toActivityJson(active) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/activity/today
exports.todayActivities = async (req, res) => {
  try {
    const userId = req.user._id;
    const dateKey = getDateKey();

    const activities = await Activity.findAll({
      where: { userId, dateKey },
      order: [["createdAt", "DESC"]],
    });

    const list = activities.map(toActivityJson);
    const active = list.find((a) => a.isActive) || null;

    res.json({ dateKey, active, activities: list });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/activity/month?year=YYYY&month=M
exports.monthActivities = async (req, res) => {
  try {
    const userId = req.user._id;
    const year = Number(req.query.year);
    const month = Number(req.query.month);

    if (!year || !month || month < 1 || month > 12) {
      return res.status(400).json({ message: "year and month are required" });
    }

    const prefix = getMonthPrefix(year, month);

    const activities = await Activity.findAll({
      where: {
        userId,
        dateKey: { [Op.like]: `${prefix}%` },
      },
      order: [["createdAt", "DESC"]],
    });

    const list = activities.map(toActivityJson);
    const active = list.find((a) => a.isActive) || null;

    res.json({ year, month, active, activities: list });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/activity/:id
exports.deleteActivity = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;

    const activity = await Activity.findOne({ where: { id, userId } });
    if (!activity) return res.status(404).json({ message: "Activity not found" });

    if (activity.isActive) {
      return res.status(400).json({ message: "Cannot delete an active activity. End it first." });
    }

    await Activity.destroy({ where: { id } });
    res.json({ message: "Activity deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
