const User = require("../models/User");
const LeaderboardPerformance = require("../models/LeaderboardPerformance");

const toNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const toNonNegativeInt = (value, fallback = 0) => {
  return Math.max(0, Math.trunc(toNumber(value, fallback)));
};

const getProgress = (achieved, target) => {
  if (!target) {
    return 0;
  }
  return Math.round((achieved / target) * 100);
};

const listLeaderboard = async (_req, res) => {
  try {
    const [employees, performances] = await Promise.all([
      User.findAll({
        where: { role: "employee" },
        attributes: ["id", "name", "email", "professional"],
        order: [["name", "ASC"]],
      }),
      LeaderboardPerformance.findAll({
        order: [["updatedAt", "DESC"]],
      }),
    ]);

    const perfMap = new Map(
      performances.map((perf) => [String(perf.employeeId), perf.toJSON()])
    );

    const items = employees.map((employee) => {
      const e = employee.toJSON();
      const perf = perfMap.get(String(e.id)) || {};
      const target = toNonNegativeInt(perf.target, 0);
      const achieved = toNonNegativeInt(perf.achieved, 0);
      const progress = getProgress(achieved, target);

      return {
        employeeId: e.id,
        _id: e.id,
        id: e.id,
        name: e.name || "Employee",
        email: e.email || "",
        employeeCode: e?.professional?.employeeId || "",
        designation: e?.professional?.designation || "",
        target,
        achieved,
        progress,
        updatedBy: perf.updatedBy || "",
        updatedAt: perf.updatedAt || null,
      };
    });

    const ranked = items
      .sort((left, right) => {
        if (right.progress !== left.progress) {
          return right.progress - left.progress;
        }
        if (right.achieved !== left.achieved) {
          return right.achieved - left.achieved;
        }
        return String(left.name || "").localeCompare(String(right.name || ""));
      })
      .map((item, index) => ({ ...item, position: index + 1 }));

    const totalTarget = ranked.reduce((sum, item) => sum + item.target, 0);
    const totalAchieved = ranked.reduce((sum, item) => sum + item.achieved, 0);
    const percentage = totalTarget > 0 ? Math.round((totalAchieved / totalTarget) * 100) : 0;

    return res.json({
      items: ranked,
      summary: {
        totalTarget,
        totalAchieved,
        percentage,
      },
    });
  } catch (err) {
    return res
      .status(500)
      .json({ message: err.message || "Failed to load leaderboard data" });
  }
};

const updatePerformance = async (req, res) => {
  try {
    const employeeId = String(req.body?.employeeId || "").trim();
    const hasTarget = req.body?.target !== undefined;
    const hasAchieved = req.body?.achieved !== undefined;

    if (!employeeId) {
      return res.status(400).json({ message: "employeeId is required" });
    }

    if (!hasTarget && !hasAchieved) {
      return res
        .status(400)
        .json({ message: "target or achieved value is required" });
    }

    const employee = await User.findOne({
      where: { id: employeeId, role: "employee" },
      attributes: ["id", "name", "email", "professional"],
    });

    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    const [performance] = await LeaderboardPerformance.findOrCreate({
      where: { employeeId },
      defaults: {
        employeeId,
        target: 0,
        achieved: 0,
        updatedBy:
          req.body?.updatedBy ||
          req.user?.name ||
          req.user?.userName ||
          req.user?.email ||
          "System",
      },
    });

    if (hasTarget) {
      performance.target = toNonNegativeInt(req.body.target, performance.target);
    }

    if (hasAchieved) {
      performance.achieved = toNonNegativeInt(req.body.achieved, performance.achieved);
    }

    performance.updatedBy =
      String(
        req.body?.updatedBy ||
          req.user?.name ||
          req.user?.userName ||
          req.user?.email ||
          "System"
      ).trim() || "System";

    await performance.save();

    const p = performance.toJSON();
    const e = employee.toJSON();

    return res.json({
      item: {
        employeeId: e.id,
        _id: e.id,
        id: e.id,
        name: e.name || "Employee",
        email: e.email || "",
        employeeCode: e?.professional?.employeeId || "",
        designation: e?.professional?.designation || "",
        target: p.target,
        achieved: p.achieved,
        progress: getProgress(p.achieved, p.target),
        updatedBy: p.updatedBy || "",
        updatedAt: p.updatedAt || null,
      },
    });
  } catch (err) {
    return res
      .status(500)
      .json({ message: err.message || "Failed to update leaderboard data" });
  }
};

module.exports = {
  listLeaderboard,
  updatePerformance,
};
