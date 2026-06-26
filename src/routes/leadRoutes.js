const express = require("express");

const { protect, authorize, forbidHRLeadAccess } = require("../middleware/authMiddleware");
const {
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
  updateComment,
  listDueReminders,
  markReminderHandled,
  deleteLead,
  getAssignEmployees,
  getAssignStats,
  getAssignLeads,
  assignLeads,
  unassignLeads,
} = require("../controllers/leadController");

const router = express.Router();

router.get("/", protect, forbidHRLeadAccess, authorize("admin", "manager", "employee"), listLeads);
router.post("/", protect, forbidHRLeadAccess, authorize("admin", "manager"), createLead);
router.post("/upload", protect, forbidHRLeadAccess, authorize("admin", "manager"), bulkUploadLeads);

router.get("/assign/employees", protect, forbidHRLeadAccess, authorize("admin", "manager"), getAssignEmployees);
router.get("/assign/stats", protect, forbidHRLeadAccess, authorize("admin", "manager"), getAssignStats);
router.get("/assign", protect, forbidHRLeadAccess, authorize("admin", "manager"), getAssignLeads);
router.post("/assign", protect, forbidHRLeadAccess, authorize("admin", "manager"), assignLeads);
router.post("/unassign", protect, forbidHRLeadAccess, authorize("admin", "manager"), unassignLeads);
router.get("/reminders/due", protect, forbidHRLeadAccess, authorize("admin", "manager", "employee"), listDueReminders);
router.patch("/:id/reminder/handled", protect, forbidHRLeadAccess, authorize("admin", "manager", "employee"), markReminderHandled);
router.get("/:id/timeline", protect, forbidHRLeadAccess, authorize("admin", "manager", "employee"), listTimeline);
router.post("/:id/comments", protect, forbidHRLeadAccess, authorize("admin", "manager", "employee"), addComment);
router.put("/:id/comments/:commentId", protect, forbidHRLeadAccess, authorize("admin", "manager", "employee"), updateComment);

router.patch("/:id/bookmark", protect, forbidHRLeadAccess, authorize("admin", "manager", "employee"), toggleBookmark);
router.patch("/:id/archive", protect, forbidHRLeadAccess, authorize("admin", "manager", "employee"), toggleArchive);
router.put("/:id/master-data", protect, forbidHRLeadAccess, authorize("admin", "manager", "employee"), updateMasterData);
router.put("/:id/tag", protect, forbidHRLeadAccess, authorize("admin", "manager", "employee"), updateTag);
router.put("/:id/stage", protect, forbidHRLeadAccess, authorize("admin", "manager", "employee"), updateStage);
router.delete("/:id", protect, forbidHRLeadAccess, authorize("admin", "manager"), deleteLead);

module.exports = router;
