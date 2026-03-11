const path = require("path");
const fs = require("fs");
const multer = require("multer");
const Upload = require("../models/Upload");

// ensure uploads folder exists
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, unique + ext);
  },
});

const upload = multer({ storage });

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
      url: `/uploads/${req.file.filename}`, // static serve needed
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

module.exports = {
  uploadSingle,
  uploadFile,
  myFiles,
  myFilesCount,
};
