const { Op } = require("sequelize");

const Lead = require("../models/Lead");
const LeadTimeline = require("../models/LeadTimeline");
const User = require("../models/User");

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const toInt = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
};

const mapLead = (lead) => {
  const obj = typeof lead?.toJSON === "function" ? lead.toJSON() : lead;
  return {
    ...obj,
    _id: obj?.id,
    assignedTo: obj?.assignedTo || "",
    assignedToId: obj?.assignedToId || "",
    preferredLanguage: obj?.preferredLanguage || "",
  };
};

const assignmentScopeForEmployee = (user) => {
  const userId = String(user?._id || user?.id || "");
  const userName = String(user?.name || "");
  const userEmail = String(user?.email || "");
  const userUserName = String(user?.userName || "");

  return {
    [Op.or]: [
      ...(userId ? [{ assignedToId: userId }] : []),
      ...(userName ? [{ assignedTo: userName }] : []),
      ...(userEmail ? [{ assignedTo: userEmail }] : []),
      ...(userUserName ? [{ assignedTo: userUserName }] : []),
    ],
  };
};

const getBaseWhere = (req) => {
  if (req.user?.role === "employee") {
    return assignmentScopeForEmployee(req.user);
  }

  return {};
};

const mergeWhere = (baseWhere, additionalWhere) => {
  if (!baseWhere || Object.keys(baseWhere).length === 0) {
    return additionalWhere || {};
  }
  if (!additionalWhere || Object.keys(additionalWhere).length === 0) {
    return baseWhere;
  }
  return { [Op.and]: [baseWhere, additionalWhere] };
};

const MASTER_DATA_FIELD_LABELS = {
  name: "Name",
  email: "Email",
  phone: "Phone Number",
  fax: "Fax",
  gender: "Gender",
  dateOfBirth: "Date of Birth",
  country: "Country",
  preferredLanguage: "Language",
  campaign: "Campaign",
  leadPool: "Lead Pool",
  assignedTo: "Assignee",
  assignedToId: "Assignee ID",
  assignedDate: "Assigned Date",
  followUp: "Upcoming Followup",
  complianceType: "Compliance Type",
};

const mapTimeline = (entry) => {
  const obj = typeof entry?.toJSON === "function" ? entry.toJSON() : entry;
  return {
    id: obj?.id,
    action: obj?.action || "",
    details: obj?.details || "",
    changedBy: obj?.changedBy || "System",
    at: obj?.changedAt || obj?.createdAt || null,
  };
};

let hasSyncedLeadTimeline = false;
const ensureLeadTimelineReady = async () => {
  if (hasSyncedLeadTimeline) return;
  await LeadTimeline.sync();
  hasSyncedLeadTimeline = true;
};

const getActorName = (req) => {
  return String(req.user?.name || req.user?.userName || req.user?.email || "System").trim() || "System";
};

const normalizeCompareValue = (field, value) => {
  if (value === null || value === undefined) return "";

  if (field === "assignedDate") {
    const dt = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(dt.getTime())) return "";
    return dt.toISOString().split("T")[0];
  }

  return String(value).trim();
};

const addLeadTimeline = async ({ req, leadId, action, details }) => {
  if (!leadId || !action || !details) return null;

  await ensureLeadTimelineReady();
  const timeline = await LeadTimeline.create({
    leadId,
    action: String(action).trim(),
    details: String(details).trim(),
    changedBy: getActorName(req),
    changedAt: new Date(),
  });

  return mapTimeline(timeline);
};

