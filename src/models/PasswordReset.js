const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");

const PasswordReset = sequelize.define(
  "PasswordReset",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: "user_id",
    },
    tokenHash: {
      type: DataTypes.STRING(128),
      allowNull: false,
      unique: true,
      field: "token_hash",
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: "expires_at",
    },
  },
  {
    tableName: "password_resets",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: false,
    indexes: [{ fields: ["user_id"] }, { fields: ["expires_at"] }, { unique: true, fields: ["token_hash"] }],
  }
);

module.exports = PasswordReset;
