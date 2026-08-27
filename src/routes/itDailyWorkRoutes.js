const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { listWork, createWork } = require("../controllers/itDailyWorkController");
const router = express.Router();
router.get("/", protect, listWork);
router.post("/", protect, createWork);
module.exports = router;
