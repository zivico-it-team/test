const User = require("../models/User");
const LeaderboardPerformance = require("../models/LeaderboardPerformance");
const LeaderboardRankingHistory = require("../models/LeaderboardRankingHistory");
const LeaderboardMonthlyCycle = require("../models/LeaderboardMonthlyCycle");
const { sequelize } = require("../config/db");
const { matchesEmploymentStatus } = require("../utils/employmentStatus");

const toNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const toNonNegativeInt = (value, fallback = 0) => {
  return Math.max(0, Math.trunc(toNumber(value, fallback)));
};

const parseProfessional = (value) => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed
        : {};
    } catch (_error) {
      return {};
    }
  }

  return {};
};

const getProgress = (achieved, target) => {
  if (!target) {
    return 0;
  }
  return Math.round((achieved / target) * 100);
};

const normalizeValue = (value) => String(value || "").trim().toLowerCase();

const getProfessional = (user) => parseProfessional(user?.professional);

const getDepartment = (user) =>
  getProfessional(user)?.department ||
  getProfessional(user)?.teamName ||
  user?.department ||
  "";

const getMonthKeyForDate = (value) => {
  if (!value) {
    return "";
  }

  const rawValue = String(value).trim();
  const dateOnlyMatch = rawValue.match(/^(\d{4})-(\d{2})-\d{2}$/);
  if (dateOnlyMatch) {
    return `${dateOnlyMatch[1]}-${dateOnlyMatch[2]}`;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.APP_TIMEZONE || "Asia/Colombo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return year && month ? `${year}-${month}` : "";
};

const wasInactivatedInMonth = (user, monthKey) => {
  const inactiveDate = getProfessional(user)?.resignedDate || user?.updatedAt;
  return getMonthKeyForDate(inactiveDate) === monthKey;
};

const isSalesEmployee = (user) => {
  const role = normalizeValue(user?.role);
  const department = normalizeValue(getDepartment(user));
  return role === "employee" && (department === "sales" || department.includes("sales"));
};

const getRankedLeaderboard = async (
  transaction,
  employmentStatus = "active",
  inactiveMonthKey = ""
) => {
  const [employees, performances] = await Promise.all([
      User.findAll({
        where: { role: "employee" },
        attributes: ["id", "name", "email", "role", "professional", "updatedAt"],
        order: [["name", "ASC"]],
        transaction,
      }),
      LeaderboardPerformance.findAll({
        order: [["updatedAt", "DESC"]],
        transaction,
      }),
  ]);

  const perfMap = new Map(
    performances.map((perf) => [String(perf.employeeId), perf.toJSON()])
  );

  const items = employees
    .map((employee) => employee.toJSON())
    .filter((employee) => matchesEmploymentStatus(employee, employmentStatus))
    .filter(
      (employee) =>
        !inactiveMonthKey || wasInactivatedInMonth(employee, inactiveMonthKey)
    )
    .filter(isSalesEmployee)
    .map((employee) => {
      const perf = perfMap.get(String(employee.id)) || {};
      const target = toNonNegativeInt(perf.target, 0);
      const achieved = toNonNegativeInt(perf.achieved, 0);
      const progress = getProgress(achieved, target);

      return {
        employeeId: employee.id,
        _id: employee.id,
        id: employee.id,
        name: employee.name || "Employee",
        email: employee.email || "",
        role: employee.role || "employee",
        employeeCode: getProfessional(employee)?.employeeId || "",
        designation: getProfessional(employee)?.designation || "",
        department: getDepartment(employee),
        employmentStatus,
        resignedDate: getProfessional(employee)?.resignedDate || null,
        employeeUpdatedAt: employee.updatedAt || null,
        target,
        achieved,
        progress,
        updatedBy: perf.updatedBy || "",
        updatedAt: perf.updatedAt || null,
      };
    });

  return items
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
};

const normalizeMonthKey = (value) => {
  const monthKey = String(value || "").trim();
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey) ? monthKey : "";
};

const getCurrentMonthKey = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.APP_TIMEZONE || "Asia/Colombo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return `${year}-${month}`;
};

const archiveRankings = async ({
  monthKey,
  ranked,
  savedBy,
  transaction,
}) => {
  if (ranked.length === 0) {
    return 0;
  }

  await LeaderboardRankingHistory.bulkCreate(
    ranked.map((item) => ({
      monthKey,
      employeeId: item.employeeId,
      employeeName: item.name,
      employeeCode: item.employeeCode,
      designation: item.designation,
      rank: item.position,
      target: item.target,
      achieved: item.achieved,
      progress: item.progress,
      savedBy,
    })),
    {
      transaction,
      ignoreDuplicates: true,
    }
  );

  return ranked.length;
};

