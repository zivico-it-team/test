const { Op } = require("sequelize");
const User = require("../models/User");
const bcrypt = require("bcryptjs");

const createTeamMember = async (req, res) => {
  try {
    const {
      name,
      userName,
      email,
      password,
      dob,
      nationality,
      phoneNumber,
      address,
      bio,
      skills,

      designation,
      joiningDate,
      workLocation,
      teamDepartment,

      assignedManagerId,
      employeeId,
    } = req.body;

    if (!name || !userName || !email || !password) {
      return res.status(400).json({ message: "name, userName, email, password required" });
    }

    const emailLower = String(email).toLowerCase();

    const exists = await User.findOne({
      where: {
        [Op.or]: [{ email: emailLower }, { userName }],
      },
    });
    if (exists) return res.status(409).json({ message: "User already exists" });

    const hashed = await bcrypt.hash(password, 10);

    let skillsArr = [];
    if (Array.isArray(skills)) {
      skillsArr = skills.map((s) => String(s).trim()).filter(Boolean);
    } else if (typeof skills === "string") {
      skillsArr = skills
        .split(",")
        .map((s) => String(s).trim())
        .filter(Boolean);
    }

    const professional = {
      employeeId: employeeId || "",
      designation: designation || "",
      teamName: teamDepartment || "",
      department: teamDepartment || "",
      employmentType: "Full Time",
      joiningDate: joiningDate ? new Date(joiningDate) : null,
      reportingManager: assignedManagerId || "",
      workLocation: workLocation || "",
    };

    const user = await User.create({
      name,
      userName,
      email: emailLower,
      password: hashed,
      role: "employee",
      phone: phoneNumber || "",
      dob: dob ? new Date(dob) : null,
      nationality: nationality || "",
      addressLine: address || "",
      bio: bio || "",
      skills: skillsArr,
      professional,
    });

    const u = user.toJSON();
    u._id = u.id;
    delete u.password;

    res.status(201).json({ message: "Team member created", user: u });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { createTeamMember };
