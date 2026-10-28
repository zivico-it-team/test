const fs = require("fs");
const path = require("path");

const productionUploadsDir = "/home/u512178113/user_uploads";
const localUploadsDir = path.resolve(__dirname, "../../uploads");

const getUploadsDir = () => {
  const configured = String(process.env.UPLOADS_DIR || "").trim();
  // On Windows, if configured with a Linux path like /home/..., fall back to localUploadsDir
  if (process.platform === "win32" && configured.startsWith("/home/")) {
    return localUploadsDir;
  }
  if (configured) {
    return path.resolve(configured);
  }
  return process.env.NODE_ENV === "production" ? productionUploadsDir : localUploadsDir;
};

const uploadsDir = getUploadsDir();

const uploadsRoute = String(process.env.UPLOADS_ROUTE || "/uploads").trim() || "/uploads";

try {
  fs.mkdirSync(uploadsDir, { recursive: true });
} catch (err) {
  console.warn(`Failed to create uploads directory at ${uploadsDir}:`, err.message);
}

module.exports = {
  uploadsDir,
  uploadsRoute,
};
