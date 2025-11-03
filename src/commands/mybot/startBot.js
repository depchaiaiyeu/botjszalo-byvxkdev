import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { sendMessageFromSQL } from "./chat-style-fake.js";
import { MessageType } from "../../api-zalo/index.js";

const projectRoot = path.resolve(process.cwd());
const myBotDir = path.join(projectRoot, "mybot");
const myBotsPath = path.join(myBotDir, "mybots.json");
const launcherPath = path.join(projectRoot, "index.js");

export async function startBot(api, message, groupAdmins) {
  const { threadId, data: { uidFrom, dName }, type } = message;
  try {
    const checkResult = await checkBotExists(uidFrom);
    if (!checkResult.exists) {
      await sendMessageFromSQL(
        api,
        message,
        {
          success: false,
          message: "❌ Bạn chưa có bot nào được tạo!"
        },
        true,
        60000
      );
      return;
    }

    const botInfo = checkResult.botInfo;
    if (["trialExpired", "expired", "stopping"].includes(botInfo.status)) {
      const statusMessages = {
        trialExpired: "Bạn đã hết thời gian dùng thử! Hãy gia hạn bot của bạn.",
        expired: "Bot của bạn đã hết hạn! Hãy gia hạn để tiếp tục sử dụng.",
        stopping: "Bot của bạn đang trong trạng thái bảo trì! Hãy liên hệ admin."
      };
      await sendMessageFromSQL(
        api,
        message,
        {
          success: false,
          message: `❌ ${statusMessages[botInfo.status]}`
        },
        true,
        60000
      );
      return;
    }

    const pm2Status = await checkPM2Status(uidFrom);
    const botName = botInfo.displayName || botInfo.name || uidFrom;
    const now = new Date();
    const expiryAt = new Date(botInfo.expiryAt);
    const hsd = botInfo.hsd || formatDateTime(expiryAt);
    const timeRemaining = expiryAt > now ? formatTimeDifference(now, expiryAt) : "Đã hết hạn";

    if (botInfo.status === "running" && pm2Status.running) {
      await sendMessageFromSQL(
        api,
        message,
        {
          success: false,
          message: "Đang khởi chạy bot..."
        },
        true,
        60000
      );

      const restartSuccess = await restartPM2Process(uidFrom);
      if (restartSuccess) {
        await sendMessageFromSQL(
          api,
          message,
          {
            success: true,
            message: `✅ Khởi chạy bot thành công!\nTên bot: ${botName}\nChủ sở hữu: ${dName}\nID tài khoản: ${uidFrom}\nThời hạn còn lại: ${timeRemaining}\nHSD: ${hsd}`
          },
          true,
          60000
        );
      } else {
        await sendMessageFromSQL(
          api,
          message,
          {
            success: false,
            message: "❌ Không thể khởi động lại bot. Vui lòng thử lại hoặc liên hệ admin!"
          },
          true,
          60000
        );
      }
      return;
    }

    if (botInfo.status === "stopped" || !pm2Status.running) {
      await sendMessageFromSQL(
        api,
        message,
        {
          success: false,
          message: "Đang khởi chạy bot..."
        },
        true,
        60000
      );

      if (!fs.existsSync(launcherPath)) {
        await sendMessageFromSQL(
          api,
          message,
          {
            success: false,
            message: "❌ Đã xảy ra lỗi nghiêm trọng!!!"
          },
          true,
          60000
        );
        return;
      }

      const startSuccess = await startBotWithLauncher(uidFrom);
      if (startSuccess) {
        await updateBotStatus(uidFrom, "running");
        await sendMessageFromSQL(
          api,
          message,
          {
            success: true,
            message: `✅ Khởi chạy bot thành công!\nTên bot: ${botName}\nChủ sở hữu: ${dName}\nID tài khoản: ${uidFrom}\nThời hạn còn lại: ${timeRemaining}\nHSD: ${hsd}`
          },
          true,
          60000
        );
      } else {
        await sendMessageFromSQL(
          api,
          message,
          {
            success: false,
            message: "❌ Không thể khởi động bot. Vui lòng kiểm tra logs và thử lại sau!"
          },
          true,
          60000
        );
      }
      return;
    }

    await sendMessageFromSQL(
      api,
      message,
      {
        success: false,
        message: `📊 Trạng thái bot hiện tại: ${botInfo.status}\n\n💡 Vui lòng liên hệ admin nếu cần hỗ trợ.`
      },
      true,
      60000
    );
  } catch (error) {
    await sendMessageFromSQL(
      api,
      message,
      {
        success: false,
        message: `❌ Đã xảy ra lỗi khi khởi động bot!\nChi tiết: ${error.message}`
      },
      true,
      60000
    );
  }
}

