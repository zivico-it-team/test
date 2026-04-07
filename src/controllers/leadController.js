const { Op } = require("sequelize");

const Lead = require("../models/Lead");
const LeadTimeline = require("../models/LeadTimeline");
const User = require("../models/User");
const { normalizeStoredImageUrl } = require("../utils/userNormalizer");

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
    wasEverAssigned: Boolean(obj?.wasEverAssigned),
    preferredLanguage: obj?.preferredLanguage || "",
    followUpSetById: obj?.followUpSetById || "",
    followUpSetBy: obj?.followUpSetBy || "",
    followUpSetAt: obj?.followUpSetAt || null,
    followUpHandled: Boolean(obj?.followUpHandled),
    followUpHandledAt: obj?.followUpHandledAt || null,
    followUpHandledById: obj?.followUpHandledById || "",
  };
};

const ASSIGNED_LEAD_POOL = "SL_EMP_ASSIGNED";
const UNASSIGNED_LEAD_POOL = "SL_EMP_UNASSIGNED";

const normalizeLeadPool = (leadPool) =>
  String(leadPool || "")
    .trim()
    .toUpperCase();

const hasAssignedToValue = (assignedTo) => {
  const normalized = String(assignedTo || "").trim();
  return Boolean(normalized) && normalized !== "Unassigned";
};

const isAssignedState = ({ assignedTo, assignedToId, leadPool }) => {
  const hasCurrentAssignment =
    hasAssignedToValue(assignedTo) ||
    Boolean(String(assignedToId || "").trim());
  if (hasCurrentAssignment) {
    return true;
  }
  return normalizeLeadPool(leadPool) === ASSIGNED_LEAD_POOL;
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
    const scope = String(req.query?.scope || "")
      .trim()
      .toLowerCase();
    if (scope === "shared") {
      return {};
    }
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
  ComplaintsType: "Complaints Type",
};

const MASTER_DATA_REQUEST_NOTIFICATION_TYPE = "lead_master_data_request";
const MASTER_DATA_RESULT_NOTIFICATION_TYPE = "lead_master_data_result";

const isLeadApprovalReviewer = (user) => {
  const role = String(user?.role || "")
    .trim()
    .toLowerCase();
  return role === "admin" || role === "manager";
};

const mapMasterDataRequest = (request) => {
  const item =
    typeof request?.toJSON === "function" ? request.toJSON() : request;
  return {
    ...item,
    _id: item?.id,
    changedFields: Array.isArray(item?.changedFields)
      ? item.changedFields.map(
          (field) => MASTER_DATA_FIELD_LABELS[field] || field,
        )
      : [],
    requestedData:
      item?.requestedData && typeof item.requestedData === "object"
        ? item.requestedData
        : {},
    requestedBy: {
      id: item?.requestedByUserId || "",
      name: item?.requestedByName || "",
      role: item?.requestedByRole || "",
    },
    reviewedBy: item?.reviewedByUserId
      ? {
          id: item?.reviewedByUserId || "",
          name: item?.reviewedByName || "",
          role: item?.reviewedByRole || "",
        }
      : null,
  };
};

const mapTimeline = (entry, actorProfile = null) => {
  const obj = typeof entry?.toJSON === "function" ? entry.toJSON() : entry;
  const actorObj =
    actorProfile && typeof actorProfile?.toJSON === "function"
      ? actorProfile.toJSON()
      : actorProfile;
  const actorImage = normalizeStoredImageUrl(actorObj?.profileImageUrl || "");
  const actorImageVersion = actorObj?.updatedAt
    ? new Date(actorObj.updatedAt).getTime()
    : null;

  return {
    id: obj?.id,
    action: obj?.action || "",
    details: obj?.details || "",
    changedBy: obj?.changedBy || "System",
    at: obj?.changedAt || obj?.createdAt || null,
    changedByAvatar: actorImage,
    changedByProfileImageUrl: actorImage,
    changedByProfileImageVersion: actorImageVersion,
  };
};

