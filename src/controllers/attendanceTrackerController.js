const { Op } = require("sequelize");
const Attendance = require("../models/Attendance");
const Activity = require("../models/Activity");
const Leave = require("../models/Leave");
const User = require("../models/User");

// helpers
const pad2 = (n) => String(n).padStart(2, "0");
const toDateKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const startOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
const endOfDay = (d) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};

const isWeekend = (year, month1to12, day) => {
  const dt = new Date(year, month1to12 - 1, day);
  const w = dt.getDay(); // 0 Sun
  return w === 0;
};

const daysInMonth = (year, month1to12) => new Date(year, month1to12, 0).getDate();
const STANDARD_WORK_SECONDS = 8 * 60 * 60;
const BREAK_LIMIT_SECONDS = {
  tea_break: 20 * 60,
  lunch_break: 40 * 60,
};

const safeUser = (u) => {
  const o = typeof u.toJSON === "function" ? u.toJSON() : u;
  o._id = o.id;
  delete o.password;
  return o;
};

const getStatusLabel = (code) => {
  switch (code) {
    case "P":
      return "Present";
    case "A":
      return "Absent";
    case "L":
      return "Late";
    case "OL":
      return "On Leave";
    case "W":
      return "Weekend";
    default:
      return "No Record";
  }
};

const getActivityDurationSeconds = (activity) => {
  if (typeof activity?.durationSeconds === "number" && activity.durationSeconds > 0) {
    return activity.durationSeconds;
  }

  const start = activity?.startedAt ? new Date(activity.startedAt) : null;
  const end = activity?.endedAt ? new Date(activity.endedAt) : null;

  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 0;
  }

  return Math.max(0, Math.floor((end - start) / 1000));
};

const getEmployeeAttendanceStartDate = (employee) => {
  const rawCreatedAt = employee?.createdAt || employee?.created_at || null;
  const createdDate = rawCreatedAt ? new Date(rawCreatedAt) : null;
  if (!createdDate || Number.isNaN(createdDate.getTime())) {
    return null;
  }
  return startOfDay(createdDate);
};

const getTrackedDayWindow = ({ year, month, dim, startDate, today = new Date() }) => {
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;

  let endDay = dim;
  if (year > currentYear || (year === currentYear && month > currentMonth)) {
    endDay = 0;
  } else if (year === currentYear && month === currentMonth) {
    endDay = Math.min(dim, today.getDate());
  }

  if (endDay <= 0) {
    return { startDay: 0, endDay: 0 };
  }

  const monthEnd = startOfDay(new Date(year, month - 1, endDay));
  if (startDate && startDate.getTime() > monthEnd.getTime()) {
    return { startDay: 0, endDay: 0 };
  }

  let startDay = 1;
  if (startDate && startDate.getFullYear() === year && startDate.getMonth() + 1 === month) {
    startDay = startDate.getDate();
  }

  if (startDay > endDay) {
    return { startDay: 0, endDay: 0 };
  }

  return { startDay, endDay };
};

const buildBreakMap = (activities) => {
  const breakMap = new Map();

  for (const activity of activities) {
    const key = `${activity.userId}|${activity.dateKey}`;
    if (!breakMap.has(key)) {
      breakMap.set(key, {
        teaBreakStart: null,
        teaBreakEnd: null,
        teaBreakSeconds: 0,
        teaBreakExceededSeconds: 0,
        lunchBreakStart: null,
        lunchBreakEnd: null,
        lunchBreakSeconds: 0,
        lunchBreakExceededSeconds: 0,
      });
    }

    const entry = breakMap.get(key);
    const isTeaBreak = activity.type === "tea_break";
    const startKey = isTeaBreak ? "teaBreakStart" : "lunchBreakStart";
    const endKey = isTeaBreak ? "teaBreakEnd" : "lunchBreakEnd";
    const durationKey = isTeaBreak ? "teaBreakSeconds" : "lunchBreakSeconds";
    const exceededKey = isTeaBreak ? "teaBreakExceededSeconds" : "lunchBreakExceededSeconds";
    const limit = isTeaBreak ? BREAK_LIMIT_SECONDS.tea_break : BREAK_LIMIT_SECONDS.lunch_break;

    if (!entry[startKey] || new Date(activity.startedAt) < new Date(entry[startKey])) {
      entry[startKey] = activity.startedAt;
    }

    if (
      activity.endedAt &&
      (!entry[endKey] || new Date(activity.endedAt) > new Date(entry[endKey]))
    ) {
      entry[endKey] = activity.endedAt;
    }

    entry[durationKey] += getActivityDurationSeconds(activity);
    entry[exceededKey] = Math.max(0, entry[durationKey] - limit);
  }

  return breakMap;
};

