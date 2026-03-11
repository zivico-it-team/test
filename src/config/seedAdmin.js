const User = require("../models/User");
const bcrypt = require("bcryptjs");

const seedSystemUser = async ({
  role,
  name,
  email,
  userName,
  password,
  professional = {},
}) => {
  const existingUser = await User.findOne({ where: { role } });

  if (existingUser) {
    console.log(`${role} already exists`);
    return;
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  await User.create({
    name,
    email,
    userName,
    password: hashedPassword,
    role,
    professional,
  });

  console.log(`Default ${role} created`);
};

const seedAdmin = async () => {
  try {
    await seedSystemUser({
      role: "admin",
      name: process.env.ADMIN_NAME || "System Admin",
      email: process.env.ADMIN_EMAIL || "admin@hrms.local",
      userName: process.env.ADMIN_USERNAME || "admin",
      password: process.env.ADMIN_PASSWORD || "admin123",
    });

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
  } catch (error) {
    console.error("System user seed failed", error.message);
  }
};

module.exports = seedAdmin;