const listLeads = async (req, res) => {
  try {
    const page = clamp(toInt(req.query.page, 1), 1, 100000);
    const limit = clamp(toInt(req.query.limit, 50), 1, 1000);
    const search = String(req.query.search || "").trim();

    const baseWhere = getBaseWhere(req);
    let where = { ...baseWhere };

    if (search) {
      const searchWhere = {
        [Op.or]: [
          { name: { [Op.like]: `%${search}%` } },
          { email: { [Op.like]: `%${search}%` } },
          { phone: { [Op.like]: `%${search}%` } },
          { assignedTo: { [Op.like]: `%${search}%` } },
          { campaign: { [Op.like]: `%${search}%` } },
          { comment: { [Op.like]: `%${search}%` } },
        ],
      };
      where = mergeWhere(baseWhere, searchWhere);
    }

    const offset = (page - 1) * limit;
    const { count, rows } = await Lead.findAndCountAll({
      where,
      order: [["createdAt", "DESC"]],
      offset,
      limit,
    });

    return res.json({
      items: rows.map(mapLead),
      page,
      pages: Math.max(1, Math.ceil(count / limit)),
      total: count,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Failed to load leads" });
  }
};

const createLead = async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const email = String(req.body?.email || "").trim();
    const phone = String(req.body?.phone || req.body?.phoneNumber || "").trim();

    if (!name || !email || !phone) {
      return res.status(400).json({ message: "name, email and phone are required" });
    }

    const assignedTo = String(req.body?.assignedTo || "").trim();
    const assignedToId = String(req.body?.assignedToId || "").trim();

    const lead = await Lead.create({
      name,
      email,
      phone,
      country: String(req.body?.country || "").trim(),
      preferredLanguage: String(req.body?.language || req.body?.preferredLanguage || "").trim(),
      assignedTo,
      assignedToId,
      followUp: String(req.body?.followUp || "").trim(),
      stage: String(req.body?.stage || "New").trim(),
      tag: String(req.body?.tag || "New Lead").trim(),
      comment: String(req.body?.comment || "").trim(),
      assignedDate: req.body?.assignedDate ? new Date(req.body.assignedDate) : assignedTo ? new Date() : null,
      complianceType: String(req.body?.complianceType || "Standard").trim(),
      uploadedBy: String(req.body?.uploadedBy || req.user?.name || req.user?.email || "System").trim(),
      campaign: String(req.body?.campaign || "General Campaign").trim(),
      source: String(req.body?.source || "manual").trim(),
      leadPool: String(
        req.body?.leadPool || (assignedTo ? "SL_EMP_ASSIGNED" : "SL_EMP_UNASSIGNED")
      ).trim(),
      fax: String(req.body?.fax || "").trim(),
      gender: String(req.body?.gender || "").trim(),
      dateOfBirth: String(req.body?.dateOfBirth || "").trim(),
    });

    return res.status(201).json({ lead: mapLead(lead) });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Failed to create lead" });
  }
};

const getLeadById = async (id) => {
  return Lead.findByPk(id);
};

const ensureLead = async (id, res) => {
  const lead = await getLeadById(id);
  if (!lead) {
    res.status(404).json({ message: "Lead not found" });
    return null;
  }
  return lead;
};

const toggleBookmark = async (req, res) => {
  try {
    const lead = await ensureLead(req.params.id, res);
    if (!lead) return;

    lead.isBookmarked = !lead.isBookmarked;
    await lead.save();

    return res.json(mapLead(lead));
  } catch (err) {
    return res.status(500).json({ message: err.message || "Failed to update bookmark" });
  }
};

const toggleArchive = async (req, res) => {
  try {
    const lead = await ensureLead(req.params.id, res);
    if (!lead) return;

    lead.isArchived = !lead.isArchived;
    await lead.save();

    return res.json(mapLead(lead));
  } catch (err) {
    return res.status(500).json({ message: err.message || "Failed to update archive state" });
  }
};

