const express = require("express");

const { protect, authorize } = require("../middleware/authMiddleware");
const {
  listLeaderboard,
  listRankingHistory,
  resetMonthlyAchieved,
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

router.get(
  "/history",
  protect,
  authorize("admin", "manager", "employee"),
  listRankingHistory
);

router.post(
  "/reset-achieved",
  protect,
  authorize("admin", "manager"),
  resetMonthlyAchieved
);

module.exports = router;
