const { DataTypes } = require("sequelize");

const { sequelize } = require("../config/db");

const LeaderboardMonthlyCycle = sequelize.define(
  "LeaderboardMonthlyCycle",
  {
    id: {
      type: DataTypes.STRING(40),
      primaryKey: true,
      defaultValue: "leaderboard",
    },
    activeMonthKey: {
      type: DataTypes.STRING(7),
      allowNull: false,
    },
    lastProcessedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
  },
  {
    tableName: "leaderboard_monthly_cycles",
    timestamps: true,
  }
);

module.exports = LeaderboardMonthlyCycle;
