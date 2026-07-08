require("dotenv").config();


const express = require("express");
const cors = require("cors");
const swaggerUi = require("swagger-ui-express");

const { connectDB } = require("./src/config/db");
const { uploadsDir, uploadsRoute } = require("./src/config/uploads");
const seedSystemUsers = require("./src/config/seedAdmin");
const swaggerSpec = require("./src/config/swagger");
const {
  startLeaderboardMonthRolloverScheduler,
} = require("./src/controllers/leaderboardController");

const app = express();

const isMysqlConnectionQuotaError = (error) =>
  String(error?.original?.code || error?.parent?.code || error?.code || "").trim() ===
  "ER_USER_LIMIT_REACHED";

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

const configuredClientUrl = String(process.env.CLIENT_URL || "").trim();
if (/revorglobal\.com/i.test(configuredClientUrl)) {
  console.warn(
    "CLIENT_URL appears to have a typo (revorglobal.com). Expected domain is likely revoraglobal.com."
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
    // Production CRM frontend — must always be present
    "https://crm.revoraglobal.com",
    "https://revoraglobal.com",
    "https://api.revoraglobal.com",
    "https://revoraglobal.netlify.app",
    ...(process.env.NODE_ENV === "production"
      ? []
      : ["http://localhost:5173", "http://localhost:5174", "http://localhost:8081"]),
    ...parseOrigins(process.env.ALLOWED_ORIGINS),
    ...parseOrigins(process.env.CLIENT_URL), // backward compatibility
  ])
);

const corsOptions = {
  origin(origin, callback) {
    // Allow non-browser requests (curl / postman / server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    console.warn(`[CORS] Blocked request from unlisted origin: ${origin}`);
    return callback(new Error("Not allowed by CORS"));
  },
  methods: "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  allowedHeaders: "Content-Type,Authorization,X-Requested-With,Accept,Origin",
  credentials: true,
  optionsSuccessStatus: 204,
};


// Apply CORS to every route — this adds Access-Control-* headers to all responses
// including error responses, so the browser can read error bodies cross-origin.
// Temporary debug middleware to help diagnose preflight issues.
// Keeps a log of origin + request and echoes permissive CORS headers so
// we can determine whether the request reaches the Node process or is
// blocked by an upstream proxy/CDN. Remove after debugging.
// Production-safe CORS handler: set Access-Control headers for allowed origins
// and respond to preflight OPTIONS before other middleware. This runs before
// other middleware so OPTIONS and error responses carry the necessary headers.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With,Accept,Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(cors(corsOptions));

// NOTE: OPTIONS preflight is handled by the debug middleware above.

// Per-request backend logger (method, path, origin)
app.use((req, _res, next) => {
  const origin = req.headers.origin || "(no-origin)";
  console.log(`[req] ${req.method} ${req.path} — origin=${origin}`);
  next();
});
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "5mb" }));
app.use(express.urlencoded({ extended: true, limit: process.env.URLENCODED_BODY_LIMIT || "5mb" }));

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.get("/", (_req, res) => {
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  res.status(200).send("Backend is running");
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
app.use("/api/notifications", require("./src/routes/notificationRoutes"));
app.use("/api/important-documents", require("./src/routes/importantDocumentsRoutes"));
app.use("/api/profile", require("./src/routes/profileRoutes"));
app.use("/api/profile", require("./src/routes/profilePhotoRoutes"));
app.use("/api/health", require("./src/routes/healthRoutes"));
app.use("/api/team", require("./src/routes/teamRoutes"));
app.use("/api/attendance-tracker", require("./src/routes/attendanceTrackerRoutes"));
app.use("/api/hierarchy", require("./src/routes/hierarchyRoutes"));
app.use("/api/leads", require("./src/routes/leadRoutes"));

app.use(
  uploadsRoute,
  express.static(uploadsDir, {
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
    const blockedOrigin = req.headers.origin || "unknown";
    console.error(`[CORS] 403 blocked — origin=${blockedOrigin} path=${req.path}`);
    return res.status(403).json({
      message: "CORS Blocked",
      detail: `Requests from origin '${blockedOrigin}' are not permitted. Contact the API administrator.`,
    });
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

const PORT = process.env.PORT || 3000;
let serverStarted = false;

const listenOnce = (suffix = "") => {
  if (serverStarted) {
    return;
  }

  serverStarted = true;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}${suffix}`);
    console.log("CORS allowed origins:", allowedOrigins.join(", "));
  });
};

const startServer = async () => {
  try {
    await connectDB();
    await seedSystemUsers();
    startLeaderboardMonthRolloverScheduler();
    listenOnce();
  } catch (error) {
    if (isMysqlConnectionQuotaError(error)) {
      console.error(
        "Starting API in degraded mode because MySQL hourly connection quota was exceeded."
      );
      console.error(
        "Wait for the host quota window to reset, and keep MYSQL_POOL_MAX low to avoid burning through connections."
      );
      listenOnce(" (degraded mode: database unavailable)");
      return;
    }

    console.error("Failed to start server", error);
    process.exit(1);
  }
};

startServer();
