const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");

const Lead = sequelize.define(
  "Lead",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    email: { type: DataTypes.STRING(160), allowNull: false, defaultValue: "" },
    name: { type: DataTypes.STRING(120), allowNull: false, defaultValue: "" },
    phone: { type: DataTypes.STRING(40), allowNull: false, defaultValue: "" },
    country: { type: DataTypes.STRING(80), allowNull: false, defaultValue: "" },
    preferredLanguage: { type: DataTypes.STRING(80), allowNull: false, defaultValue: "" },
    assignedTo: { type: DataTypes.STRING(120), allowNull: false, defaultValue: "" },
    assignedToId: { type: DataTypes.STRING(64), allowNull: false, defaultValue: "" },
    followUp: { type: DataTypes.STRING(120), allowNull: false, defaultValue: "" },
    stage: { type: DataTypes.STRING(80), allowNull: false, defaultValue: "New" },
    tag: { type: DataTypes.STRING(120), allowNull: false, defaultValue: "New Lead" },
    comment: { type: DataTypes.TEXT, allowNull: false, defaultValue: "" },
    assignedDate: { type: DataTypes.DATE, allowNull: true },
    complianceType: { type: DataTypes.STRING(80), allowNull: false, defaultValue: "Standard" },
    isBookmarked: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    isArchived: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    uploadedBy: { type: DataTypes.STRING(120), allowNull: false, defaultValue: "System" },
    campaign: { type: DataTypes.STRING(120), allowNull: false, defaultValue: "General Campaign" },
    source: { type: DataTypes.STRING(60), allowNull: false, defaultValue: "manual" },
    leadPool: { type: DataTypes.STRING(60), allowNull: false, defaultValue: "SL_EMP_UNASSIGNED" },
    fax: { type: DataTypes.STRING(80), allowNull: false, defaultValue: "" },
    gender: { type: DataTypes.STRING(40), allowNull: false, defaultValue: "" },
    dateOfBirth: { type: DataTypes.STRING(40), allowNull: false, defaultValue: "" },
  },
  {
    tableName: "leads",
    timestamps: true,
    indexes: [
      { fields: ["email"] },
      { fields: ["assignedToId"] },
      { fields: ["assignedTo"] },
      { fields: ["isArchived"] },
      { fields: ["isBookmarked"] },
      { fields: ["createdAt"] },
    ],
  }
);

module.exports = Lead;
