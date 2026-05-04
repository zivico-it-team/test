const { Op } = require("sequelize");
const Attendance = require("../models/Attendance");
const Activity = require("../models/Activity");
const Leave = require("../models/Leave");
const User = require("../models/User");
const { toPlainObject } = require("../utils/userNormalizer");
const {
  getAppointmentDate,
  getEmploymentStatus,
  getResignedDate,
  matchesEmploymentStatus,
  normalizeEmploymentStatusFilter,
} = require("../utils/employmentStatus");

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
  prayer_time: 70 * 60,
  meeting: 0,
};
const ACTIVITY_EXPORT_TYPES = ["tea_break", "lunch_break", "prayer_time", "meeting"];
const ACTIVITY_BREAK_FIELDS = {
  tea_break: {
    startKey: "teaBreakStart",
    endKey: "teaBreakEnd",
    durationKey: "teaBreakSeconds",
    exceededKey: "teaBreakExceededSeconds",
  },
  lunch_break: {
    startKey: "lunchBreakStart",
    endKey: "lunchBreakEnd",
    durationKey: "lunchBreakSeconds",
    exceededKey: "lunchBreakExceededSeconds",
  },
  prayer_time: {
    startKey: "prayerTimeStart",
    endKey: "prayerTimeEnd",
    durationKey: "prayerTimeSeconds",
    exceededKey: "prayerTimeExceededSeconds",
  },
  meeting: {
    startKey: "meetingStart",
    endKey: "meetingEnd",
    durationKey: "meetingSeconds",
    exceededKey: "meetingExceededSeconds",
  },
};

const createEmptyBreakSummary = () => ({
  teaBreakStart: null,
  teaBreakEnd: null,
  teaBreakSeconds: 0,
  teaBreakExceededSeconds: 0,
  lunchBreakStart: null,
  lunchBreakEnd: null,
  lunchBreakSeconds: 0,
  lunchBreakExceededSeconds: 0,
  prayerTimeStart: null,
  prayerTimeEnd: null,
  prayerTimeSeconds: 0,
  prayerTimeExceededSeconds: 0,
  meetingStart: null,
  meetingEnd: null,
  meetingSeconds: 0,
  meetingExceededSeconds: 0,
});

const safeUser = (u) => {
  const o = typeof u.toJSON === "function" ? u.toJSON() : u;
  o._id = o.id;
  delete o.password;
  return o;
};

const normalizeText = (value) => String(value || "").trim().toLowerCase();

const getDepartmentScopeForManager = (viewer) => {
  if (normalizeText(viewer?.role) !== "manager") {
    return null;
  }

  const professional = toPlainObject(viewer?.professional, {});
  const department = normalizeText(professional.department);
  const teamName = normalizeText(professional.teamName);
  const managerKeys = [
    viewer?.id,
    viewer?._id,
    viewer?.name,
    viewer?.email,
    viewer?.userName,
    professional.employeeId,
  ]
    .map(normalizeText)
    .filter(Boolean);
  const values = [department, teamName].filter(Boolean);

  return {
    isScoped: true,
    values: new Set(values),
    managerKeys: new Set(managerKeys),
    label: professional.department || professional.teamName || "",
  };
};

const employeeMatchesDepartmentScope = (employee, scope) => {
  if (!scope?.isScoped) {
    return true;
  }

  if (!scope.values.size) {
    return false;
  }

  const professional = toPlainObject(employee?.professional, {});
  const reportingManager = normalizeText(professional.reportingManager);
  if (reportingManager && scope.managerKeys?.has(reportingManager)) {
    return true;
  }

  const employeeValues = [
    professional.department,
    professional.teamName,
    employee?.department,
  ]
    .map(normalizeText)
    .filter(Boolean);

  return employeeValues.some((value) => scope.values.has(value));
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
  const appointmentDate = getAppointmentDate(employee);
  if (appointmentDate) {
    return startOfDay(appointmentDate);
  }

  const rawCreatedAt = employee?.createdAt || employee?.created_at || null;
  const createdDate = rawCreatedAt ? new Date(rawCreatedAt) : null;
  if (!createdDate || Number.isNaN(createdDate.getTime())) {
    return null;
  }
  return startOfDay(createdDate);
};

const getEmployeeAttendanceEndDate = (employee) => {
  const resignedDate = getResignedDate(employee);
  return resignedDate ? startOfDay(resignedDate) : null;
};

