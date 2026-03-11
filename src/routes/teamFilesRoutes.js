// src/routes/teamFilesRoutes.js
const express = require("express");
const router = express.Router();

const { protect, authorize } = require("../middleware/authMiddleware");
const t = require("../controllers/teamFilesController");

/**
 * @swagger
 * tags:
 *   name: TeamFiles
 *   description: Team files list + share APIs
 */

/**
 * @swagger
 * /api/team-files:
 *   get:
 *     summary: List team files (search/filter)
 *     tags: [TeamFiles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: type
 *         schema: { type: string }
 *       - in: query
 *         name: shared
 *         schema:
 *           type: string
 *           enum: [all, shared, unshared]
 *           default: all
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 12 }
 */
router.get("/", protect, authorize("manager", "admin"), t.listTeamFiles);

/**
 * @swagger
 * /api/team-files/people:
 *   get:
 *     summary: Get people list for share modal
 *     tags: [TeamFiles]
 *     security:
 *       - bearerAuth: []
 */
router.get("/people", protect, authorize("manager", "admin"), t.listPeople);

/**
 * @swagger
 * /api/team-files/share:
 *   post:
 *     summary: Share a file to team or selected users
 *     tags: [TeamFiles]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fileId]
 *             properties:
 *               fileId: { type: string }
 *               shareToTeam: { type: boolean, example: true }
 *               userIds:
 *                 type: array
 *                 items: { type: string }
 */
router.post("/share", protect, authorize("manager", "admin"), t.shareFile);

/**
 * @swagger
 * /api/team-files/share/{fileId}:
 *   get:
 *     summary: Get share info for a file
 *     tags: [TeamFiles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: fileId
 *         required: true
 *         schema: { type: string }
 */
router.get("/share/:fileId", protect, authorize("manager", "admin"), t.getFileShare);

/**
 * @swagger
 * /api/team-files/share/{fileId}:
 *   delete:
 *     summary: Unshare a file
 *     tags: [TeamFiles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: fileId
 *         required: true
 *         schema: { type: string }
 */
router.delete("/share/:fileId", protect, authorize("manager", "admin"), t.unshareFile);

module.exports = router;
