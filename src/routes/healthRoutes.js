const express = require("express");
const { sequelize } = require("../config/db");

const router = express.Router();

// Example route that reuses the shared Sequelize singleton instance.
router.get("/db", async (req, res) => {
  try {
    await sequelize.query("SELECT 1");
    return res.status(200).json({ status: "ok", message: "Database connection is healthy" });
  } catch (error) {
    return res.status(503).json({ status: "error", message: "Database connection failed" });
  }
});

module.exports = router;
