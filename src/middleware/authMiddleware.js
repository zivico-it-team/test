const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { toPlainObject } = require("../utils/userNormalizer");

const normalizeValue = (value) => String(value || "").trim().toLowerCase();
const AUTH_CACHE_TTL_MS = Number(process.env.AUTH_USER_CACHE_TTL_MS || 60000);
const AUTH_CACHE_MAX_USERS = Number(process.env.AUTH_USER_CACHE_MAX_USERS || 500);
const AUTH_USER_CACHE_KEY = "__zivico_auth_user_cache__";
const authUserCache = globalThis[AUTH_USER_CACHE_KEY] || new Map();
globalThis[AUTH_USER_CACHE_KEY] = authUserCache;

const getCachedUser = (userId) => {
  if (AUTH_CACHE_TTL_MS <= 0) {
    return null;
  }

  const cached = authUserCache.get(userId);
  if (!cached) {
    return null;
  }

  if (Date.now() > cached.expiresAt) {
    authUserCache.delete(userId);
    return null;
  }

  return cached.user;
};

const setCachedUser = (userId, user) => {
  if (AUTH_CACHE_TTL_MS <= 0 || !userId || !user) {
    return;
  }

  if (authUserCache.size >= AUTH_CACHE_MAX_USERS) {
    const firstKey = authUserCache.keys().next().value;
    if (firstKey) {
      authUserCache.delete(firstKey);
    }
  }

  authUserCache.set(userId, {
    user,
    expiresAt: Date.now() + AUTH_CACHE_TTL_MS,
  });
};

const isHRStaff = (user) => {
  if (normalizeValue(user?.role) === "hr") {
    return true;
  }

  if (normalizeValue(user?.role) !== "manager") {
    return false;
  }

  const professional = toPlainObject(user?.professional, {});
  const department = normalizeValue(professional?.department);
  const teamName = normalizeValue(professional?.teamName);
  const designation = normalizeValue(professional?.designation);

  return (
    department === "hr" ||
    department.includes("human resource") ||
    teamName === "hr" ||
    designation.includes("human resource") ||
    designation === "hr manager"
  );
};

const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "No token, authorization denied" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = String(decoded?.id || "").trim();
    if (!userId) {
      return res.status(401).json({ message: "Invalid token payload" });
    }

    let user = getCachedUser(userId);

    if (!user) {
      const dbUser = await User.findByPk(userId, {
        attributes: { exclude: ["password"] },
      });

      if (
        normalizeValue(user.role) === "employee" &&
        normalizeValue(user.approvalStatus || "approved") !== "approved"
      ) {
        return res.status(403).json({ message: "Your account is awaiting admin approval" });
      }

      // keep backward compatibility with old Mongo _id usage
      const u = user.toJSON();
      u._id = u.id;

      req.user = { ...user };
      next();
    }
  } catch (err) {
  return res.status(401).json({ message: "Invalid token" });
  };
};

const authorize = (...roles) => {
  return (req, res, next) => {
    const allowedRoles = new Set(roles);
    if (allowedRoles.has("admin")) {
      allowedRoles.add("hr");
    }

    if (!req.user || !allowedRoles.has(req.user.role)) {
      return res.status(403).json({ message: "Access denied" });
    }
    next();
  };
};

const authorizeAdminOrHR = (req, res, next) => {
  if (!req.user) {
    return res.status(403).json({ message: "Access denied" });
  }

  if (req.user.role === "admin" || req.user.role === "hr" || isHRStaff(req.user)) {
    return next();
  }

  return res.status(403).json({ message: "Access denied" });
};

const forbidHRLeadAccess = (req, res, next) => {
  if (!req.user) {
    return res.status(403).json({ message: "Access denied" });
  }

  if (req.user.role === "hr" || isHRStaff(req.user)) {
    return res.status(403).json({ message: "Lead module is not available for HR users" });
  }

  return next();
};

module.exports = { protect, authorize, authorizeAdminOrHR, isHRStaff, forbidHRLeadAccess };