const getTrackedDayWindow = ({
  year,
  month,
  dim,
  startDate,
  endDate,
  today = new Date(),
  includeFutureMonths = false,
}) => {
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;

  let endDay = dim;
  if (year > currentYear || (year === currentYear && month > currentMonth)) {
    endDay = includeFutureMonths ? dim : 0;
  } else if (year === currentYear && month === currentMonth && !includeFutureMonths) {
    endDay = Math.min(dim, today.getDate());
  }

  if (endDay <= 0) {
    return { startDay: 0, endDay: 0 };
  }

  if (endDate && endDate.getFullYear() === year && endDate.getMonth() + 1 === month) {
    endDay = Math.min(endDay, endDate.getDate());
  }

  const monthStart = startOfDay(new Date(year, month - 1, 1));
  const monthEnd = startOfDay(new Date(year, month - 1, endDay));
  if (
    (startDate && startDate.getTime() > monthEnd.getTime()) ||
    (endDate && endDate.getTime() < monthStart.getTime())
  ) {
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
      breakMap.set(key, createEmptyBreakSummary());
    }

    const config = ACTIVITY_BREAK_FIELDS[activity.type];
    if (!config) {
      continue;
    }

    const entry = breakMap.get(key);
    const { startKey, endKey, durationKey, exceededKey } = config;
    const limit = BREAK_LIMIT_SECONDS[activity.type] || 0;

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
    entry[exceededKey] = limit > 0 ? Math.max(0, entry[durationKey] - limit) : 0;
  }

  return breakMap;
};

