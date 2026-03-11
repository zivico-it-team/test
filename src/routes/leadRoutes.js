const express = require("express");

const { protect, authorize } = require("../middleware/authMiddleware");
const {
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
} = require("../controllers/leadController");

const router = express.Router();

router.get("/", protect, authorize("admin", "manager", "employee"), listLeads);
router.post("/", protect, authorize("admin", "manager"), createLead);

router.get("/assign/employees", protect, authorize("admin", "manager"), getAssignEmployees);
router.get("/assign/stats", protect, authorize("admin", "manager"), getAssignStats);
router.get("/assign", protect, authorize("admin", "manager"), getAssignLeads);
router.post("/assign", protect, authorize("admin", "manager"), assignLeads);
router.post("/unassign", protect, authorize("admin", "manager"), unassignLeads);
router.get("/:id/timeline", protect, authorize("admin", "manager", "employee"), listTimeline);

router.patch("/:id/bookmark", protect, authorize("admin", "manager", "employee"), toggleBookmark);
router.patch("/:id/archive", protect, authorize("admin", "manager", "employee"), toggleArchive);
router.put("/:id/master-data", protect, authorize("admin", "manager", "employee"), updateMasterData);
router.put("/:id/tag", protect, authorize("admin", "manager", "employee"), updateTag);
router.put("/:id/stage", protect, authorize("admin", "manager", "employee"), updateStage);
router.delete("/:id", protect, authorize("admin", "manager"), deleteLead);

module.exports = router;
