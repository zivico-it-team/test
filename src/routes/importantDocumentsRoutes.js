const express = require("express");

const { protect, authorize } = require("../middleware/authMiddleware");
const {
  createImportantDocument,
  listImportantDocuments,
  markImportantDocumentAsRead,
  uploadImportantDocumentSingle,
} = require("../controllers/importantDocumentsController");

const router = express.Router();

router.get(
  "/",
  protect,
  authorize("employee", "manager", "admin", "hr"),
  listImportantDocuments
);

router.post(
  "/",
  protect,
  authorize("admin", "hr"),
  uploadImportantDocumentSingle,
  createImportantDocument
);

router.patch(
  "/:id/read",
  protect,
  authorize("employee", "manager", "admin", "hr"),
  markImportantDocumentAsRead
);

module.exports = router;
