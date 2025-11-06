import mysql from "mysql2/promise";
import chalk from "chalk";
import fs from "fs/promises";
import path from "path";
import { claimDailyReward, getMyCard } from "./player.js";
import { getTopPlayers } from "./jdbc.js";
import { getBotInfo } from "../utils/env.js";
export * from "./player.js";
export * from "./jdbc.js";

const botInfo = await getBotInfo();
const configPath = botInfo.databaseFile;
let nameServer = "";
let connection;
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
    });
    await tempConnection.end();
    return true;
  } catch (error) {
    return false;
  }
}

async function createMySQLConfig() {
  const defaultConfig = {
    host: "localhost",
    user: "root",
    password: "",
    database: "zalo_bot_db",
    port: 3306,
    nameServer: "Game Server",
    tablePlayerZalo: "players",
    tableAccount: "accounts",
    dailyReward: 5000
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

export async function initializeDatabase() {
  try {
    let config;
    
    try {
      config = await loadConfig();
    } catch (error) {
      console.log(chalk.yellow("⚠ Không tìm thấy file config, đang tạo mới..."));
      config = await createMySQLConfig();
    }

    const canConnect = await tryConnectMySQL(config);
    
    if (!canConnect) {
      console.log(chalk.red("✗ Không thể kết nối MySQL với config hiện tại"));
      console.log(chalk.yellow("⚠ Đang tạo config mới..."));
      config = await createMySQLConfig();
      
      const canConnectNew = await tryConnectMySQL(config);
      if (!canConnectNew) {
        throw new Error("Không thể kết nối MySQL. Vui lòng kiểm tra XAMPP/MySQL đã khởi động chưa!");
      }
    }

    nameServer = config.nameServer;
    NAME_TABLE_PLAYERS = config.tablePlayerZalo;
    NAME_TABLE_ACCOUNT = config.tableAccount;
    DAILY_REWARD = config.dailyReward;

    const tempConnection = await mysql.createConnection({
      host: config.host,
      user: config.user,
      password: config.password,
    });

    await tempConnection.execute(
      `CREATE DATABASE IF NOT EXISTS \`${config.database}\``
    );

    await tempConnection.end();

    connection = mysql.createPool({
      host: config.host,
      user: config.user,
      password: config.password,
      database: config.database,
      port: config.port,
    });

    const [tablesAccount] = await connection.execute(
      `SHOW TABLES LIKE '${NAME_TABLE_ACCOUNT}'`
    );
    
    if (tablesAccount.length === 0) {
      await connection.execute(`
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

    const [tables] = await connection.execute(
      `SHOW TABLES LIKE '${NAME_TABLE_PLAYERS}'`
    );

    if (tables.length === 0) {
      await connection.execute(`
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
      const [columns] = await connection.execute(
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
          query: "ADD COLUMN balance bigint(20) DEFAULT 10000",
        },
        {
          name: "registrationTime",
          query: "ADD COLUMN registrationTime DATETIME",
        },
        {
          name: "totalWinnings",
          query: "ADD COLUMN totalWinnings bigint(20) DEFAULT 0",
        },
        {
          name: "totalLosses",
          query: "ADD COLUMN totalLosses bigint(20) DEFAULT 0",
        },
        {
          name: "netProfit",
          query: "ADD COLUMN netProfit bigint(20) DEFAULT 0",
        },
        {
          name: "totalWinGames",
          query: "ADD COLUMN totalWinGames bigint(20) DEFAULT 0",
        },
        {
          name: "totalGames",
          query: "ADD COLUMN totalGames bigint(20) DEFAULT 0",
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
          await connection.execute(
            `ALTER TABLE ${NAME_TABLE_PLAYERS} ${column.query}`
          );
          console.log(
            `Đã thêm/sửa cột ${column.name} vào bảng ${NAME_TABLE_PLAYERS}`
          );
        }
      }
    }

    console.log(chalk.green("✓ Khởi tạo database thành công"));
  } catch (error) {
    console.error(chalk.red("Lỗi khi khởi tạo cơ sở dữ liệu: "), error);
    console.error(chalk.red("Vui lòng mở XAMPP MySQL và khởi động lại!"));
    throw error;
  }
}

export {
  connection,
  NAME_TABLE_PLAYERS,
  NAME_TABLE_ACCOUNT,
  claimDailyReward,
  getTopPlayers,
  getMyCard,
  nameServer,
  DAILY_REWARD,
};
