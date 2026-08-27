const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");

const ComplianceComplaint = sequelize.define(
  "ComplianceComplaint",
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    reportedById: { type: DataTypes.UUID, allowNull: false },
    reportedByName: { type: DataTypes.STRING(120), allowNull: false, defaultValue: "" },
    targets: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
    complaint: { type: DataTypes.TEXT, allowNull: false },
  },
  { tableName: "compliance_complaints", timestamps: true, indexes: [{ fields: ["reportedById"] }] },
);

module.exports = ComplianceComplaint;
