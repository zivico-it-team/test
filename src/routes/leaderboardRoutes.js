const express = require("express");

const { protect, authorize } = require("../middleware/authMiddleware");
const {
  listLeaderboard,
  updatePerformance,
} = require("../controllers/leaderboardController");

const router = express.Router();

router.get(
  "/",
  protect,
  authorize("admin", "manager", "employee"),
  listLeaderboard
);

router.put(
  "/performance",
  protect,
  authorize("admin", "manager"),
  updatePerformance
);

module.exports = router;
