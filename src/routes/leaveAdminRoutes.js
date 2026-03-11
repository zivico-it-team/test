// src/routes/leaveAdminRoutes.js
const express = require("express");
const router = express.Router();

const { protect, authorize } = require("../middleware/authMiddleware");
const admin = require("../controllers/leaveAdminController");

/**
 * @swagger
 * tags:
 *   name: LeaveAdmin
 *   description: Manager/Admin leave management APIs (tabs, counts, clear)
 */

/**
 * @swagger
 * /api/leaves-admin/summary:
 *   get:
 *     tags: [LeaveAdmin]
 *     summary: Leave Management counts (Total/Pending/Approved/Rejected)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Summary counts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total: { type: number, example: 15 }
 *                 pending: { type: number, example: 7 }
 *                 approved: { type: number, example: 4 }
 *                 rejected: { type: number, example: 4 }
 */
router.get("/summary", protect, authorize("manager", "admin"), admin.adminLeaveSummary);

/**
 * @swagger
 * /api/leaves-admin/list:
 *   get:
 *     tags: [LeaveAdmin]
 *     summary: List leaves by status (all/pending/approved/rejected)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [all, pending, approved, rejected]
 *           default: all
 *       - in: query
 *         name: page
 *         schema: { type: number, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: number, default: 10 }
 *     responses:
 *       200:
 *         description: Paginated leaves list
 */
router.get("/list", protect, authorize("manager", "admin"), admin.adminLeaveList);

/**
 * @swagger
 * /api/leaves-admin/clear:
 *   delete:
 *     tags: [LeaveAdmin]
 *     summary: Clear leave records (all or by status)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [all, pending, approved, rejected]
 *           default: all
 *     responses:
 *       200:
 *         description: Cleared successfully
 */
router.delete("/clear", protect, authorize("manager", "admin"), admin.clearLeaveRecords);

module.exports = router;
