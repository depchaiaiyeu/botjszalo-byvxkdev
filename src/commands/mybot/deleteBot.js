import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { sendMessageFromSQL } from "./chat-style-fake.js";

const projectRoot = path.resolve(process.cwd());
const myBotDir = path.join(projectRoot, "mybot");
const myBotsPath = path.join(myBotDir, "mybots.json");

function createBotConfig(uidFrom, webPort) {
  return {
    "name": uidFrom,
    "configFilePath": `mybot/credentials/${uidFrom}.json`,
    "groupSettingsPath": `mybot/settings/groupSettings-${uidFrom}.json`,
    "adminFilePath": `mybot/configs/admins-${uidFrom}.json`,
    "commandFilePath": `mybot/json-data/command-${uidFrom}.json`,
    "MANAGER_FILE_PATH": `mybot/json-data/manager-${uidFrom}.json`,
    "DATA_GAME_FILE_PATH": `mybot/json-data/game_data-${uidFrom}.json`,
    "DATA_NT_PATH": `mybot/json-data/nong-trai-${uidFrom}.json`,
    "PROPHYLACTIC_CONFIG_PATH": `mybot/json-data/prophylactic-${uidFrom}.json`,
    "logDir": `logs/${uidFrom}`,
    "resourceDir": `assets/resources/${uidFrom}`,
    "tempDir": `assets/temp/${uidFrom}`,
    "dataGifPath": `assets/resources/gif/${uidFrom}`,
    "WEB_CONFIG_PATH": `mybot/json-data/web_config-${uidFrom}.json`,
    "webPort": webPort.toString(),
    "databaseFile": `mybot/json-data/database_config-${uidFrom}.json`,
    "dataTrainingPath": `mybot/json-data/data_training-${uidFrom}.json`,
    "rankInfoPath": `mybot/json-data/rank_info-${uidFrom}.json`
  };
}

export async function deleteBot(api, message, groupAdmins) {
  const { threadId, data: { uidFrom, dName }, type } = message;
  try {
    const checkResult = await checkBotExists(uidFrom);
    if (!checkResult.exists) {
      try {
        await sendMessageFromSQL(
          api,
          message,
          {
            success: false,
            message: "Bạn chưa có bot nào được tạo!",
          },
          true,
          60000
        );
      } catch (err) {
      }
      return;
    }
    const botInfo = checkResult.botInfo;
    if (["trialExpired", "expired", "stopping"].includes(botInfo.status)) {
      try {
        await sendMessageFromSQL(
          api,
          message,
          {
            success: false,
            message: "Hiện tại chỉ có admin bot mẹ mới có quyền xoá/reset bot của bạn.",
          },
          true,
          60000
        );
      } catch (err) {
      }
      return;
    }
    const pm2Status = await checkPM2Status(uidFrom);
    if (pm2Status.running) {
      const stopSuccess = await stopPM2Process(uidFrom);
      if (!stopSuccess) {
      }
    }
    const deleteSuccess = await deletePM2Process(uidFrom);
    const removeSuccess = await removeBotFromList(uidFrom, botInfo.webPort);
    if (removeSuccess) {
      const botName = botInfo.displayName || botInfo.name || uidFrom;
      const createdBy = botInfo.createdBy || "Không rõ";
      const createdAt = formatDateTime(new Date(botInfo.createdAt));
      try {
        await sendMessageFromSQL(
          api,
          message,
          {
            success: false,
            message:
              `🚫 Đã xóa bot thành công!\n` +
              `👤 ID Owner: ${uidFrom}\n` +
              `📱 Tên Bot: ${botName}\n` +
              `👤 Người tạo: ${createdBy}\n` +
              `📅 Ngày tạo: ${createdAt}\n` +
              `⚠️ Lưu ý: Dữ liệu bot đã bị xóa vĩnh viễn!`,
          },
          false,
          120000
        );
      } catch (err) {
      }
    } else {
      try {
        await sendMessageFromSQL(
          api,
          message,
          {
            success: false,
            message: "Không thể xóa bot khỏi danh sách. Vui lòng thử lại hoặc liên hệ admin!",
          },
          true,
          60000
        );
      } catch (err) {
      }
    }
  } catch (error) {
    try {
      await sendMessageFromSQL(
        api,
        message,
        {
          success: false,
          message: `Đã xảy ra lỗi khi xóa bot!\nChi tiết: ${error.message}`,
        },
        true,
        60000
      );
    } catch (err) {
    }
  }
}

async function checkPM2Status(processName) {
  return new Promise((resolve) => {
    const pm2Command = "pm2";
    const pm2Process = spawn(pm2Command, ["jlist"], {
      stdio: "pipe",
      shell: true,
    });
    let output = "";
    pm2Process.stdout?.on("data", (data) => {
      output += data.toString();
    });
    pm2Process.on("close", (code) => {
      try {
        if (code === 0 && output) {
          const processes = JSON.parse(output);
          const process = processes.find((p) => p.name === processName);
          resolve({ running: !!process, status: process ? process.pm2_env.status : null });
        } else {
          resolve({ running: false, status: null });
        }
      } catch (error) {
        resolve({ running: false, status: null });
      }
    });
    pm2Process.on("error", (error) => {
      resolve({ running: false, status: null });
    });
  });
}

