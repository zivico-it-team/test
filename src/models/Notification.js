const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");
const User = require("./User");

const Notification = sequelize.define(
  "Notification",
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false },
    title: { type: DataTypes.STRING(160), allowNull: false, defaultValue: "" },
    message: { type: DataTypes.STRING(500), allowNull: false, defaultValue: "" },
    type: { type: DataTypes.STRING(60), allowNull: false, defaultValue: "general" },
    module: { type: DataTypes.STRING(60), allowNull: false, defaultValue: "general" },
    isRead: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    readAt: { type: DataTypes.DATE, allowNull: true, defaultValue: null },
    meta: { type: DataTypes.JSON, allowNull: true, defaultValue: {} },
  },
  {
    tableName: "notifications",
    timestamps: true,
    indexes: [{ fields: ["userId", "isRead"] }, { fields: ["type"] }],
  }
);

Notification.belongsTo(User, { foreignKey: "userId", as: "user" });
User.hasMany(Notification, { foreignKey: "userId", as: "notifications" });

module.exports = Notification;
