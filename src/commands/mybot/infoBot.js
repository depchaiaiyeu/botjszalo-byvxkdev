import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { sendMessageFromSQL, sendMessageComplete } from "./chat-style-fake.js";

const projectRoot = path.resolve(process.cwd());
const myBotDir = path.join(projectRoot, "mybot");
const myBotsPath = path.join(myBotDir, "mybots.json");
const adminListPath = path.join(projectRoot, "assets", "data", "list_admin.json");

export async function infoBot(api, message, groupAdmins) {
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
    const pm2Status = await checkPM2Status(uidFrom);
    let realStatus = "stopped";
    if (pm2Status.running && pm2Status.status === "online") {
      realStatus = "running";
    } else if (["trialExpired", "expired", "stopping", "pending", "rejected"].includes(botInfo.status)) {
      realStatus = botInfo.status;
    }
    let statusUpdated = false;
    if (botInfo.status !== realStatus && !["trialExpired", "expired", "stopping", "pending", "rejected"].includes(botInfo.status)) {
      await updateBotStatus(uidFrom, realStatus);
      statusUpdated = true;
    }
    const botName = botInfo.name || uidFrom;
    const displayName = botInfo.displayName || "Không có";
    const description = botInfo.description || "Không có";
    const createdBy = botInfo.createdBy || dName;
    const infoMessage = `✨ THÔNG TIN CHỦ BOT ✨\n\n` +
                        `👤 Tên: ${createdBy}\n` +
                        `🤖 Bot đang chạy: ${botName}\n` +
                        `🛡️ Tên Đại Diện: ${displayName}\n` +
                        `📄 Mô Tả Bot: ${description}`;
    try {
      await sendMessageComplete(
        api,
        message,
        infoMessage,
        true
      );
    } catch (err) {
    }
  } catch (error) {
    try {
      await sendMessageFromSQL(
        api,
        message,
        {
          success: false,
          message: `Đã xảy ra lỗi khi lấy thông tin bot!\nChi tiết: ${error.message}`,
        },
        true,
        60000
      );
    } catch (err) {
    }
  }
}

