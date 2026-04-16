const fs = require("fs");
const path = require("path");

const DEFAULT_UPLOADS_DIR = path.resolve(__dirname, "../../uploads");

const normalizeUploadsDir = (value) => {
  const raw = String(value || "").trim();
  if (!raw) {
    return DEFAULT_UPLOADS_DIR;
  }

  return path.isAbsolute(raw)
    ? path.normalize(raw)
    : path.resolve(__dirname, "../../", raw);
};

const uploadsDir = normalizeUploadsDir(process.env.UPLOADS_DIR);

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

module.exports = {
  uploadsDir,
  uploadsRoute: "/uploads",
};
