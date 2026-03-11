const path = require("path");
const dotenv = require("dotenv");

// ✅ 1) FIRST load .env (before any other imports that use env)
dotenv.config({ path: path.join(__dirname, ".env") });

const express = require("express");
const cors = require("cors");
const swaggerUi = require("swagger-ui-express");

// ✅ 2) Now import modules that depend on env
const { connectDB } = require("./src/config/db");
const seedAdmin = require("./src/config/seedAdmin");
const swaggerSpec = require("./src/config/swagger");

const app = express();
app.use(express.json());

// (Optional) verify env loads
console.log("MYSQL_USER =", process.env.MYSQL_USER);
console.log("MYSQL_DB   =", process.env.MYSQL_DB);

// ✅ 3) Connect DB then seed
connectDB();
seedAdmin();

app.use(
  cors({
    origin: ["http://localhost:5174", "http://localhost:5173"],
    methods: "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    allowedHeaders: "Content-Type,Authorization",
    credentials: true,
  })
);

// Swagger
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.get("/", (req, res) => {
  res.send("CRM Backend is running ✅");
});

// Routes (listen ekata කලින් දාන්න recommended)
app.use("/api/auth", require("./src/routes/authRoutes"));
app.use("/api/admin", require("./src/routes/adminRoutes"));
app.use("/api/leave", require("./src/routes/leaveRoutes"));
app.use("/api/leaves-admin", require("./src/routes/leaveAdminRoutes"));
app.use("/api/files", require("./src/routes/fileRoutes"));
app.use("/api/team-files", require("./src/routes/teamFilesRoutes"));
app.use("/api/employee", require("./src/routes/employeeRoutes"));
app.use("/api/attendance", require("./src/routes/attendanceRoutes"));
app.use("/api/activity", require("./src/routes/activityRoutes"));
app.use("/api/leaderboard", require("./src/routes/leaderboardRoutes"));
app.use("/api/profile", require("./src/routes/profileRoutes"));
app.use("/api/profile", require("./src/routes/profilePhotoRoutes"));
app.use("/api/team", require("./src/routes/teamRoutes"));
app.use("/api/attendance-tracker", require("./src/routes/attendanceTrackerRoutes"));
app.use("/api/hierarchy", require("./src/routes/hierarchyRoutes"));
app.use("/api/leads", require("./src/routes/leadRoutes"));

// uploaded files serve
app.use("/uploads", express.static("uploads"));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
