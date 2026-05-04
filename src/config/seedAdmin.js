const { Op } = require("sequelize");
const User = require("../models/User");
const bcrypt = require("bcryptjs");

const normalizeValue = (value) => String(value || "").trim();
const normalizeRole = (value) => normalizeValue(value).toLowerCase();
const isEnabled = (value, fallback = false) => {
  const normalized = normalizeRole(value);
  if (!normalized) return fallback;
  return ["1", "true", "yes", "on"].includes(normalized);
};

const allowedRoles = new Set(["admin", "master", "hr", "manager", "employee"]);

const getBootstrapRole = () => {
  const requestedRole = normalizeRole(
    process.env.FIRST_USER_ROLE || process.env.MASTER_ROLE || "master"
  );
  return allowedRoles.has(requestedRole) ? requestedRole : "master";
};

const buildProfessionalProfile = (role) => {
  if (role === "hr") {
    return {
      department: "HR",
      designation: process.env.HR_DESIGNATION || "HR Manager",
    };
  }

  if (role === "manager") {
    return {
      designation: process.env.FIRST_USER_DESIGNATION || "Manager",
    };
  }

  if (role === "master") {
    return {
      designation: process.env.FIRST_USER_DESIGNATION || "Master User",
    };
  }

  if (role === "admin") {
    return {
      designation: process.env.FIRST_USER_DESIGNATION || "System Admin",
    };
  }

  return {};
};

const seedSystemUser = async ({
  role,
  name,
  email,
  userName,
  password,
  professional = {},
}) => {
  const normalizedRole = normalizeRole(role);
  const normalizedName = normalizeValue(name);
  const normalizedEmail = normalizeValue(email).toLowerCase() || null;
  const normalizedUserName = normalizeValue(userName).toLowerCase();

  const existingUser = await User.findOne({
    where: {
      [Op.or]: [
        { role: normalizedRole },
        ...(normalizedEmail ? [{ email: normalizedEmail }] : []),
        ...(normalizedUserName ? [{ userName: normalizedUserName }] : []),
      ],
    },
  });

  if (existingUser) {
    console.log(
      `${normalizedRole} seed skipped because a matching role/email/username already exists`
    );
    return existingUser;
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const createdUser = await User.create({
    name: normalizedName,
    email: normalizedEmail,
    userName: normalizedUserName,
    password: hashedPassword,
    role: normalizedRole,
    professional,
    approvalStatus: "approved",
    approvedAt: new Date(),
  });

  console.log(`Default ${normalizedRole} created`);
  return createdUser;
};

const seedBootstrapUser = async () => {
  const bootstrapRole = getBootstrapRole();

  return seedSystemUser({
    role: bootstrapRole,
    name:
      process.env.FIRST_USER_NAME ||
      process.env.MASTER_NAME ||
      "Master User",
    email:
      process.env.FIRST_USER_EMAIL ||
      process.env.MASTER_EMAIL ||
      "master@hrms.local",
    userName:
      process.env.FIRST_USER_USERNAME ||
      process.env.MASTER_USERNAME ||
      "master",
    password:
      process.env.FIRST_USER_PASSWORD ||
      process.env.MASTER_PASSWORD ||
      "master123",
    professional: buildProfessionalProfile(bootstrapRole),
  });
};

const seedOptionalSupportUsers = async () => {
  if (isEnabled(process.env.AUTO_SEED_ADMIN, false)) {
    await seedSystemUser({
      role: "admin",
      name: process.env.ADMIN_NAME || "System Admin",
      email: process.env.ADMIN_EMAIL || "admin@hrms.local",
      userName: process.env.ADMIN_USERNAME || "admin",
      password: process.env.ADMIN_PASSWORD || "admin123",
      professional: {
        designation: process.env.ADMIN_DESIGNATION || "System Admin",
      },
    });
  }

  if (isEnabled(process.env.AUTO_SEED_HR, false)) {
    await seedSystemUser({
      role: "hr",
      name: process.env.HR_NAME || "HR Manager",
      email: process.env.HR_EMAIL || "hr@hrms.local",
      userName: process.env.HR_USERNAME || "hr",
      password: process.env.HR_PASSWORD || "hr123",
      professional: {
        department: "HR",
        designation: process.env.HR_DESIGNATION || "HR Manager",
      },
    });
  }
};

const seedSystemUsers = async () => {
  try {
    const bootstrapUser = await seedBootstrapUser();
    if (bootstrapUser) {
      console.log(`Bootstrap user ready with role: ${bootstrapUser.role}`);
    }

    await seedOptionalSupportUsers();
  } catch (error) {
    console.error("System user seed failed", error.message);
  }
};

module.exports = seedSystemUsers;
