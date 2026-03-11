const express = require("express");
const router = express.Router();

const { protect, authorize } = require("../middleware/authMiddleware");
const c = require("../controllers/attendanceController");

/**
 * @swagger
 * tags:
 *   name: Attendance
 *   description: Employee attendance operations
 */

/**
 * @swagger
 * /api/attendance/today:
 *   get:
 *     summary: Get today's attendance status
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Today's attendance status fetched successfully
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Access denied
 *       500:
 *         description: Server error
 */
router.get("/today", protect, authorize("employee", "manager", "admin"), c.todayStatus);

/**
 * @swagger
 * /api/attendance/check-in:
 *   post:
 *     summary: Employee check-in
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Checked in successfully
 *       400:
 *         description: Already checked in / invalid request
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Access denied
 *       500:
 *         description: Server error
 */
router.post("/check-in", protect, authorize("employee", "manager", "admin"), c.checkIn);

/**
 * @swagger
 * /api/attendance/check-out:
 *   post:
 *     summary: Employee check-out
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Checked out successfully
 *       400:
 *         description: Not checked in yet / already checked out
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Access denied
 *       500:
 *         description: Server error
 */
router.post("/check-out", protect, authorize("employee", "manager", "admin"), c.checkOut);

/**
 * @swagger
 * /api/attendance/month/summary:
 *   get:
 *     summary: Get monthly attendance summary (Present/Absent/Late/Total Hours)
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: year
 *         required: true
 *         schema:
 *           type: integer
 *         example: 2026
 *       - in: query
 *         name: month
 *         required: true
 *         schema:
 *           type: integer
 *         example: 2
 *     responses:
 *       200:
 *         description: Monthly summary fetched successfully
 *       400:
 *         description: year/month missing or invalid
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Access denied
 *       500:
 *         description: Server error
 */
router.get("/month/summary", protect, authorize("employee", "manager", "admin"), c.monthSummary);

/**
 * @swagger
 * /api/attendance/month/calendar:
 *   get:
 *     summary: Get monthly calendar data (date-wise attendance)
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: year
 *         required: true
 *         schema:
 *           type: integer
 *         example: 2026
 *       - in: query
 *         name: month
 *         required: true
 *         schema:
 *           type: integer
 *         example: 2
 *     responses:
 *       200:
 *         description: Monthly calendar data fetched successfully
 *       400:
 *         description: year/month missing or invalid
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Access denied
 *       500:
 *         description: Server error
 */
router.get("/month/calendar", protect, authorize("employee", "manager", "admin"), c.monthCalendar);

/**
 * @swagger
 * /api/attendance/month/records:
 *   get:
 *     summary: Get monthly attendance records list (for Attendance Records tab)
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: year
 *         required: true
 *         schema:
 *           type: integer
 *         example: 2026
 *       - in: query
 *         name: month
 *         required: true
 *         schema:
 *           type: integer
 *         example: 2
 *     responses:
 *       200:
 *         description: Monthly attendance records fetched successfully
 *       400:
 *         description: year/month missing or invalid
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Access denied
 *       500:
 *         description: Server error
 */
router.get("/month/records", protect, authorize("employee", "manager", "admin"), c.monthRecords);

/**
 * @swagger
 * /api/attendance/{id}:
 *   delete:
 *     summary: Delete an attendance record (Trash icon)
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: "65b8c0f2a9f1c2a0d9e6a123"
 *     responses:
 *       200:
 *         description: Attendance record deleted successfully
 *       404:
 *         description: Record not found
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Access denied
 *       500:
 *         description: Server error
 */
router.delete("/:id", protect, authorize("employee", "manager", "admin"), c.deleteRecord);

module.exports = router;
