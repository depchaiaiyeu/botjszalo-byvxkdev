import mysql from "mysql2/promise";
import chalk from "chalk";
import fs from "fs/promises";
import path from "path";
import Database from "better-sqlite3";
import { claimDailyReward, getMyCard } from "./player.js";
import { getTopPlayers } from "./jdbc.js";
import { getBotInfo } from "../utils/env.js";

export * from "./player.js";
export * from "./jdbc.js";

const botInfo = await getBotInfo();
let nameServer = "";
let db;
let useSQLite = false;
let NAME_TABLE_PLAYERS;
let NAME_TABLE_ACCOUNT;
let DAILY_REWARD;

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

async function tryConnectMySQL(config) {
  try {
    const tempConnection = await mysql.createConnection({
      host: config.host,
      user: config.user,
      password: config.password,
      connectTimeout: 5000,
    });
    await tempConnection.end();
    return true;
  } catch (error) {
    return false;
  }
}

async function createDatabaseConfig() {
  const defaultConfig = {
    host: "localhost",
    user: "root",
    password: "",
    database: "zalo_bot_db",
    port: 3306,
    nameServer: "Game Server",
    tablePlayerZalo: "players",
    tableAccount: "accounts",
    dailyReward: 5000,
    useSQLite: false,
  };

  const configDir = path.join(process.cwd(), "assets", "json-data");
  const configPath = path.join(configDir, "database-config.json");

  try {
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(configPath, JSON.stringify(defaultConfig, null, 2), "utf8");
    console.log(chalk.yellow("✓ Đã tạo file database-config.json mặc định"));
    return defaultConfig;
  } catch (error) {
    console.error(chalk.red("Lỗi khi tạo file config: "), error);
    throw error;
  }
}