const buildMonthlyTrackerData = async ({
  year,
  month,
  search,
  employmentStatus = "active",
  viewer = null,
}) => {
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  const dim = daysInMonth(year, month);
  const todayKey = toDateKey(new Date());
  const employmentStatusFilter = normalizeEmploymentStatusFilter(employmentStatus, "active");
  const departmentScope = getDepartmentScopeForManager(viewer);

  const allEmployees = await User.findAll({
    where: { role: "employee" },
    attributes: ["id", "name", "email", "userName", "professional", "createdAt"],
    order: [["name", "ASC"]],
  });

  const employees = allEmployees.filter((u) => {
    const user = typeof u.toJSON === "function" ? u.toJSON() : u;
    const professional = toPlainObject(user.professional, {});

    if (!matchesEmploymentStatus(user, employmentStatusFilter)) {
      return false;
    }

    if (!employeeMatchesDepartmentScope(user, departmentScope)) {
      return false;
    }

    if (!search) {
      return true;
    }

    const s = [
      user.name,
      user.email,
      user.userName,
      professional.employeeId,
      professional.department,
      professional.teamName,
      professional.designation,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return s.includes(search);
  });

  const empIds = employees.map((u) => u.id);

  if (empIds.length === 0) {
    return {
      year,
      month,
      rows: [],
      detailRows: [],
      scope: departmentScope?.isScoped
        ? { type: "department", label: departmentScope.label }
        : null,
    };
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
        type: { [Op.in]: ACTIVITY_EXPORT_TYPES },
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
    const employee = typeof emp.toJSON === "function" ? emp.toJSON() : emp;
    const professional = toPlainObject(employee.professional, {});
    const uid = employee.id;
    const employeeStartDate = getEmployeeAttendanceStartDate(employee);
    const employeeEndDate = getEmployeeAttendanceEndDate(employee);
    const employeeStatus = getEmploymentStatus(employee);
    const { startDay: trackedStartDay, endDay: trackedLastDay } = getTrackedDayWindow({
      year,
      month,
      dim,
      startDate: employeeStartDate,
      endDate: employeeEndDate,
      includeFutureMonths: true,
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

      if (trackedStartDay === 0 || day < trackedStartDay) {
        statusCode = "-";
      } else if (leaveInfo) {
        statusCode = "OL";
      } else if (dk > todayKey || day > trackedLastDay) {
        statusCode = "-";
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
        (breaks.teaBreakExceededSeconds || 0) +
        (breaks.lunchBreakExceededSeconds || 0) +
        (breaks.prayerTimeExceededSeconds || 0) +
        (breaks.meetingExceededSeconds || 0);

      overtimeSeconds += dailyOvertimeSeconds;
      excessBreakSeconds += dailyExcessBreakSeconds;

      detailRows.push({
        userId: uid,
        name: employee.name,
        email: employee.email,
        userName: employee.userName,
        employeeId: professional.employeeId || "",
        department: professional.department || "",
        designation: professional.designation || "",
        employmentStatus: employeeStatus,
        appointmentDate: professional.appointmentDate || null,
        resignedDate: professional.resignedDate || null,
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
        prayerTimeStart: breaks.prayerTimeStart || null,
        prayerTimeEnd: breaks.prayerTimeEnd || null,
        prayerTimeSeconds: breaks.prayerTimeSeconds || 0,
        prayerTimeExceededSeconds: breaks.prayerTimeExceededSeconds || 0,
        meetingStart: breaks.meetingStart || null,
        meetingEnd: breaks.meetingEnd || null,
        meetingSeconds: breaks.meetingSeconds || 0,
        meetingExceededSeconds: breaks.meetingExceededSeconds || 0,
        leaveType: leaveInfo?.type || "",
        leaveReason: leaveInfo?.reason || "",
      });
    }

    return {
      userId: uid,
      name: employee.name,
      email: employee.email,
      userName: employee.userName,
      employeeId: professional.employeeId || "",
      department: professional.department || "",
      designation: professional.designation || "",
      employmentStatus: employeeStatus,
      appointmentDate: professional.appointmentDate || null,
      resignedDate: professional.resignedDate || null,
      days,
      P,
      A,
      overtimeSeconds,
      excessBreakSeconds,
    };
  });

  return {
    year,
    month,
    rows,
    detailRows,
    scope: departmentScope?.isScoped
      ? { type: "department", label: departmentScope.label }
      : null,
  };
};

/**
 * GET /api/attendance-tracker/monthly?year=2026&month=2&search=
 */
const monthlyGrid = async (req, res) => {
  try {
    const year = Number(req.query.year);
    const month = Number(req.query.month); // 1-12
    const search = (req.query.search || "").trim().toLowerCase();
    const employmentStatus = normalizeEmploymentStatusFilter(req.query.employmentStatus, "active");

    if (!year || !month || month < 1 || month > 12) {
      return res.status(400).json({ message: "year and month required (month 1-12)" });
    }
    const { rows, scope } = await buildMonthlyTrackerData({
      year,
      month,
      search,
      employmentStatus,
      viewer: req.user,
    });
    res.json({ year, month, rows, scope });
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
    const employmentStatus = normalizeEmploymentStatusFilter(req.query.employmentStatus, "active");

    if (!year || !month || month < 1 || month > 12) {
      return res.status(400).json({ message: "year and month required (month 1-12)" });
    }

    const data = await buildMonthlyTrackerData({
      year,
      month,
      search,
      employmentStatus,
      viewer: req.user,
    });
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

    const emp = await User.findByPk(userId, {
      attributes: ["id", "name", "email", "userName", "professional"],
    });

    if (!emp) return res.status(404).json({ message: "Employee not found" });

    if (!employeeMatchesDepartmentScope(emp.toJSON(), getDepartmentScopeForManager(req.user))) {
      return res.status(403).json({ message: "Access denied for this employee attendance" });
    }

    const [att, acts, leave] = await Promise.all([
      Attendance.findOne({
        where: { userId, dateKey: dk },
        attributes: ["checkInAt", "checkOutAt", "totalWorkedSeconds", "isLate"],
      }),
      Activity.findAll({
        where: { userId, dateKey: dk, type: { [Op.in]: ACTIVITY_EXPORT_TYPES } },
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

    const breakSummary = buildBreakMap(
      acts.map((activity) => ({
        ...activity.toJSON(),
        userId,
        dateKey: dk,
      }))
    ).get(`${userId}|${dk}`) || createEmptyBreakSummary();

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
      prayerTime: {
        start: breakSummary.prayerTimeStart,
        end: breakSummary.prayerTimeEnd,
        durationSeconds: breakSummary.prayerTimeSeconds || 0,
        exceededSeconds: breakSummary.prayerTimeExceededSeconds || 0,
        isActive: acts.some((activity) => activity.type === "prayer_time" && activity.isActive),
      },
      meeting: {
        start: breakSummary.meetingStart,
        end: breakSummary.meetingEnd,
        durationSeconds: breakSummary.meetingSeconds || 0,
        exceededSeconds: breakSummary.meetingExceededSeconds || 0,
        isActive: acts.some((activity) => activity.type === "meeting" && activity.isActive),
      },
      excessBreakSeconds:
        (breakSummary.teaBreakExceededSeconds || 0) +
        (breakSummary.lunchBreakExceededSeconds || 0) +
        (breakSummary.prayerTimeExceededSeconds || 0) +
        (breakSummary.meetingExceededSeconds || 0),
      breakLimits: {
        teaBreakSeconds: BREAK_LIMIT_SECONDS.tea_break,
        lunchBreakSeconds: BREAK_LIMIT_SECONDS.lunch_break,
        prayerTimeSeconds: BREAK_LIMIT_SECONDS.prayer_time,
        meetingSeconds: BREAK_LIMIT_SECONDS.meeting,
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