const normalizeActorValue = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const buildActorProfileLookup = async (timelineItems = []) => {
  const actorValues = Array.from(
    new Set(
      timelineItems
        .map((item) => String(item?.changedBy || "").trim())
        .filter(Boolean),
    ),
  );

  if (actorValues.length === 0) {
    return new Map();
  }

  const users = await User.findAll({
    where: {
      [Op.or]: [
        { name: { [Op.in]: actorValues } },
        { userName: { [Op.in]: actorValues } },
        { email: { [Op.in]: actorValues } },
      ],
    },
    attributes: [
      "id",
      "name",
      "userName",
      "email",
      "profileImageUrl",
      "updatedAt",
    ],
  });

  const lookup = new Map();
  users.forEach((user) => {
    const u = typeof user?.toJSON === "function" ? user.toJSON() : user;
    [u?.name, u?.userName, u?.email].forEach((value) => {
      const key = normalizeActorValue(value);
      if (key && !lookup.has(key)) {
        lookup.set(key, u);
      }
    });
  });

  return lookup;
};

let hasSyncedLeadTimeline = false;
const ensureLeadTimelineReady = async () => {
  if (hasSyncedLeadTimeline) return;
  await LeadTimeline.sync();
  hasSyncedLeadTimeline = true;
};

const getActorName = (req) => {
  return (
    String(
      req.user?.name || req.user?.userName || req.user?.email || "System",
    ).trim() || "System"
  );
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

const addLeadTimelineEntry = async ({ leadId, action, details, changedBy }) => {
  if (!leadId || !action || !details) return null;

  await ensureLeadTimelineReady();
  const timeline = await LeadTimeline.create({
    leadId,
    action: String(action).trim(),
    details: String(details).trim(),
    changedBy: String(changedBy || "System").trim() || "System",
    changedAt: new Date(),
  });

  return timeline;
};

const addLeadTimeline = async ({ req, leadId, action, details }) => {
  const actorName = getActorName(req);
  const timeline = await addLeadTimelineEntry({
    leadId,
    action,
    details,
    changedBy: actorName,
  });

  return mapTimeline(timeline, req?.user || null);
};

const buildLeadMasterDataNextValues = ({
  lead,
  payload = {},
  actorId = "",
  actorName = "System",
}) => {
  const assignedTo =
    payload?.assignedTo !== undefined
      ? String(payload.assignedTo || "").trim()
      : lead.assignedTo;
  const assignedToId =
    payload?.assignedToId !== undefined
      ? String(payload.assignedToId || "").trim()
      : lead.assignedToId;
  const explicitLeadPool =
    payload?.leadPool !== undefined
      ? String(payload.leadPool || "").trim()
      : "";
  const nextLeadPool =
    explicitLeadPool ||
    (hasAssignedToValue(assignedTo) || Boolean(assignedToId)
      ? ASSIGNED_LEAD_POOL
      : UNASSIGNED_LEAD_POOL);
  const isAssigned = isAssignedState({
    assignedTo,
    assignedToId,
    leadPool: nextLeadPool,
  });
  const nextValues = {
    name:
      payload?.name !== undefined
        ? String(payload.name || "").trim()
        : lead.name,
    email:
      payload?.email !== undefined
        ? String(payload.email || "").trim()
        : lead.email,
    phone:
      payload?.phone !== undefined || payload?.phoneNumber !== undefined
        ? String(payload.phone || payload.phoneNumber || "").trim()
        : lead.phone,
    fax:
      payload?.fax !== undefined ? String(payload.fax || "").trim() : lead.fax,
    gender:
      payload?.gender !== undefined
        ? String(payload.gender || "").trim()
        : lead.gender,
    dateOfBirth:
      payload?.dateOfBirth !== undefined
        ? String(payload.dateOfBirth || "").trim()
        : lead.dateOfBirth,
    country:
      payload?.country !== undefined
        ? String(payload.country || "").trim()
        : lead.country,
    preferredLanguage:
      payload?.language !== undefined ||
      payload?.preferredLanguage !== undefined
        ? String(payload.language || payload.preferredLanguage || "").trim()
        : lead.preferredLanguage,
    campaign:
      payload?.campaign !== undefined
        ? String(payload.campaign || "").trim()
        : lead.campaign,
    leadPool: nextLeadPool,
    assignedTo,
    assignedToId,
    assignedDate:
      payload?.assignedDate !== undefined
        ? payload.assignedDate
          ? new Date(payload.assignedDate)
          : null
        : isAssigned
          ? lead.assignedDate || new Date()
          : null,
    wasEverAssigned: Boolean(lead.wasEverAssigned || isAssigned),
    followUp:
      payload?.followUp !== undefined
        ? String(payload.followUp || "").trim()
        : lead.followUp,
    ComplaintsType:
      payload?.ComplaintsType !== undefined
        ? String(payload.ComplaintsType || "").trim()
        : lead.ComplaintsType,
  };

  const previousFollowUpValue = normalizeCompareValue(
    "followUp",
    lead.followUp,
  );
  const nextFollowUpValue = normalizeCompareValue(
    "followUp",
    nextValues.followUp,
  );
  const followUpChanged = previousFollowUpValue !== nextFollowUpValue;

  if (followUpChanged) {
    if (nextFollowUpValue) {
      nextValues.followUpSetById = String(actorId || "").trim();
      nextValues.followUpSetBy =
        String(actorName || "System").trim() || "System";
      nextValues.followUpSetAt = new Date();
    } else {
      nextValues.followUpSetById = "";
      nextValues.followUpSetBy = "";
      nextValues.followUpSetAt = null;
    }

    nextValues.followUpHandled = false;
    nextValues.followUpHandledAt = null;
    nextValues.followUpHandledById = "";
  }

  const changedFields = Object.keys(MASTER_DATA_FIELD_LABELS).filter(
    (field) =>
      normalizeCompareValue(field, lead[field]) !==
      normalizeCompareValue(field, nextValues[field]),
  );

  return { nextValues, changedFields };
};

const applyLeadMasterDataUpdate = async ({
  lead,
  payload,
  actorId = "",
  actorName = "System",
  timelineAction = "Master Data Updated",
  timelineDetailsPrefix = "Updated",
}) => {
  const { nextValues, changedFields } = buildLeadMasterDataNextValues({
    lead,
    payload,
    actorId,
    actorName,
  });

  await lead.update(nextValues);

  let timelineEntry = null;
  if (changedFields.length > 0) {
    const labels = changedFields.map(
      (field) => MASTER_DATA_FIELD_LABELS[field],
    );
    const timelineRecord = await addLeadTimelineEntry({
      leadId: lead.id,
      action: timelineAction,
      details: `${timelineDetailsPrefix} ${labels.join(", ")}`,
      changedBy: actorName,
    });
    timelineEntry = mapTimeline(timelineRecord, null);
  }

  return { lead, timelineEntry, changedFields, nextValues };
};

const createLeadMasterDataNotifications = async ({
  requester,
  lead,
  changedFields,
  requestId,
}) => {
  const recipients = await User.findAll({
    where: {
      role: {
        [Op.in]: ["admin", "manager"],
      },
    },
    attributes: ["id", "name", "role"],
  });

  const recipientPayload = recipients
    .filter(
      (recipient) =>
        String(recipient.id) !== String(requester?._id || requester?.id || ""),
    )
    .map((recipient) => ({
      userId: recipient.id,
      title: "Lead Update Approval Needed",
      message: `${requester?.name || requester?.userName || "Employee"} requested master data changes for "${lead?.name || "Lead"}".`,
      type: MASTER_DATA_REQUEST_NOTIFICATION_TYPE,
      module: "lead",
      isRead: false,
      meta: {
        requestId,
        leadId: lead?.id || "",
        leadName: lead?.name || "",
        requestedByUserId: requester?._id || requester?.id || "",
        requestedByName: requester?.name || requester?.userName || "Employee",
        changedFields,
      },
    }));

  if (recipientPayload.length > 0) {
    await Notification.bulkCreate(recipientPayload);
  }
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
    return res
      .status(500)
      .json({ message: err.message || "Failed to load leads" });
  }
};