export async function detailBot(api, message, groupAdmins) {
  const { threadId, data: { uidFrom, dName, index }, type } = message;
  try {
    let isMotherBotAdmin = await checkMotherBotAdmin(uidFrom);
    let targetUid = uidFrom;

    if (index !== undefined && isMotherBotAdmin) {
      const botUid = await getBotUidByIndex(index);
      if (botUid) {
        targetUid = botUid;
      } else {
        try {
          await sendMessageFromSQL(
            api,
            message,
            {
              success: false,
              message: `Không tìm thấy bot với số thứ tự ${index}!`,
            },
            true,
            60000
          );
        } catch (err) {
        }
        return;
      }
    } else if (index !== undefined && !isMotherBotAdmin) {
      try {
        await sendMessageFromSQL(
          api,
          message,
          {
            success: false,
            message: `Bạn không có quyền xem chi tiết bot khác! Hiển thị thông tin bot hiện tại của bạn.`,
          },
          true,
          60000
        );
      } catch (err) {
      }
    }

    const checkResult = await checkBotExists(targetUid);
    if (!checkResult.exists) {
      try {
        await sendMessageFromSQL(
          api,
          message,
          {
            success: false,
            message: `Bot ${targetUid} không tồn tại trong hệ thống!`,
          },
          true,
          60000
        );
      } catch (err) {
      }
      return;
    }

    const botInfo = checkResult.botInfo;
    const pm2Status = await checkPM2Status(targetUid);
    let realStatus = "stopped";
    if (pm2Status.running && pm2Status.status === "online") {
      realStatus = "running";
    } else if (["trialExpired", "expired", "stopping", "pending", "rejected"].includes(botInfo.status)) {
      realStatus = botInfo.status;
    }
    let statusUpdated = false;
    if (botInfo.status !== realStatus && !["trialExpired", "expired", "stopping", "pending", "rejected"].includes(botInfo.status)) {
      await updateBotStatus(targetUid, realStatus);
      statusUpdated = true;
    }

    const createdAt = new Date(botInfo.createdAt);
    const expiryAt = new Date(botInfo.expiryAt);
    const now = new Date();
    const timeRunning = formatTimeDifference(createdAt, now);
    const timeRemaining = expiryAt > now ? formatTimeDifference(now, expiryAt) : "Đã hết hạn";
    const statusIcons = {
      "running": "✅ Đang hoạt động",
      "stopped": "⏹️ Đã dừng",
      "trialExpired": "⏰ Hết thời gian dùng thử",
      "expired": "❌ Đã hết hạn",
      "stopping": "🔧 Đang bảo trì",
      "pending": "⌛ Đang chờ phê duyệt",
      "rejected": "🚫 Bị từ chối"
    };
    const botName = botInfo.displayName || botInfo.name || targetUid;
    const createdBy = botInfo.createdBy || dName;
    const infoMessage = `📌 THÔNG TIN CHI TIẾT BOT 📌\n\n` +
                        `👤 ID Owner: ${targetUid}\n` +
                        `📱 Tên Bot: ${botName}\n` +
                        `🟢 Trạng thái: ${statusIcons[realStatus] || realStatus}\n` +
                        `🌐 Web Port: ${botInfo.webPort || "Không có"}\n` +
                        `🗄️ Database: ${botInfo.database || "Không có"}\n` +
                        `🔄 Đang chạy: ${timeRunning}\n` +
                        `⏳ Thời hạn còn: ${timeRemaining}\n\n` +
                        `📊 THÔNG TIN ĐĂNG KÝ\n` +
                        `📅 Ngày tạo: ${formatDateTime(createdAt)}\n` +
                        `👤 Người tạo: ${createdBy}\n` +
                        `✅ Thời gian xem xét gần nhất: ${formatDateTime(createdAt)}\n` +
                        `👮 Được phê duyệt bởi: ${botInfo.approvedBy || "Chưa xác định"}\n` +
                        `🔧 TRẠNG THÁI KỸ THUẬT:\n` +
                        `• PM2 Status: ${pm2Status.status}\n` +
                        `• File Status: ${botInfo.status}\n` +
                        `• Real Status: ${realStatus}\n` +
                        `• Cập nhật cuối: ${botInfo.lastUpdated ? formatDateTime(new Date(botInfo.lastUpdated)) : "Chưa cập nhật"}`;
    try {
      await sendMessageComplete(
        api,
        message,
        infoMessage,
        true
      );
    } catch (err) {
    }
  } catch (error) {
    try {
      await sendMessageFromSQL(
        api,
        message,
        {
          success: false,
          message: `Đã xảy ra lỗi khi lấy thông tin chi tiết bot!\nChi tiết: ${error.message}`,
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
    const pm2Process = spawn(pm2Command, ["describe", processName], {
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

async function checkMotherBotAdmin(uidFrom) {
  try {
    if (!fs.existsSync(adminListPath)) {
      return false;
    }
    const adminList = JSON.parse(fs.readFileSync(adminListPath, "utf8"));
    return Array.isArray(adminList) && adminList.includes(uidFrom.toString());
  } catch (error) {
    return false;
  }
}

async function getBotUidByIndex(index) {
  try {
    if (!fs.existsSync(myBotsPath)) {
      return null;
    }
    const myBots = JSON.parse(fs.readFileSync(myBotsPath, "utf8"));
    const botUids = Object.keys(myBots);
    const idx = parseInt(index) - 1;
    if (idx >= 0 && idx < botUids.length) {
      return botUids[idx];
    }
    return null;
  } catch (error) {
    return null;
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
    fs.writeFileSync(myBotsPath, JSON.stringify(myBots, null, 2));
  } catch (error) {
    throw error;
  }
}

function formatDateTime(date) {
  const options = {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh"
  };
  return date.toLocaleString("vi-VN", options);
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
