const express = require("express");

const { protect, authorize } = require("../middleware/authMiddleware");
const {
  createImportantDocument,
  deleteImportantDocument,
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

router.delete(
  "/:id",
  protect,
  authorize("admin", "hr"),
  deleteImportantDocument
);

module.exports = router;
