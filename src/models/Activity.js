const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");
const User = require("./User");

const Activity = sequelize.define(
  "Activity",
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false },
    dateKey: { type: DataTypes.STRING(10), allowNull: false }, // YYYY-MM-DD
    type: {
      type: DataTypes.ENUM("tea_break", "lunch_break", "prayer_time", "meeting"),
      allowNull: false,
    },
    startedAt: { type: DataTypes.DATE, allowNull: false },
    endedAt: { type: DataTypes.DATE, allowNull: true },
    durationSeconds: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  {
    tableName: "activities",
    timestamps: true,
    indexes: [{ fields: ["userId", "dateKey", "isActive"] }],
  }
);

Activity.belongsTo(User, { foreignKey: "userId", as: "user" });
User.hasMany(Activity, { foreignKey: "userId", as: "activities" });

module.exports = Activity;
