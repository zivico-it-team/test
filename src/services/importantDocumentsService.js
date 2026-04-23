const fs = require("fs/promises");
const path = require("path");
const { Op } = require("sequelize");

const ImportantDocument = require("../models/ImportantDocument");
const Notification = require("../models/Notification");
const Upload = require("../models/Upload");
const { uploadsDir } = require("../config/uploads");

const IMPORTANT_DOCUMENT_MODULE = "important_documents";
const IMPORTANT_DOCUMENT_TYPE = "important_document";
const IMPORTANT_DOCUMENT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

const getImportantDocumentRouteForRole = (role = "") => {
  const normalizedRole = String(role || "").trim().toLowerCase();
  if (normalizedRole === "admin") return "/admin/important-documents";
  if (normalizedRole === "hr") return "/hr/important-documents";
  if (normalizedRole === "manager") return "/manager/important-documents";
  return "/employee/important-documents";
};

const buildDocumentExpiryDate = () =>
  new Date(Date.now() + IMPORTANT_DOCUMENT_RETENTION_MS);

const resolveStoredFileName = (file = {}) => {
  const candidates = [file?.fileName, file?.url];

  for (const candidate of candidates) {
    const normalized = String(candidate || "").trim();
    if (!normalized) continue;
    return path.basename(normalized);
  }

  return "";
};

const removeStoredFile = async (file = {}) => {
  const storedFileName = resolveStoredFileName(file);
  if (!storedFileName) return;

  const targetPath = path.resolve(uploadsDir, storedFileName);
  const uploadsRoot = path.resolve(uploadsDir);
  if (!targetPath.startsWith(uploadsRoot)) {
    return;
  }

  try {
    await fs.unlink(targetPath);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      console.error("Failed to delete important document file:", error);
    }
  }
};

const cleanupExpiredImportantDocuments = async () => {
  const expiredDocuments = await ImportantDocument.findAll({
    where: {
      expiresAt: {
        [Op.lt]: new Date(),
      },
    },
    include: [
      {
        model: Upload,
        as: "file",
        required: false,
        attributes: ["id", "fileName", "url"],
      },
    ],
  });

  if (!expiredDocuments.length) {
    return { deletedDocuments: 0, deletedNotifications: 0 };
  }

  const documentIds = expiredDocuments.map((item) => item.id).filter(Boolean);
  const uploadIds = expiredDocuments.map((item) => item.uploadId).filter(Boolean);

  const importantNotifications = await Notification.findAll({
    where: { module: IMPORTANT_DOCUMENT_MODULE },
    attributes: ["id", "meta"],
  });

  const notificationIds = importantNotifications
    .filter((notification) => {
      const meta =
        notification?.meta && typeof notification.meta === "object" ? notification.meta : {};
      return documentIds.includes(String(meta.documentId || ""));
    })
    .map((notification) => notification.id)
    .filter(Boolean);

  if (notificationIds.length) {
    await Notification.destroy({
      where: {
        id: {
          [Op.in]: notificationIds,
        },
      },
    });
  }

  if (documentIds.length) {
    await ImportantDocument.destroy({
      where: {
        id: {
          [Op.in]: documentIds,
        },
      },
    });
  }

  if (uploadIds.length) {
    await Upload.destroy({
      where: {
        id: {
          [Op.in]: uploadIds,
        },
      },
    });
  }

  await Promise.all(
    expiredDocuments.map((document) => removeStoredFile(document?.file))
  );

  return {
    deletedDocuments: documentIds.length,
    deletedNotifications: notificationIds.length,
  };
};

module.exports = {
  IMPORTANT_DOCUMENT_MODULE,
  IMPORTANT_DOCUMENT_RETENTION_MS,
  IMPORTANT_DOCUMENT_TYPE,
  buildDocumentExpiryDate,
  cleanupExpiredImportantDocuments,
  getImportantDocumentRouteForRole,
  removeStoredFile,
};
