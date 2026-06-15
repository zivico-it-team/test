// src/routes/adminRoutes.js
const express = require("express");
const router = express.Router();

const { protect, authorize, authorizeAdminOrHR } = require("../middleware/authMiddleware");
const { isAdminLikeRole } = require("../utils/roleUtils");
const {
  addManager,
  addEmployee,

  getManagers,
  getManagerById,
  updateManager,
  deleteManager,

  getEmployees,
  getDashboardUsersSummary,
  getRolePermissionUsers,
  updateUserRolePermissions,
  getEmployeeById,
  updateEmployee,
  deleteEmployee,
  getPendingEmployeeAccess,
  approveEmployeeAccess,

  // admin profile
  getAdminProfile,
  updateAdminProfile,
  changeAdminPassword,

  // role permission templates
  saveRolePermissionTemplates,
} = require("../controllers/adminController");

const adminOnly = (req, res, next) => {
  if (!isAdminLikeRole(req.user?.role)) {
    return res.status(403).json({ message: "Admin only" });
  }

  return next();
};

/**
 * @swagger
 * tags:
 *   name: Admin
 *   description: Admin & Manager user management APIs
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     CreateUserPayload:
 *       type: object
 *       required:
 *         - name
 *         - userName
 *         - email
 *         - password
 *       properties:
 *         name:
 *           type: string
 *           example: John Doe
 *         userName:
 *           type: string
 *           example: johndoe
 *         email:
 *           type: string
 *           example: john@gmail.com
 *         password:
 *           type: string
 *           example: 123456
 *
 *     UpdateUserPayload:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *           example: Updated Name
 *         userName:
 *           type: string
 *           example: updatedusername
 *         email:
 *           type: string
 *           example: updated@gmail.com
 *         password:
 *           type: string
 *           example: newpassword123
 *         phone:
 *           type: string
 *           example: +94771234567
 *         gender:
 *           type: string
 *           example: Male
 *         nationality:
 *           type: string
 *           example: Sri Lankan
 *         addressLine:
 *           type: string
 *           example: No 10, Main Street
 *         city:
 *           type: string
 *           example: Colombo
 *         state:
 *           type: string
 *           example: Western
 *         postalCode:
 *           type: string
 *           example: 00100
 *
 *     UserResponse:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: 65f1a2b3c4d5e6f789012345
 *         name:
 *           type: string
 *         userName:
 *           type: string
 *         email:
 *           type: string
 *         role:
 *           type: string
 *           example: employee
 *         phone:
 *           type: string
 *         profileImageUrl:
 *           type: string
 *         createdAt:
 *           type: string
 *         updatedAt:
 *           type: string
 *
 *     AdminProfileUpdatePayload:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *           example: Admin User
 *         phone:
 *           type: string
 *           example: "+94 77 123 4567"
 *         dob:
 *           type: string
 *           example: "1990-01-01"
 *         gender:
 *           type: string
 *           example: "Male"
 *         city:
 *           type: string
 *           example: "Colombo"
 *         state:
 *           type: string
 *           example: "Western"
 *         nationality:
 *           type: string
 *           example: "Sri Lankan"
 *         addressLine:
 *           type: string
 *           example: "No 10, Main Street"
 *         postalCode:
 *           type: string
 *           example: "00100"
 *         profileImageUrl:
 *           type: string
 *           example: "/uploads/avatar.png"
 *         profileImageFileName:
 *           type: string
 *           example: "avatar.png"
 *
 *     ChangePasswordPayload:
 *       type: object
 *       required:
 *         - currentPassword
 *         - newPassword
 *         - confirmNewPassword
 *       properties:
 *         currentPassword:
 *           type: string
 *           example: "OldPass123"
 *         newPassword:
 *           type: string
 *           example: "NewPass123"
 *         confirmNewPassword:
 *           type: string
 *           example: "NewPass123"
 */

/* ===========================
   CREATE
=========================== */

/**
 * @swagger
 * /api/admin/manager:
 *   post:
 *     summary: Add new manager (ADMIN only)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateUserPayload'
 *     responses:
 *       201:
 *         description: Manager created
 *       401:
 *         description: Unauthorized (token missing/invalid)
 *       403:
 *         description: Forbidden (Admin only)
 *       500:
 *         description: Server error
 */
router.post("/manager", protect, authorizeAdminOrHR, addManager);

/**
 * @swagger
 * /api/admin/employee:
 *   post:
 *     summary: Add new employee (ADMIN or MANAGER)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateUserPayload'
 *     responses:
 *       201:
 *         description: Employee created
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Server error
 */
router.post("/employee", protect, authorize("admin", "manager", "hr"), addEmployee);

