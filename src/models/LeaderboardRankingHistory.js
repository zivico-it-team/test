const { DataTypes } = require("sequelize");

const { sequelize } = require("../config/db");

const LeaderboardRankingHistory = sequelize.define(
  "LeaderboardRankingHistory",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    monthKey: {
      type: DataTypes.STRING(7),
      allowNull: false,
    },
    employeeId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    employeeName: {
      type: DataTypes.STRING(160),
      allowNull: false,
      defaultValue: "Employee",
    },
    employeeCode: {
      type: DataTypes.STRING(60),
      allowNull: false,
      defaultValue: "",
    },
    designation: {
      type: DataTypes.STRING(120),
      allowNull: false,
      defaultValue: "",
    },
    rank: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    target: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    achieved: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    progress: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    savedBy: {
      type: DataTypes.STRING(120),
      allowNull: false,
      defaultValue: "System",
    },
  },
  {
    tableName: "leaderboard_ranking_history",
    timestamps: true,
    indexes: [
      { unique: true, fields: ["monthKey", "employeeId"] },
      { fields: ["monthKey", "rank"] },
    ],
  }
);

module.exports = LeaderboardRankingHistory;
