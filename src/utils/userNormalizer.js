const toPlainObject = (value, fallback = {}) => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return fallback;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch (_) {
      return fallback;
    }
  }

  return fallback;
};

const toPlainArray = (value, fallback = []) => {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return fallback;
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch (_) {
      return fallback;
    }
  }

  return fallback;
};

const normalizeStoredImageUrl = (value) => {
  const raw = String(value || "").trim();
  if (!raw || /^data:/i.test(raw)) {
    return "";
  }

  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }

  const unixPath = raw.replace(/\\/g, "/");
  return unixPath.startsWith("/") ? unixPath : `/${unixPath}`;
};

const normalizeProfessional = (value) => {
  const professional = toPlainObject(value, {});
  return {
    ...professional,
    employeeId: String(professional.employeeId ?? "").trim(),
    designation: String(professional.designation ?? "").trim(),
    department: String(professional.department ?? professional.teamName ?? "").trim(),
  };
};

const toPublicUser = (user) => {
  if (!user) return null;

  const obj = typeof user.toJSON === "function" ? user.toJSON() : { ...user };
  delete obj.password;
  const normalizedRole = String(obj.role || "").trim().toLowerCase();
  const approvalStatus =
    normalizedRole === "employee"
      ? String(obj.approvalStatus || "approved").trim().toLowerCase() || "approved"
      : "approved";
  const professional = normalizeProfessional(obj.professional);
  const imagePath = normalizeStoredImageUrl(obj.profileImageUrl);
  const profileImageVersion = obj.updatedAt ? new Date(obj.updatedAt).getTime() : null;

  return {
    ...obj,
    _id: obj.id,
    professional,
    employeeId: obj.employeeId || professional.employeeId || "",
    designation: obj.designation || professional.designation || "",
    department: obj.department || professional.department || "",
    documents: toPlainArray(obj.documents, []),
    skills: toPlainArray(obj.skills, []),
    bank: toPlainObject(obj.bank, {}),
    emergencyContact: toPlainObject(obj.emergencyContact, {}),
    approvalStatus,
    approvedAt: obj.approvedAt || null,
    profileImageUrl: imagePath,
    profilePicture: imagePath,
    profileImageFileName: String(obj.profileImageFileName || "").trim(),
    profileImageVersion,
  };
};

module.exports = {
  toPlainObject,
  toPlainArray,
  normalizeStoredImageUrl,
  normalizeProfessional,
  toPublicUser,
};
