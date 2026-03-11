const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");
const User = require("./User");

const Upload = sequelize.define(
  "Upload",
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false },
    originalName: { type: DataTypes.STRING(255), allowNull: false },
    fileName: { type: DataTypes.STRING(255), allowNull: false },
    mimeType: { type: DataTypes.STRING(120), allowNull: false },
    size: { type: DataTypes.INTEGER, allowNull: false },
    url: { type: DataTypes.STRING(255), allowNull: false },
  },
  { tableName: "uploads", timestamps: true, indexes: [{ fields: ["userId"] }] }
);

Upload.belongsTo(User, { foreignKey: "userId", as: "user" });
User.hasMany(Upload, { foreignKey: "userId", as: "uploads" });

module.exports = Upload;
