const { Sequelize, DataTypes } = require("sequelize");

const isProduction = process.env.NODE_ENV === "production";
const shouldSync =
  String(process.env.DB_SYNC || (isProduction ? "false" : "true")).toLowerCase() === "true";

const sequelize = new Sequelize(
  process.env.MYSQL_DB,
  process.env.MYSQL_USER,
  process.env.MYSQL_PASSWORD,
  {
    host: process.env.MYSQL_HOST || "localhost",
    port: Number(process.env.MYSQL_PORT || 3306),
    dialect: "mysql",
    logging: false,
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
    timezone: "+05:30",
  }
);

const connectDB = async () => {
  try {
    await sequelize.authenticate();
    console.log("MySQL connected successfully");

    if (shouldSync) {
      // Create tables if not exist (dev/local).
      await sequelize.sync();
      console.log("MySQL tables synced");
    } else {
      console.log("DB sync skipped (DB_SYNC=false)");
    }

    const queryInterface = sequelize.getQueryInterface();
    const userTable = await queryInterface.describeTable("users").catch(() => null);

    if (!userTable) {
      return;
    }

    if (userTable?.email && userTable.email.allowNull === false) {
      await queryInterface.changeColumn("users", "email", {
        type: Sequelize.STRING(120),
        allowNull: true,
        unique: true,
        defaultValue: null,
      });
      console.log("Users.email column updated to nullable");
    }

    if (userTable?.role && !String(userTable.role.type || "").includes("'hr'")) {
      await queryInterface.changeColumn("users", "role", {
        type: DataTypes.ENUM("admin", "hr", "manager", "employee"),
        allowNull: false,
        defaultValue: "employee",
      });
      console.log("Users.role enum updated with hr");
    }
  } catch (error) {
    console.error("MySQL connection failed", error);
    process.exit(1);
  }
};

module.exports = { sequelize, connectDB };
