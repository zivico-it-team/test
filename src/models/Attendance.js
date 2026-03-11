const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");
const User = require("./User");

const Attendance = sequelize.define(
  "Attendance",
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false },
    dateKey: { type: DataTypes.STRING(10), allowNull: false }, // YYYY-MM-DD
    checkInAt: { type: DataTypes.DATE, allowNull: true },
    checkOutAt: { type: DataTypes.DATE, allowNull: true },
    totalWorkedSeconds: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    isLate: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    status: { type: DataTypes.ENUM("present", "absent"), allowNull: false, defaultValue: "present" },
  },
  {
    tableName: "attendances",
    timestamps: true,
    indexes: [
      { unique: true, fields: ["userId", "dateKey"] },
      { fields: ["dateKey"] },
    ],
  }
);

Attendance.belongsTo(User, { foreignKey: "userId", as: "user" });
User.hasMany(Attendance, { foreignKey: "userId", as: "attendances" });

module.exports = Attendance;
