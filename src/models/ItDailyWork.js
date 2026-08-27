const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");

const ItDailyWork = sequelize.define("ItDailyWork", {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  submittedById: { type: DataTypes.UUID, allowNull: false },
  submittedByName: { type: DataTypes.STRING(120), allowNull: false, defaultValue: "" },
  workDate: { type: DataTypes.DATEONLY, allowNull: false },
  workItems: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
}, { tableName: "it_daily_work", timestamps: true, indexes: [{ fields: ["submittedById"] }, { fields: ["workDate"] }] });

module.exports = ItDailyWork;
