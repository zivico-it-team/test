const jwt = require("jsonwebtoken");
const User = require("../models/User");

const normalizeValue = (value) => String(value || "").trim().toLowerCase();

const isHRStaff = (user) => {
  if (normalizeValue(user?.role) === "hr") {
    return true;
  }

  if (normalizeValue(user?.role) !== "manager") {
    return false;
  }

  const department = normalizeValue(user?.professional?.department);
  const teamName = normalizeValue(user?.professional?.teamName);
  const designation = normalizeValue(user?.professional?.designation);

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

    const user = await User.findByPk(decoded.id, {
      attributes: { exclude: ["password"] },
    });

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    // keep backward compatibility with old Mongo _id usage
    const u = user.toJSON();
    u._id = u.id;

    req.user = u;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid token" });
  }
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

module.exports = { protect, authorize, authorizeAdminOrHR, isHRStaff };
