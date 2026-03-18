const { Sequelize, DataTypes } = require("sequelize");

const isProduction = process.env.NODE_ENV === "production";
const shouldSync =
  String(process.env.DB_SYNC || (isProduction ? "false" : "true")).toLowerCase() === "true";

const GLOBAL_SEQUELIZE_KEY = "__zivico_mysql_sequelize__";
const GLOBAL_DB_STATE_KEY = "__zivico_mysql_db_state__";
const globalStore = globalThis;

// Reuse one Sequelize instance across the process (helps during dev reloads).
if (!globalStore[GLOBAL_SEQUELIZE_KEY]) {
  globalStore[GLOBAL_SEQUELIZE_KEY] = new Sequelize(
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
}

if (!globalStore[GLOBAL_DB_STATE_KEY]) {
  globalStore[GLOBAL_DB_STATE_KEY] = {
    connected: false,
    connectingPromise: null,
    shutdownHooksRegistered: false,
  };
}

const sequelize = globalStore[GLOBAL_SEQUELIZE_KEY];
const dbState = globalStore[GLOBAL_DB_STATE_KEY];

const runBootstrapMigrations = async () => {
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
};

const connectDB = async () => {
  // Idempotent connect: all callers share one in-flight connect promise.
  if (dbState.connected) {
    return sequelize;
  }

  if (dbState.connectingPromise) {
    return dbState.connectingPromise;
  }

  dbState.connectingPromise = (async () => {
    await sequelize.authenticate();
    console.log("MySQL connected successfully");

    if (shouldSync) {
      // Create tables if not exist (dev/local).
      await sequelize.sync();
      console.log("MySQL tables synced");
    } else {
      console.log("DB sync skipped (DB_SYNC=false)");
    }

    await runBootstrapMigrations();
    dbState.connected = true;
    return sequelize;
  })()
    .catch((error) => {
      dbState.connected = false;
      console.error("MySQL connection failed", error);
      throw error;
    })
    .finally(() => {
      dbState.connectingPromise = null;
    });

  return dbState.connectingPromise;
};

const closeDB = async () => {
  if (!dbState.connected) {
    return;
  }

  await sequelize.close();
  dbState.connected = false;
  console.log("MySQL connection pool closed");
};

const registerShutdownHooks = () => {
  if (dbState.shutdownHooksRegistered) {
    return;
  }

  dbState.shutdownHooksRegistered = true;
  const gracefulClose = async (signal) => {
    try {
      await closeDB();
    } catch (error) {
      console.error(`Error closing DB connection on ${signal}`, error);
    } finally {
      if (signal === "SIGUSR2") {
        process.kill(process.pid, "SIGUSR2");
        return;
      }
      process.exit(0);
    }
  };

  process.once("SIGINT", () => {
    gracefulClose("SIGINT");
  });
  process.once("SIGTERM", () => {
    gracefulClose("SIGTERM");
  });
  process.once("SIGUSR2", () => {
    gracefulClose("SIGUSR2");
  });
};

registerShutdownHooks();

module.exports = { sequelize, connectDB, closeDB };
