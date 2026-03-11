const { Op } = require("sequelize");
const User = require("../models/User");
const Attendance = require("../models/Attendance");
const Leave = require("../models/Leave");

const getDateKey = (d = new Date()) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const toUserJson = (u) => {
  const o = typeof u.toJSON === "function" ? u.toJSON() : u;
  o._id = o.id;
  delete o.password;
  return o;
};

// GET /api/team/stats
const teamStats = async (req, res) => {
  try {
    const today = new Date();
    const dateKey = getDateKey(today);

    const totalMembers = await User.count({ where: { role: "employee" } });

    const activeAttendances = await Attendance.findAll({
      where: {
        dateKey,
        checkInAt: { [Op.ne]: null },
        checkOutAt: null,
      },
      attributes: ["userId"],
    });
    const activeIds = [...new Set(activeAttendances.map((a) => a.userId))];

    const activeNow = activeIds.length
      ? await User.count({ where: { role: "employee", id: { [Op.in]: activeIds } } })
      : 0;

    const onLeaveLeaves = await Leave.findAll({
      where: {
        status: "approved",
        fromDate: { [Op.lte]: today },
        toDate: { [Op.gte]: today },
      },
      attributes: ["userId"],
    });
    const onLeaveIds = [...new Set(onLeaveLeaves.map((l) => l.userId))];

    const onLeave = onLeaveIds.length
      ? await User.count({ where: { role: "employee", id: { [Op.in]: onLeaveIds } } })
      : 0;

    // New joiners = professional.joiningDate last 30 days (JS filter because joiningDate is inside JSON)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const employees = await User.findAll({
      where: { role: "employee" },
      attributes: ["id", "professional"],
    });

    const newJoiners = employees.filter((u) => {
      const jd = u.professional?.joiningDate ? new Date(u.professional.joiningDate) : null;
      return jd && !Number.isNaN(jd.getTime()) && jd >= thirtyDaysAgo;
    }).length;

    res.json({ totalMembers, activeNow, onLeave, newJoiners });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/team/members
const teamMembers = async (req, res) => {
  try {
    const {
      status = "all",
      search = "",
      team = "",
      page = 1,
      limit = 12,
      sort = "new",
    } = req.query;

    const today = new Date();
    const dateKey = getDateKey(today);

    const p = Math.max(1, Number(page));
    const l = Math.min(100, Math.max(1, Number(limit)));

    const allEmployees = await User.findAll({
      where: { role: "employee" },
      attributes: { exclude: ["password"] },
    });

    let list = allEmployees.map((u) => toUserJson(u));

    // team filter
    if (team) {
      list = list.filter((u) => {
        const t1 = u?.professional?.teamName || "";
        const t2 = u?.professional?.department || "";
        return t1 === team || t2 === team;
      });
    }

    // search filter
    if (search.trim()) {
      const s = search.trim().toLowerCase();
      list = list.filter((u) => {
        const pro = u.professional || {};
        const blob = `${u.name} ${u.email} ${u.userName} ${pro.designation || ""} ${pro.employeeId || ""} ${
          pro.workLocation || ""
        }`.toLowerCase();
        return blob.includes(s);
      });
    }

    // status tabs
    if (status === "active") {
      const activeAttendances = await Attendance.findAll({
        where: {
          dateKey,
          checkInAt: { [Op.ne]: null },
          checkOutAt: null,
        },
        attributes: ["userId"],
      });
      const activeIds = new Set(activeAttendances.map((a) => a.userId));
      list = list.filter((u) => activeIds.has(u.id));
    }

    if (status === "onLeave") {
      const onLeaveLeaves = await Leave.findAll({
        where: {
          status: "approved",
          fromDate: { [Op.lte]: today },
          toDate: { [Op.gte]: today },
        },
        attributes: ["userId"],
      });
      const onLeaveIds = new Set(onLeaveLeaves.map((l) => l.userId));
      list = list.filter((u) => onLeaveIds.has(u.id));
    }

    if (status === "remote") {
      list = list.filter((u) => String(u?.professional?.workLocation || "").toLowerCase().includes("remote"));
    }

    // sorting
    if (sort === "name") list.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    else if (sort === "join") {
      list.sort((a, b) => {
        const ad = a.professional?.joiningDate ? new Date(a.professional.joiningDate).getTime() : 0;
        const bd = b.professional?.joiningDate ? new Date(b.professional.joiningDate).getTime() : 0;
        return bd - ad;
      });
    } else {
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    const total = list.length;
    const start = (p - 1) * l;
    const members = list.slice(start, start + l);

    res.json({ page: p, limit: l, total, members });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/team/managers
const managersList = async (req, res) => {
  try {
    const managers = await User.findAll({
      where: { role: "manager" },
      attributes: ["id", "name", "email", "userName"],
      order: [["name", "ASC"]],
    });

    res.json(managers.map((m) => ({ ...m.toJSON(), _id: m.id })));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/team/teams
const teamsList = async (req, res) => {
  try {
    const employees = await User.findAll({
      where: { role: "employee" },
      attributes: ["professional"],
    });

    const set = new Set();
    for (const e of employees) {
      const p = e.professional || {};
      if (p.teamName) set.add(p.teamName);
      if (p.department) set.add(p.department);
    }

    res.json([...set]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { teamStats, teamMembers, managersList, teamsList };
