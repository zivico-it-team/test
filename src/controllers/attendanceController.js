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

const countWorkingDaysInMonth = (year, month1to12, endDay = null) => {
  const lastDay = new Date(year, month1to12, 0).getDate();
  const limit = endDay === null ? lastDay : Math.max(0, Math.min(lastDay, endDay));
  let working = 0;
  for (let d = 1; d <= limit; d++) {
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

    const [record, leave] = await Promise.all([
      Attendance.findOne({ where: { userId, dateKey } }),
      Leave.findOne({
        where: {
          userId,
          status: "approved",
          fromDate: { [Op.lte]: today },
          toDate: { [Op.gte]: today },
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

    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1;

    let trackedLastDay = lastDay;
    if (year > currentYear || (year === currentYear && month > currentMonth)) {
      trackedLastDay = 0;
    } else if (year === currentYear && month === currentMonth) {
      trackedLastDay = today.getDate();
    }

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
          return day <= trackedLastDay && !isSunday(year, month, day);
        })
        .map((r) => r.dateKey)
    );

    const presentWorkingDays = presentDayKeys.size;

    const leaveDayKeys = new Set();
    if (trackedLastDay > 0) {
      const monthStart = dateOnly(`${start}T00:00:00`);
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
      return day <= trackedLastDay;
    }).length;
    const totalSeconds = records.reduce((sum, r) => sum + (r.totalWorkedSeconds || 0), 0);

    const workingDays = countWorkingDaysInMonth(year, month, trackedLastDay);
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
    const todayKey = getDateKey();

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

    const leaveRanges = leaves.map((leave) => ({
      from: new Date(leave.fromDate),
      to: new Date(leave.toDate),
    }));

    const isOnLeave = (date) => {
      const t = date.getTime();
      return leaveRanges.some((range) => {
        const from = new Date(range.from);
        const to = new Date(range.to);
        from.setHours(0, 0, 0, 0);
        to.setHours(23, 59, 59, 999);
        return t >= from.getTime() && t <= to.getTime();
      });
    };

    const days = {};
    for (const r of records) {
      days[r.dateKey] = {
        dateKey: r.dateKey,
        status: r.checkInAt ? "present" : "absent",
        checkInAt: r.checkInAt,
        checkOutAt: r.checkOutAt,
        totalWorkedSeconds: r.totalWorkedSeconds || 0,
        totalWorkedHours: secondsToHours(r.totalWorkedSeconds || 0),
        isLate: !!r.isLate,
      };
    }

    for (let d = 1; d <= lastDay; d++) {
      const key = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

      if (!days[key]) {
        const off = isSunday(year, month, d);
        const dayDate = new Date(year, month - 1, d);
        const onLeave = isOnLeave(dayDate);

        if (key > todayKey && !onLeave) {
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

        days[key] = {
          dateKey: key,
          status: off ? "off" : onLeave ? "leave" : "absent",
          checkInAt: null,
          checkOutAt: null,
          totalWorkedSeconds: 0,
          totalWorkedHours: 0,
          isLate: false,
        };
      }
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
    const { start, end } = monthKeyRange(year, month);

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

    const attendanceByDateKey = new Map(records.map((r) => [r.dateKey, r]));

    const leaveDateKeys = new Set();
    const monthStart = dateOnly(`${start}T00:00:00`);
    const monthEnd = dateOnly(`${end}T00:00:00`);

    for (const leave of leaves) {
      const from = dateOnly(leave.fromDate);
      const to = dateOnly(leave.toDate);
      const rangeStart = new Date(Math.max(from.getTime(), monthStart.getTime()));
      const rangeEnd = new Date(Math.min(to.getTime(), monthEnd.getTime()));

      if (rangeStart.getTime() > rangeEnd.getTime()) continue;

      const cursor = new Date(rangeStart);
      while (cursor.getTime() <= rangeEnd.getTime()) {
        const day = cursor.getDate();
        if (!isSunday(year, month, day)) {
          const key = getDateKey(cursor);
          if (!attendanceByDateKey.has(key)) {
            leaveDateKeys.add(key);
          }
        }
        cursor.setDate(cursor.getDate() + 1);
      }
    }

    const attendanceFormatted = records.map((r) => ({
      _id: r.id,
      dateKey: r.dateKey,
      status: r.checkInAt ? "present" : "absent",
      checkInAt: r.checkInAt,
      checkOutAt: r.checkOutAt,
      totalWorkedSeconds: r.totalWorkedSeconds || 0,
      totalWorkedHours: secondsToHours(r.totalWorkedSeconds || 0),
      isLate: !!r.isLate,
    }));

    const leaveFormatted = Array.from(leaveDateKeys).map((dateKey) => ({
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
