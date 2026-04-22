const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");
const Upload = require("./Upload");
const User = require("./User");

const ImportantDocument = sequelize.define(
  "ImportantDocument",
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    uploadId: { type: DataTypes.UUID, allowNull: false, unique: true },
    uploadedById: { type: DataTypes.UUID, allowNull: false },
    title: { type: DataTypes.STRING(160), allowNull: false, defaultValue: "" },
    note: { type: DataTypes.STRING(1200), allowNull: false, defaultValue: "" },
    expiresAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    tableName: "important_documents",
    timestamps: true,
    indexes: [{ fields: ["expiresAt"] }, { fields: ["uploadedById"] }],
  }
);

ImportantDocument.belongsTo(Upload, { foreignKey: "uploadId", as: "file" });
Upload.hasOne(ImportantDocument, { foreignKey: "uploadId", as: "importantDocument" });

ImportantDocument.belongsTo(User, { foreignKey: "uploadedById", as: "uploadedBy" });
User.hasMany(ImportantDocument, { foreignKey: "uploadedById", as: "importantDocuments" });

module.exports = ImportantDocument;
