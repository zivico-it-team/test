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
  const w = dt.getDay(); // 0 Sun, 6 Sat
  return w === 0 || w === 6;
};

const daysInMonth = (year, month1to12) => new Date(year, month1to12, 0).getDate();

const safeUser = (u) => {
  const o = typeof u.toJSON === "function" ? u.toJSON() : u;
  o._id = o.id;
  delete o.password;
  return o;
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

    const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const end = new Date(year, month, 0, 23, 59, 59, 999);
    const dim = daysInMonth(year, month);
    const todayKey = toDateKey(new Date());

    // fetch employees
    const allEmployees = await User.findAll({
      where: { role: "employee" },
      attributes: ["id", "name", "email", "userName"],
      order: [["name", "ASC"]],
    });

    const employees = search
      ? allEmployees.filter((u) => {
          const s = `${u.name} ${u.email} ${u.userName}`.toLowerCase();
          return s.includes(search);
        })
      : allEmployees;

    const empIds = employees.map((u) => u.id);

    const atts = await Attendance.findAll({
      where: {
        userId: { [Op.in]: empIds },
        dateKey: { [Op.gte]: toDateKey(start), [Op.lte]: toDateKey(end) },
      },
      attributes: ["userId", "dateKey", "checkInAt", "isLate"],
    });

    const attMap = new Map();
    for (const a of atts) attMap.set(`${a.userId}|${a.dateKey}`, a);

    const leaves = await Leave.findAll({
      where: {
        userId: { [Op.in]: empIds },
        status: "approved",
        fromDate: { [Op.lte]: end },
        toDate: { [Op.gte]: start },
      },
      attributes: ["userId", "fromDate", "toDate"],
    });

    const leaveRanges = new Map();
    for (const l of leaves) {
      const k = l.userId;
      if (!leaveRanges.has(k)) leaveRanges.set(k, []);
      leaveRanges.get(k).push({ from: l.fromDate, to: l.toDate });
    }

    const isOnLeave = (userId, dt) => {
      const ranges = leaveRanges.get(userId);
      if (!ranges) return false;
      const t = dt.getTime();
      for (const r of ranges) {
        if (t >= startOfDay(r.from).getTime() && t <= endOfDay(r.to).getTime()) return true;
      }
      return false;
    };

    const rows = employees.map((emp) => {
      const uid = emp.id;
      const days = {};
      let P = 0;
      let A = 0;

      for (let day = 1; day <= dim; day++) {
        const dt = new Date(year, month - 1, day);
        const dk = toDateKey(dt);

        if (isWeekend(year, month, day)) {
          days[String(day)] = "W";
          continue;
        }

        if (isOnLeave(uid, dt)) {
          days[String(day)] = "OL";
          continue;
        }

        if (dk > todayKey) {
          days[String(day)] = "-";
          continue;
        }

        const att = attMap.get(`${uid}|${dk}`);
        if (!att || !att.checkInAt) {
          days[String(day)] = "A";
          A++;
        } else {
          if (att.isLate) days[String(day)] = "L";
          else days[String(day)] = "P";
          P++;
        }
      }

      return {
        userId: uid,
        name: emp.name,
        email: emp.email,
        userName: emp.userName,
        days,
        P,
        A,
      };
    });

    res.json({ year, month, rows });
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
      Attendance.findOne({ where: { userId, dateKey: dk }, attributes: ["checkInAt", "checkOutAt", "isLate"] }),
      Activity.findAll({
        where: { userId, dateKey: dk, type: { [Op.in]: ["tea_break", "lunch_break"] } },
        order: [["startedAt", "ASC"]],
        attributes: ["type", "startedAt", "endedAt", "isActive"],
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

    const tea = acts.find((a) => a.type === "tea_break") || null;
    const lunch = acts.find((a) => a.type === "lunch_break") || null;

    res.json({
      employee: { ...emp.toJSON(), _id: emp.id },
      dateKey: dk,
      attendance: {
        checkInAt: att?.checkInAt || null,
        checkOutAt: att?.checkOutAt || null,
        isLate: att?.isLate || false,
      },
      teaBreak: {
        start: tea?.startedAt || null,
        end: tea?.endedAt || null,
        isActive: tea?.isActive || false,
      },
      lunchBreak: {
        start: lunch?.startedAt || null,
        end: lunch?.endedAt || null,
        isActive: lunch?.isActive || false,
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

module.exports = { monthlyGrid, dayDetails };
