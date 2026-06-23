const fs = require("fs");
const path = require("path");

const productionUploadsDir = "/home/u512178113/user_uploads";
const localUploadsDir = path.resolve(__dirname, "../../uploads");

const uploadsDir = path.resolve(
  String(
    process.env.UPLOADS_DIR ||
      (process.env.NODE_ENV === "production" ? productionUploadsDir : localUploadsDir)
  ).trim()
);

const uploadsRoute = String(process.env.UPLOADS_ROUTE || "/uploads").trim() || "/uploads";

fs.mkdirSync(uploadsDir, { recursive: true });


module.exports = {
  uploadsDir,
  uploadsRoute,
};
