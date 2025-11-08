import mysql from "mysql2/promise";
import chalk from "chalk";
import fs from "fs/promises";
import path from "path";
import Database from "better-sqlite3";
import { claimDailyReward, getMyCard } from "./player.js";
import { getTopPlayers } from "./jdbc.js";
export * from "./player.js";
export * from "./jdbc.js";

let nameServer = "";
let connection;
let NAME_TABLE_PLAYERS;
let NAME_TABLE_ACCOUNT;
let DAILY_REWARD;
let dbType = "mysql";
let dbInstance;

async function loadConfig() {
  const configPath = path.join(
    process.cwd(),
    "assets",
    "json-data",
    "database-config.json"
  );
  const configFile = await fs.readFile(configPath, "utf8");
  return JSON.parse(configFile);
}

export async function getNameServer() {
  const config = await loadConfig();
  return config.nameServer;
}
export function updateNameServer(newName) {
  nameServer = newName;
}

export async function executeQuery(query, params = []) {
  if (dbType === "mysql") {
    return dbInstance.execute(query, params);
  } else if (dbType === "sqlite") {
    if (query.trim().toUpperCase().startsWith("SELECT")) {
      const statement = dbInstance.prepare(query);
      return [statement.all(...params)];
    } else {
      const statement = dbInstance.prepare(query);
      return statement.run(...params);
    }
  }
}

async function initializeMySQL(config) {
  try {
    const tempConnection = await mysql.createConnection({
      host: config.host,
      user: config.user,
      password: config.password,
    });

    await tempConnection.execute(
      `CREATE DATABASE IF NOT EXISTS \`${config.database}\``
    );

    await tempConnection.end();

    dbInstance = mysql.createPool({
      host: config.host,
      user: config.user,
      password: config.password,
      database: config.database,
      port: config.port,
    });
    dbType = "mysql";
    console.log(chalk.green("✓ Đã kết nối MySQL"));
    return true;
  } catch (error) {
    console.error(
      chalk.yellow(
        "Lỗi kết nối MySQL, thử chuyển sang SQLite: "
      ),
      error.message
    );
    return false;
  }
}

async function initializeSQLite(config) {
  try {
    const dbPath = path.join(process.cwd(), config.sqliteFile || "bot_data.sqlite");
    dbInstance = new Database(dbPath);
    dbType = "sqlite";
    console.log(chalk.green(`✓ Đã kết nối SQLite tại: ${dbPath}`));
    return true;
  } catch (error) {
    console.error(chalk.red("Lỗi khi tạo/kết nối SQLite: "), error);
    return false;
  }
}

