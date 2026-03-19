const { Op } = require("sequelize");
const Attendance = require("../models/Attendance");
const Activity = require("../models/Activity");
const Leave = require("../models/Leave");

// ===== Helpers =====
const getDateKey = (d = new Date()) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const parseYM = (req) => {
  const year = Number(req.query.year);
  const month = Number(req.query.month);
  if (!year || !month || month < 1 || month > 12) return null;
  return { year, month };
};

const monthKeyRange = (year, month1to12) => {
  const start = `${year}-${String(month1to12).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month1to12, 0).getDate();
  const end = `${year}-${String(month1to12).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end, lastDay };
};

const secondsToHours = (sec) => Math.round((sec / 3600) * 10) / 10; // 1 decimal

// ✅ Saturday working => Sunday மட்டும் OFF
const isSunday = (year, month1to12, day) => {
  const dt = new Date(year, month1to12 - 1, day);
  return dt.getDay() === 0; // 0 = Sunday
};

const countWorkingDaysInMonth = (year, month1to12, startDay = 1, endDay = null) => {
  const lastDay = new Date(year, month1to12, 0).getDate();
  const normalizedStartDay = Math.max(1, Math.min(lastDay, Number(startDay) || 1));
  const limit = endDay === null ? lastDay : Math.max(0, Math.min(lastDay, endDay));
  if (limit < normalizedStartDay) return 0;
  let working = 0;
  for (let d = normalizedStartDay; d <= limit; d++) {
    if (!isSunday(year, month1to12, d)) working++;
  }
  return working;
};

const toAttendanceJson = (r) => {
  const o = typeof r.toJSON === "function" ? r.toJSON() : r;
  o._id = o.id;
  o.user = o.userId;
  return o;
};

const dateOnly = (value) => {
  const dt = new Date(value);
  dt.setHours(0, 0, 0, 0);
  return dt;
};

const dateEnd = (value) => {
  const dt = new Date(value);
  dt.setHours(23, 59, 59, 999);
  return dt;
};

