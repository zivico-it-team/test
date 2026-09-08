const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");

// Comments are stored separately so each complaint can have a full, auditable
// conversation instead of overwriting a single note on the complaint record.
const ComplianceComplaintComment = sequelize.define(
  "ComplianceComplaintComment",
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    complaintId: { type: DataTypes.UUID, allowNull: false },
    authorId: { type: DataTypes.UUID, allowNull: false },
    authorName: { type: DataTypes.STRING(120), allowNull: false, defaultValue: "" },
    authorDepartment: { type: DataTypes.STRING(80), allowNull: false, defaultValue: "" },
    comment: { type: DataTypes.TEXT, allowNull: false },
  },
  {
    tableName: "compliance_complaint_comments",
    timestamps: true,
    indexes: [{ fields: ["complaintId", "createdAt"] }, { fields: ["authorId"] }],
  },
);

module.exports = ComplianceComplaintComment;