async function createMySQLTables() {
  const [tablesAccount] = await executeQuery(
    `SHOW TABLES LIKE '${NAME_TABLE_ACCOUNT}'`
  );
  if (tablesAccount.length === 0) {
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS ${NAME_TABLE_ACCOUNT} (
        id INT PRIMARY KEY AUTO_INCREMENT,
        username VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        is_admin BOOLEAN DEFAULT false,
        vnd BIGINT DEFAULT 0
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log(`✓ Đã kiểm tra/tạo bảng ${NAME_TABLE_ACCOUNT}`);
  }

  const [tables] = await executeQuery(
    `SHOW TABLES LIKE '${NAME_TABLE_PLAYERS}'`
  );

  if (tables.length === 0) {
    await executeQuery(`
      CREATE TABLE ${NAME_TABLE_PLAYERS} (
        id INT AUTO_INCREMENT,
        username VARCHAR(255) NOT NULL,
        idUserZalo VARCHAR(255) DEFAULT '-1',
        playerName VARCHAR(255) NOT NULL,
        balance BIGINT DEFAULT 10000,
        registrationTime DATETIME,
        totalWinnings BIGINT DEFAULT 0,
        totalLosses BIGINT DEFAULT 0,
        netProfit BIGINT DEFAULT 0,
        totalWinGames BIGINT DEFAULT 0,
        totalGames BIGINT DEFAULT 0,
        winRate DECIMAL(5, 2) DEFAULT 0,
        lastDailyReward DATETIME,
        isBanned BOOLEAN DEFAULT FALSE,
        PRIMARY KEY (id),
        UNIQUE KEY (username)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log(`✓ Đã tạo bảng ${NAME_TABLE_PLAYERS}`);
  } else {
    const [columns] = await executeQuery(
      `SHOW COLUMNS FROM ${NAME_TABLE_PLAYERS}`
    );
    const existingColumns = columns.map((col) => col.Field);

    const requiredColumns = [
      {
        name: "username",
        query: "ADD COLUMN username VARCHAR(255) NOT NULL UNIQUE",
      },
      {
        name: "idUserZalo",
        query: "ADD COLUMN idUserZalo VARCHAR(255) DEFAULT '-1'",
      },
      {
        name: "playerName",
        query: "ADD COLUMN playerName VARCHAR(255) NOT NULL",
      },
      {
        name: "balance",
        query: "ADD COLUMN balance BIGINT DEFAULT 10000",
      },
      {
        name: "registrationTime",
        query: "ADD COLUMN registrationTime DATETIME",
      },
      {
        name: "totalWinnings",
        query: "ADD COLUMN totalWinnings BIGINT DEFAULT 0",
      },
      {
        name: "totalLosses",
        query: "ADD COLUMN totalLosses BIGINT DEFAULT 0",
      },
      {
        name: "netProfit",
        query: "ADD COLUMN netProfit BIGINT DEFAULT 0",
      },
      {
        name: "totalWinGames",
        query: "ADD COLUMN totalWinGames BIGINT DEFAULT 0",
      },
      {
        name: "totalGames",
        query: "ADD COLUMN totalGames BIGINT DEFAULT 0",
      },
      {
        name: "winRate",
        query: "ADD COLUMN winRate DECIMAL(5, 2) DEFAULT 0",
      },
      {
        name: "lastDailyReward",
        query: "ADD COLUMN lastDailyReward DATETIME",
      },
      {
        name: "isBanned",
        query: "ADD COLUMN isBanned BOOLEAN DEFAULT FALSE",
      },
    ];

    for (const column of requiredColumns) {
      if (!existingColumns.includes(column.name)) {
        await executeQuery(
          `ALTER TABLE ${NAME_TABLE_PLAYERS} ${column.query}`
        );
        console.log(
          `Đã thêm/sửa cột ${column.name} vào bảng ${NAME_TABLE_PLAYERS}`
        );
      }
    }
  }
}

async function createSQLiteTables() {
  executeQuery(`
    CREATE TABLE IF NOT EXISTS ${NAME_TABLE_ACCOUNT} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      is_admin INTEGER DEFAULT 0,
      vnd INTEGER DEFAULT 0
    )
  `);
  console.log(`✓ Đã kiểm tra/tạo bảng ${NAME_TABLE_ACCOUNT}`);

  executeQuery(`
    CREATE TABLE IF NOT EXISTS ${NAME_TABLE_PLAYERS} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      idUserZalo TEXT DEFAULT '-1',
      playerName TEXT NOT NULL,
      balance INTEGER DEFAULT 10000,
      registrationTime TEXT,
      totalWinnings INTEGER DEFAULT 0,
      totalLosses INTEGER DEFAULT 0,
      netProfit INTEGER DEFAULT 0,
      totalWinGames INTEGER DEFAULT 0,
      totalGames INTEGER DEFAULT 0,
      winRate REAL DEFAULT 0,
      lastDailyReward TEXT,
      isBanned INTEGER DEFAULT 0
    )
  `);
  console.log(`✓ Đã kiểm tra/tạo bảng ${NAME_TABLE_PLAYERS}`);
}

export async function initializeDatabase() {
  try {
    const config = await loadConfig();

    nameServer = config.nameServer;
    NAME_TABLE_PLAYERS = config.tablePlayerZalo;
    NAME_TABLE_ACCOUNT = config.tableAccount;
    DAILY_REWARD = config.dailyReward;

    let connected = false;

    if (config.type === "sqlite" || !(await initializeMySQL(config))) {
      connected = await initializeSQLite(config);
    } else {
      connected = true;
    }

    if (!connected) {
      throw new Error("Không thể kết nối với cả MySQL và SQLite");
    }

    if (dbType === "mysql") {
      await createMySQLTables();
    } else if (dbType === "sqlite") {
      await createSQLiteTables();
    }

    console.log(chalk.green("✓ Khởi tạo database thành công"));
  } catch (error) {
    console.error(chalk.red("Lỗi khi khởi tạo cơ sở dữ liệu: "), error);
    if (dbType === "mysql") {
      console.error(chalk.red("Vui lòng mở XAMPP MySQL và khởi động lại!"));
    }
  }
}

export {
  dbInstance as connection,
  NAME_TABLE_PLAYERS,
  NAME_TABLE_ACCOUNT,
  claimDailyReward,
  getTopPlayers,
  getMyCard,
  nameServer,
  DAILY_REWARD,
};
