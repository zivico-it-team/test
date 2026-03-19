const { Op } = require("sequelize");
const Attendance = require("../models/Attendance");
const Activity = require("../models/Activity");
const Leave = require("../models/Leave");
const Upload = require("../models/Upload");

// YYYY-MM-DD dateKey
const getDateKey = (d = new Date()) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const startOfDay = (value) => {
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) {
    const fallback = new Date();
    fallback.setHours(0, 0, 0, 0);
    return fallback;
  }
  dt.setHours(0, 0, 0, 0);
  return dt;
};

// GET /api/employee/dashboard/summary
const dashboardSummary = async (req, res) => {
  try {
    const userId = req.user._id;
    const todayKey = getDateKey();

    const todayAttendance = await Attendance.findOne({ where: { userId, dateKey: todayKey } });

    const activeActivity = await Activity.findOne({
      where: { userId, dateKey: todayKey, isActive: true },
      order: [["createdAt", "DESC"]],
    });

    const [totalLeaves, pendingLeaves, filesUploaded] = await Promise.all([
      Leave.count({ where: { userId } }),
      Leave.count({ where: { userId, status: "pending" } }),
      Upload.count({ where: { userId } }),
    ]);

    // Attendance rate (monthly simple)
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const employeeStartDate = startOfDay(req.user?.createdAt || now);
    const effectiveStart = employeeStartDate > monthStart ? employeeStartDate : monthStart;

    const presentDays = await Attendance.count({
      where: {
        userId,
        checkInAt: { [Op.gte]: effectiveStart, [Op.lt]: nextMonthStart },
      },
    });

    const todayStart = startOfDay(now);
    const daysSoFar =
      effectiveStart > todayStart
        ? 0
        : Math.floor((todayStart.getTime() - effectiveStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const attendanceRate = daysSoFar > 0 ? Math.round((presentDays / daysSoFar) * 100) : 0;

    res.json({
      user: {
        id: req.user._id,
        name: req.user.name,
        role: req.user.role,
      },
      today: {
        dateKey: todayKey,
        checkedIn: !!todayAttendance?.checkInAt,
        checkedOut: !!todayAttendance?.checkOutAt,
        checkInAt: todayAttendance?.checkInAt || null,
        checkOutAt: todayAttendance?.checkOutAt || null,
        totalWorkedSeconds: todayAttendance?.totalWorkedSeconds || 0,
      },
      activity: {
        hasActive: !!activeActivity,
        active: activeActivity
          ? {
              id: activeActivity.id,
              _id: activeActivity.id,
              type: activeActivity.type,
              startedAt: activeActivity.startedAt,
            }
          : null,
      },
      cards: {
        totalLeaveApplications: totalLeaves,
        pendingLeaves,
        filesUploaded,
        attendanceRate: `${attendanceRate}%`,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { dashboardSummary };
