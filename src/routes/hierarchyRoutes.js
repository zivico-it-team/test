// src/routes/hierarchyRoutes.js
const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middleware/authMiddleware");
const h = require("../controllers/hierarchyController");

/**
 * @swagger
 * tags:
 *   name: Hierarchy
 *   description: Organization overview / company hierarchy APIs
 */

/**
 * @swagger
 * /api/hierarchy/overview:
 *   get:
 *     summary: Get organization hierarchy overview (role-based response)
 *     description: |
 *       - Employee: Returns full hierarchy (CEO + HR Manager + Managers cards + Teams + Summary)
 *       - Manager/Admin: Returns Teams + Summary only (no cards section)
 *     tags: [Hierarchy]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Hierarchy overview fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 view:
 *                   type: string
 *                   example: employee_full
 *                 cards:
 *                   type: object
 *                   nullable: true
 *                   description: Present only for employee view
 *                 teams:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       teamName:
 *                         type: string
 *                         example: Sales Team
 *                       managedBy:
 *                         type: string
 *                         example: Michael Rodriguez
 *                       membersCount:
 *                         type: number
 *                         example: 4
 *                       members:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             _id:
 *                               type: string
 *                               example: 65b8c0f2a9f1c2a0d9e6a123
 *                             name:
 *                               type: string
 *                               example: Alex Johnson
 *                             email:
 *                               type: string
 *                               example: alex@company.com
 *                             role:
 *                               type: string
 *                               example: employee
 *                             designation:
 *                               type: string
 *                               example: Sales Executive
 *                             teamName:
 *                               type: string
 *                               example: Sales Team
 *                 summary:
 *                   type: object
 *                   properties:
 *                     totalEmployees:
 *                       type: number
 *                       example: 17
 *                     management:
 *                       type: number
 *                       example: 5
 *                     teams:
 *                       type: number
 *                       example: 4
 *                     hierarchyLevels:
 *                       type: number
 *                       example: 3
 *       401:
 *         description: Not authorized (token missing/invalid)
 *       403:
 *         description: Access denied (role not allowed)
 *       500:
 *         description: Server error
 */
router.get(
  "/overview",
  protect,
  authorize("employee", "manager", "admin"),
  h.hierarchyOverview
);

module.exports = router;