const updateMasterData = async (req, res) => {
  try {
    const lead = await ensureLead(req.params.id, res);
    if (!lead) return;

    const assignedTo = req.body?.assignedTo !== undefined ? String(req.body.assignedTo || "").trim() : lead.assignedTo;
    const assignedToId =
      req.body?.assignedToId !== undefined ? String(req.body.assignedToId || "").trim() : lead.assignedToId;
    const nextValues = {
      name: req.body?.name !== undefined ? String(req.body.name || "").trim() : lead.name,
      email: req.body?.email !== undefined ? String(req.body.email || "").trim() : lead.email,
      phone:
        req.body?.phone !== undefined || req.body?.phoneNumber !== undefined
          ? String(req.body.phone || req.body.phoneNumber || "").trim()
          : lead.phone,
      fax: req.body?.fax !== undefined ? String(req.body.fax || "").trim() : lead.fax,
      gender: req.body?.gender !== undefined ? String(req.body.gender || "").trim() : lead.gender,
      dateOfBirth:
        req.body?.dateOfBirth !== undefined ? String(req.body.dateOfBirth || "").trim() : lead.dateOfBirth,
      country: req.body?.country !== undefined ? String(req.body.country || "").trim() : lead.country,
      preferredLanguage:
        req.body?.language !== undefined || req.body?.preferredLanguage !== undefined
          ? String(req.body.language || req.body.preferredLanguage || "").trim()
          : lead.preferredLanguage,
      campaign: req.body?.campaign !== undefined ? String(req.body.campaign || "").trim() : lead.campaign,
      leadPool:
        req.body?.leadPool !== undefined
          ? String(req.body.leadPool || "").trim()
          : assignedTo
            ? "SL_EMP_ASSIGNED"
            : "SL_EMP_UNASSIGNED",
      assignedTo,
      assignedToId,
      assignedDate:
        req.body?.assignedDate !== undefined
          ? req.body.assignedDate
            ? new Date(req.body.assignedDate)
            : null
          : assignedTo
            ? lead.assignedDate || new Date()
            : null,
      followUp: req.body?.followUp !== undefined ? String(req.body.followUp || "").trim() : lead.followUp,
      complianceType:
        req.body?.complianceType !== undefined
          ? String(req.body.complianceType || "").trim()
          : lead.complianceType,
    };

    const changedFields = Object.keys(MASTER_DATA_FIELD_LABELS).filter(
      (field) =>
        normalizeCompareValue(field, lead[field]) !== normalizeCompareValue(field, nextValues[field])
    );

    await lead.update(nextValues);

    let timelineEntry = null;
    if (changedFields.length > 0) {
      const labels = changedFields.map((field) => MASTER_DATA_FIELD_LABELS[field]);
      timelineEntry = await addLeadTimeline({
        req,
        leadId: lead.id,
        action: "Master Data Updated",
        details: `Updated ${labels.join(", ")}`,
      });
    }

    return res.json({ lead: mapLead(lead), timeline: timelineEntry });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Failed to update lead master data" });
  }
};

const updateTag = async (req, res) => {
  try {
    const lead = await ensureLead(req.params.id, res);
    if (!lead) return;
    const previousTag = String(lead.tag || "New Lead").trim();
    const nextTag = String(req.body?.tag || lead.tag || "New Lead").trim();

    lead.tag = nextTag;
    await lead.save();

    let timelineEntry = null;
    if (previousTag !== nextTag) {
      timelineEntry = await addLeadTimeline({
        req,
        leadId: lead.id,
        action: "Tag Updated",
        details: `Lead tag changed from "${previousTag}" to "${nextTag}"`,
      });
    }

    return res.json({ lead: mapLead(lead), timeline: timelineEntry });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Failed to update lead tag" });
  }
};

const updateStage = async (req, res) => {
  try {
    const lead = await ensureLead(req.params.id, res);
    if (!lead) return;
    const previousStage = String(lead.stage || "New").trim();
    const nextStage = String(req.body?.stage || lead.stage || "New").trim();

    lead.stage = nextStage;
    await lead.save();

    let timelineEntry = null;
    if (previousStage !== nextStage) {
      timelineEntry = await addLeadTimeline({
        req,
        leadId: lead.id,
        action: "Stage Updated",
        details: `Lead stage changed from "${previousStage}" to "${nextStage}"`,
      });
    }

    return res.json({ lead: mapLead(lead), timeline: timelineEntry });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Failed to update lead stage" });
  }
};

const listTimeline = async (req, res) => {
  try {
    const lead = await ensureLead(req.params.id, res);
    if (!lead) return;

    await ensureLeadTimelineReady();

    const items = await LeadTimeline.findAll({
      where: { leadId: lead.id },
      order: [
        ["changedAt", "DESC"],
        ["createdAt", "DESC"],
      ],
      limit: 200,
    });

    return res.json({ items: items.map(mapTimeline) });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Failed to load lead timeline" });
  }
};

const deleteLead = async (req, res) => {
  try {
    const deleted = await Lead.destroy({ where: { id: req.params.id } });
    if (!deleted) {
      return res.status(404).json({ message: "Lead not found" });
    }
    return res.json({ message: "Lead deleted successfully" });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Failed to delete lead" });
  }
};