const buildLeaveDateKeys = ({
  leaves,
  year,
  month,
  trackedStartDay,
  trackedLastDay,
  includeSundays = false,
}) => {
  const leaveDateKeys = new Set();

  if (trackedStartDay <= 0 || trackedLastDay <= 0) {
    return leaveDateKeys;
  }

  const trackedStart = `${year}-${String(month).padStart(2, "0")}-${String(trackedStartDay).padStart(2, "0")}`;
  const trackedEnd = `${year}-${String(month).padStart(2, "0")}-${String(trackedLastDay).padStart(2, "0")}`;
  const monthStart = dateOnly(`${trackedStart}T00:00:00`);
  const monthEnd = dateOnly(`${trackedEnd}T00:00:00`);

  for (const leave of leaves) {
    const from = dateOnly(leave.fromDate);
    const to = dateOnly(leave.toDate);
    const rangeStart = new Date(Math.max(from.getTime(), monthStart.getTime()));
    const rangeEnd = new Date(Math.min(to.getTime(), monthEnd.getTime()));

    if (rangeStart.getTime() > rangeEnd.getTime()) continue;

    const cursor = new Date(rangeStart);
    while (cursor.getTime() <= rangeEnd.getTime()) {
      const day = cursor.getDate();
      if (includeSundays || !isSunday(year, month, day)) {
        leaveDateKeys.add(getDateKey(cursor));
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  return leaveDateKeys;
};

const getEmploymentStartDate = (user = {}) => {
  const rawCreatedAt = user?.createdAt || user?.created_at || null;
  const createdDate = rawCreatedAt ? new Date(rawCreatedAt) : new Date();
  if (Number.isNaN(createdDate.getTime())) {
    return dateOnly(new Date());
  }
  return dateOnly(createdDate);
};

const getTrackedDayWindow = ({ year, month, lastDay, employmentStartDate, today = new Date() }) => {
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;

  let endDay = lastDay;
  if (year > currentYear || (year === currentYear && month > currentMonth)) {
    endDay = 0;
  } else if (year === currentYear && month === currentMonth) {
    endDay = Math.min(lastDay, today.getDate());
  }

  if (endDay <= 0) {
    return { startDay: 0, endDay: 0 };
  }

  const monthEnd = new Date(year, month - 1, endDay);
  monthEnd.setHours(0, 0, 0, 0);

  if (employmentStartDate && employmentStartDate.getTime() > monthEnd.getTime()) {
    return { startDay: 0, endDay: 0 };
  }

  let startDay = 1;
  if (
    employmentStartDate &&
    employmentStartDate.getFullYear() === year &&
    employmentStartDate.getMonth() + 1 === month
  ) {
    startDay = employmentStartDate.getDate();
  }

  if (startDay > endDay) {
    return { startDay: 0, endDay: 0 };
  }

  return { startDay, endDay };
};

// ✅ POST /api/attendance/check-in
exports.checkIn = async (req, res) => {
  try {
    const userId = req.user._id;
    const now = new Date();
    const dateKey = getDateKey(now);

    const lateCutoff = new Date(now);
    lateCutoff.setHours(11, 0, 0, 0);
    const isLate = now > lateCutoff;

    const existing = await Attendance.findOne({ where: { userId, dateKey } });
    if (existing?.checkInAt) {
      return res.status(400).json({ success: false, message: "Already checked in" });
    }

    // upsert record
    await Attendance.upsert({
      userId,
      dateKey,
      checkInAt: now,
      isLate,
      status: "present",
    });

    const record = await Attendance.findOne({ where: { userId, dateKey } });

    return res.status(201).json({ success: true, message: "Checked in", record: toAttendanceJson(record) });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ POST /api/attendance/check-out
exports.checkOut = async (req, res) => {
  try {
    const userId = req.user._id;
    const now = new Date();
    const dateKey = getDateKey(now);

    const record = await Attendance.findOne({ where: { userId, dateKey } });

    if (!record || !record.checkInAt) {
      return res.status(400).json({ success: false, message: "You must check in first" });
    }
    if (record.checkOutAt) {
      return res.status(400).json({ success: false, message: "Already checked out" });
    }

    const breaks = await Activity.findAll({
      where: {
        userId,
        dateKey,
        isActive: false,
        durationSeconds: { [Op.gt]: 0 },
      },
      attributes: ["durationSeconds"],
    });

    const breakSeconds = breaks.reduce((sum, b) => sum + (b.durationSeconds || 0), 0);
    const grossSeconds = Math.max(0, Math.floor((now - new Date(record.checkInAt)) / 1000));
    const netSeconds = Math.max(0, grossSeconds - breakSeconds);

    await record.update({
      checkOutAt: now,
      totalWorkedSeconds: netSeconds,
    });

    return res.json({
      success: true,
      message: "Checked out",
      record: toAttendanceJson(record),
      breakSeconds,
      totalWorkedHours: secondsToHours(netSeconds),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ GET /api/attendance/today
exports.todayStatus = async (req, res) => {
  try {
    const userId = req.user._id;
    const dateKey = getDateKey();
    const today = new Date();
    const todayStart = dateOnly(today);
    const todayEnd = dateEnd(today);

    const [record, leave] = await Promise.all([
      Attendance.findOne({ where: { userId, dateKey } }),
      Leave.findOne({
        where: {
          userId,
          status: "approved",
          fromDate: { [Op.lte]: todayEnd },
          toDate: { [Op.gte]: todayStart },
        },
        attributes: ["id"],
      }),
    ]);

    const onLeave = !!leave;
    const status = record?.checkInAt
      ? record?.isLate
        ? "late"
        : "present"
      : onLeave
        ? "leave"
        : "absent";

    return res.json({
      success: true,
      dateKey,
      status,
      onLeave,
      checkedIn: !!record?.checkInAt,
      checkedOut: !!record?.checkOutAt,
      checkInAt: record?.checkInAt || null,
      checkOutAt: record?.checkOutAt || null,
      totalWorkedSeconds: record?.totalWorkedSeconds || 0,
      totalWorkedHours: secondsToHours(record?.totalWorkedSeconds || 0),
      isLate: !!record?.isLate,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ GET /api/attendance/month/summary?year=YYYY&month=M
exports.monthSummary = async (req, res) => {
  try {
    const userId = req.user._id;
    const ym = parseYM(req);
    if (!ym) return res.status(400).json({ success: false, message: "year and month are required" });

    const { year, month } = ym;
    const { start, end, lastDay } = monthKeyRange(year, month);
    const employmentStartDate = getEmploymentStartDate(req.user);
    const { startDay: trackedStartDay, endDay: trackedLastDay } = getTrackedDayWindow({
      year,
      month,
      lastDay,
      employmentStartDate,
    });

    const [records, leaves] = await Promise.all([
      Attendance.findAll({
        where: {
          userId,
          dateKey: { [Op.gte]: start, [Op.lte]: end },
        },
        attributes: ["dateKey", "checkInAt", "checkOutAt", "totalWorkedSeconds", "isLate"],
      }),
      Leave.findAll({
        where: {
          userId,
          status: "approved",
          fromDate: { [Op.lte]: new Date(`${end}T23:59:59`) },
          toDate: { [Op.gte]: new Date(`${start}T00:00:00`) },
        },
        attributes: ["fromDate", "toDate"],
      }),
    ]);

    const presentDayKeys = new Set(
      records
        .filter((r) => {
          if (!r.checkInAt) return false;
          const day = Number(String(r.dateKey).split("-")[2]);
          return day >= trackedStartDay && day <= trackedLastDay && !isSunday(year, month, day);
        })
        .map((r) => r.dateKey)
    );

    const presentWorkingDays = presentDayKeys.size;

    const leaveDayKeys = new Set();
    if (trackedStartDay > 0 && trackedLastDay > 0) {
      const trackedStart = `${year}-${String(month).padStart(2, "0")}-${String(trackedStartDay).padStart(2, "0")}`;
      const monthStart = dateOnly(`${trackedStart}T00:00:00`);
      const monthEnd = dateOnly(`${end}T00:00:00`);
      const trackedEnd = new Date(year, month - 1, trackedLastDay);
      trackedEnd.setHours(0, 0, 0, 0);

      for (const leave of leaves) {
        const from = dateOnly(leave.fromDate);
        const to = dateOnly(leave.toDate);
        const rangeStart = new Date(Math.max(from.getTime(), monthStart.getTime()));
        const rangeEnd = new Date(Math.min(to.getTime(), monthEnd.getTime(), trackedEnd.getTime()));

        if (rangeStart.getTime() > rangeEnd.getTime()) continue;

        const cursor = new Date(rangeStart);
        while (cursor.getTime() <= rangeEnd.getTime()) {
          const day = cursor.getDate();
          if (!isSunday(year, month, day)) {
            const key = getDateKey(cursor);
            if (!presentDayKeys.has(key)) {
              leaveDayKeys.add(key);
            }
          }
          cursor.setDate(cursor.getDate() + 1);
        }
      }
    }

    const leaveWorkingDays = leaveDayKeys.size;

    const lateArrivals = records.filter((r) => {
      if (!r.isLate) return false;
      const day = Number(String(r.dateKey).split("-")[2]);
      return day >= trackedStartDay && day <= trackedLastDay;
    }).length;
    const totalSeconds = records.reduce((sum, r) => sum + (r.totalWorkedSeconds || 0), 0);

    const workingDays = countWorkingDaysInMonth(year, month, trackedStartDay, trackedLastDay);
    const absent = Math.max(0, workingDays - presentWorkingDays - leaveWorkingDays);

    return res.json({
      success: true,
      year,
      month,
      workingDays,
      present: presentWorkingDays,
      absent,
      leave: leaveWorkingDays,
      lateArrivals,
      totalHours: secondsToHours(totalSeconds),
      totalSeconds,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ GET /api/attendance/month/calendar?year=YYYY&month=M
exports.monthCalendar = async (req, res) => {
  try {
    const userId = req.user._id;
    const ym = parseYM(req);
    if (!ym) return res.status(400).json({ success: false, message: "year and month are required" });

    const { year, month } = ym;
    const { start, end, lastDay } = monthKeyRange(year, month);
    const employmentStartDate = getEmploymentStartDate(req.user);
    const { startDay: trackedStartDay, endDay: trackedLastDay } = getTrackedDayWindow({
      year,
      month,
      lastDay,
      employmentStartDate,
    });

    const [records, leaves] = await Promise.all([
      Attendance.findAll({
        where: {
          userId,
          dateKey: { [Op.gte]: start, [Op.lte]: end },
        },
        attributes: ["dateKey", "checkInAt", "checkOutAt", "totalWorkedSeconds", "isLate"],
      }),
      Leave.findAll({
        where: {
          userId,
          status: "approved",
          fromDate: { [Op.lte]: new Date(`${end}T23:59:59`) },
          toDate: { [Op.gte]: new Date(`${start}T00:00:00`) },
        },
        attributes: ["fromDate", "toDate"],
      }),
    ]);

    const attendanceByDateKey = new Map(records.map((record) => [record.dateKey, record]));
    const leaveDateKeys = buildLeaveDateKeys({
      leaves,
      year,
      month,
      trackedStartDay,
      trackedLastDay,
      includeSundays: true,
    });

    const days = {};

    for (let d = 1; d <= lastDay; d++) {
      const key = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

      if (trackedStartDay === 0 || d < trackedStartDay || d > trackedLastDay) {
        days[key] = {
          dateKey: key,
          status: null,
          checkInAt: null,
          checkOutAt: null,
          totalWorkedSeconds: 0,
          totalWorkedHours: 0,
          isLate: false,
        };
        continue;
      }

      const off = isSunday(year, month, d);
      const attendance = attendanceByDateKey.get(key);
      const hasCheckIn = !!attendance?.checkInAt;
      const onLeave = leaveDateKeys.has(key);

      days[key] = {
        dateKey: key,
        status: hasCheckIn ? "present" : onLeave ? "leave" : off ? "off" : "absent",
        checkInAt: attendance?.checkInAt || null,
        checkOutAt: attendance?.checkOutAt || null,
        totalWorkedSeconds: attendance?.totalWorkedSeconds || 0,
        totalWorkedHours: secondsToHours(attendance?.totalWorkedSeconds || 0),
        isLate: hasCheckIn ? !!attendance?.isLate : false,
      };
    }

    return res.json({ success: true, year, month, days });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ GET /api/attendance/month/records?year=YYYY&month=M
exports.monthRecords = async (req, res) => {
  try {
    const userId = req.user._id;
    const ym = parseYM(req);
    if (!ym) return res.status(400).json({ success: false, message: "year and month are required" });

    const { year, month } = ym;
    const { start, end, lastDay } = monthKeyRange(year, month);
    const employmentStartDate = getEmploymentStartDate(req.user);
    const { startDay: trackedStartDay, endDay: trackedLastDay } = getTrackedDayWindow({
      year,
      month,
      lastDay,
      employmentStartDate,
    });

    const [records, leaves] = await Promise.all([
      Attendance.findAll({
        where: {
          userId,
          dateKey: { [Op.gte]: start, [Op.lte]: end },
        },
        order: [["dateKey", "DESC"]],
      }),
      Leave.findAll({
        where: {
          userId,
          status: "approved",
          fromDate: { [Op.lte]: new Date(`${end}T23:59:59`) },
          toDate: { [Op.gte]: new Date(`${start}T00:00:00`) },
        },
        attributes: ["fromDate", "toDate"],
      }),
    ]);

    if (trackedStartDay === 0 || trackedLastDay === 0) {
      return res.json({ success: true, year, month, records: [] });
    }

    const filteredRecords = records.filter((r) => {
      const day = Number(String(r.dateKey).split("-")[2]);
      return day >= trackedStartDay && day <= trackedLastDay;
    });
    const leaveDateKeys = buildLeaveDateKeys({
      leaves,
      year,
      month,
      trackedStartDay,
      trackedLastDay,
      includeSundays: true,
    });

    const attendanceFormatted = filteredRecords.map((r) => ({
      _id: r.id,
      dateKey: r.dateKey,
      status: r.checkInAt ? "present" : leaveDateKeys.has(r.dateKey) ? "leave" : "absent",
      checkInAt: r.checkInAt,
      checkOutAt: r.checkOutAt,
      totalWorkedSeconds: r.totalWorkedSeconds || 0,
      totalWorkedHours: secondsToHours(r.totalWorkedSeconds || 0),
      isLate: !!r.isLate,
    }));

    const attendanceDateKeys = new Set(attendanceFormatted.map((record) => record.dateKey));

    const leaveFormatted = Array.from(leaveDateKeys)
      .filter((dateKey) => !attendanceDateKeys.has(dateKey))
      .map((dateKey) => ({
        _id: null,
        dateKey,
        status: "leave",
        checkInAt: null,
        checkOutAt: null,
        totalWorkedSeconds: 0,
        totalWorkedHours: 0,
        isLate: false,
      }));

    const formatted = [...attendanceFormatted, ...leaveFormatted].sort((a, b) =>
      String(b.dateKey).localeCompare(String(a.dateKey))
    );

    return res.json({ success: true, year, month, records: formatted });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ✅ DELETE /api/attendance/:id
exports.deleteRecord = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;

    const record = await Attendance.findOne({ where: { id, userId } });
    if (!record) return res.status(404).json({ success: false, message: "Record not found" });

    await Attendance.destroy({ where: { id } });

    return res.json({ success: true, message: "Attendance record deleted" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
