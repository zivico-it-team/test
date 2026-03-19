const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");

const User = sequelize.define(
  "User",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },

    userName: { type: DataTypes.STRING(60), allowNull: false },
    password: { type: DataTypes.STRING(255), allowNull: false },
    name: { type: DataTypes.STRING(80), allowNull: false },
    email: { type: DataTypes.STRING(120), allowNull: true, unique: true, defaultValue: null },

    role: {
      type: DataTypes.ENUM("admin", "hr", "manager", "employee"),
      allowNull: false,
      defaultValue: "employee",
    },
    approvalStatus: {
      type: DataTypes.ENUM("pending", "approved"),
      allowNull: false,
      defaultValue: "approved",
    },
    approvedAt: { type: DataTypes.DATE, allowNull: true, defaultValue: null },

    phone: { type: DataTypes.STRING(30), allowNull: true, defaultValue: "" },
    dob: { type: DataTypes.DATE, allowNull: true },
    gender: {
      type: DataTypes.ENUM("Male", "Female", "Other", "Not specified"),
      allowNull: false,
      defaultValue: "Not specified",
    },
    nationality: { type: DataTypes.STRING(60), allowNull: true, defaultValue: "" },

    bio: { type: DataTypes.STRING(500), allowNull: true, defaultValue: "" },
    skills: { type: DataTypes.JSON, allowNull: true, defaultValue: [] },

    addressLine: { type: DataTypes.STRING(120), allowNull: true, defaultValue: "" },
    city: { type: DataTypes.STRING(60), allowNull: true, defaultValue: "" },
    state: { type: DataTypes.STRING(60), allowNull: true, defaultValue: "" },
    postalCode: { type: DataTypes.STRING(20), allowNull: true, defaultValue: "" },

    professional: { type: DataTypes.JSON, allowNull: true, defaultValue: {} },
    bank: { type: DataTypes.JSON, allowNull: true, defaultValue: {} },
    documents: { type: DataTypes.JSON, allowNull: true, defaultValue: [] },

    profileImageUrl: { type: DataTypes.STRING(255), allowNull: true, defaultValue: "" },
    profileImageFileName: { type: DataTypes.STRING(255), allowNull: true, defaultValue: "" },

    emergencyContact: { type: DataTypes.JSON, allowNull: true, defaultValue: {} },
  },
  {
    tableName: "users",
    timestamps: true,
    indexes: [
      { unique: true, fields: ["email"] },
      { unique: true, fields: ["userName"] },
      { fields: ["role"] },
    ],
  }
);

module.exports = User;
