const User = require("../models/User");

const parseProfessional = (value) => {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (_) {
      return {};
    }
  }
  return {};
};

const pickUser = (u) => ({
  _id: u.id,
  id: u.id,
  name: u.name,
  email: u.email,
  phone: u.phone || "",
  role: u.role,
  designation: parseProfessional(u?.professional)?.designation || "",
  teamName: parseProfessional(u?.professional)?.teamName || "",
  department: parseProfessional(u?.professional)?.department || "",
  reportingManager: parseProfessional(u?.professional)?.reportingManager || "",
  profileImageUrl: u.profileImageUrl || "",
  profilePicture: u.profileImageUrl || "",
  profileImageFileName: u.profileImageFileName || "",
  profileImageVersion: u.updatedAt ? new Date(u.updatedAt).getTime() : null,
  updatedAt: u.updatedAt || null,
});

const d = (u) => String(parseProfessional(u?.professional)?.designation || "").toLowerCase();

const isCEO = (u) => d(u).includes("ceo") || u.role === "admin";
const isHRManager = (u) => d(u).includes("hr") && d(u).includes("manager");
const isManager = (u) => d(u).includes("manager") && !d(u).includes("hr") && !d(u).includes("ceo");

// ✅ GET /api/hierarchy/overview
const hierarchyOverview = async (req, res) => {
  try {
    const users = (await User.findAll({
      attributes: [
        "id",
        "name",
        "email",
        "phone",
        "role",
        "professional",
        "profileImageUrl",
        "profileImageFileName",
        "updatedAt",
      ],
      order: [["name", "ASC"]],
    })).map((x) => x.toJSON());

    // ---- Top roles (for employee view only) ----
    const ceo = users.find(isCEO) || null;
    const hrManager = users.find(isHRManager) || null;

    // managers list without duplicating CEO/admin or HR manager in lower levels
    const managers = users.filter((u) => (u.role === "manager" || isManager(u)) && !isCEO(u) && !isHRManager(u));

    // group employees by teamName
    const employees = users.filter((u) => u.role === "employee");

    const teamsMap = new Map();
    for (const e of employees) {
      const professional = parseProfessional(e?.professional);
      const teamName = professional?.teamName || professional?.department || "Unassigned";
      if (!teamsMap.has(teamName)) teamsMap.set(teamName, []);
      teamsMap.get(teamName).push(pickUser(e));
    }

    const managerByTeamName = new Map();
    managers.forEach((manager) => {
      const professional = parseProfessional(manager?.professional);
      const teamKey = String(professional?.teamName || professional?.department || "")
        .trim()
        .toLowerCase();
      if (teamKey && !managerByTeamName.has(teamKey)) {
        managerByTeamName.set(teamKey, manager.name);
      }
    });

    const teams = Array.from(teamsMap.entries())
      .map(([teamName, members]) => {
        const teamKey = String(teamName || "")
          .trim()
          .toLowerCase();
        return {
          teamName,
          members,
          membersCount: members.length,
          managedBy: managerByTeamName.get(teamKey) || "",
        };
      })
      .sort((a, b) => a.teamName.localeCompare(b.teamName));

    const hierarchyLevels =
      1 +
      (hrManager ? 1 : 0) +
      (managers.length > 0 ? 1 : 0) +
      (employees.length > 0 ? 1 : 0);

    const managementIds = new Set();
    managers.forEach((u) => managementIds.add(u.id));
    if (ceo?.id) managementIds.add(ceo.id);
    if (hrManager?.id) managementIds.add(hrManager.id);

    const summary = {
      totalEmployees: employees.length,
      management: managementIds.size,
      teams: teams.length,
      hierarchyLevels,
    };

    res.set("Cache-Control", "no-store");

    return res.json({
      view: req.user?.role === "employee" ? "employee_full" : "management_full",
      cards: {
        ceo: ceo ? pickUser(ceo) : null,
        hrManager: hrManager ? pickUser(hrManager) : null,
        managers: managers.map(pickUser),
      },
      teams,
      summary,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { hierarchyOverview };
