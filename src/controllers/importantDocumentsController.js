const path = require("path");
const fs = require("fs/promises");
const multer = require("multer");
const { Op } = require("sequelize");

const ImportantDocument = require("../models/ImportantDocument");
const Notification = require("../models/Notification");
const Upload = require("../models/Upload");
const User = require("../models/User");
const { sequelize } = require("../config/db");
const { uploadsDir, uploadsRoute } = require("../config/uploads");
const { matchesEmploymentStatus } = require("../utils/employmentStatus");
const {
  IMPORTANT_DOCUMENT_MODULE,
  IMPORTANT_DOCUMENT_TYPE,
  buildDocumentExpiryDate,
  cleanupExpiredImportantDocuments,
  getImportantDocumentRouteForRole,
  removeStoredFile,
} = require("../services/importantDocumentsService");
const { isAdminLikeRole } = require("../utils/roleUtils");

const IMPORTANT_DOCUMENT_ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname || "");
    cb(null, `${unique}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!IMPORTANT_DOCUMENT_ALLOWED_MIME_TYPES.has(String(file?.mimetype || "").toLowerCase())) {
      const error = new Error("Only PDF files or images are allowed");
      error.status = 400;
      return cb(error);
    }
    cb(null, true);
  },
});

const uploadImportantDocumentSingle = upload.single("file");

const removeUploadedFileIfExists = async (file = {}) => {
  const storedName = String(file?.filename || "").trim();
  if (!storedName) return;

  const resolvedPath = path.resolve(uploadsDir, storedName);
  const rootPath = path.resolve(uploadsDir);
  if (!resolvedPath.startsWith(rootPath)) {
    return;
  }

  try {
    await fs.unlink(resolvedPath);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      console.error("Failed to cleanup uploaded important document file:", error);
    }
  }
};

const isAdminOrHr = (role = "") => {
  const normalizedRole = String(role || "").trim().toLowerCase();
  return isAdminLikeRole(normalizedRole) || normalizedRole === "hr";
};

const toImportantDocumentJson = (document, options = {}) => {
  const item = typeof document?.toJSON === "function" ? document.toJSON() : document;
  const file = item?.file || {};
  const uploadedBy = item?.uploadedBy || {};
  const notification = options.notification || null;

  return {
    ...item,
    _id: item.id,
    originalName: file.originalName || "",
    fileName: file.fileName || "",
    mimeType: file.mimeType || "",
    size: file.size || 0,
    url: file.url || "",
    uploadedByName: uploadedBy.name || uploadedBy.email || "Unknown",
    uploadedByEmail: uploadedBy.email || "",
    isRead: notification ? Boolean(notification.isRead) : options.defaultReadState ?? false,
    notificationId: notification?.id || null,
  };
};

const getImportantDocumentNotificationIds = async (documentIds = [], options = {}) => {
  const normalizedDocumentIds = new Set(
    documentIds.map((id) => String(id || "").trim()).filter(Boolean)
  );

  if (!normalizedDocumentIds.size) {
    return [];
  }

  const notifications = await Notification.findAll({
    where: { module: IMPORTANT_DOCUMENT_MODULE },
    attributes: ["id", "meta"],
    transaction: options.transaction,
  });

  return notifications
    .filter((notification) => {
      const meta =
        notification?.meta && typeof notification.meta === "object" ? notification.meta : {};
      return normalizedDocumentIds.has(String(meta.documentId || "").trim());
    })
    .map((notification) => notification.id)
    .filter(Boolean);
};

const listImportantDocuments = async (req, res) => {
  try {
    await cleanupExpiredImportantDocuments();

    const documents = await ImportantDocument.findAll({
      where: {
        expiresAt: {
          [Op.gt]: new Date(),
        },
      },
      include: [
        {
          model: Upload,
          as: "file",
          required: true,
          attributes: ["id", "originalName", "fileName", "mimeType", "size", "url", "createdAt"],
        },
        {
          model: User,
          as: "uploadedBy",
          required: false,
          attributes: ["id", "name", "email", "role"],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    const notifications = await Notification.findAll({
      where: {
        userId: req.user._id,
        module: IMPORTANT_DOCUMENT_MODULE,
      },
      attributes: ["id", "isRead", "meta"],
    });

    const notificationByDocumentId = new Map(
      notifications
        .map((notification) => {
          const meta =
            notification?.meta && typeof notification.meta === "object" ? notification.meta : {};
          const documentId = String(meta.documentId || "").trim();
          if (!documentId) return null;
          return [documentId, notification];
        })
        .filter(Boolean)
    );

    const defaultReadState = isAdminOrHr(req.user?.role);
    const payload = documents.map((document) =>
      toImportantDocumentJson(document, {
        notification: notificationByDocumentId.get(String(document.id)),
        defaultReadState,
      })
    );

    res.json({ documents: payload });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const createImportantDocument = async (req, res) => {
  let uploadRecord = null;

  try {
    await cleanupExpiredImportantDocuments();

    if (!req.file) {
      return res.status(400).json({ message: "A PDF or image file is required" });
    }

    const title = String(req.body?.title || "").trim() || "Important Document";
    const note = String(req.body?.note || "").trim();

    const expiresAt = buildDocumentExpiryDate();
    const uploaderId = req.user._id;
    const notificationMessage = note || "A new important document was published.";

    const documentRecord = await sequelize.transaction(async (transaction) => {
      uploadRecord = await Upload.create(
        {
          userId: uploaderId,
          originalName: req.file.originalname,
          fileName: req.file.filename,
          mimeType: req.file.mimetype,
          size: req.file.size,
          url: `${uploadsRoute}/${req.file.filename}`,
        },
        { transaction }
      );

      const createdDocument = await ImportantDocument.create(
        {
          uploadId: uploadRecord.id,
          uploadedById: uploaderId,
          title,
          note,
          expiresAt,
        },
        { transaction }
      );

      const viewers = await User.findAll({
        where: {
          role: {
            [Op.in]: ["employee", "manager"],
          },
        },
        attributes: ["id", "role", "approvalStatus", "professional"],
        transaction,
      });

      const recipientNotifications = viewers
        .filter((viewer) => {
          const role = String(viewer.role || "").trim().toLowerCase();
          if (!matchesEmploymentStatus(viewer, "active")) return false;
          if (role === "manager") return true;
          return String(viewer.approvalStatus || "approved").trim().toLowerCase() === "approved";
        })
        .map((viewer) => ({
          userId: viewer.id,
          title: title || "Important Document",
          message: notificationMessage,
          type: IMPORTANT_DOCUMENT_TYPE,
          module: IMPORTANT_DOCUMENT_MODULE,
          isRead: false,
          readAt: null,
          meta: {
            documentId: createdDocument.id,
            uploadId: uploadRecord.id,
            fileUrl: uploadRecord.url,
            targetPath: getImportantDocumentRouteForRole(viewer.role),
          },
        }));

      if (recipientNotifications.length) {
        await Notification.bulkCreate(recipientNotifications, { transaction });
      }

      return createdDocument;
    });

    const hydratedDocument = await ImportantDocument.findByPk(documentRecord.id, {
      include: [
        {
          model: Upload,
          as: "file",
          required: true,
          attributes: ["id", "originalName", "fileName", "mimeType", "size", "url", "createdAt"],
        },
        {
          model: User,
          as: "uploadedBy",
          required: false,
          attributes: ["id", "name", "email", "role"],
        },
      ],
    });

    res.status(201).json({
      message: "Important document uploaded successfully",
      document: toImportantDocumentJson(hydratedDocument, {
        defaultReadState: true,
      }),
    });
  } catch (err) {
    if (uploadRecord?.id) {
      await Upload.destroy({ where: { id: uploadRecord.id } }).catch(() => null);
    }
    if (req.file) {
      await removeUploadedFileIfExists(req.file);
    }
    res.status(Number(err?.status || 500)).json({ message: err.message });
  }
};

const deleteImportantDocument = async (req, res) => {
  try {
    await cleanupExpiredImportantDocuments();

    const documentId = String(req.params.id || "").trim();
    const documentRecord = await ImportantDocument.findByPk(documentId, {
      include: [
        {
          model: Upload,
          as: "file",
          required: false,
          attributes: ["id", "fileName", "url"],
        },
      ],
    });

    if (!documentRecord) {
      return res.status(404).json({ message: "Important document not found" });
    }

    const documentData =
      typeof documentRecord.toJSON === "function" ? documentRecord.toJSON() : documentRecord;
    const uploadId = documentData.uploadId;
    const file = documentData.file || null;

    await sequelize.transaction(async (transaction) => {
      const notificationIds = await getImportantDocumentNotificationIds([documentId], {
        transaction,
      });

      if (notificationIds.length) {
        await Notification.destroy({
          where: {
            id: {
              [Op.in]: notificationIds,
            },
          },
          transaction,
        });
      }

      await ImportantDocument.destroy({
        where: { id: documentId },
        transaction,
      });

      if (uploadId) {
        await Upload.destroy({
          where: { id: uploadId },
          transaction,
        });
      }
    });

    await removeStoredFile(file);

    return res.json({
      message: "Important document deleted successfully",
      documentId,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

const markImportantDocumentAsRead = async (req, res) => {
  try {
    await cleanupExpiredImportantDocuments();

    const documentId = String(req.params.id || "").trim();
    const document = await ImportantDocument.findOne({
      where: {
        id: documentId,
        expiresAt: {
          [Op.gt]: new Date(),
        },
      },
      attributes: ["id"],
    });

    if (!document) {
      return res.status(404).json({ message: "Important document not found" });
    }

    const notifications = await Notification.findAll({
      where: {
        userId: req.user._id,
        module: IMPORTANT_DOCUMENT_MODULE,
      },
      attributes: ["id", "isRead", "meta"],
    });

    const targetNotifications = notifications.filter((notification) => {
      const meta =
        notification?.meta && typeof notification.meta === "object" ? notification.meta : {};
      return String(meta.documentId || "").trim() === documentId;
    });

    if (!targetNotifications.length) {
      return res.json({ documentId, isRead: true });
    }

    const unreadIds = targetNotifications
      .filter((notification) => !notification.isRead)
      .map((notification) => notification.id);

    if (unreadIds.length) {
      await Notification.update(
        {
          isRead: true,
          readAt: new Date(),
        },
        {
          where: {
            id: {
              [Op.in]: unreadIds,
            },
          },
        }
      );
    }

    res.json({ documentId, isRead: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  createImportantDocument,
  deleteImportantDocument,
  listImportantDocuments,
  markImportantDocumentAsRead,
  uploadImportantDocumentSingle,
};