const ensureLeaderboardMonthRollover = async () => {
  const currentMonthKey = getCurrentMonthKey();

  return sequelize.transaction(async (transaction) => {
    const [cycle] = await LeaderboardMonthlyCycle.findOrCreate({
      where: { id: "leaderboard" },
      defaults: {
        id: "leaderboard",
        activeMonthKey: currentMonthKey,
        lastProcessedAt: new Date(),
      },
      transaction,
    });

    const lockedCycle = await LeaderboardMonthlyCycle.findByPk(cycle.id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!lockedCycle || lockedCycle.activeMonthKey === currentMonthKey) {
      return { rolledOver: false, currentMonthKey };
    }

    const archivedMonthKey = lockedCycle.activeMonthKey;
    const [activeRanked, inactiveRanked] = await Promise.all([
      getRankedLeaderboard(transaction),
      getRankedLeaderboard(transaction, "inactive", archivedMonthKey),
    ]);
    const archivedEmployeeMap = new Map();
    [...activeRanked, ...inactiveRanked].forEach((item) => {
      archivedEmployeeMap.set(String(item.employeeId), item);
    });
    const ranked = Array.from(archivedEmployeeMap.values())
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
    const archivedCount = await archiveRankings({
      monthKey: archivedMonthKey,
      ranked,
      savedBy: "Automatic month-end archive",
      transaction,
    });

    lockedCycle.activeMonthKey = currentMonthKey;
    lockedCycle.lastProcessedAt = new Date();
    await lockedCycle.save({ transaction });

    return {
      rolledOver: true,
      archivedMonthKey,
      archivedCount,
      currentMonthKey,
    };
  });
};

let monthlyRolloverTimer = null;

const startLeaderboardMonthRolloverScheduler = () => {
  if (monthlyRolloverTimer) {
    return;
  }

  const runRollover = () => {
    ensureLeaderboardMonthRollover()
      .then((result) => {
        if (result.rolledOver) {
          console.log(
            `Leaderboard ${result.archivedMonthKey} archived automatically for ${result.currentMonthKey}`
          );
        }
      })
      .catch((error) => {
        console.error("Automatic leaderboard month rollover failed", error);
      });
  };

  runRollover();
  monthlyRolloverTimer = setInterval(runRollover, 5 * 60 * 1000);
  monthlyRolloverTimer.unref?.();
};

const listLeaderboard = async (_req, res) => {
  try {
    await ensureLeaderboardMonthRollover();
    const [ranked, inactiveRanked] = await Promise.all([
      getRankedLeaderboard(),
      getRankedLeaderboard(undefined, "inactive", getCurrentMonthKey()),
    ]);
    const currentMonthItems = [...ranked, ...inactiveRanked];
    const totalTarget = currentMonthItems.reduce(
      (sum, item) => sum + item.target,
      0
    );
    const totalAchieved = currentMonthItems.reduce(
      (sum, item) => sum + item.achieved,
      0
    );
    const percentage = totalTarget > 0 ? Math.round((totalAchieved / totalTarget) * 100) : 0;

    return res.json({
      items: ranked,
      inactiveItems: inactiveRanked,
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

const getActorName = (req) =>
  String(
    req.body?.savedBy ||
      req.body?.updatedBy ||
      req.user?.name ||
      req.user?.userName ||
      req.user?.email ||
      "System"
  ).trim() || "System";

const listRankingHistory = async (req, res) => {
  try {
    const requestedMonth = req.query?.monthKey;
    const monthKey = requestedMonth ? normalizeMonthKey(requestedMonth) : "";

    if (requestedMonth && !monthKey) {
      return res.status(400).json({ message: "monthKey must use YYYY-MM format" });
    }

    const rows = await LeaderboardRankingHistory.findAll({
      ...(monthKey ? { where: { monthKey } } : {}),
      order: [
        ["monthKey", "DESC"],
        ["rank", "ASC"],
      ],
    });

    const items = rows.map((row) => {
      const item = row.toJSON();
      return {
        ...item,
        position: item.rank,
        name: item.employeeName,
      };
    });
    const months = Array.from(new Set(items.map((item) => item.monthKey)));

    return res.json({ months, items });
  } catch (err) {
    return res
      .status(500)
      .json({ message: err.message || "Failed to load ranking history" });
  }
};

const resetMonthlyAchieved = async (req, res) => {
  try {
    await ensureLeaderboardMonthRollover();
    const updatedBy = getActorName(req);
    const [updatedCount] = await LeaderboardPerformance.update(
      { achieved: 0, updatedBy },
      { where: {} }
    );

    return res.json({
      message: "Monthly achieved values reset successfully",
      updatedCount,
    });
  } catch (err) {
    return res
      .status(500)
      .json({ message: err.message || "Failed to reset monthly achieved values" });
  }
};

const updatePerformance = async (req, res) => {
  try {
    await ensureLeaderboardMonthRollover();
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
      attributes: ["id", "name", "email", "role", "professional"],
    });

    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    if (!isSalesEmployee(employee.toJSON())) {
      return res.status(400).json({
        message: "Only Sales department employee accounts can be updated in leaderboard",
      });
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
        role: e.role || "employee",
        employeeCode: getProfessional(e)?.employeeId || "",
        designation: getProfessional(e)?.designation || "",
        department: getDepartment(e),
        employmentStatus: matchesEmploymentStatus(e, "inactive") ? "inactive" : "active",
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
  ensureLeaderboardMonthRollover,
  listLeaderboard,
  listRankingHistory,
  resetMonthlyAchieved,
  startLeaderboardMonthRolloverScheduler,
  updatePerformance,
};
