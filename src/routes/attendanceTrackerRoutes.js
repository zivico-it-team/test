// src/routes/attendanceTrackerRoutes.js
const express = require("express");
const router = express.Router();

const { protect, authorize } = require("../middleware/authMiddleware");
const t = require("../controllers/attendanceTrackerController");

/**
 * @swagger
 * tags:
 *   name: AttendanceTracker
 *   description: Monthly attendance tracker grid + day details
 */

/**
 * @swagger
 * /api/attendance-tracker/monthly:
 *   get:
 *     summary: Monthly attendance grid (Manager/Admin)
 *     tags: [AttendanceTracker]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: year
 *         required: true
 *         schema: { type: integer }
 *         example: 2026
 *       - in: query
 *         name: month
 *         required: true
 *         schema: { type: integer }
 *         example: 2
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Monthly grid data
 */
router.get("/monthly", protect, authorize("manager", "admin"), t.monthlyGrid);

/**
 * @swagger
 * /api/attendance-tracker/details:
 *   get:
 *     summary: Day details for modal (checkin/out + tea/lunch breaks)
 *     tags: [AttendanceTracker]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: date
 *         required: true
 *         schema: { type: string }
 *         example: 2026-02-06
 *     responses:
 *       200:
 *         description: Day details
 */
router.get("/details", protect, authorize("manager", "admin"), t.dayDetails);

module.exports = router;