const createLead = async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const email = String(req.body?.email || "").trim();
    const phone = String(req.body?.phone || req.body?.phoneNumber || "").trim();

    if (!name || !email || !phone) {
      return res
        .status(400)
        .json({ message: "name, email and phone are required" });
    }

    const assignedTo = String(req.body?.assignedTo || "").trim();
    const assignedToId = String(req.body?.assignedToId || "").trim();
    const requestedLeadPool = String(req.body?.leadPool || "").trim();
    const isAssigned = isAssignedState({
      assignedTo,
      assignedToId,
      leadPool: requestedLeadPool,
    });

    const lead = await Lead.create({
      name,
      email,
      phone,
      country: String(req.body?.country || "").trim(),
      preferredLanguage: String(
        req.body?.language || req.body?.preferredLanguage || "",
      ).trim(),
      assignedTo,
      assignedToId,
      followUp: String(req.body?.followUp || "").trim(),
      stage: String(req.body?.stage || "New").trim(),
      tag: String(req.body?.tag || "New Lead").trim(),
      comment: String(req.body?.comment || "").trim(),
      assignedDate: req.body?.assignedDate
        ? new Date(req.body.assignedDate)
        : isAssigned
          ? new Date()
          : null,
      wasEverAssigned: isAssigned,
      ComplaintsType: String(req.body?.ComplaintsType || "Standard").trim(),
      uploadedBy: String(
        req.body?.uploadedBy || req.user?.name || req.user?.email || "System",
      ).trim(),
      campaign: String(req.body?.campaign || "General Campaign").trim(),
      source: String(req.body?.source || "manual").trim(),
      leadPool:
        requestedLeadPool ||
        (isAssigned ? ASSIGNED_LEAD_POOL : UNASSIGNED_LEAD_POOL),
      fax: String(req.body?.fax || "").trim(),
      gender: String(req.body?.gender || "").trim(),
      dateOfBirth: String(req.body?.dateOfBirth || "").trim(),
    });

    return res.status(201).json({ lead: mapLead(lead) });
  } catch (err) {
    return res
      .status(500)
      .json({ message: err.message || "Failed to create lead" });
  }
};

