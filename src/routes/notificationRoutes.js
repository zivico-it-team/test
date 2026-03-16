const express = require("express");

const { protect, authorize } = require("../middleware/authMiddleware");
const {
  listMyNotifications,
  markNotificationAsRead,
} = require("../controllers/notificationController");

const router = express.Router();

router.get("/", protect, authorize("employee", "manager", "admin"), listMyNotifications);
router.patch("/:id/read", protect, authorize("employee", "manager", "admin"), markNotificationAsRead);

module.exports = router;
