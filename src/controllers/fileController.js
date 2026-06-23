const path = require("path");
const multer = require("multer");
const Upload = require("../models/Upload");
const FileShare = require("../models/FileShare");
const User = require("../models/User");
const { Op } = require("sequelize");
const { sequelize } = require("../config/db");
const { uploadsDir, uploadsRoute } = require("../config/uploads");

// multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, unique + ext);
  },
});


const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
});

// ✅ middleware for single file upload (field name: "file")
const uploadSingle = upload.single("file");

// Upload file
const uploadFile = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    const userId = req.user._id;

    const fileDoc = await Upload.create({
      userId,
      originalName: req.file.originalname,
      fileName: req.file.filename,
      mimeType: req.file.mimetype,
      size: req.file.size,
      url: `${uploadsRoute}/${req.file.filename}`,
    });

    const f = fileDoc.toJSON();
    f._id = f.id;

    res.status(201).json({ message: "File uploaded", file: f });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// My uploaded files list
const myFiles = async (req, res) => {
  try {
    const userId = req.user._id;
    const files = await Upload.findAll({
      where: { userId },
      order: [["createdAt", "DESC"]],
    });

    res.json({ files: files.map((x) => ({ ...x.toJSON(), _id: x.id })) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Count files (for dashboard card)
const myFilesCount = async (req, res) => {
  try {
    const userId = req.user._id;
    const count = await Upload.count({ where: { userId } });
    res.json({ count });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Files shared with current user
const sharedWithMe = async (req, res) => {
  try {
    const userId = req.user._id;

    const shares = await FileShare.findAll({
      where: {
        [Op.or]: [
          { scope: "team" },
          {
            [Op.and]: [
              { scope: "users" },
              sequelize.literal(
                `JSON_CONTAINS(sharedWith, ${sequelize.escape(JSON.stringify(userId))})`
              ),
            ],
          },
        ],
      },
      include: [
        {
          model: Upload,
          as: "file",
          required: true,
          attributes: ["id", "originalName", "mimeType", "size", "url", "createdAt"],
        },
        {
          model: User,
          as: "sharedBy",
          required: false,
          attributes: ["id", "name", "email"],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    const files = shares
      .map((share) => {
        const s = share.toJSON();
        const file = s.file;
        if (!file) return null;

        return {
          id: file.id,
          _id: file.id,
          name: file.originalName,
          fileType: file.mimeType,
          size: file.size,
          url: file.url,
          uploadedAt: file.createdAt,
          scope: s.scope,
          sharedBy: s.sharedBy?.name || s.sharedBy?.email || "Unknown",
        };
      })
      .filter(Boolean);

    res.json({ files });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  uploadSingle,
  uploadFile,
  myFiles,
  myFilesCount,
  sharedWithMe,
};
