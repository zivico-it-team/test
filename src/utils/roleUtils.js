const normalizeRole = (role) => String(role || "").trim().toLowerCase();

const isAdminLikeRole = (role) =>
  ["admin", "master"].includes(normalizeRole(role));

const isAdminLikeUser = (user) => isAdminLikeRole(user?.role);

module.exports = {
  normalizeRole,
  isAdminLikeRole,
  isAdminLikeUser,
};
