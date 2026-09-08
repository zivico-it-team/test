const { Op } = require("sequelize");
const ComplianceComplaint = require("../models/ComplianceComplaint");
const ComplianceComplaintComment = require("../models/ComplianceComplaintComment");
const User = require("../models/User");

const value = (item) => String(item || "").trim().toLowerCase();
const professionalOf = (user) => {
  const professional = user?.professional;
  if (professional && typeof professional === "object" && !Array.isArray(professional)) {
    return professional;
  }
  if (typeof professional === "string") {
    try {
      const parsed = JSON.parse(professional);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch (_) {
      // Legacy records can contain an empty or malformed JSON value.
    }
  }
  return {};
};
const departmentOf = (user) => {
  const professional = professionalOf(user);
  return value(professional.department || professional.teamName || user?.department);
};
const isActiveEmployee = (user) => {
  const professional = professionalOf(user);
  return value(professional.employmentStatus || user?.employmentStatus || user?.status || "active") !== "inactive";
};
const targetsOf = (record) => {
  const raw = record?.targets;
  if (Array.isArray(raw)) return raw;
  try { return Array.isArray(JSON.parse(raw || "[]")) ? JSON.parse(raw) : []; } catch (_) { return []; }
};
const toComplaintResponse = (record, comments = []) => {
  const data = typeof record?.toJSON === "function" ? record.toJSON() : record;
  return { ...data, targets: targetsOf(data), comments };
};
const isComplianceEmployee = (user) =>
  value(user?.role) === "employee" && departmentOf(user) === "compliance";
const canReviewAll = (user) => {
  const role = value(user?.role);
  return ["admin", "master"].includes(role) ||
    (role === "manager" && ["compliance", "sales", "retention"].includes(departmentOf(user)));
};
const canUseCompliance = (user) => isComplianceEmployee(user) || canReviewAll(user);
const canCommentOnComplaints = (user) =>
  value(user?.role) === "manager" && ["sales", "retention"].includes(departmentOf(user));

const requireComplianceAccess = (req, res) => {
  if (!canUseCompliance(req.user)) {
    res.status(403).json({ message: "Compliance access is restricted to Compliance staff and authorized reviewers" });
    return false;
  }
  return true;
};

const getSalesEmployees = async (req, res) => {
  if (!requireComplianceAccess(req, res)) return;
  try {
    const users = await User.findAll({
      where: { role: "employee", approvalStatus: "approved" },
      attributes: ["id", "name", "userName", "professional"],
      order: [["name", "ASC"]],
    });
    res.json(users
      .filter((user) => departmentOf(user) === "sales" && isActiveEmployee(user))
      .map((user) => ({
        id: user.id,
        name: user.userName || user.name,
        userName: user.userName || user.name,
        fullName: user.name || user.userName,
        department: "Sales",
      })));
  } catch (error) {
    res.status(500).json({ message: "Failed to load Sales employees" });
  }
};

const listComplaints = async (req, res) => {
  if (!requireComplianceAccess(req, res)) return;
  try {
    const where = canReviewAll(req.user) ? {} : { reportedById: req.user.id };
    const complaints = await ComplianceComplaint.findAll({ where, order: [["createdAt", "DESC"]] });
    const complaintIds = complaints.map((complaint) => complaint.id);
    const comments = complaintIds.length
      ? await ComplianceComplaintComment.findAll({
        where: { complaintId: { [Op.in]: complaintIds } },
        order: [["createdAt", "ASC"]],
      })
      : [];
    const commentsByComplaint = new Map();
    comments.forEach((comment) => {
      const commentData = comment.toJSON();
      const existing = commentsByComplaint.get(String(commentData.complaintId)) || [];
      existing.push(commentData);
      commentsByComplaint.set(String(commentData.complaintId), existing);
    });
    res.json(complaints.map((complaint) =>
      toComplaintResponse(complaint, commentsByComplaint.get(String(complaint.id)) || []),
    ));
  } catch (error) {
    res.status(500).json({ message: "Failed to load complaints" });
  }
};

const createComplaint = async (req, res) => {
  if (!requireComplianceAccess(req, res)) return;
  if (!isComplianceEmployee(req.user)) {
    return res.status(403).json({ message: "Only Compliance employees can submit complaints" });
  }
  const entries = Array.isArray(req.body?.complaints)
    ? req.body.complaints
    : [{ targetId: req.body?.targetIds?.[0], complaint: req.body?.complaint }];
  const cleanedEntries = entries
    .map((entry) => ({ targetId: String(entry?.targetId || "").trim(), complaint: String(entry?.complaint || "").trim() }))
    .filter((entry) => entry.targetId || entry.complaint);
  if (!cleanedEntries.length || cleanedEntries.some((entry) => !entry.targetId || !entry.complaint)) {
    return res.status(400).json({ message: "Each complaint row needs a Sales employee and complaint text" });
  }
  if (cleanedEntries.length > 100) {
    return res.status(400).json({ message: "A maximum of 100 complaints can be submitted at once" });
  }
  try {
    const targetIds = [...new Set(cleanedEntries.map((entry) => entry.targetId))];
    const users = await User.findAll({
      where: { id: { [Op.in]: targetIds }, role: "employee", approvalStatus: "approved" },
      attributes: ["id", "name", "userName", "professional"],
    });
    const targetsById = new Map(users.filter((user) => departmentOf(user) === "sales" && isActiveEmployee(user))
      .map((user) => [String(user.id), {
        id: user.id,
        name: user.userName || user.name,
        userName: user.userName || user.name,
        fullName: user.name || user.userName,
      }]));
    if (targetsById.size !== targetIds.length) {
      return res.status(400).json({ message: "Complaints can only be submitted against current Sales employees" });
    }
    const records = await ComplianceComplaint.bulkCreate(cleanedEntries.map((entry) => ({
      reportedById: req.user.id,
      reportedByName: req.user.name || req.user.userName || "Compliance employee",
      targets: [targetsById.get(entry.targetId)],
      complaint: entry.complaint,
    })));
    return res.status(201).json(records.map(toComplaintResponse));
  } catch (error) {
    return res.status(500).json({ message: "Failed to submit complaint" });
  }
};

const createComplaintComment = async (req, res) => {
  if (!requireComplianceAccess(req, res)) return;
  if (!canCommentOnComplaints(req.user)) {
    return res.status(403).json({ message: "Only Sales and Retention managers can comment on complaints" });
  }

  const complaintId = String(req.params?.complaintId || "").trim();
  const commentText = String(req.body?.comment || "").trim();
  if (!commentText) {
    return res.status(400).json({ message: "Comment text is required" });
  }
  if (commentText.length > 5000) {
    return res.status(400).json({ message: "A comment cannot exceed 5000 characters" });
  }

  try {
    const complaint = await ComplianceComplaint.findByPk(complaintId, { attributes: ["id"] });
    if (!complaint) {
      return res.status(404).json({ message: "Complaint not found" });
    }
    const comment = await ComplianceComplaintComment.create({
      complaintId: complaint.id,
      authorId: req.user.id,
      authorName: req.user.name || req.user.userName || "Manager",
      authorDepartment: departmentOf(req.user),
      comment: commentText,
    });
    return res.status(201).json(comment.toJSON());
  } catch (error) {
    return res.status(500).json({ message: "Failed to add complaint comment" });
  }
};

module.exports = { getSalesEmployees, listComplaints, createComplaint, createComplaintComment };
