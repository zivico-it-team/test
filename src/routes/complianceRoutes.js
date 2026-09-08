const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const {
  getSalesEmployees,
  listComplaints,
  createComplaint,
  createComplaintComment,
} = require("../controllers/complianceController");

const router = express.Router();
router.get("/sales-employees", protect, getSalesEmployees);
router.get("/complaints", protect, listComplaints);
router.post("/complaints", protect, createComplaint);
router.post("/complaints/:complaintId/comments", protect, createComplaintComment);

module.exports = router;