/* ===========================
   MANAGER CRUD (Admin only)
=========================== */

/**
 * @swagger
 * /api/admin/manager:
 *   get:
 *     summary: Get all managers (ADMIN only)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of managers
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/UserResponse'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Server error
 */
router.get("/manager", protect, authorizeAdminOrHR, getManagers);

/**
 * @swagger
 * /api/admin/manager/{id}:
 *   get:
 *     summary: Get manager by ID (ADMIN only)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: 65f1a2b3c4d5e6f789012345
 *     responses:
 *       200:
 *         description: Manager details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserResponse'
 *       404:
 *         description: Manager not found
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Server error
 */
router.get("/manager/:id", protect, authorizeAdminOrHR, getManagerById);

/**
 * @swagger
 * /api/admin/manager/{id}:
 *   patch:
 *     summary: Update manager by ID (ADMIN only)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateUserPayload'
 *     responses:
 *       200:
 *         description: Manager updated
 *       404:
 *         description: Manager not found
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Server error
 */
router.patch("/manager/:id", protect, authorizeAdminOrHR, updateManager);

/**
 * @swagger
 * /api/admin/manager/{id}:
 *   delete:
 *     summary: Delete manager by ID (ADMIN only)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Manager deleted
 *       404:
 *         description: Manager not found
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Server error
 */
router.delete("/manager/:id", protect, authorizeAdminOrHR, deleteManager);

/* ===========================
   EMPLOYEE CRUD (Admin + Manager)
=========================== */

/**
 * @swagger
 * /api/admin/employee:
 *   get:
 *     summary: Get all employees (ADMIN or MANAGER)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of employees
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/UserResponse'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Server error
 */
router.get("/employee", protect, authorize("admin", "manager", "hr"), getEmployees);
router.get("/directory/users", protect, authorizeAdminOrHR, getRolePermissionUsers);
router.get("/dashboard/users-summary", protect, authorize("admin"), getDashboardUsersSummary);
router.get("/role-permissions/users", protect, adminOnly, getRolePermissionUsers);
router.patch("/role-permissions/users/:id", protect, adminOnly, updateUserRolePermissions);
router.patch(
  "/role-permissions/templates",
  protect,
  authorize("admin", "master"),
  saveRolePermissionTemplates
);
router.get("/access/pending", protect, adminOnly, getPendingEmployeeAccess);
router.patch("/access/:id/approve", protect, adminOnly, approveEmployeeAccess);

/**
 * @swagger
 * /api/admin/employee/{id}:
 *   get:
 *     summary: Get employee by ID (ADMIN or MANAGER)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Employee details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserResponse'
 *       404:
 *         description: Employee not found
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Server error
 */
router.get("/employee/:id", protect, authorize("admin", "manager", "hr", "employee"), getEmployeeById);

/**
 * @swagger
 * /api/admin/employee/{id}:
 *   patch:
 *     summary: Update employee by ID (ADMIN or MANAGER)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateUserPayload'
 *     responses:
 *       200:
 *         description: Employee updated
 *       404:
 *         description: Employee not found
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Server error
 */
router.patch("/employee/:id", protect, authorize("admin", "manager", "hr", "employee"), updateEmployee);

/**
 * @swagger
 * /api/admin/employee/{id}:
 *   delete:
 *     summary: Delete employee by ID (ADMIN or MANAGER)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Employee deleted
 *       404:
 *         description: Employee not found
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Server error
 */
router.delete("/employee/:id", protect, authorize("admin", "manager", "hr"), deleteEmployee);

/* ===========================
   ADMIN PROFILE (Admin only)
=========================== */

/**
 * @swagger
 * /api/admin/profile/me:
 *   get:
 *     summary: Get current admin profile
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Admin profile fetched
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin only
 *       500:
 *         description: Server error
 */
router.get("/profile/me", protect, authorize("admin", "master"), getAdminProfile);

/**
 * @swagger
 * /api/admin/profile/me:
 *   patch:
 *     summary: Update admin profile info (no password)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AdminProfileUpdatePayload'
 *     responses:
 *       200:
 *         description: Profile updated
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin only
 *       500:
 *         description: Server error
 */
router.patch("/profile/me", protect, authorize("admin", "master"), updateAdminProfile);

/**
 * @swagger
 * /api/admin/profile/me/password:
 *   patch:
 *     summary: Change admin password (requires current password)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ChangePasswordPayload'
 *     responses:
 *       200:
 *         description: Password changed
 *       400:
 *         description: Validation error / current password wrong
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin only
 *       500:
 *         description: Server error
 */
router.patch("/profile/me/password", protect, authorize("admin", "master"), changeAdminPassword);

module.exports = router;