const bulkUploadLeads = async (req, res) => {
  try {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];

    if (rows.length === 0) {
      return res.status(400).json({ message: "rows are required" });
    }

    const normalizedRows = rows.map((row, index) => ({
      rowNumber: Number(row?.rowNumber) || index + 2,
      email: String(row?.email || "").trim(),
      name: String(row?.name || "").trim(),
      phone: String(row?.phone || row?.phoneNumber || "").trim(),
      campaign: String(row?.campaign || "").trim(),
      comment: String(row?.comment || "").trim(),
    }));

    const emailSet = new Set(
      normalizedRows.map((row) => row.email.toLowerCase()).filter(Boolean)
    );
    const existingLeads = emailSet.size
      ? await Lead.findAll({
          where: {
            email: {
              [Op.in]: Array.from(emailSet),
            },
          },
          attributes: ["email"],
        })
      : [];

    const existingEmailSet = new Set(
      existingLeads.map((lead) => String(lead.email || "").trim().toLowerCase())
    );
    const seenInFile = new Set();
    const incomplete = [];
    const toCreate = [];
    let existingCount = 0;

    normalizedRows.forEach((row) => {
      const missingFields = [];
      if (!row.email) missingFields.push("Email");
      if (!row.name) missingFields.push("Name");
      if (!row.phone) missingFields.push("Phone");

      if (missingFields.length > 0) {
        incomplete.push({
          rowNumber: row.rowNumber,
          reason: `Missing ${missingFields.join(", ")}`,
        });
        return;
      }

      const normalizedEmail = row.email.toLowerCase();
      if (existingEmailSet.has(normalizedEmail) || seenInFile.has(normalizedEmail)) {
        existingCount += 1;
        return;
      }

      seenInFile.add(normalizedEmail);
      toCreate.push({
        name: row.name,
        email: row.email,
        phone: row.phone,
        comment: row.comment || "Imported from Excel",
        campaign: row.campaign || "Excel Upload",
        source: "excel",
        stage: "New",
        tag: "New Lead",
        uploadedBy: String(
          req.body?.uploadedBy || req.user?.name || req.user?.email || "System"
        ).trim(),
        leadPool: UNASSIGNED_LEAD_POOL,
      });
    });

    const createdLeads = toCreate.length > 0 ? await Lead.bulkCreate(toCreate) : [];

    return res.status(201).json({
      message: "Leads uploaded successfully",
      summary: {
        totalRows: normalizedRows.length,
        newLeads: createdLeads.length,
        existingLeads: existingCount,
        incompleteLeads: incomplete.length,
      },
      data: {
        created: createdLeads.map(mapLead),
        incomplete,
      },
    });
  } catch (err) {
    return res
      .status(500)
      .json({ message: err.message || "Failed to upload leads" });
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
    return res
      .status(500)
      .json({ message: err.message || "Failed to update bookmark" });
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
    return res
      .status(500)
      .json({ message: err.message || "Failed to update archive state" });
  }
};