async function checkPM2Status(processName) {
  return new Promise((resolve) => {
    const pm2Command = "pm2"; 
    const pm2Process = spawn(pm2Command, ["describe", processName], {
      stdio: "pipe",
      shell: true,
    });
    let output = "";
    pm2Process.stdout?.on("data", (data) => {
      output += data.toString();
    });
    pm2Process.on("close", (code) => {
      if (code === 0 && output.includes("online")) {
        resolve({ running: true, status: "online" });
      } else if (code === 0 && output.includes("stopped")) {
        resolve({ running: false, status: "stopped" });
      } else {
        resolve({ running: false, status: "not_found" });
      }
    });
    pm2Process.on("error", () => {
      resolve({ running: false, status: "error" });
    });
    setTimeout(() => {
      pm2Process.kill();
      resolve({ running: false, status: "timeout" });
    }, 10000);
  });
}

async function restartPM2Process(processName) {
  return new Promise((resolve) => {
    const pm2Command = "pm2";
    const pm2Process = spawn(pm2Command, ["restart", processName], {
      stdio: "pipe",
      shell: true,
    });
    pm2Process.on("close", (code) => {
      if (code === 0) {
        resolve(true);
      } else {
        resolve(false);
      }
    });
    pm2Process.on("error", () => {
      resolve(false);
    });
    setTimeout(() => {
      pm2Process.kill();
      resolve(false);
    }, 30000);
  });
}

async function startBotWithLauncher(uidFrom) {
  return new Promise((resolve) => {
    const launcherProcess = spawn("node", [launcherPath, uidFrom], {
      stdio: "pipe",
      detached: true,
      env: {
        ...process.env,
        UID_FROM: uidFrom
      }
    });
    let hasStarted = false;
    launcherProcess.stdout?.on("data", (data) => {
      const text = data.toString();
      if (text.includes("Successfully") || text.includes("started") || text.includes("listening")) {
        hasStarted = true;
      }
    });

    const checkTimeout = setTimeout(async () => {
      try {
        const isRunning = await waitForPM2Process(uidFrom, 45000);
        if (isRunning) {
          resolve(true);
        } else {
          resolve(false);
        }
      } catch (error) {
        resolve(false);
      }
    }, 5000);

    launcherProcess.on("close", (code) => {
      clearTimeout(checkTimeout);
      if (code === 0 || hasStarted) {
        setTimeout(async () => {
          const status = await checkPM2Status(uidFrom);
          resolve(status.running);
        }, 2000);
      } else {
        resolve(false);
      }
    });

    launcherProcess.on("error", () => {
      clearTimeout(checkTimeout);
      resolve(false);
    });

    launcherProcess.unref();
  });
}

async function waitForPM2Process(processName, maxWaitTime = 60000) {
  const startTime = Date.now();
  const checkInterval = 2000;
  while (Date.now() - startTime < maxWaitTime) {
    const status = await checkPM2Status(processName);
    if (status.running && status.status === "online") {
      return true;
    }
    if (status.status === "stopped") {
      return false;
    }
    await new Promise(resolve => setTimeout(resolve, checkInterval));
  }
  return false;
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
    return { exists: false };
  }
}

async function updateBotStatus(uidFrom, status) {
  try {
    if (!fs.existsSync(myBotsPath)) {
      throw new Error("File mybots.json không tồn tại");
    }
    const myBots = JSON.parse(fs.readFileSync(myBotsPath, "utf8"));
    if (!myBots[uidFrom]) {
      throw new Error("Bot không tồn tại trong danh sách");
    }
    myBots[uidFrom].status = status;
    myBots[uidFrom].lastUpdated = new Date().toISOString();
    myBots[uidFrom].hsd = formatDateTime(new Date(myBots[uidFrom].expiryAt));
    fs.writeFileSync(myBotsPath, JSON.stringify(myBots, null, 2));
  } catch (error) {
    throw error;
  }
}

function formatTimeDifference(startDate, endDate) {
  const diffMs = Math.abs(endDate - startDate);
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays > 0) {
    const remainingHours = diffHours % 24;
    return `${diffDays} ngày ${remainingHours} giờ`;
  } else if (diffHours > 0) {
    const remainingMinutes = diffMinutes % 60;
    return `${diffHours} giờ ${remainingMinutes} phút`;
  } else if (diffMinutes > 0) {
    const remainingSeconds = diffSeconds % 60;
    return `${diffMinutes} phút ${remainingSeconds} giây`;
  } else {
    return `${diffSeconds} giây`;
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
