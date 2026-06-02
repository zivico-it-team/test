const bcrypt = require("bcryptjs");
const User = require("../models/User");
const { toPublicUser, toPlainObject, toPlainArray } = require("../utils/userNormalizer");

// helper: allowed fields only (security)
const pick = (obj, keys) =>
  keys.reduce((acc, k) => {
    if (obj?.[k] !== undefined) acc[k] = obj[k];
    return acc;
  }, {});

const normalizeProfileUser = (u) => {
  const normalized = toPublicUser(u);
  normalized.professional = toPlainObject(normalized.professional, {});
  return normalized;
};

// GET /api/profile/me
exports.getMyProfile = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id || req.user._id, {
      attributes: { exclude: ["password"] },
    });
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const u = normalizeProfileUser(user.toJSON());

    return res.json({ success: true, data: u });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/profile/me
exports.updateMyProfile = async (req, res, next) => {
  try {
    const userId = req.user.id || req.user._id;
    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const personalAllowed = [
      "name",
      "fullName", // maps to name
      "userName",
      "email",
      "phone",
      "dob",
      "nic",
      "gender",
      "nationality",
      "addressLine",
      "city",
      "state",
      "postalCode",
      "bio",
      "skills",
    ];

    const professionalAllowed = [
      "employeeId",
      "designation",
      "teamName",
      "department",
      "employmentType",
      "joiningDate",
      "reportingManager",
      "workLocation",
      "rolePermissionTemplates",
    ];

    const emergencyAllowed = ["name", "phone", "relationship", "email"];
    const bankAllowed = ["bankName", "accountHolder", "accountNumberMasked", "accountNumber", "branch", "ifscCode"];

    const updateDoc = {
      ...pick(req.body, personalAllowed),
    };

    if (updateDoc.fullName !== undefined && updateDoc.name === undefined) {
      updateDoc.name = updateDoc.fullName;
    }
    delete updateDoc.fullName;

    if (updateDoc.email !== undefined) {
      const normalizedEmail = String(updateDoc.email || "").trim().toLowerCase() || null;
      if (normalizedEmail && normalizedEmail !== (user.email || null)) {
        const existingUser = await User.findOne({
          where: { email: normalizedEmail },
          attributes: ["id"],
        });

        if (existingUser && String(existingUser.id) !== String(user.id)) {
          return res.status(409).json({ success: false, message: "Email already exists" });
        }
      }
      updateDoc.email = normalizedEmail;
    }

    if (updateDoc.nic !== undefined) {
      updateDoc.nic = String(updateDoc.nic || "").trim();
    }

    if (req.body?.professional !== undefined) {
      updateDoc.professional = {
        ...toPlainObject(user.professional, {}),
        ...pick(toPlainObject(req.body.professional, {}), professionalAllowed),
      };
    }
    if (req.body?.emergencyContact !== undefined) {
      updateDoc.emergencyContact = {
        ...toPlainObject(user.emergencyContact, {}),
        ...pick(toPlainObject(req.body.emergencyContact, {}), emergencyAllowed),
      };
    }
    if (req.body?.bank !== undefined) {
      updateDoc.bank = {
        ...toPlainObject(user.bank, {}),
        ...pick(toPlainObject(req.body.bank, {}), bankAllowed),
      };
    }

    if (req.body?.documents !== undefined) {
      updateDoc.documents = toPlainArray(req.body.documents, []);
    }

    if (req.body?.skills !== undefined) {
      updateDoc.skills = toPlainArray(req.body.skills, []);
    }

    if (updateDoc.dob) updateDoc.dob = new Date(updateDoc.dob);
    if (updateDoc?.professional?.joiningDate) updateDoc.professional.joiningDate = new Date(updateDoc.professional.joiningDate);

    const hasPasswordChangeRequest =
      req.body?.currentPassword !== undefined ||
      req.body?.newPassword !== undefined ||
      req.body?.confirmPassword !== undefined;

    if (hasPasswordChangeRequest) {
      const currentPassword = String(req.body?.currentPassword || "");
      const newPassword = String(req.body?.newPassword || "");
      const confirmPassword = String(req.body?.confirmPassword || "");

      if (!currentPassword || !newPassword || !confirmPassword) {
        return res.status(400).json({
          success: false,
          message: "currentPassword, newPassword and confirmPassword are required",
        });
      }

      const matchesCurrentPassword = await bcrypt.compare(currentPassword, user.password);
      if (!matchesCurrentPassword) {
        return res.status(400).json({ success: false, message: "Current password is incorrect" });
      }

      if (newPassword !== confirmPassword) {
        return res.status(400).json({ success: false, message: "New passwords do not match" });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ success: false, message: "New password must be at least 6 characters" });
      }

      updateDoc.password = await bcrypt.hash(newPassword, 10);
    }

    await user.update(updateDoc);

    const updated = await User.findByPk(userId, { attributes: { exclude: ["password"] } });
    const u = normalizeProfileUser(updated.toJSON());

    return res.json({ success: true, message: "Profile updated", data: u });
  } catch (err) {
    if (err?.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({ success: false, message: `${err.errors?.[0]?.path || "field"} already exists` });
    }

    if (err?.name === "SequelizeValidationError") {
      return res.status(400).json({ success: false, message: err.errors?.[0]?.message || "Validation failed" });
    }

    next(err);
  }
};
