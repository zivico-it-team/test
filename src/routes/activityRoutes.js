const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middleware/authMiddleware");
const c = require("../controllers/activityController");

/**
 * @swagger
 * tags:
 *   name: Activity
 *   description: Employee activity tracking operations
 */

/**
 * @swagger
 * /api/activity/today:
 *   get:
 *     summary: Get today's activities (Employee/Manager/Admin)
 *     tags:
 *       - Activity
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Today's activities fetched successfully
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Access denied
 *       500:
 *         description: Server error
 */
router.get("/today", protect, authorize("employee", "manager", "admin"), c.todayActivities);

/**
 * @swagger
 * /api/activity/start:
 *   post:
 *     summary: Start an activity (Employee/Manager/Admin)
 *     tags:
 *       - Activity
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               activityName:
 *                 type: string
 *                 example: "Client Call"
 *               description:
 *                 type: string
 *                 example: "Discussed requirements with client"
 *     responses:
 *       201:
 *         description: Activity started successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Access denied
 *       500:
 *         description: Server error
 */
router.post("/start", protect, authorize("employee", "manager", "admin"), c.startActivity);

/**
 * @swagger
 * /api/activity/end:
 *   post:
 *     summary: End an activity (Employee/Manager/Admin)
 *     tags:
 *       - Activity
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               activityId:
 *                 type: string
 *                 example: "65b8c0f2a9f1c2a0d9e6a123"
 *               notes:
 *                 type: string
 *                 example: "Completed successfully"
 *     responses:
 *       200:
 *         description: Activity ended successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Access denied
 *       404:
 *         description: Activity not found
 *       500:
 *         description: Server error
 */
router.post("/end", protect, authorize("employee", "manager", "admin"), c.endActivity);
/**
 * @swagger
 * /api/activity/month:
 *   get:
 *     summary: Get monthly activities/breaks list
 *     tags: [Activity]
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
 *         description: Monthly activities fetched successfully
 *       400:
 *         description: year/month missing or invalid
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Access denied
 *       500:
 *         description: Server error
 */
router.get("/month", protect, authorize("employee", "manager", "admin"), c.monthActivities);

/**
 * @swagger
 * /api/activity/{id}:
 *   delete:
 *     summary: Delete an activity (Completed only)
 *     tags: [Activity]
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
 *         description: Activity deleted successfully
 *       400:
 *         description: Cannot delete active activity
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Access denied
 *       404:
 *         description: Activity not found
 *       500:
 *         description: Server error
 */
router.delete("/:id", protect, authorize("employee", "manager", "admin"), c.deleteActivity);

module.exports = router;