const getAssignEmployees = async (_req, res) => {
  try {
    const employees = await User.findAll({
      where: { role: "employee" },
      attributes: ["id", "name", "email", "userName", "professional"],
      order: [["name", "ASC"]],
    });

    return res.json({
      employees: employees.map((employee) => {
        const obj = employee.toJSON();
        return {
          ...obj,
          _id: obj.id,
          id: obj.id,
        };
      }),
    });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Failed to load employees" });
  }
};

const isAssignedWhere = {
  [Op.and]: [
    { assignedTo: { [Op.not]: null } },
    { assignedTo: { [Op.ne]: "" } },
    { assignedTo: { [Op.ne]: "Unassigned" } },
  ],
};

const getAssignStats = async (_req, res) => {
  try {
    const [total, assigned] = await Promise.all([
      Lead.count(),
      Lead.count({ where: isAssignedWhere }),
    ]);
    const unassigned = total - assigned;

    return res.json({ total, assigned, unassigned });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Failed to load assign stats" });
  }
};

const getAssignLeads = async (req, res) => {
  try {
    const page = clamp(toInt(req.query.page, 1), 1, 100000);
    const limit = clamp(toInt(req.query.limit, 10), 1, 1000);
    const filter = String(req.query.filter || "all").trim().toLowerCase();
    const search = String(req.query.search || "").trim();

    let where = {};
    if (filter === "assigned") {
      where = mergeWhere(where, isAssignedWhere);
    } else if (filter === "unassigned") {
      where = mergeWhere(where, {
        [Op.or]: [
          { assignedTo: null },
          { assignedTo: "" },
          { assignedTo: "Unassigned" },
        ],
      });
    }

    if (search) {
      where = mergeWhere(where, {
        [Op.or]: [
          { name: { [Op.like]: `%${search}%` } },
          { email: { [Op.like]: `%${search}%` } },
          { phone: { [Op.like]: `%${search}%` } },
          { uploadedBy: { [Op.like]: `%${search}%` } },
          { assignedTo: { [Op.like]: `%${search}%` } },
        ],
      });
    }

    const offset = (page - 1) * limit;
    const { count, rows } = await Lead.findAndCountAll({
      where,
      order: [["createdAt", "DESC"]],
      offset,
      limit,
    });

    return res.json({
      items: rows.map(mapLead),
      page,
      pages: Math.max(1, Math.ceil(count / limit)),
      total: count,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Failed to load assign leads" });
  }
};

const assignLeads = async (req, res) => {
  try {
    const employeeName = String(req.body?.employeeName || "").trim();
    const employeeId = String(req.body?.employeeId || "").trim();
    const leadIds = Array.isArray(req.body?.leadIds) ? req.body.leadIds.filter(Boolean) : [];

    if (!employeeName || leadIds.length === 0) {
      return res.status(400).json({ message: "employeeName and leadIds are required" });
    }

    const [affected] = await Lead.update(
      {
        assignedTo: employeeName,
        assignedToId: employeeId,
        assignedDate: new Date(),
        leadPool: "SL_EMP_ASSIGNED",
      },
      {
        where: { id: { [Op.in]: leadIds } },
      }
    );

    return res.json({ message: "Leads assigned successfully", updated: affected });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Failed to assign leads" });
  }
};

const unassignLeads = async (req, res) => {
  try {
    const leadIds = Array.isArray(req.body?.leadIds) ? req.body.leadIds.filter(Boolean) : [];
    if (leadIds.length === 0) {
      return res.status(400).json({ message: "leadIds are required" });
    }

    const [affected] = await Lead.update(
      {
        assignedTo: "",
        assignedToId: "",
        assignedDate: null,
        leadPool: "SL_EMP_UNASSIGNED",
      },
      {
        where: { id: { [Op.in]: leadIds } },
      }
    );

    return res.json({ message: "Leads unassigned successfully", updated: affected });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Failed to unassign leads" });
  }
};

module.exports = {
  listLeads,
  createLead,
  toggleBookmark,
  toggleArchive,
  updateMasterData,
  updateTag,
  updateStage,
  listTimeline,
  deleteLead,
  getAssignEmployees,
  getAssignStats,
  getAssignLeads,
  assignLeads,
  unassignLeads,
};
