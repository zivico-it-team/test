const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");

// Load .env before importing modules that depend on env vars
dotenv.config({ path: path.join(__dirname, ".env") });

const express = require("express");
const cors = require("cors");
const swaggerUi = require("swagger-ui-express");

const { connectDB } = require("./src/config/db");
const seedAdmin = require("./src/config/seedAdmin");
const swaggerSpec = require("./src/config/swagger");

const app = express();

const requiredEnvVars = ["MYSQL_HOST", "MYSQL_DB", "MYSQL_USER", "MYSQL_PASSWORD", "JWT_SECRET"];
const missingEnvVars = requiredEnvVars.filter((key) => !String(process.env[key] || "").trim());
if (missingEnvVars.length > 0) {
  console.warn("Missing environment variables:", missingEnvVars.join(", "));
}

const requiredResetMailEnvVars = ["CLIENT_URL", "MAIL_HOST", "MAIL_PORT", "MAIL_USER", "MAIL_PASS", "MAIL_FROM"];
const missingResetMailEnvVars = requiredResetMailEnvVars.filter((key) => !String(process.env[key] || "").trim());
if (missingResetMailEnvVars.length > 0) {
  console.warn(
    "Password reset email config is incomplete. Missing:",
    missingResetMailEnvVars.join(", "),
    "- forgot-password emails will not be delivered until these are set."
  );
}

if (String(process.env.JWT_SECRET || "").trim() === "change_this_secret_to_a_long_random_string") {
  console.warn("JWT_SECRET is using a default placeholder. Set a strong secret in production.");
}

if (String(process.env.TRUST_PROXY || "").toLowerCase() === "true") {
  app.set("trust proxy", 1);
}

const parseOrigins = (value = "") =>
  String(value)
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);

const allowedOrigins = Array.from(
  new Set([
    "https://crm.revoraglobal.com",
    "https://revoraglobal.com",
    "https://api.revoraglobal.com",
    ...(process.env.NODE_ENV === "production" ? [] : ["http://localhost:5173", "http://localhost:5174"]),
    ...parseOrigins(process.env.ALLOWED_ORIGINS),
    ...parseOrigins(process.env.CLIENT_URL), // backward compatibility
  ])
);

const corsOptions = {
  origin(origin, callback) {
    // Allow non-browser requests (curl/postman/server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Not allowed by CORS"));
  },
  methods: "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  allowedHeaders: "Content-Type,Authorization",
  credentials: true,
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "5mb" }));
app.use(express.urlencoded({ extended: true, limit: process.env.URLENCODED_BODY_LIMIT || "5mb" }));

// Connect DB then seed
connectDB();
seedAdmin();

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.get("/", (req, res) => {
  res.send("CRM Backend is running");
});

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

const uploadsPath = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}
app.use(
  "/uploads",
  express.static(uploadsPath, {
    etag: true,
    maxAge: "1h",
  })
);

app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

app.use((err, req, res, next) => {
  const isCorsError = err?.message === "Not allowed by CORS";
  if (isCorsError) {
    return res.status(403).json({ message: "CORS blocked for this origin" });
  }

  if (err?.type === "entity.too.large" || Number(err?.status) === 413) {
    return res.status(413).json({ message: "Request payload too large" });
  }

  if (err?.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ message: "File is too large. Max 15MB allowed." });
  }

  const status = Number(err?.status || 500);
  const isProduction = process.env.NODE_ENV === "production";
  const message = status >= 500 && isProduction ? "Internal server error" : err?.message || "Internal server error";

  if (status >= 500) {
    console.error("Unhandled error:", err);
  }

  return res.status(status).json({ message });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log("CORS allowed origins:", allowedOrigins.join(", "));
});
