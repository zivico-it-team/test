// src/routes/teamRoutes.js
const express = require("express");
const router = express.Router();

const { protect, authorize } = require("../middleware/authMiddleware");
const t = require("../controllers/teamController");
const { createTeamMember } = require("../controllers/teamMemberController");

/**
 * @swagger
 * tags:
 *   name: Team
 *   description: Team management APIs (stats, members, dropdowns, add member)
 */

/**
 * @swagger
 * /api/team/stats:
 *   get:
 *     tags: [Team]
 *     summary: Get Team Management dashboard stats
 *     description: Returns totalMembers, activeNow, onLeave, newJoiners (last 30 days)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Team stats
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalMembers:
 *                   type: number
 *                   example: 12
 *                 activeNow:
 *                   type: number
 *                   example: 9
 *                 onLeave:
 *                   type: number
 *                   example: 3
 *                 newJoiners:
 *                   type: number
 *                   example: 0
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (role)
 */
router.get("/stats", protect, authorize("manager", "admin"), t.teamStats);

/**
 * @swagger
 * /api/team/members:
 *   get:
 *     tags: [Team]
 *     summary: Get team members list (search/filter/pagination)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [all, active, onLeave, remote]
 *           default: all
 *         description: Filter tab status
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name, designation, email, username, employeeId
 *       - in: query
 *         name: team
 *         schema:
 *           type: string
 *         description: Filter by team/department (professional.teamName or professional.department)
 *       - in: query
 *         name: page
 *         schema:
 *           type: number
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: number
 *           default: 12
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [new, name, join]
 *           default: new
 *     responses:
 *       200:
 *         description: Paginated members list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 page:
 *                   type: number
 *                   example: 1
 *                 limit:
 *                   type: number
 *                   example: 12
 *                 total:
 *                   type: number
 *                   example: 12
 *                 members:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                         example: 65f1a2b3c4d5e6f7890abc12
 *                       name:
 *                         type: string
 *                         example: Employee 1
 *                       email:
 *                         type: string
 *                         example: employee1@company.com
 *                       role:
 *                         type: string
 *                         example: employee
 *                       phone:
 *                         type: string
 *                         example: +94 77 123 4567
 *                       nationality:
 *                         type: string
 *                         example: Sri Lankan
 *                       bio:
 *                         type: string
 *                         example: Short bio...
 *                       skills:
 *                         type: array
 *                         items:
 *                           type: string
 *                         example: ["React", "Node.js", "UI/UX"]
 *                       professional:
 *                         type: object
 *                         properties:
 *                           employeeId:
 *                             type: string
 *                             example: EMP-001
 *                           designation:
 *                             type: string
 *                             example: Senior Developer
 *                           teamName:
 *                             type: string
 *                             example: Engineering
 *                           department:
 *                             type: string
 *                             example: Engineering
 *                           joiningDate:
 *                             type: string
 *                             example: 2025-02-14T00:00:00.000Z
 *                           reportingManager:
 *                             type: string
 *                             example: Manager Name
 *                           workLocation:
 *                             type: string
 *                             example: Nugegoda
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (role)
 */
router.get("/members", protect, authorize("manager", "admin"), t.teamMembers);

/**
 * @swagger
 * /api/team/managers:
 *   get:
 *     tags: [Team]
 *     summary: Get managers list (dropdown)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Managers list
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   _id:
 *                     type: string
 *                     example: 65f1a2b3c4d5e6f7890abc12
 *                   name:
 *                     type: string
 *                     example: John Manager
 *                   email:
 *                     type: string
 *                     example: manager@company.com
 *                   userName:
 *                     type: string
 *                     example: john.manager
 */
router.get("/managers", protect, authorize("manager", "admin"), t.managersList);

/**
 * @swagger
 * /api/team/teams:
 *   get:
 *     tags: [Team]
 *     summary: Get teams/departments list (dropdown)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Teams list
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: string
 *               example: ["Engineering", "Product", "Management"]
 */
router.get("/teams", protect, authorize("manager", "admin"), t.teamsList);

/**
 * @swagger
 * /api/team/members:
 *   post:
 *     tags: [Team]
 *     summary: Add new team member (Employee)
 *     description: Creates a new employee with personal + professional info.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, userName, email, password]
 *             properties:
 *               name:
 *                 type: string
 *                 example: John Doe
 *               userName:
 *                 type: string
 *                 example: john.doe
 *               email:
 *                 type: string
 *                 example: john@example.com
 *               password:
 *                 type: string
 *                 example: Pass@123
 *               dob:
 *                 type: string
 *                 example: 2000-02-10
 *               nationality:
 *                 type: string
 *                 example: Sri Lankan
 *               phoneNumber:
 *                 type: string
 *                 example: +94 77 123 4567
 *               employeeId:
 *                 type: string
 *                 example: EMP-001
 *               address:
 *                 type: string
 *                 example: No 123 Main, Colombo
 *               bio:
 *                 type: string
 *                 example: Short bio...
 *               skills:
 *                 type: string
 *                 example: React, Node.js, UI/UX
 *               designation:
 *                 type: string
 *                 example: Software Engineer
 *               joiningDate:
 *                 type: string
 *                 example: 2025-02-14
 *               workLocation:
 *                 type: string
 *                 example: Nugegoda
 *               teamDepartment:
 *                 type: string
 *                 example: Engineering
 *               assignedManagerId:
 *                 type: string
 *                 example: 65f1a2b3c4d5e6f7890abc12
 *     responses:
 *       201:
 *         description: Team member created
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (role)
 *       409:
 *         description: User already exists
 */
router.post("/members", protect, authorize("manager", "admin"), createTeamMember);

module.exports = router;
