const User = require("../models/User");
const { toPublicUser } = require("../utils/userNormalizer");
const { matchesEmploymentStatus } = require("../utils/employmentStatus");

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

const normalizeValue = (value) => String(value || "").trim().toLowerCase();

const getDesignation = (user) =>
  normalizeValue(
    parseProfessional(user?.professional)?.designation ||
      user?.designation ||
      ""
  );

const getDepartment = (user) =>
  normalizeValue(
    parseProfessional(user?.professional)?.department ||
      parseProfessional(user?.professional)?.teamName ||
      user?.department ||
      ""
  );

const pickUser = (u) => {
  const normalized = toPublicUser(u);
  const professional = parseProfessional(normalized?.professional);
  const address = [normalized?.addressLine, normalized?.city, normalized?.state]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(", ");

  return {
    _id: normalized._id,
    id: normalized.id,
    name: normalized.name,
    email: normalized.email,
    phone: normalized.phone || "",
    role: normalized.role,
    employeeId: normalized.employeeId || professional?.employeeId || "",
    designation: professional?.designation || "",
    teamName: professional?.teamName || "",
    department: professional?.department || "",
    reportingManager: professional?.reportingManager || "",
    joiningDate: professional?.joiningDate || null,
    workLocation: professional?.workLocation || "",
    gender: normalized.gender || "",
    dob: normalized.dob || null,
    bio: normalized.bio || "",
    address,
    profileImageUrl: normalized.profileImageUrl || "",
    profilePicture: normalized.profilePicture || "",
    profileImageFileName: normalized.profileImageFileName || "",
    profileImageVersion: normalized.profileImageVersion || null,
    updatedAt: normalized.updatedAt || null,
  };
};

const isCEO = (u) => {
  const role = normalizeValue(u?.role);
  return getDesignation(u).includes("ceo") || role === "admin";
};

const isHRDepartmentUser = (u) => {
  const department = getDepartment(u);
  return (
    department === "hr" ||
    department.includes("human resource") ||
    department.includes("human resources")
  );
};

const isHRProfile = (u) => {
  const role = normalizeValue(u?.role);
  const designation = getDesignation(u);
  const isHRManagerDesignation =
    designation === "hr manager" ||
    (designation.includes("hr") && designation.includes("manager"));
  const isHRPartnerDesignation =
    designation === "hr partner" ||
    (designation.includes("hr") && designation.includes("partner"));

  return (
    role === "hr" ||
    role.includes("hr") ||
    isHRDepartmentUser(u) ||
    isHRManagerDesignation ||
    isHRPartnerDesignation ||
    designation.includes("human resource") ||
    designation.includes("human resources") ||
    designation.startsWith("hr")
  );
};

const getHRProfilePriority = (u) => {
  const role = normalizeValue(u?.role);
  const designation = getDesignation(u);
  let score = 0;

  if (role === "hr" || role.includes("hr")) score += 100;
  if (isHRDepartmentUser(u)) score += 40;
  if (designation === "hr manager") score += 30;
  if (designation === "hr partner") score += 28;
  if (designation.includes("manager")) score += 20;
  if (designation.includes("partner")) score += 18;
  if (designation.includes("director") || designation.includes("head")) score += 16;
  if (designation.includes("lead")) score += 14;
  if (designation.includes("executive")) score += 12;
  if (designation.includes("generalist")) score += 10;
  if (designation.includes("hr")) score += 8;

  return score;
};

const isManager = (u) => {
  const designation = getDesignation(u);
  return (
    designation.includes("manager") &&
    !designation.includes("hr") &&
    !designation.includes("ceo")
  );
};

// ✅ GET /api/hierarchy/overview
const hierarchyOverview = async (req, res) => {
  try {
    const users = (await User.findAll({
      attributes: [
        "id",
        "name",
        "email",
        "phone",
        "dob",
        "gender",
        "bio",
        "addressLine",
        "city",
        "state",
        "role",
        "professional",
        "profileImageUrl",
        "profileImageFileName",
        "updatedAt",
      ],
      order: [["name", "ASC"]],
    }))
      .map((x) => x.toJSON())
      .filter((user) => matchesEmploymentStatus(user, "active"));

    // ---- Top roles (for employee view only) ----
    const ceo = users.find(isCEO) || null;
    const hrManager =
      users
        .filter((user) => !isCEO(user) && isHRProfile(user))
        .sort((left, right) => {
          const priorityDiff =
            getHRProfilePriority(right) - getHRProfilePriority(left);
          if (priorityDiff !== 0) {
            return priorityDiff;
          }

          return String(left?.name || "").localeCompare(
            String(right?.name || "")
          );
        })[0] || null;

    // managers list without duplicating CEO/admin or HR manager in lower levels
    const managers = users.filter(
      (u) =>
        (u.role === "manager" || isManager(u)) &&
        !isCEO(u) &&
        !isHRProfile(u)
    );

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
