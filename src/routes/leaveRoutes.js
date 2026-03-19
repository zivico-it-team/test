const express = require("express");
const router = express.Router();

const { protect, authorize } = require("../middleware/authMiddleware");
const {
  applyLeave,
  myLeaves,
  leaveSummary,
  pendingLeaves,
  updateLeaveStatus,
} = require("../controllers/leaveController");

/**
 * @swagger
 * tags:
 *   name: Leave
 *   description: Employee leave management APIs
 */

/**
 * @swagger
 * components:
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 *   schemas:
 *     Leave:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         user:
 *           type: string
 *         type:
 *           type: string
 *           example: annual
 *         fromDate:
 *           type: string
 *           format: date
 *           example: "2026-02-10"
 *         toDate:
 *           type: string
 *           format: date
 *           example: "2026-02-12"
 *         totalDays:
 *           type: integer
 *           example: 3
 *         reason:
 *           type: string
 *           example: "Family function"
 *         status:
 *           type: string
 *           enum: [pending, approved, rejected]
 *           example: pending
 */

/**
 * @swagger
 * /api/leave/summary:
 *   get:
 *     summary: Get leave summary (cards + balances) for logged-in user
 *     tags: [Leave]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Summary fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 cards:
 *                   type: object
 *                   properties:
 *                     totalApplications:
 *                       type: integer
 *                     approved:
 *                       type: integer
 *                     pending:
 *                       type: integer
 *                     daysUsed:
 *                       type: integer
 *                 balances:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       type:
 *                         type: string
 *                         example: annual
 *                       total:
 *                         oneOf:
 *                           - type: integer
 *                           - type: string
 *                         example: 21
 *                       used:
 *                         type: integer
 *                         example: 0
 *                       left:
 *                         oneOf:
 *                           - type: integer
 *                           - type: string
 *                         example: 21
 *       401:
 *         description: Not authorized (no/invalid token)
 *       403:
 *         description: Access denied
 *       500:
 *         description: Server error
 */
router.get("/summary", protect, authorize("employee", "manager", "admin"), leaveSummary);

/**
 * @swagger
 * /api/leave/apply:
 *   post:
 *     summary: Apply for leave (Employee/Manager/Admin)
 *     tags: [Leave]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - type
 *               - fromDate
 *               - toDate
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [annual, casual, medical, unpaid]
 *                 example: annual
 *               fromDate:
 *                 type: string
 *                 format: date
 *                 example: "2026-02-10"
 *               toDate:
 *                 type: string
 *                 format: date
 *                 example: "2026-02-12"
 *               reason:
 *                 type: string
 *                 maxLength: 500
 *                 example: "Family function"
 *     responses:
 *       201:
 *         description: Leave applied successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Leave applied
 *                 leave:
 *                   $ref: '#/components/schemas/Leave'
 *       400:
 *         description: Validation error / insufficient balance / overlap
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Access denied
 *       500:
 *         description: Server error
 */
router.post("/apply", protect, authorize("employee", "manager", "admin"), applyLeave);

/**
 * @swagger
 * /api/leave/my:
 *   get:
 *     summary: Get my leave applications
 *     tags: [Leave]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of leaves
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 leaves:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Leave'
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Access denied
 *       500:
 *         description: Server error
 */
router.get("/my", protect, authorize("employee", "manager", "admin"), myLeaves);

/**
 * @swagger
 * /api/leave/pending:
 *   get:
 *     summary: Get all pending leaves (Manager/Admin)
 *     tags: [Leave]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Pending leaves fetched
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Access denied
 *       500:
 *         description: Server error
 */
router.get("/pending", protect, authorize("manager", "admin"), pendingLeaves);

/**
 * @swagger
 * /api/leave/{leaveId}/status:
 *   patch:
 *     summary: Approve or reject a leave (Manager/Admin)
 *     tags: [Leave]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: leaveId
 *         required: true
 *         schema:
 *           type: string
 *         example: "65b8c0f2a9f1c2a0d9e6a123"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [approved, rejected]
 *                 example: approved
 *               remark:
 *                 type: string
 *                 example: "Approved for valid reason"
 *     responses:
 *       200:
 *         description: Leave status updated successfully
 *       400:
 *         description: Invalid status
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Access denied
 *       404:
 *         description: Leave not found
 *       500:
 *         description: Server error
 */
router.patch("/:leaveId/status", protect, authorize("manager", "admin"), updateLeaveStatus);

module.exports = router;
