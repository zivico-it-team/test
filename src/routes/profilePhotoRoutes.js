// src/routes/profilePhotoRoutes.js
const express = require("express");
const router = express.Router();

const { protect, authorize } = require("../middleware/authMiddleware");
const { uploadSingle } = require("../controllers/fileController"); // ✅ reuse your multer middleware

const {
  uploadProfilePhoto,
  getProfilePhoto,
} = require("../controllers/profilePhotoController");

/**
 * @swagger
 * tags:
 *   name: ProfilePhoto
 *   description: Upload and retrieve logged-in user's profile photo
 */

/**
 * @swagger
 * /api/profile/me/photo:
 *   get:
 *     summary: Get logged-in user's profile photo (returns URL only)
 *     tags: [ProfilePhoto]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved profile photo URL
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 photoUrl:
 *                   type: string
 *                   example: "https://your-domain.com/uploads/profile/abc123.jpg"
 *       401:
 *         description: Not authorized, token missing or invalid
 *       403:
 *         description: Forbidden - role not allowed
 */

// GET profile pic (url only)
router.get(
  "/me/photo",
  protect,
  authorize("employee", "manager", "admin"),
  getProfilePhoto
);

/**
 * @swagger
 * /api/profile/me/photo:
 *   patch:
 *     summary: Upload/update logged-in user's profile photo
 *     tags: [ProfilePhoto]
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
 *                 description: Profile photo file (field name must be "file")
 *     responses:
 *       200:
 *         description: Profile photo uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Profile photo updated successfully"
 *                 photoUrl:
 *                   type: string
 *                   example: "https://your-domain.com/uploads/profile/abc123.jpg"
 *       400:
 *         description: Invalid file / file missing
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Forbidden
 */

// UPLOAD profile pic (field name: "file")
router.patch(
  "/me/photo",
  protect,
  authorize("employee", "manager", "admin"),
  uploadSingle,
  uploadProfilePhoto
);

module.exports = router;
