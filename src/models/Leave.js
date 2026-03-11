const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");
const User = require("./User");

const Leave = sequelize.define(
  "Leave",
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false },

    type: { type: DataTypes.ENUM("annual", "casual", "medical", "unpaid"), allowNull: false },

    fromDate: { type: DataTypes.DATE, allowNull: false },
    toDate: { type: DataTypes.DATE, allowNull: false },
    totalDays: { type: DataTypes.INTEGER, allowNull: false },

    reason: { type: DataTypes.STRING(500), allowNull: true, defaultValue: "" },

    status: {
      type: DataTypes.ENUM("pending", "approved", "rejected"),
      allowNull: false,
      defaultValue: "pending",
    },

    remark: { type: DataTypes.STRING(500), allowNull: true, defaultValue: "" },
    actionById: { type: DataTypes.UUID, allowNull: true },
    actionAt: { type: DataTypes.DATE, allowNull: true },
  },
  { tableName: "leaves", timestamps: true, indexes: [{ fields: ["status"] }, { fields: ["userId"] }] }
);

Leave.belongsTo(User, { foreignKey: "userId", as: "user" });
User.hasMany(Leave, { foreignKey: "userId", as: "leaves" });

Leave.belongsTo(User, { foreignKey: "actionById", as: "actionBy" });

module.exports = Leave;
