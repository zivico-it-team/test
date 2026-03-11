// src/routes/profileRoutes.js
const express = require("express");
const router = express.Router();

const { protect, authorize } = require("../middleware/authMiddleware");
const { getMyProfile, updateMyProfile } = require("../controllers/profileController");
/**
 * @swagger
 * tags:
 *   name: Profile 
 *   description: User profile management
 */

/**
 * @swagger
 * /api/profile/me:
 *   get:
 *     summary: Get logged-in user's profile
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved profile
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
 *                     _id:
 *                       type: string
 *                       example: "65abc123def4567890ghijk"
 *                     name:
 *                       type: string
 *                       example: "Musfir Mohammed"
 *                     email:
 *                       type: string
 *                       example: "musfir@gmail.com"
 *                     role:
 *                       type: string
 *                       example: "employee"
 *       401:
 *         description: Not authorized, token missing or invalid
 *       403:
 *         description: Forbidden - role not allowed
 */

// Get my profile
router.get("/me", protect, authorize("employee", "manager", "admin"), getMyProfile);

/**
 * @swagger
 * /api/profile/me:
 *   patch:
 *     summary: Update logged-in user's profile
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Musfir Mohammed Updated"
 *               email:
 *                 type: string
 *                 example: "musfir.updated@gmail.com"
 *     responses:
 *       200:
 *         description: Profile updated successfully
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
 *                   example: "Profile updated successfully"
 *                 data:
 *                   type: object
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Forbidden
 */

// Update my profile
router.patch("/me", protect, authorize("employee", "manager", "admin"), updateMyProfile);

module.exports = router;
