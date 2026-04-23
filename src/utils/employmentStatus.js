const { toPlainObject } = require("./userNormalizer");

const normalizeEmploymentStatus = (value, fallback = "active") => {
  const normalized = String(value || fallback).trim().toLowerCase();
  return normalized === "inactive" ? "inactive" : "active";
};

const normalizeEmploymentStatusFilter = (value, fallback = "active") => {
  const normalized = String(value || fallback).trim().toLowerCase();
  if (["active", "inactive", "all"].includes(normalized)) {
    return normalized;
  }
  return fallback;
};

const getProfessional = (user) => toPlainObject(user?.professional, {});

const getEmploymentStatus = (user) =>
  normalizeEmploymentStatus(
    getProfessional(user).employmentStatus ||
      user?.employmentStatus ||
      user?.status,
  );

const isInactiveUser = (user) => getEmploymentStatus(user) === "inactive";

const matchesEmploymentStatus = (user, filter = "active") => {
  const normalizedFilter = normalizeEmploymentStatusFilter(filter);
  if (normalizedFilter === "all") {
    return true;
  }
  return getEmploymentStatus(user) === normalizedFilter;
};

const toValidDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getAppointmentDate = (user) => toValidDate(getProfessional(user).appointmentDate);
const getResignedDate = (user) => toValidDate(getProfessional(user).resignedDate);

module.exports = {
  getAppointmentDate,
  getEmploymentStatus,
  getResignedDate,
  isInactiveUser,
  matchesEmploymentStatus,
  normalizeEmploymentStatus,
  normalizeEmploymentStatusFilter,
  toValidDate,
};
