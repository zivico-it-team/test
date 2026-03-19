const express = require("express");

const { protect, authorize } = require("../middleware/authMiddleware");
const {
  listMyNotifications,
  markNotificationAsRead,
} = require("../controllers/notificationController");

const router = express.Router();

router.get("/", protect, authorize("employee", "manager", "admin", "hr"), listMyNotifications);
router.patch("/:id/read", protect, authorize("employee", "manager", "admin", "hr"), markNotificationAsRead);

module.exports = router;
