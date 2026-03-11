const { DataTypes } = require("sequelize");

const { sequelize } = require("../config/db");
const Lead = require("./Lead");

const LeadTimeline = sequelize.define(
  "LeadTimeline",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    leadId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    action: {
      type: DataTypes.STRING(120),
      allowNull: false,
      defaultValue: "",
    },
    details: {
      type: DataTypes.STRING(500),
      allowNull: false,
      defaultValue: "",
    },
    changedBy: {
      type: DataTypes.STRING(120),
      allowNull: false,
      defaultValue: "System",
    },
    changedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "lead_timelines",
    timestamps: true,
    indexes: [{ fields: ["leadId"] }, { fields: ["changedAt"] }],
  }
);

LeadTimeline.belongsTo(Lead, {
  foreignKey: "leadId",
  as: "lead",
});
Lead.hasMany(LeadTimeline, {
  foreignKey: "leadId",
  as: "timeline",
});

module.exports = LeadTimeline;
