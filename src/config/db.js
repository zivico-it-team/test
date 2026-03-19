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

    if (!userTable?.approvalStatus) {
      await queryInterface.addColumn("users", "approvalStatus", {
        type: DataTypes.ENUM("pending", "approved"),
        allowNull: false,
        defaultValue: "approved",
      });
      console.log("Users.approvalStatus column added");
    }

    if (!userTable?.approvedAt) {
      await queryInterface.addColumn("users", "approvedAt", {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null,
      });
      console.log("Users.approvedAt column added");
    }

    await sequelize.query(`
      UPDATE users
      SET approvalStatus = 'approved'
      WHERE approvalStatus IS NULL OR approvalStatus = ''
    `);

    const passwordResetTable = await queryInterface.describeTable("password_resets").catch(() => null);
    if (!passwordResetTable) {
      await queryInterface.createTable("password_resets", {
        id: {
          type: DataTypes.UUID,
          allowNull: false,
          primaryKey: true,
        },
        user_id: {
          type: DataTypes.UUID,
          allowNull: false,
          references: { model: "users", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE",
        },
        token_hash: {
          type: DataTypes.STRING(128),
          allowNull: false,
          unique: true,
        },
        expires_at: {
          type: DataTypes.DATE,
          allowNull: false,
        },
        created_at: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
        },
      });
      await queryInterface.addIndex("password_resets", ["user_id"]);
      await queryInterface.addIndex("password_resets", ["expires_at"]);
      console.log("password_resets table created");
    }

    const leaveTable = await queryInterface.describeTable("leaves").catch(() => null);
    if (leaveTable) {
      if (!String(leaveTable?.totalDays?.type || "").toLowerCase().includes("float")) {
        await queryInterface.changeColumn("leaves", "totalDays", {
          type: DataTypes.FLOAT,
          allowNull: false,
        });
        console.log("Leaves.totalDays column updated to float");
      }

      if (!leaveTable?.isHalfDay) {
        await queryInterface.addColumn("leaves", "isHalfDay", {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        });
        console.log("Leaves.isHalfDay column added");
      }

      if (!leaveTable?.session) {
        await queryInterface.addColumn("leaves", "session", {
          type: DataTypes.STRING(20),
          allowNull: true,
          defaultValue: null,
        });
        console.log("Leaves.session column added");
      }
    }

    const notificationsTable = await queryInterface.describeTable("notifications").catch(() => null);
    if (!notificationsTable) {
      await queryInterface.createTable("notifications", {
        id: {
          type: DataTypes.UUID,
          allowNull: false,
          primaryKey: true,
        },
        userId: {
          type: DataTypes.UUID,
          allowNull: false,
          references: { model: "users", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE",
        },
        title: {
          type: DataTypes.STRING(160),
          allowNull: false,
          defaultValue: "",
        },
        message: {
          type: DataTypes.STRING(500),
          allowNull: false,
          defaultValue: "",
        },
        type: {
          type: DataTypes.STRING(60),
          allowNull: false,
          defaultValue: "general",
        },
        module: {
          type: DataTypes.STRING(60),
          allowNull: false,
          defaultValue: "general",
        },
        isRead: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        readAt: {
          type: DataTypes.DATE,
          allowNull: true,
          defaultValue: null,
        },
        meta: {
          type: DataTypes.JSON,
          allowNull: true,
        },
        createdAt: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
        },
        updatedAt: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
        },
      });
      await queryInterface.addIndex("notifications", ["userId", "isRead"]);
      await queryInterface.addIndex("notifications", ["type"]);
      console.log("notifications table created");
    }

    const leadTable = await queryInterface.describeTable("leads").catch(() => null);
    if (!leadTable) {
      return;
    }

    const ensureLeadColumn = async (name, definition) => {
      if (leadTable?.[name]) return;
      await queryInterface.addColumn("leads", name, definition);
      console.log(`Leads.${name} column added`);
    };

    await ensureLeadColumn("followUpSetById", {
      type: DataTypes.STRING(64),
      allowNull: false,
      defaultValue: "",
    });
    await ensureLeadColumn("followUpSetBy", {
      type: DataTypes.STRING(120),
      allowNull: false,
      defaultValue: "",
    });
    await ensureLeadColumn("followUpSetAt", {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    });
    await ensureLeadColumn("followUpHandled", {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await ensureLeadColumn("followUpHandledAt", {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    });
    await ensureLeadColumn("followUpHandledById", {
      type: DataTypes.STRING(64),
      allowNull: false,
      defaultValue: "",
    });
    await ensureLeadColumn("wasEverAssigned", {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });

    await sequelize.query(`
      UPDATE leads
      SET wasEverAssigned = 1
      WHERE leadPool = 'SL_EMP_ASSIGNED'
         OR (assignedTo IS NOT NULL AND assignedTo <> '' AND assignedTo <> 'Unassigned')
         OR (assignedToId IS NOT NULL AND assignedToId <> '')
    `);
  } catch (error) {
    console.error("MySQL connection failed", error);
    process.exit(1);
  }
};

module.exports = { sequelize, connectDB };
