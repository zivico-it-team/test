const User = require("../models/User");

const pickUser = (u) => ({
  _id: u.id,
  id: u.id,
  name: u.name,
  email: u.email,
  phone: u.phone || "",
  role: u.role,
  designation: u?.professional?.designation || "",
  teamName: u?.professional?.teamName || "",
  department: u?.professional?.department || "",
  reportingManager: u?.professional?.reportingManager || "",
  profileImageUrl: u.profileImageUrl || "",
});

const d = (u) => String(u?.professional?.designation || "").toLowerCase();

const isCEO = (u) => d(u).includes("ceo") || u.role === "admin";
const isHRManager = (u) => d(u).includes("hr") && d(u).includes("manager");
const isManager = (u) => d(u).includes("manager") && !d(u).includes("hr") && !d(u).includes("ceo");

// ✅ GET /api/hierarchy/overview
const hierarchyOverview = async (req, res) => {
  try {
    const users = (await User.findAll({
      attributes: ["id", "name", "email", "phone", "role", "professional", "profileImageUrl"],
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
      const teamName = e?.professional?.teamName || e?.professional?.department || "Unassigned";
      if (!teamsMap.has(teamName)) teamsMap.set(teamName, []);
      teamsMap.get(teamName).push(pickUser(e));
    }

    const managerByTeamName = new Map();
    managers.forEach((manager) => {
      const teamKey = String(manager?.professional?.teamName || manager?.professional?.department || "")
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