const buildMonthlyTrackerData = async ({ year, month, search }) => {
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  const dim = daysInMonth(year, month);
  const todayKey = toDateKey(new Date());

  const allEmployees = await User.findAll({
    where: { role: "employee" },
    attributes: ["id", "name", "email", "userName", "createdAt"],
    order: [["name", "ASC"]],
  });

  const employees = search
    ? allEmployees.filter((u) => {
        const s = `${u.name} ${u.email} ${u.userName}`.toLowerCase();
        return s.includes(search);
      })
    : allEmployees;

  const empIds = employees.map((u) => u.id);

  if (empIds.length === 0) {
    return { year, month, rows: [], detailRows: [] };
  }

  const [atts, leaves, activities] = await Promise.all([
    Attendance.findAll({
      where: {
        userId: { [Op.in]: empIds },
        dateKey: { [Op.gte]: toDateKey(start), [Op.lte]: toDateKey(end) },
      },
      attributes: ["userId", "dateKey", "checkInAt", "checkOutAt", "totalWorkedSeconds", "isLate"],
    }),
    Leave.findAll({
      where: {
        userId: { [Op.in]: empIds },
        status: "approved",
        fromDate: { [Op.lte]: end },
        toDate: { [Op.gte]: start },
      },
      attributes: ["userId", "fromDate", "toDate", "type", "reason"],
    }),
    Activity.findAll({
      where: {
        userId: { [Op.in]: empIds },
        dateKey: { [Op.gte]: toDateKey(start), [Op.lte]: toDateKey(end) },
        type: { [Op.in]: ["tea_break", "lunch_break"] },
      },
      order: [["startedAt", "ASC"]],
      attributes: ["userId", "dateKey", "type", "startedAt", "endedAt", "durationSeconds"],
    }),
  ]);

  const attMap = new Map();
  for (const a of atts) attMap.set(`${a.userId}|${a.dateKey}`, a);

  const leaveRanges = new Map();
  for (const l of leaves) {
    const k = l.userId;
    if (!leaveRanges.has(k)) leaveRanges.set(k, []);
    leaveRanges.get(k).push({
      from: l.fromDate,
      to: l.toDate,
      type: l.type,
      reason: l.reason || "",
    });
  }

  const getLeaveForDate = (userId, dt) => {
    const ranges = leaveRanges.get(userId);
    if (!ranges) return null;
    const t = dt.getTime();
    for (const r of ranges) {
      if (t >= startOfDay(r.from).getTime() && t <= endOfDay(r.to).getTime()) {
        return r;
      }
    }
    return null;
  };

  const breakMap = buildBreakMap(activities);

  const detailRows = [];

  const rows = employees.map((emp) => {
    const uid = emp.id;
    const employeeStartDate = getEmployeeAttendanceStartDate(emp);
    const { startDay: trackedStartDay, endDay: trackedLastDay } = getTrackedDayWindow({
      year,
      month,
      dim,
      startDate: employeeStartDate,
    });
    const days = {};
    let P = 0;
    let A = 0;
    let overtimeSeconds = 0;
    let excessBreakSeconds = 0;

    for (let day = 1; day <= dim; day++) {
      const dt = new Date(year, month - 1, day);
      const dk = toDateKey(dt);
      const key = `${uid}|${dk}`;
      const leaveInfo = getLeaveForDate(uid, dt);

      let statusCode = "-";

      if (trackedStartDay === 0 || day < trackedStartDay || day > trackedLastDay) {
        statusCode = "-";
      } else if (leaveInfo) {
        statusCode = "OL";
      } else if (isWeekend(year, month, day)) {
        statusCode = "W";
      } else if (dk <= todayKey) {
        const att = attMap.get(key);
        if (!att || !att.checkInAt) {
          statusCode = "A";
          A++;
        } else {
          statusCode = att.isLate ? "L" : "P";
          P++;
        }
      }

      days[String(day)] = statusCode;

      if (statusCode === "-") {
        continue;
      }

      const attendance = attMap.get(key);
      const breaks = breakMap.get(key) || {};
      const workedSeconds = attendance?.totalWorkedSeconds || 0;
      const dailyOvertimeSeconds = Math.max(0, workedSeconds - STANDARD_WORK_SECONDS);
      const dailyExcessBreakSeconds =
        (breaks.teaBreakExceededSeconds || 0) + (breaks.lunchBreakExceededSeconds || 0);

      overtimeSeconds += dailyOvertimeSeconds;
      excessBreakSeconds += dailyExcessBreakSeconds;

      detailRows.push({
        userId: uid,
        name: emp.name,
        email: emp.email,
        userName: emp.userName,
        dateKey: dk,
        statusCode,
        statusLabel: getStatusLabel(statusCode),
        checkInAt: attendance?.checkInAt || null,
        checkOutAt: attendance?.checkOutAt || null,
        totalWorkedSeconds: workedSeconds,
        overtimeSeconds: dailyOvertimeSeconds,
        excessBreakSeconds: dailyExcessBreakSeconds,
        isLate: Boolean(attendance?.isLate),
        teaBreakStart: breaks.teaBreakStart || null,
        teaBreakEnd: breaks.teaBreakEnd || null,
        teaBreakSeconds: breaks.teaBreakSeconds || 0,
        teaBreakExceededSeconds: breaks.teaBreakExceededSeconds || 0,
        lunchBreakStart: breaks.lunchBreakStart || null,
        lunchBreakEnd: breaks.lunchBreakEnd || null,
        lunchBreakSeconds: breaks.lunchBreakSeconds || 0,
        lunchBreakExceededSeconds: breaks.lunchBreakExceededSeconds || 0,
        leaveType: leaveInfo?.type || "",
        leaveReason: leaveInfo?.reason || "",
      });
    }

    return {
      userId: uid,
      name: emp.name,
      email: emp.email,
      userName: emp.userName,
      days,
      P,
      A,
      overtimeSeconds,
      excessBreakSeconds,
    };
  });

  return { year, month, rows, detailRows };
};

