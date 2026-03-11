const express = require("express");
const router = express.Router();

const { protect, authorize } = require("../middleware/authMiddleware");
const { dashboardSummary } = require("../controllers/employeeController");

/**
 * @swagger
 * tags:
 *   name: Employee
 *   description: Employee related APIs
 */

/**
 * @swagger
 * /api/employee/dashboard/summary:
 *   get:
 *     summary: Get employee dashboard summary
 *     tags: [Employee]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard summary retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalTasks:
 *                       type: number
 *                       example: 12
 *                     pendingTasks:
 *                       type: number
 *                       example: 5
 *                     completedTasks:
 *                       type: number
 *                       example: 7
 *                     leaveBalance:
 *                       type: number
 *                       example: 8
 *       401:
 *         description: Not authorized (token missing/invalid)
 *       403:
 *         description: Forbidden – role not allowed
 */
router.get(
  "/dashboard/summary",
  protect,
  authorize("employee", "manager", "admin"),
  dashboardSummary
);

module.exports = router;