async function stopPM2Process(processName) {
  return new Promise((resolve) => {
    const pm2Command = "pm2";
    const pm2Process = spawn(pm2Command, ["stop", processName], {
      stdio: "pipe",
      shell: true,
    });
    let output = "";
    let errorOutput = "";
    pm2Process.stdout?.on("data", (data) => {
      output += data.toString();
    });
    pm2Process.stderr?.on("data", (data) => {
      errorOutput += data.toString();
    });
    pm2Process.on("close", (code) => {
      if (code === 0) {
        resolve(true);
      } else {
        console.error(`Failed to stop PM2 process: ${processName}`);
        if (errorOutput) console.error(`Error: ${errorOutput}`);
        resolve(false);
      }
    });
    pm2Process.on("error", (error) => {
      console.error(`Error stopping PM2 process: ${error.message}`);
      resolve(false);
    });
    setTimeout(() => {
      pm2Process.kill();
      console.error(`Timeout stopping PM2 process: ${processName}`);
      resolve(false);
    }, 15000);
  });
}

async function deletePM2Process(processName) {
  return new Promise((resolve) => {
    const pm2Command = "pm2";
    const pm2Process = spawn(pm2Command, ["delete", processName], {
      stdio: "pipe",
      shell: true,
    });
    let output = "";
    let errorOutput = "";
    pm2Process.stdout?.on("data", (data) => {
      output += data.toString();
    });
    pm2Process.stderr?.on("data", (data) => {
      errorOutput += data.toString();
    });
    pm2Process.on("close", (code) => {
      if (code === 0) {
        resolve(true);
      } else {
        resolve(true);
      }
    });
    pm2Process.on("error", (error) => {
      console.error(`Error deleting PM2 process: ${error.message}`);
      resolve(false);
    });
    setTimeout(() => {
      pm2Process.kill();
      console.error(`Timeout deleting PM2 process: ${processName}`);
      resolve(false);
    }, 15000);
  });
}

async function checkBotExists(uidFrom) {
  try {
    if (!fs.existsSync(myBotsPath)) {
      return { exists: false };
    }
    const myBots = JSON.parse(fs.readFileSync(myBotsPath, "utf8"));
    const botInfo = myBots[uidFrom];
    if (!botInfo) {
      return { exists: false };
    }
    return { exists: true, botInfo };
  } catch (error) {
    console.error(`Lỗi kiểm tra bot: ${error.message}`);
    return { exists: false };
  }
}

async function removeBotFromList(uidFrom, webPort) {
  try {
    if (!fs.existsSync(myBotsPath)) {
      throw new Error("File mybots.json không tồn tại");
    }
    const myBots = JSON.parse(fs.readFileSync(myBotsPath, "utf8"));
    if (!myBots[uidFrom]) {
      throw new Error("Bot không tồn tại trong danh sách");
    }

    const botConfig = createBotConfig(uidFrom, webPort || 3000);

    const filesToDelete = [
      botConfig.configFilePath,
      botConfig.groupSettingsPath,
      botConfig.adminFilePath,
      botConfig.commandFilePath,
      botConfig.MANAGER_FILE_PATH,
      botConfig.DATA_GAME_FILE_PATH,
      botConfig.DATA_NT_PATH,
      botConfig.PROPHYLACTIC_CONFIG_PATH,
      botConfig.WEB_CONFIG_PATH,
      botConfig.databaseFile,
      botConfig.dataTrainingPath,
      botConfig.rankInfoPath
    ];

    for (const filePath of filesToDelete) {
      const fullPath = path.join(projectRoot, filePath);
      if (fs.existsSync(fullPath)) {
        try {
          fs.unlinkSync(fullPath);
        } catch (error) {
          console.error(`Lỗi khi xóa tệp ${fullPath}: ${error.message}`);
        }
      }
    }

    const dirsToDelete = [
      botConfig.logDir,
      botConfig.resourceDir,
      botConfig.tempDir,
      botConfig.dataGifPath
    ];

    for (const dirPath of dirsToDelete) {
      const fullPath = path.join(projectRoot, dirPath);
      if (fs.existsSync(fullPath)) {
        try {
          fs.rmSync(fullPath, { recursive: true, force: true });
        } catch (error) {
          console.error(`Lỗi khi xóa thư mục ${fullPath}: ${error.message}`);
        }
      }
    }

    delete myBots[uidFrom];
    fs.writeFileSync(myBotsPath, JSON.stringify(myBots, null, 2));

    return true;
  } catch (error) {
    console.error(`Lỗi xóa bot khỏi danh sách: ${error.message}`);
    return false;
  }
}

function formatDateTime(date) {
  const options = {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh"
  };
  return date.toLocaleString("vi-VN", options);
}
