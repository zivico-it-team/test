const { DataTypes } = require("sequelize");

const { sequelize } = require("../config/db");
const User = require("./User");

const LeaderboardPerformance = sequelize.define(
  "LeaderboardPerformance",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    employeeId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
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
    updatedBy: {
      type: DataTypes.STRING(120),
      allowNull: false,
      defaultValue: "System",
    },
  },
  {
    tableName: "leaderboard_performances",
    timestamps: true,
    indexes: [{ fields: ["employeeId"] }],
  }
);

LeaderboardPerformance.belongsTo(User, {
  foreignKey: "employeeId",
  as: "employee",
});
User.hasOne(LeaderboardPerformance, {
  foreignKey: "employeeId",
  as: "leaderboardPerformance",
});

module.exports = LeaderboardPerformance;