const updateMasterData = async (req, res) => {
  try {
    const lead = await ensureLead(req.params.id, res);
    if (!lead) return;

    const assignedTo =
      req.body?.assignedTo !== undefined
        ? String(req.body.assignedTo || "").trim()
        : lead.assignedTo;
    const assignedToId =
      req.body?.assignedToId !== undefined
        ? String(req.body.assignedToId || "").trim()
        : lead.assignedToId;
    const explicitLeadPool =
      req.body?.leadPool !== undefined
        ? String(req.body.leadPool || "").trim()
        : "";
    const nextLeadPool =
      explicitLeadPool ||
      (hasAssignedToValue(assignedTo) || Boolean(assignedToId)
        ? ASSIGNED_LEAD_POOL
        : UNASSIGNED_LEAD_POOL);
    const isAssigned = isAssignedState({
      assignedTo,
      assignedToId,
      leadPool: nextLeadPool,
    });
    const nextValues = {
      name:
        req.body?.name !== undefined
          ? String(req.body.name || "").trim()
          : lead.name,
      email:
        req.body?.email !== undefined
          ? String(req.body.email || "").trim()
          : lead.email,
      phone:
        req.body?.phone !== undefined || req.body?.phoneNumber !== undefined
          ? String(req.body.phone || req.body.phoneNumber || "").trim()
          : lead.phone,
      fax:
        req.body?.fax !== undefined
          ? String(req.body.fax || "").trim()
          : lead.fax,
      gender:
        req.body?.gender !== undefined
          ? String(req.body.gender || "").trim()
          : lead.gender,
      dateOfBirth:
        req.body?.dateOfBirth !== undefined
          ? String(req.body.dateOfBirth || "").trim()
          : lead.dateOfBirth,
      country:
        req.body?.country !== undefined
          ? String(req.body.country || "").trim()
          : lead.country,
      preferredLanguage:
        req.body?.language !== undefined ||
        req.body?.preferredLanguage !== undefined
          ? String(req.body.language || req.body.preferredLanguage || "").trim()
          : lead.preferredLanguage,
      campaign:
        req.body?.campaign !== undefined
          ? String(req.body.campaign || "").trim()
          : lead.campaign,
      leadPool: nextLeadPool,
      assignedTo,
      assignedToId,
      assignedDate:
        req.body?.assignedDate !== undefined
          ? req.body.assignedDate
            ? new Date(req.body.assignedDate)
            : null
          : isAssigned
            ? lead.assignedDate || new Date()
            : null,
      wasEverAssigned: Boolean(lead.wasEverAssigned || isAssigned),
      followUp:
        req.body?.followUp !== undefined
          ? String(req.body.followUp || "").trim()
          : lead.followUp,
      ComplaintsType:
        req.body?.ComplaintsType !== undefined
          ? String(req.body.ComplaintsType || "").trim()
          : lead.ComplaintsType,
    };

    const previousFollowUpValue = normalizeCompareValue(
      "followUp",
      lead.followUp,
    );
    const nextFollowUpValue = normalizeCompareValue(
      "followUp",
      nextValues.followUp,
    );
    const followUpChanged = previousFollowUpValue !== nextFollowUpValue;

    if (followUpChanged) {
      const actorId = String(req.user?._id || req.user?.id || "");
      const actorName = getActorName(req);
      if (nextFollowUpValue) {
        nextValues.followUpSetById = actorId;
        nextValues.followUpSetBy = actorName;
        nextValues.followUpSetAt = new Date();
      } else {
        nextValues.followUpSetById = "";
        nextValues.followUpSetBy = "";
        nextValues.followUpSetAt = null;
      }

      nextValues.followUpHandled = false;
      nextValues.followUpHandledAt = null;
      nextValues.followUpHandledById = "";
    }

    const changedFields = Object.keys(MASTER_DATA_FIELD_LABELS).filter(
      (field) =>
        normalizeCompareValue(field, lead[field]) !==
        normalizeCompareValue(field, nextValues[field]),
    );

    await lead.update(nextValues);

    let timelineEntry = null;
    if (changedFields.length > 0) {
      const labels = changedFields.map(
        (field) => MASTER_DATA_FIELD_LABELS[field],
      );
      timelineEntry = await addLeadTimeline({
        req,
        leadId: lead.id,
        action: "Master Data Updated",
        details: `Updated ${labels.join(", ")}`,
      });
    }

    return res.json({ lead: mapLead(lead), timeline: timelineEntry });
  } catch (err) {
    return res
      .status(500)
      .json({ message: err.message || "Failed to update lead master data" });
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
    return res
      .status(500)
      .json({ message: err.message || "Failed to update lead tag" });
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
    return res
      .status(500)
      .json({ message: err.message || "Failed to update lead stage" });
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

    const actorLookup = await buildActorProfileLookup(items);
    const mappedItems = items.map((item) =>
      mapTimeline(item, actorLookup.get(normalizeActorValue(item?.changedBy))),
    );

    return res.json({ items: mappedItems });
  } catch (err) {
    return res
      .status(500)
      .json({ message: err.message || "Failed to load lead timeline" });
  }
};

