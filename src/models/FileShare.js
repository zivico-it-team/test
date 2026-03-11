const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");
const Upload = require("./Upload");
const User = require("./User");

const FileShare = sequelize.define(
  "FileShare",
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    fileId: { type: DataTypes.UUID, allowNull: false, unique: true },
    sharedById: { type: DataTypes.UUID, allowNull: false },
    scope: { type: DataTypes.ENUM("team", "users"), allowNull: false },
    sharedWith: { type: DataTypes.JSON, allowNull: true, defaultValue: [] }, // [userId,...]
  },
  { tableName: "file_shares", timestamps: true, indexes: [{ fields: ["fileId"] }] }
);

FileShare.belongsTo(Upload, { foreignKey: "fileId", as: "file" });
Upload.hasOne(FileShare, { foreignKey: "fileId", as: "share" });

FileShare.belongsTo(User, { foreignKey: "sharedById", as: "sharedBy" });

module.exports = FileShare;
