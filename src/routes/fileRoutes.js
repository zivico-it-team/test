const express = require("express");
const router = express.Router();

const { protect, authorize } = require("../middleware/authMiddleware");
const {
  uploadSingle,
  uploadFile,
  myFiles,
  myFilesCount,
} = require("../controllers/fileController");

/**
 * @swagger
 * tags:
 *   name: Files
 *   description: File upload and management operations
 */

/**
 * @swagger
 * /api/files/upload:
 *   post:
 *     summary: Upload a file
 *     tags:
 *       - Files
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: "Upload file (field name MUST be 'file')"
 *     responses:
 *       201:
 *         description: File uploaded successfully
 *       400:
 *         description: Invalid file / missing file
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Access denied
 *       500:
 *         description: Server error
 */
router.post(
  "/upload",
  protect,
  authorize("employee", "manager", "admin"),
  uploadSingle,
  uploadFile
);

/**
 * @swagger
 * /api/files/my:
 *   get:
 *     summary: Get current user's files
 *     tags:
 *       - Files
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of user files
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                     example: "65b8c0f2a9f1c2a0d9e6a123"
 *                   filename:
 *                     type: string
 *                     example: "report.pdf"
 *                   size:
 *                     type: number
 *                     example: 204800
 *                   uploadedAt:
 *                     type: string
 *                     format: date-time
 *                     example: "2025-02-03T10:15:00Z"
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Access denied
 *       500:
 *         description: Server error
 */
router.get(
  "/my",
  protect,
  authorize("employee", "manager", "admin"),
  myFiles
);

/**
 * @swagger
 * /api/files/my/count:
 *   get:
 *     summary: Get current user's total file count
 *     tags:
 *       - Files
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Total file count
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalFiles:
 *                   type: number
 *                   example: 15
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Access denied
 *       500:
 *         description: Server error
 */
router.get(
  "/my/count",
  protect,
  authorize("employee", "manager", "admin"),
  myFilesCount
);

module.exports = router;