const addComment = async (req, res) => {
  try {
    const lead = await ensureLead(req.params.id, res);
    if (!lead) return;

    const comment = String(req.body?.comment || "").trim();
    if (!comment) {
      return res.status(400).json({ message: "Comment is required" });
    }

    const timelineEntry = await addLeadTimeline({
      req,
      leadId: lead.id,
      action: "Comment Added",
      details: comment,
    });

    // Keep latest comment in lead master record for backward compatibility.
    lead.comment = comment;
    await lead.save();

    return res
      .status(201)
      .json({ comment: timelineEntry, lead: mapLead(lead) });
  } catch (err) {
    return res
      .status(500)
      .json({ message: err.message || "Failed to add comment" });
  }
};

const listDueReminders = async (req, res) => {
  try {
    const userId = String(req.user?._id || req.user?.id || "");
    if (!userId) {
      return res.json({ items: [] });
    }

    const leads = await Lead.findAll({
      where: {
        followUpSetById: userId,
        followUpHandled: false,
        followUp: { [Op.notIn]: ["", "N/A"] },
      },
      order: [["updatedAt", "DESC"]],
      limit: 500,
    });

    const now = Date.now();
    const expiredLeadIds = [];

    const items = leads
      .map((lead) => {
        const mappedLead = mapLead(lead);
        const reminderDate = new Date(mappedLead.followUp);
        if (Number.isNaN(reminderDate.getTime())) {
          return null;
        }

        // Auto-reset reminders once reminder time has passed.
        if (now >= reminderDate.getTime()) {
          expiredLeadIds.push(mappedLead.id);
          return null;
        }

        const notifyAt = reminderDate.getTime() - 10 * 60 * 1000;
        if (now < notifyAt) {
          return null;
        }

        return {
          id: mappedLead.id,
          name: mappedLead.name,
          followUp: mappedLead.followUp,
          followUpISO: reminderDate.toISOString(),
          notifyAtISO: new Date(notifyAt).toISOString(),
          reminderKey: `${userId}_${mappedLead.id}_${reminderDate.toISOString()}`,
        };
      })
      .filter(Boolean)
      .sort(
        (a, b) =>
          new Date(a.followUpISO).getTime() - new Date(b.followUpISO).getTime(),
      );

    if (expiredLeadIds.length > 0) {
      await Lead.update(
        {
          followUp: "",
          followUpSetById: "",
          followUpSetBy: "",
          followUpSetAt: null,
          followUpHandled: true,
          followUpHandledAt: new Date(),
          followUpHandledById: userId,
        },
        {
          where: { id: { [Op.in]: expiredLeadIds } },
        },
      );
    }

    return res.json({ items });
  } catch (err) {
    console.warn("Failed to load due reminders:", err.message || err);
    return res.json({ items: [] });
  }
};