async function initializeSQLite(config) {
  try {
    const dbDir = path.join(process.cwd(), "database");
    await fs.mkdir(dbDir, { recursive: true });

    const dbPath = path.join(dbDir, "bot_database.sqlite");
    db = new Database(dbPath);

    db.exec(`
      CREATE TABLE IF NOT EXISTS ${config.tableAccount} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        is_admin INTEGER DEFAULT 0,
        vnd INTEGER DEFAULT 0
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS ${config.tablePlayerZalo} (
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

    console.log(chalk.green("✓ Đã khởi tạo SQLite database thành công"));
    return true;
  } catch (error) {
    console.error(chalk.red("Lỗi khi khởi tạo SQLite: "), error);
    return false;
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

    db = mysql.createPool({
      host: config.host,
      user: config.user,
      password: config.password,
      database: config.database,
      port: config.port,
    });

    const [tablesAccount] = await db.execute(
      `SHOW TABLES LIKE '${config.tableAccount}'`
    );

    if (tablesAccount.length === 0) {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS ${config.tableAccount} (
          id INT PRIMARY KEY AUTO_INCREMENT,
          username VARCHAR(255) NOT NULL UNIQUE,
          password VARCHAR(255) NOT NULL,
          is_admin BOOLEAN DEFAULT false,
          vnd BIGINT DEFAULT 0
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log(`✓ Đã kiểm tra/tạo bảng ${config.tableAccount}`);
    }

    const [tables] = await db.execute(
      `SHOW TABLES LIKE '${config.tablePlayerZalo}'`
    );

    if (tables.length === 0) {
      await db.execute(`
        CREATE TABLE ${config.tablePlayerZalo} (
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
      console.log(`✓ Đã tạo bảng ${config.tablePlayerZalo}`);
    } else {
      const [columns] = await db.execute(
        `SHOW COLUMNS FROM ${config.tablePlayerZalo}`
      );
      const existingColumns = columns.map((col) => col.Field);

      const requiredColumns = [
        { name: "username", query: "ADD COLUMN username VARCHAR(255) NOT NULL UNIQUE" },
        { name: "idUserZalo", query: "ADD COLUMN idUserZalo VARCHAR(255) DEFAULT '-1'" },
        { name: "playerName", query: "ADD COLUMN playerName VARCHAR(255) NOT NULL" },
        { name: "balance", query: "ADD COLUMN balance bigint(20) DEFAULT 10000" },
        { name: "registrationTime", query: "ADD COLUMN registrationTime DATETIME" },
        { name: "totalWinnings", query: "ADD COLUMN totalWinnings bigint(20) DEFAULT 0" },
        { name: "totalLosses", query: "ADD COLUMN totalLosses bigint(20) DEFAULT 0" },
        { name: "netProfit", query: "ADD COLUMN netProfit bigint(20) DEFAULT 0" },
        { name: "totalWinGames", query: "ADD COLUMN totalWinGames bigint(20) DEFAULT 0" },
        { name: "totalGames", query: "ADD COLUMN totalGames bigint(20) DEFAULT 0" },
        { name: "winRate", query: "ADD COLUMN winRate DECIMAL(5, 2) DEFAULT 0" },
        { name: "lastDailyReward", query: "ADD COLUMN lastDailyReward DATETIME" },
        { name: "isBanned", query: "ADD COLUMN isBanned BOOLEAN DEFAULT FALSE" },
      ];

      for (const column of requiredColumns) {
        if (!existingColumns.includes(column.name)) {
          await db.execute(
            `ALTER TABLE ${config.tablePlayerZalo} ${column.query}`
          );
          console.log(
            `✓ Đã thêm/sửa cột ${column.name} vào bảng ${config.tablePlayerZalo}`
          );
        }
      }
    }

    console.log(chalk.green("✓ Khởi tạo MySQL database thành công"));
    return true;
  } catch (error) {
    console.error(chalk.red("Lỗi khi khởi tạo MySQL: "), error);
    return false;
  }
}

async function saveConfig(config) {
  const configPath = path.join(
    process.cwd(),
    "assets",
    "json-data",
    "database-config.json"
  );
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf8");
}

export async function initializeDatabase() {
  try {
    let config;

    try {
      config = await loadConfig();
    } catch (error) {
      console.log(chalk.yellow("⚠ Không tìm thấy file config, đang tạo mới..."));
      config = await createDatabaseConfig();
    }

    nameServer = config.nameServer;
    NAME_TABLE_PLAYERS = config.tablePlayerZalo;
    NAME_TABLE_ACCOUNT = config.tableAccount;
    DAILY_REWARD = config.dailyReward;

    if (config.useSQLite === true) {
      console.log(chalk.blue("✓ Sử dụng SQLite database theo config..."));
      useSQLite = true;
      await initializeSQLite(config);
      return;
    }

    const canConnect = await tryConnectMySQL(config);

    if (!canConnect) {
      console.log(chalk.yellow("⚠ Không thể kết nối MySQL, chuyển sang SQLite..."));
      useSQLite = true;
      config.useSQLite = true;
      await saveConfig(config);
      await initializeSQLite(config);
      return;
    }

    useSQLite = false;
    await initializeMySQL(config);
  } catch (error) {
    console.error(chalk.red("Lỗi khi khởi tạo cơ sở dữ liệu: "), error);
    console.log(chalk.yellow("⚠ Thử chuyển sang SQLite..."));
    useSQLite = true;

    let config;
    try {
      config = await loadConfig();
    } catch {
      config = await createDatabaseConfig();
    }

    config.useSQLite = true;
    await saveConfig(config);

    await initializeSQLite(config);
  }
}

export function getConnection() {
  return db;
}

export function isUsingSQLite() {
  return useSQLite;
}

export function isDatabaseConnected() {
  return db !== null && db !== undefined;
}

export {
  db,
  useSQLite,
  NAME_TABLE_PLAYERS,
  NAME_TABLE_ACCOUNT,
  claimDailyReward,
  getTopPlayers,
  getMyCard,
  nameServer,
  DAILY_REWARD,
};