/**
 * GET /api/attendance-tracker/monthly?year=2026&month=2&search=
 */
const monthlyGrid = async (req, res) => {
  try {
    const year = Number(req.query.year);
    const month = Number(req.query.month); // 1-12
    const search = (req.query.search || "").trim().toLowerCase();

    if (!year || !month || month < 1 || month > 12) {
      return res.status(400).json({ message: "year and month required (month 1-12)" });
    }
    const { rows } = await buildMonthlyTrackerData({ year, month, search });
    res.json({ year, month, rows });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * GET /api/attendance-tracker/export?year=2026&month=2&search=
 */
const monthlyExport = async (req, res) => {
  try {
    const year = Number(req.query.year);
    const month = Number(req.query.month);
    const search = (req.query.search || "").trim().toLowerCase();

    if (!year || !month || month < 1 || month > 12) {
      return res.status(400).json({ message: "year and month required (month 1-12)" });
    }

    const data = await buildMonthlyTrackerData({ year, month, search });
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * GET /api/attendance-tracker/details?userId=...&date=YYYY-MM-DD
 */
const dayDetails = async (req, res) => {
  try {
    const { userId, date } = req.query;

    if (!userId || !date) return res.status(400).json({ message: "userId and date required" });

    const dt = new Date(date);
    if (Number.isNaN(dt.getTime())) return res.status(400).json({ message: "Invalid date" });

    const dk = toDateKey(dt);

    const [emp, att, acts, leave] = await Promise.all([
      User.findByPk(userId, { attributes: ["id", "name", "email", "userName"] }),
      Attendance.findOne({
        where: { userId, dateKey: dk },
        attributes: ["checkInAt", "checkOutAt", "totalWorkedSeconds", "isLate"],
      }),
      Activity.findAll({
        where: { userId, dateKey: dk, type: { [Op.in]: ["tea_break", "lunch_break"] } },
        order: [["startedAt", "ASC"]],
        attributes: ["userId", "dateKey", "type", "startedAt", "endedAt", "durationSeconds", "isActive"],
      }),
      Leave.findOne({
        where: {
          userId,
          status: "approved",
          fromDate: { [Op.lte]: endOfDay(dt) },
          toDate: { [Op.gte]: startOfDay(dt) },
        },
        attributes: ["id", "type", "fromDate", "toDate", "reason"],
      }),
    ]);

    if (!emp) return res.status(404).json({ message: "Employee not found" });

    const breakSummary = buildBreakMap(
      acts.map((activity) => ({
        ...activity.toJSON(),
        userId,
        dateKey: dk,
      }))
    ).get(`${userId}|${dk}`) || {
      teaBreakStart: null,
      teaBreakEnd: null,
      teaBreakSeconds: 0,
      teaBreakExceededSeconds: 0,
      lunchBreakStart: null,
      lunchBreakEnd: null,
      lunchBreakSeconds: 0,
      lunchBreakExceededSeconds: 0,
    };

    const totalWorkedSeconds = att?.totalWorkedSeconds || 0;
    const overtimeSeconds = Math.max(0, totalWorkedSeconds - STANDARD_WORK_SECONDS);

    res.json({
      employee: { ...emp.toJSON(), _id: emp.id },
      dateKey: dk,
      attendance: {
        checkInAt: att?.checkInAt || null,
        checkOutAt: att?.checkOutAt || null,
        totalWorkedSeconds,
        overtimeSeconds,
        isLate: att?.isLate || false,
      },
      teaBreak: {
        start: breakSummary.teaBreakStart,
        end: breakSummary.teaBreakEnd,
        durationSeconds: breakSummary.teaBreakSeconds || 0,
        exceededSeconds: breakSummary.teaBreakExceededSeconds || 0,
        isActive: acts.some((activity) => activity.type === "tea_break" && activity.isActive),
      },
      lunchBreak: {
        start: breakSummary.lunchBreakStart,
        end: breakSummary.lunchBreakEnd,
        durationSeconds: breakSummary.lunchBreakSeconds || 0,
        exceededSeconds: breakSummary.lunchBreakExceededSeconds || 0,
        isActive: acts.some((activity) => activity.type === "lunch_break" && activity.isActive),
      },
      excessBreakSeconds:
        (breakSummary.teaBreakExceededSeconds || 0) + (breakSummary.lunchBreakExceededSeconds || 0),
      breakLimits: {
        teaBreakSeconds: BREAK_LIMIT_SECONDS.tea_break,
        lunchBreakSeconds: BREAK_LIMIT_SECONDS.lunch_break,
      },
      leave: leave
        ? {
            id: leave.id,
            leaveType: leave.type,
            fromDate: leave.fromDate,
            toDate: leave.toDate,
            reason: leave.reason || "",
          }
        : null,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { monthlyGrid, monthlyExport, dayDetails };