const markReminderHandled = async (req, res) => {
  try {
    const lead = await ensureLead(req.params.id, res);
    if (!lead) return;

    const userId = String(req.user?._id || req.user?.id || "");
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (String(lead.followUpSetById || "") !== userId) {
      return res
        .status(403)
        .json({ message: "You can only handle reminders you created" });
    }

    if (
      !String(lead.followUp || "").trim() ||
      String(lead.followUp).trim() === "N/A"
    ) {
      return res
        .status(400)
        .json({ message: "No active reminder set for this lead" });
    }

    // Viewing from reminder popup is treated as completing that reminder.
    lead.followUp = "";
    lead.followUpSetById = "";
    lead.followUpSetBy = "";
    lead.followUpSetAt = null;
    lead.followUpHandled = true;
    lead.followUpHandledAt = new Date();
    lead.followUpHandledById = userId;
    await lead.save();

    return res.json({ lead: mapLead(lead) });
  } catch (err) {
    return res
      .status(500)
      .json({ message: err.message || "Failed to mark reminder handled" });
  }
};

const deleteLead = async (req, res) => {
  let transaction = null;
  try {
    transaction = await Lead.sequelize.transaction();

    const lead = await Lead.findByPk(req.params.id, { transaction });
    if (!lead) {
      await transaction.rollback();
      transaction = null;
      return res.status(404).json({ message: "Lead not found" });
    }

    // Remove dependent timeline rows first to satisfy FK constraints.
    await LeadTimeline.destroy({
      where: { leadId: lead.id },
      transaction,
    });

    await lead.destroy({ transaction });
    await transaction.commit();
    transaction = null;

    return res.json({ message: "Lead deleted successfully" });
  } catch (err) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch {
        // ignore rollback errors and return original failure
      }
    }
    return res
      .status(500)
      .json({ message: err.message || "Failed to delete lead" });
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
    return res
      .status(500)
      .json({ message: err.message || "Failed to load employees" });
  }
};

const hasAssignedToWhere = {
  [Op.and]: [
    { assignedTo: { [Op.not]: null } },
    { assignedTo: { [Op.ne]: "" } },
    { assignedTo: { [Op.ne]: "Unassigned" } },
  ],
};

const hasAssignedToIdWhere = {
  [Op.and]: [
    { assignedToId: { [Op.not]: null } },
    { assignedToId: { [Op.ne]: "" } },
  ],
};

const isAssignedWhere = {
  [Op.or]: [
    { leadPool: ASSIGNED_LEAD_POOL },
    hasAssignedToWhere,
    hasAssignedToIdWhere,
  ],
};

const isUnassignedWhere = {
  [Op.and]: [
    { wasEverAssigned: true },
    {
      [Op.or]: [
        { leadPool: UNASSIGNED_LEAD_POOL },
        {
          [Op.and]: [
            {
              [Op.or]: [{ leadPool: null }, { leadPool: "" }],
            },
            {
              [Op.or]: [
                { assignedTo: null },
                { assignedTo: "" },
                { assignedTo: "Unassigned" },
              ],
            },
            {
              [Op.or]: [{ assignedToId: null }, { assignedToId: "" }],
            },
          ],
        },
      ],
    },
  ],
};

const getAssignStats = async (_req, res) => {
  try {
    const [total, assigned, unassigned] = await Promise.all([
      Lead.count(),
      Lead.count({ where: isAssignedWhere }),
      Lead.count({ where: isUnassignedWhere }),
    ]);

    return res.json({ total, assigned, unassigned });
  } catch (err) {
    return res
      .status(500)
      .json({ message: err.message || "Failed to load assign stats" });
  }
};

const getAssignLeads = async (req, res) => {
  try {
    const page = clamp(toInt(req.query.page, 1), 1, 100000);
    const limit = clamp(toInt(req.query.limit, 10), 1, 1000);
    const filter = String(req.query.filter || "all")
      .trim()
      .toLowerCase();
    const search = String(req.query.search || "").trim();

    let where = {};
    if (filter === "assigned") {
      where = mergeWhere(where, isAssignedWhere);
    } else if (filter === "unassigned") {
      where = mergeWhere(where, isUnassignedWhere);
    } else if (filter === "new") {
      where = mergeWhere(where, {
        [Op.or]: [
          { stage: { [Op.in]: ["New"] } },
          { tag: { [Op.in]: ["New", "New Lead"] } },
        ],
      });
    } else if (
      filter === "sale_done" ||
      filter === "sale done" ||
      filter === "saledone"
    ) {
      where = mergeWhere(where, {
        [Op.or]: [
          { stage: { [Op.in]: ["Converted", "Sale Done"] } },
          { tag: { [Op.in]: ["Sale Done", "Converted"] } },
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
    return res
      .status(500)
      .json({ message: err.message || "Failed to load assign leads" });
  }
};

const assignLeads = async (req, res) => {
  try {
    const employeeName = String(req.body?.employeeName || "").trim();
    const employeeId = String(req.body?.employeeId || "").trim();
    const leadIds = Array.isArray(req.body?.leadIds)
      ? req.body.leadIds.filter(Boolean)
      : [];

    if (!employeeName || leadIds.length === 0) {
      return res
        .status(400)
        .json({ message: "employeeName and leadIds are required" });
    }

    const [affected] = await Lead.update(
      {
        assignedTo: employeeName,
        assignedToId: employeeId,
        assignedDate: new Date(),
        leadPool: ASSIGNED_LEAD_POOL,
        wasEverAssigned: true,
      },
      {
        where: { id: { [Op.in]: leadIds } },
      },
    );

    return res.json({
      message: "Leads assigned successfully",
      updated: affected,
    });
  } catch (err) {
    return res
      .status(500)
      .json({ message: err.message || "Failed to assign leads" });
  }
};

const unassignLeads = async (req, res) => {
  try {
    const leadIds = Array.isArray(req.body?.leadIds)
      ? req.body.leadIds.filter(Boolean)
      : [];
    if (leadIds.length === 0) {
      return res.status(400).json({ message: "leadIds are required" });
    }

    const [affected] = await Lead.update(
      {
        assignedTo: "",
        assignedToId: "",
        assignedDate: null,
        leadPool: UNASSIGNED_LEAD_POOL,
        wasEverAssigned: true,
      },
      {
        where: { id: { [Op.in]: leadIds } },
      },
    );

    return res.json({
      message: "Leads unassigned successfully",
      updated: affected,
    });
  } catch (err) {
    return res
      .status(500)
      .json({ message: err.message || "Failed to unassign leads" });
  }
};

module.exports = {
  listLeads,
  createLead,
  bulkUploadLeads,
  toggleBookmark,
  toggleArchive,
  updateMasterData,
  updateTag,
  updateStage,
  listTimeline,
  addComment,
  listDueReminders,
  markReminderHandled,
  deleteLead,
  getAssignEmployees,
  getAssignStats,
  getAssignLeads,
  assignLeads,
  unassignLeads,
};
