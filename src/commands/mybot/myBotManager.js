import path from "path";
import * as fs from "fs";
import { spawn } from "child_process";
import { createBot } from "./createBot.js";
import { stopBot } from "./stopBot.js";
import { startBot } from "./startBot.js";
import { deleteBot } from "./deleteBot.js";
import { infoBot, detailBot } from "./infoBot.js";
import { getGlobalPrefix } from "../../service-dqt/service.js";
import { createBotListImage } from "../../utils/canvas/listbots-canvas.js";
import { sendMessageFailed, sendMessageComplete, sendMessageWarning, sendMessageResultRequest } from "./chat-style-fake.js";
import { MessageType } from "zlbotdqt";

const projectRoot = path.resolve(process.cwd());
const myBotDir = path.join(projectRoot, "mybot");
const myBotsPath = path.join(myBotDir, "mybots.json");
const configsDir = path.join(myBotDir, "configs");
const jsonDataDir = path.join(myBotDir, "json-data");
const adminListPath = path.join(projectRoot, "assets", "data", "list_admin.json");

const CHECK_INTERVAL = 5 * 60 * 1000;

async function stopPM2Process(processName) {
  return new Promise((resolve) => {
    const pm2Command = "pm2";
    const pm2Process = spawn(pm2Command, ["stop", processName], {
      stdio: "pipe",
      shell: true,
    });
    pm2Process.on("close", (code) => {
      resolve(code === 0);
    });
    pm2Process.on("error", () => {
      resolve(false);
    });
    setTimeout(() => {
      pm2Process.kill();
      resolve(false);
    }, 5000);
  });
}

function startExpirationCheck(api) {
  setInterval(async () => {
    try {
      if (!fs.existsSync(myBotsPath)) {
        return;
      }
      const myBots = JSON.parse(fs.readFileSync(myBotsPath, "utf8"));
      const now = new Date();
      for (const [botUid, botInfo] of Object.entries(myBots)) {
        const expiryAt = new Date(botInfo.expiryAt);
        if (expiryAt <= now && botInfo.status === "running") {

          const modifiedMessage = {
            threadId: null,
            data: { uidFrom: botUid, dName: botInfo.displayName || botInfo.name },
            type: 1
          };
          await stopBot(api, modifiedMessage, []);
          const pm2Stopped = await stopPM2Process(botUid);
          if (pm2Stopped) {
            
          } else {

          }
          myBots[botUid].status = "expired";
          myBots[botUid].lastUpdated = now.toISOString();
          myBots[botUid].hsd = formatDateTime(expiryAt);
          fs.writeFileSync(myBotsPath, JSON.stringify(myBots, null, 2));

        }
      }
    } catch (error) {

    }
  }, CHECK_INTERVAL);
}

startExpirationCheck({ sendMessage: async (options, threadId, type) => {

}});

export async function myBot(api, message, groupAdmins) {
  const { threadId, data: { uidFrom, dName, content, mentions }, type } = message;
  const args = content.split(/\s+/);
  const prefix = getGlobalPrefix();

  try {
    if (!args || args.length < 2) {
      try {
        await sendMessageWarning(
          api,
          message,
          `《 HỆ THỐNG QUẢN LÝ BOT 》

➤ Tạo/Sửa Bot:
『${prefix}mybot create』
• Cú pháp: ${prefix}mybot create cookie imei 
• Chức năng: Đăng ký/sửa đổi thông tin vào hệ thống VXK Bot Team
• Lưu ý: 
   - Không cần nhập dấu []
   - Nếu không biết cách điền, chat "${prefix}mybot create" để xem hướng dẫn
   - Chỉ hoạt động trong tin nhắn riêng

➤ Trợ Giúp:
『${prefix}mybot help』
• Hiển thị hướng dẫn sử dụng các lệnh cơ bản`, 
true
        );
      } catch (err) {
      
      }
      return;
    }

    const subCommand = args[1].toLowerCase();
    const arg = args.slice(1);

    let isMotherBotAdmin = false;
    try {
      if (fs.existsSync(adminListPath)) {
        const adminList = JSON.parse(fs.readFileSync(adminListPath, "utf8"));
        isMotherBotAdmin = Array.isArray(adminList) && adminList.includes(uidFrom.toString());
      }
    } catch (error) {

    }

    if (isMotherBotAdmin && ["del", "rs", "start", "stop", "detail", "info", "active", "restart", "shutdown", "addtime", "subtime", "approve", "reject"].includes(subCommand) && args.length >= 3 && /^\d+$/.test(args[2])) {
      const index = parseInt(args[2], 10);
      const botUid = await getBotUidByIndex(index);
      if (!botUid) {
        try {
          const messageOptions = { msg: `❌ Không tìm thấy bot với số thứ tự ${index}!`, ttl: 120000 };
          if (message && typeof message === 'object' && message.messageID) {
            messageOptions.quote = message;
          }
          await api.sendMessage(messageOptions, threadId, type);
        } catch (err) {
        
        }
        return;
      }
      const modifiedMessage = {
        ...message,
        data: { ...message.data, uidFrom: botUid }
      };
      switch (subCommand) {
        case "del":
          await deleteBot(api, modifiedMessage, groupAdmins);
          break;
        case "rs":
        case "start":
        case "active":
        case "restart":
          await startBot(api, modifiedMessage, groupAdmins);
          break;
        case "stop":
        case "shutdown":
          await stopBot(api, modifiedMessage, groupAdmins);
          break;
        case "detail":
          await detailBot(api, modifiedMessage, groupAdmins);
          break;
        case "info":
          await infoBot(api, modifiedMessage, groupAdmins);
          break;
        case "addtime":
          if (args.length < 4) {
            try {
              const messageOptions = { 
                msg: `❌ Sai cú pháp!\n\n📝 Cách dùng: ${prefix}mybot addtime [index] [thời hạn]\nVí dụ: ${prefix}mybot addtime 1 24h`, 
                ttl: 120000 
              };
              if (message && typeof message === 'object' && message.messageID) {
                messageOptions.quote = message;
              }
              await api.sendMessage(messageOptions, threadId, type);
            } catch (err) {
            
            }
            return;
          }
          await handleAddTime(api, botUid, dName, args[3], threadId, type, message);
          break;
        case "subtime":
          if (args.length < 4) {
            try {
              const messageOptions = { 
                msg: `❌ Sai cú pháp!\n\n📝 Cách dùng: ${prefix}mybot subtime [index] [thời hạn]\nVí dụ: ${prefix}mybot subtime 1 24h`, 
                ttl: 120000 
              };
              if (message && typeof message === 'object' && message.messageID) {
                messageOptions.quote = message;
              }
              await api.sendMessage(messageOptions, threadId, type);
            } catch (err) {
            
            }
            return;
          }
          await handleSubTime(api, botUid, dName, args[3], threadId, type, message);
          break;
        case "approve":
          if (args.length < 4) {
            try {
              const messageOptions = { 
                msg: `❌ Sai cú pháp!\n\n📝 Cách dùng: ${prefix}mybot approve [index] [thời hạn]\nVí dụ: ${prefix}mybot approve 1 24h`, 
                ttl: 120000 
              };
              if (message && typeof message === 'object' && message.messageID) {
                messageOptions.quote = message;
              }
              await api.sendMessage(messageOptions, threadId, type);
            } catch (err) {
            
            }
            return;
          }
          await handleApprove(api, botUid, dName, args[3], threadId, type, message);
          break;
        case "reject":
          await handleReject(api, botUid, dName, threadId, type, message);
          break;
      }
      return;
    }

    switch (subCommand) {
      case "info":
        await infoBot(api, message, groupAdmins);
        break;
      case "detail":
        await detailBot(api, message, groupAdmins);
        break;
      case "start":
      case "restart":
      case "rs":
        const checkResult = await checkBotExists(uidFrom);
        if (!checkResult.exists) {
          try {
            const messageOptions = { msg: "❌ Bạn chưa có bot nào được tạo!", ttl: 120000 };
            if (message && typeof message === 'object' && message.messageID) {
              messageOptions.quote = message;
            }
            await api.sendMessage(messageOptions, threadId, type);
          } catch (err) {
          
          }
          return;
        }
        if (checkResult.botInfo.status !== "running") {
          try {
            const messageOptions = { 
              msg: "❌ Có bot đéo đâu mà đòi reset!!! Vui lòng chờ phê duyệt hoặc liên hệ ADMIN để gia hạn.\n\n ❌❌❌", 
              ttl: 120000 
            };
            if (message && typeof message === 'object' && message.messageID) {
              messageOptions.quote = message;
            }
            await api.sendMessage(messageOptions, threadId, type);
          } catch (err) {
          
          }
          return;
        }
        await startBot(api, message, groupAdmins, arg);
        break;
      case "stop":
        await stopBot(api, message, groupAdmins, arg);
        break;
      case "delete":
      case "del":
        await deleteBot(api, message, groupAdmins, arg);
        break;
      case "login":
      case "create":
        await createBot(api, message, groupAdmins, arg);
        break;
      case "list":
        await handleListBots(api, threadId, type, message);
        break;
      case "update":
        if (args.length < 3) {
          try {
            const messageOptions = { 
              msg: `❌ Sai cú pháp!\n\n📝 Cách dùng:\n• ${prefix}mybot update name [tên mới]\n• ${prefix}mybot update description [mô tả mới]\n• ${prefix}mybot update nameserver [tên server mới]`, 
              ttl: 120000 
            };
            if (message && typeof message === 'object' && message.messageID) {
              messageOptions.quote = message;
            }
            await api.sendMessage(messageOptions, threadId, type);
          } catch (err) {
          
          }
          return;
        }
        const updateType = args[2].toLowerCase();
        const newValue = args.slice(3).join(" ");
        if (updateType === "name") {
          await handleUpdateName(api, uidFrom, dName, newValue, threadId, type, message);
        } else if (updateType === "description") {
          await handleUpdateDescription(api, uidFrom, dName, newValue, threadId, type, message);
        } else if (updateType === "nameserver") {
          await handleUpdateNameServer(api, uidFrom, dName, newValue, threadId, type, message);
        } else if (updateType === "credentials") {
          try {
            const messageOptions = { msg: "❌ Chỉ hỗ trợ update: name, description, nameserver hoặc credentials", ttl: 120000 };
            if (message && typeof message === 'object' && message.messageID) {
              messageOptions.quote = message;
            }
            await api.sendMessage(messageOptions, threadId, type);
          } catch (err) {
          }
        }
        break;
      case "add":
        if (args.length < 3 || args[2].toLowerCase() !== "admin") {
          try {
            const messageOptions = { 
              msg: `❌ Sai cú pháp!\n\n📝 Cách dùng: ${prefix}mybot add admin [uid] hoặc @tag`, 
              ttl: 120000 
            };
            if (message && typeof message === 'object' && message.messageID) {
              messageOptions.quote = message;
            }
            await api.sendMessage(messageOptions, threadId, type);
          } catch (err) {
          
          }
          return;
        }
        let adminUid = args[3];
        if (mentions && mentions.length > 0) adminUid = mentions[0].uid;
        await handleAddAdmin(api, uidFrom, dName, adminUid, threadId, type, message);
        break;
      case "remove":
        if (args.length < 3 || args[2].toLowerCase() !== "admin") {
          try {
            const messageOptions = { 
              msg: `❌ Sai cú pháp!\n\n📝 Cách dùng: ${prefix}mybot remove admin [uid] hoặc @tag`, 
              ttl: 120000 
            };
            if (message && typeof message === 'object' && message.messageID) {
              messageOptions.quote = message;
            }
            await api.sendMessage(messageOptions, threadId, type);
          } catch (err) {
          
          }
          return;
        }
        let removeAdminUid = args[3];
        if (mentions && mentions.length > 0) removeAdminUid = mentions[0].uid;
        await handleRemoveAdmin(api, uidFrom, dName, removeAdminUid, threadId, type, message);
        break;
      case "admin":
        if (args.length < 3 || args[2].toLowerCase() !== "list") {
          try {
            const messageOptions = { 
              msg: `❌ Sai cú pháp!\n\n📝 Cách dùng: ${prefix}mybot admin list`, 
              ttl: 120000 
            };
            if (message && typeof message === 'object' && message.messageID) {
              messageOptions.quote = message;
            }
            await api.sendMessage(messageOptions, threadId, type);
          } catch (err) {
          
          }
          return;
        }
        await handleListAdmins(api, uidFrom, dName, threadId, type, message);
        break;
      case "notify":
        if (!isMotherBotAdmin) {
          try {
            const messageOptions = { msg: "❌ Lệnh này chỉ dành cho quản trị viên hệ thống!", ttl: 120000 };
            if (message && typeof message === 'object' && message.messageID) {
              messageOptions.quote = message;
            }
            await api.sendMessage(messageOptions, threadId, type);
          } catch (err) {
          
          }
          return;
        }
        if (args.length < 3) {
          try {
            const messageOptions = { 
              msg: `❌ Sai cú pháp!\n\n📝 Cách dùng: ${prefix}mybot notify [nội dung thông báo]`, 
              ttl: 120000 
            };
            if (message && typeof message === 'object' && message.messageID) {
              messageOptions.quote = message;
            }
            await api.sendMessage(messageOptions, threadId, type);
          } catch (err) {
          
          }
          return;
        }
        await handleNotify(api, uidFrom, dName, args.slice(2).join(" "), threadId, type, message);
        break;
      case "load":
        if (!isMotherBotAdmin) {
          try {
            const messageOptions = { 
              msg: "❌ Lệnh này chỉ dành cho quản trị viên hệ thống!", 
              ttl: 120000 
            };
            if (message && typeof message === 'object' && message.messageID) {
              messageOptions.quote = message;
            }
            await api.sendMessage(messageOptions, threadId, type);
          } catch (err) {
          
          }
          return;
        }
        await handleLoadBots(api, uidFrom, dName, threadId, type, message);
        break;        
      case "activeall":
        if (!isMotherBotAdmin) {
          try {
            const messageOptions = { msg: "❌ Lệnh này chỉ dành cho quản trị viên hệ thống!", ttl: 120000 };
            if (message && typeof message === 'object' && message.messageID) {
              messageOptions.quote = message;
            }
            await api.sendMessage(messageOptions, threadId, type);
          } catch (err) {
          
          }
          return;
        }
        await handleActiveAll(api, uidFrom, dName, threadId, type, message, groupAdmins);
        break;
      case "shutdownall":
        if (!isMotherBotAdmin) {
          try {
            const messageOptions = { msg: "❌ Lệnh này chỉ dành cho quản trị viên hệ thống!", ttl: 120000 };
            if (message && typeof message === 'object' && message.messageID) {
              messageOptions.quote = message;
            }
            await api.sendMessage(messageOptions, threadId, type);
          } catch (err) {
          
          }
          return;
        }
        await handleShutdownAll(api, uidFrom, dName, threadId, type, message, groupAdmins);
        break;             
      case "help":
        await sendMessageWarning(
          api,
          message,
          `📋 HƯỚNG DẪN QUẢN LÝ BOT 📋\n\n` +
          `1️⃣ Các lệnh cơ bản\n\n` +
          `➤『${prefix}mybot info』 - Xem thông tin chủ bot của bạn\n` +
          `➤『${prefix}mybot detail』 - Xem thông tin chi tiết bot của bạn\n` +
          `➤『${prefix}mybot start』 - Kích hoạt bot\n` +
          `➤『${prefix}mybot restart』 - Khởi động lại bot\n` +
          `➤『${prefix}mybot stop』 - Tắt bot\n` +
          `2️⃣ Các lệnh quản lý bot\n\n` +
          `➤『${prefix}mybot qtv』 - Xem danh sách lệnh quản lý bot\n` +
          `3️⃣ Đối với quản trị viên\n\n` +
          `➤『${prefix}mybot manager』 - Xem danh sách lệnh quản lý hệ thống bot` +
          true
        );
        break;
      case "qtv": {
        const qtvMessage = `📋 HƯỚNG DẪN QUẢN LÝ BOT 📋

➤『${prefix}mybot update name』- Cập nhật tên hiển thị
➤『${prefix}mybot update description』- Cập nhật mô tả bot
➤『${prefix}mybot update nameserver』- Cập nhật name server của bot
➤『${prefix}mybot add admin』- Thêm admin bot
➤『${prefix}mybot remove admin』- Xoá admin bot
➤『${prefix}mybot admin list』- Xem danh sách admin bot
➤『${prefix}mybot delete』- Xoá bot khỏi hệ thống VXK Bot Team`;
        try {
          await sendMessageWarning(api, message, qtvMessage, true);
        } catch (err) {
        
        }
        break;
      }
      case "manager": {
        const listAdmin = JSON.parse(fs.readFileSync(adminListPath, "utf8"));
        if (!listAdmin.includes(uidFrom.toString())) {
          try {
            await sendMessageFailed(api, message, "❌ Lệnh này chỉ dành cho quản trị viên hệ thống!", true);
          } catch (err) {
          
          }
          return;
        }
        const managerMessage = `👮 LỆNH QUẢN TRỊ BOT 👮

➤ Quản lý danh sách:
• ${prefix}mybot list - Xem danh sách tất cả bot
• ${prefix}mybot load - Tải lại dữ liệu bot từ file json
• ${prefix}mybot notify - Thông báo cho tất cả khách hàng đang thuê bot

➤ Quản lý bot cụ thể:
• ${prefix}mybot detail [index] - Xem thông tin bot theo số thứ tự
• ${prefix}mybot info [index] - Xem thông tin cơ bản bot theo số thứ tự
• ${prefix}mybot active [index] - Kích hoạt bot theo số thứ tự
• ${prefix}mybot restart [index] - Khởi động lại bot theo số thứ tự
• ${prefix}mybot shutdown [index] - Tắt bot theo số thứ tự

➤ Phê duyệt/Từ chối bot:
• ${prefix}mybot addtime [index/ID] [thời hạn] - Tăng thời hạn dùng bot
• ${prefix}mybot subtime [index/ID] [thời hạn] - Giảm thời hạn dùng bot
• ${prefix}mybot approve [index/ID] [thời hạn] - Phê duyệt bot
   Ví dụ: ${prefix}mybot approve 1 24h
• ${prefix}mybot reject [index/ID] - Từ chối bot
• ${prefix}mybot delete [index/ID] - Xóa bot

➤ Quản lý hệ thống:
• ${prefix}mybot activeall - Khởi chạy tất cả bot
• ${prefix}mybot shutdownall - Tắt tất cả bot

📝 Lưu ý về thời hạn:
• Định dạng: số + đơn vị
• Đơn vị: s (giây), m (phút), h (giờ), d (ngày)
• Ví dụ: 30s, 15m, 24h, 7d, -1 (vô thời hạn)`;
        try {
          await sendMessageWarning(api, message, managerMessage, true);
        } catch (err) {
        
        }
        break;
      }
      default:
        try {
          const messageOptions = { msg: `❌ Lệnh "${subCommand}" không tồn tại!`, ttl: 120000 };
          if (message && typeof message === 'object' && message.messageID) {
            messageOptions.quote = message;
          }
          await api.sendMessage(messageOptions, threadId, type);
        } catch (err) {
        
        }
        break;
    }
  } catch (error) {
 
    try {
      const messageOptions = { 
        msg: `❌ Đã xảy ra lỗi khi xử lý lệnh mybot!\nChi tiết: ${error.message}`, 
        ttl: 120000 
      };
      if (message && typeof message === 'object' && message.messageID) {
        messageOptions.quote = message;
      }
      await api.sendMessage(messageOptions, threadId, type);
    } catch (err) {
    
    }
  }
}

async function getBotUidByIndex(index) {
  try {
    if (!fs.existsSync(myBotsPath)) return null;
    const myBots = JSON.parse(fs.readFileSync(myBotsPath, "utf8"));
    const botUids = Object.keys(myBots);
    return botUids[index - 1] || null;
  } catch (error) {

    return null;
  }
}

async function handleListBots(api, threadId, type, message) {
  let imagePath;
  try {
    if (!threadId) {
      return;
    }

    if (!fs.existsSync(myBotsPath)) {
      try {
        await sendMessageFailed(api, message, "❌ Chưa có bot nào được tạo!", true);
      } catch (err) {

      }
      return;
    }

    let myBots;
    try {
      myBots = JSON.parse(fs.readFileSync(myBotsPath, "utf8"));
    } catch (parseError) {
      await sendMessageFailed(api, message, `❌ Lỗi khi đọc file bot: ${parseError.message}`, true);
      return;
    }

    const botList = Object.values(myBots);
    if (botList.length === 0) {
      try {
        await sendMessageFailed(api, message, "❌ Danh sách bot trống!", true);
      } catch (err) {

      }
      return;
    }

    try {
      imagePath = await createBotListImage(botList, api);
      if (!fs.existsSync(imagePath)) {
        throw new Error("Tệp ảnh không được tạo");
      }
    } catch (imageError) {
      await sendMessageFailed(api, message, `❌ Không thể tạo ảnh danh sách bot: ${imageError.message}`, true);
      return;
    }

    try {
      const dataUpload = await api.uploadAttachment([imagePath], threadId, type);
      const imageUrl = dataUpload[0].fileUrl || dataUpload[0].normalUrl;
      if (!imageUrl) {
        throw new Error("Không lấy được URL ảnh từ API upload");
      }

      const ttl = 600000;
      const msg = `📋DANH SÁCH TẤT CẢ BOT📋`;
      await api.sendImage(imageUrl, message, msg, ttl);
    } catch (sendError) {
      
      await sendMessageFailed(api, message, `❌ Không thể gửi ảnh danh sách bot: ${sendError.message}`, true);
    }

  } catch (error) {

    await sendMessageFailed(api, message, `❌ Không thể lấy danh sách bot: ${error.message}`, true);
  } finally {
    if (imagePath && fs.existsSync(imagePath)) {
      try {
        fs.unlinkSync(imagePath);
      } catch (unlinkError) {
       
      }
    }
  }
}

async function handleAddTime(api, botUid, dName, duration, threadId, type, message) {
  try {
    if (!fs.existsSync(myBotsPath)) {
      try {
        const messageOptions = { msg: "❌ File mybots.json không tồn tại!", ttl: 120000 };
        if (message && typeof message === 'object' && message.messageID) {
          messageOptions.quote = message;
        }
        await api.sendMessage(messageOptions, threadId, type);
      } catch (err) {
      
      }
      return;
    }
    const myBots = JSON.parse(fs.readFileSync(myBotsPath, "utf8"));
    if (!myBots[botUid]) {
      try {
        const messageOptions = { msg: `❌ Không tìm thấy bot với ID ${botUid}!`, ttl: 120000 };
        if (message && typeof message === 'object' && message.messageID) {
          messageOptions.quote = message;
        }
        await api.sendMessage(messageOptions, threadId, type);
      } catch (err) {
      
      }
      return;
    }
    const durationMs = parseDuration(duration);
    if (durationMs === null) {
      try {
        const messageOptions = { 
          msg: `❌ Thời hạn không hợp lệ! Định dạng: số + đơn vị (s, m, h, d). Ví dụ: 30s, 15m, 24h, 7d`, 
          ttl: 120000 
        };
        if (message && typeof message === 'object' && message.messageID) {
          messageOptions.quote = message;
        }
        await api.sendMessage(messageOptions, threadId, type);
      } catch (err) {
      
      }
      return;
    }
    const currentExpiry = new Date(myBots[botUid].expiryAt);
    const newExpiry = duration === "-1" ? new Date(9999, 11, 31) : new Date(currentExpiry.getTime() + durationMs);
    myBots[botUid].expiryAt = newExpiry.toISOString();
    myBots[botUid].hsd = formatDateTime(new Date(newExpiry));
    myBots[botUid].lastUpdated = new Date().toISOString();
    fs.writeFileSync(myBotsPath, JSON.stringify(myBots, null, 2));
    const formattedExpiry = formatDateTime(new Date(newExpiry));
    try {
      const messageOptions = { 
        msg: `✅ Đã tăng thời hạn bot thành công!\n\n🤖 Bot ID: ${botUid}\n⏰ Thời hạn mới: ${formattedExpiry}\n👤 Cập nhật bởi: ${dName}`, 
        ttl: 120000 
      };
      if (message && typeof message === 'object' && message.messageID) {
        messageOptions.quote = message;
      }
      await api.sendMessage(messageOptions, threadId, type);
    } catch (err) {
    
    }

    if (new Date(newExpiry) > new Date() && myBots[botUid].status === "expired") {
      const modifiedMessage = {
        threadId: null,
        data: { uidFrom: botUid, dName: myBots[botUid].displayName || myBots[botUid].name },
        type: 1
      };
      await startBot(api, modifiedMessage, []);
      myBots[botUid].status = "running";
      fs.writeFileSync(myBotsPath, JSON.stringify(myBots, null, 2));

    }
  } catch (error) {

    try {
      const messageOptions = { 
        msg: `❌ Đã xảy ra lỗi khi tăng thời hạn bot!\nChi tiết: ${error.message}`, 
        ttl: 120000 
      };
      if (message && typeof message === 'object' && message.messageID) {
        messageOptions.quote = message;
      }
      await api.sendMessage(messageOptions, threadId, type);
    } catch (err) {
    
    }
  }
}

async function handleSubTime(api, botUid, dName, duration, threadId, type, message) {
  try {
    if (!fs.existsSync(myBotsPath)) {
      try {
        const messageOptions = { msg: "❌ File mybots.json không tồn tại!", ttl: 120000 };
        if (message && typeof message === 'object' && message.messageID) {
          messageOptions.quote = message;
        }
        await api.sendMessage(messageOptions, threadId, type);
      } catch (err) {
      
      }
      return;
    }
    const myBots = JSON.parse(fs.readFileSync(myBotsPath, "utf8"));
    if (!myBots[botUid]) {
      try {
        const messageOptions = { msg: `❌ Không tìm thấy bot với ID ${botUid}!`, ttl: 120000 };
        if (message && typeof message === 'object' && message.messageID) {
          messageOptions.quote = message;
        }
        await api.sendMessage(messageOptions, threadId, type);
      } catch (err) {
      
      }
      return;
    }
    const durationMs = parseDuration(duration);
    if (durationMs === null) {
      try {
        const messageOptions = { 
          msg: `❌ Thời hạn không hợp lệ! Định dạng: số + đơn vị (s, m, h, d). Ví dụ: 30s, 15m, 24h, 7d`, 
          ttl: 120000 
        };
        if (message && typeof message === 'object' && message.messageID) {
          messageOptions.quote = message;
        }
        await api.sendMessage(messageOptions, threadId, type);
      } catch (err) {
      
      }
      return;
    }
    const currentExpiry = new Date(myBots[botUid].expiryAt);
    const newExpiry = new Date(currentExpiry.getTime() - durationMs);
    if (newExpiry < new Date()) {
      try {
        const messageOptions = { 
          msg: `❌ Không thể giảm thời hạn! Thời hạn mới sẽ nhỏ hơn thời gian hiện tại.`, 
          ttl: 120000 
        };
        if (message && typeof message === 'object' && message.messageID) {
          messageOptions.quote = message;
        }
        await api.sendMessage(messageOptions, threadId, type);
      } catch (err) {
      
      }
      return;
    }
    myBots[botUid].expiryAt = newExpiry.toISOString();
    myBots[botUid].hsd = formatDateTime(new Date(newExpiry));
    myBots[botUid].lastUpdated = new Date().toISOString();
    fs.writeFileSync(myBotsPath, JSON.stringify(myBots, null, 2));
    const formattedExpiry = formatDateTime(new Date(newExpiry));
    try {
      const messageOptions = { 
        msg: `✅ Đã giảm thời hạn bot thành công!\n\n🤖 Bot ID: ${botUid}\n⏰ Thời hạn mới: ${formattedExpiry}\n👤 Cập nhật bởi: ${dName}`, 
        ttl: 120000 
      };
      if (message && typeof message === 'object' && message.messageID) {
        messageOptions.quote = message;
      }
      await api.sendMessage(messageOptions, threadId, type);
    } catch (err) {
    
    }

  } catch (error) {

    try {
      const messageOptions = { 
        msg: `❌ Đã xảy ra lỗi khi giảm thời hạn bot!\nChi tiết: ${error.message}`, 
        ttl: 120000 
      };
      if (message && typeof message === 'object' && message.messageID) {
        messageOptions.quote = message;
      }
      await api.sendMessage(messageOptions, threadId, type);
    } catch (err) {
    
    }
  }
}

async function handleApprove(api, botUid, dName, duration, threadId, type, message) {
  try {
    if (!fs.existsSync(myBotsPath)) {
      await sendMessageResultRequest(
        api,
        type || MessageType.GroupMessage,
        threadId,
        "❌ File mybots.json không tồn tại!",
        false,
        120000
      );
      return;
    }

    const myBots = JSON.parse(fs.readFileSync(myBotsPath, "utf8"));
    if (!myBots[botUid]) {
      await sendMessageResultRequest(
        api,
        type || MessageType.GroupMessage,
        threadId,
        `❌ Không tìm thấy bot với ID ${botUid}!`,
        false,
        120000
      );
      return;
    }

    const durationMs = parseDuration(duration);
    if (durationMs === null) {
      await sendMessageResultRequest(
        api,
        type || MessageType.GroupMessage,
        threadId,
        `❌ Thời hạn không hợp lệ! Định dạng: số + đơn vị (s, m, h, d). Ví dụ: 30s, 15m, 24h, 7d, -1 (vô thời hạn)`,
        false,
        120000
      );
      return;
    }

    let newExpiry;
    if (duration === "-1") {
      newExpiry = new Date(9999, 11, 31).toISOString();
    } else {
      newExpiry = new Date(Date.now() + durationMs).toISOString();
    }

    myBots[botUid].status = "running";
    myBots[botUid].expiryAt = newExpiry;
    myBots[botUid].hsd = formatDateTime(new Date(newExpiry));
    myBots[botUid].lastUpdated = new Date().toISOString();
    myBots[botUid].approvedBy = dName;
    fs.writeFileSync(myBotsPath, JSON.stringify(myBots, null, 2));

    const modifiedMessage = {
      threadId: threadId,
      data: {
        uidFrom: botUid,
        dName: myBots[botUid].displayName || myBots[botUid].name || "Unknown"
      },
      type: MessageType.GroupMessage
    };

    try {
      await startBot(api, modifiedMessage, []);
    } catch (startBotError) {
      
      await sendMessageResultRequest(
        api,
        type || MessageType.GroupMessage,
        threadId,
        `❌ Lỗi khi khởi động bot: ${startBotError.message}`,
        false,
        120000
      );
      return;
    }
    try {
      await api.sendMessage(
        {
          msg: `📢 Bot của bạn đã được phê duyệt!\n\n⏰ Thời hạn: ${formatDateTime(new Date(newExpiry))}\n\n👤 Phê duyệt bởi: ${dName}\n\n  /-li  /-li  /-li`,
          ttl: 120000
        },
        botUid,
        MessageType.DirectMessage
      );
    } catch (err) {      
    }
    await sendMessageResultRequest(
      api,
      type || MessageType.GroupMessage,
      threadId,
      `✅ Đã phê duyệt bot thành công!\n\n🤖 Bot ID: ${botUid}\n⏰ Thời hạn: ${formatDateTime(new Date(newExpiry))}\n👤 Phê duyệt bởi: ${dName}`,
      true,
      120000
    );
  } catch (error) {
  
    await sendMessageResultRequest(
      api,
      type || MessageType.GroupMessage,
      threadId,
      `❌ Đã xảy ra lỗi khi phê duyệt bot!\nChi tiết: ${error.message}`,
      false,
      120000
    );
  }
}
async function handleReject(api, botUid, dName, threadId, type, message) {
  try {
    if (!fs.existsSync(myBotsPath)) {
      try {
        const messageOptions = { msg: "❌ File mybots.json không tồn tại!", ttl: 120000 };
        if (message && typeof message === 'object' && message.messageID) {
          messageOptions.quote = message;
        }
        await api.sendMessage(messageOptions, threadId, type);
      } catch (err) {
      
      }
      return;
    }
    const myBots = JSON.parse(fs.readFileSync(myBotsPath, "utf8"));
    if (!myBots[botUid]) {
      try {
        const messageOptions = { msg: `❌ Không tìm thấy bot với ID ${botUid}!`, ttl: 120000 };
        if (message && typeof message === 'object' && message.messageID) {
          messageOptions.quote = message;
        }
        await api.sendMessage(messageOptions, threadId, type);
      } catch (err) {
      
      }
      return;
    }
    myBots[botUid].status = "rejected";
    myBots[botUid].lastUpdated = new Date().toISOString();
    fs.writeFileSync(myBotsPath, JSON.stringify(myBots, null, 2));
    const modifiedMessage = {
      threadId: null,
      data: { uidFrom: botUid, dName: myBots[botUid].displayName || myBots[botUid].name },
      type: 1
    };
    await stopBot(api, modifiedMessage, []);
    try {
      const messageOptions = { 
        msg: `✅ Đã từ chối bot thành công!\n\n🤖 Bot ID: ${botUid}\n👤 Từ chối bởi: ${dName}`, 
        ttl: 120000 
      };
      if (message && typeof message === 'object' && message.messageID) {
        messageOptions.quote = message;
      }
      await api.sendMessage(messageOptions, threadId, type);
    } catch (err) {
    
    }
    try {
      await api.sendMessage({ 
        msg: `📢 Bot của bạn đã bị từ chối!\n\n👤 Từ chối bởi: ${dName}`, 
        ttl: 120000 
      }, botUid, 1);
    } catch (err) {

    }

  } catch (error) {

    try {
      const messageOptions = { 
        msg: `❌ Đã xảy ra lỗi khi từ chối bot!\nChi tiết: ${error.message}`, 
        ttl: 120000 
      };
      if (message && typeof message === 'object' && message.messageID) {
        messageOptions.quote = message;
      }
      await api.sendMessage(messageOptions, threadId, type);
    } catch (err) {
    
    }
  }
}

async function handleActiveAll(api, uidFrom, dName, threadId, type, message, groupAdmins) {
  try {
    if (!fs.existsSync(myBotsPath)) {
      try {
        await sendMessageFailed(api, message, "❌ File mybots.json không tồn tại!", true);
      } catch (err) {
      
      }
      return;
    }
    const myBots = JSON.parse(fs.readFileSync(myBotsPath, "utf8"));
    let successCount = 0;
    let failCount = 0;
    for (const [botUid, botInfo] of Object.entries(myBots)) {
      const modifiedMessage = {
        threadId: threadId,
        data: { uidFrom: botUid, dName: botInfo.displayName || botInfo.name },
        type: MessageType.GroupMessage
      };
      try {
        await startBot(api, modifiedMessage, groupAdmins);
        successCount++;
      } catch (error) {

        failCount++;
      }
    }
    try {
      await sendMessageComplete(
        api,
        message,
        `✅ Đã khởi chạy tất cả bot!\nThành công: ${successCount}\nThất bại: ${failCount}\n👤 Thực hiện bởi: ${dName}`,
        true
      );
    } catch (err) {
    
    }

  } catch (error) {

    try {
      await sendMessageFailed(
        api,
        message,
        `❌ Đã xảy ra lỗi khi khởi chạy tất cả bot!\nChi tiết: ${error.message}`,
        true
      );
    } catch (err) {
    
    }
  }
}

async function handleShutdownAll(api, uidFrom, dName, threadId, type, message, groupAdmins) {
  try {
    if (!fs.existsSync(myBotsPath)) {
      try {
        await sendMessageFailed(api, message, "❌ File mybots.json không tồn tại!", true);
      } catch (err) {
      
      }
      return;
    }
    const myBots = JSON.parse(fs.readFileSync(myBotsPath, "utf8"));
    let successCount = 0;
    let failCount = 0;
    for (const [botUid, botInfo] of Object.entries(myBots)) {
      const modifiedMessage = {
        threadId: threadId,
        data: { uidFrom: botUid, dName: botInfo.displayName || botInfo.name },
        type: MessageType.GroupMessage
      };
      try {
        await stopBot(api, modifiedMessage, groupAdmins);
        successCount++;
      } catch (error) {
       
        failCount++;
      }
    }
    try {
      await sendMessageComplete(
        api,
        message,
        `⏹️ Đã tắt tất cả bot!\nThành công: ${successCount}\nThất bại: ${failCount}\n👤 Thực hiện bởi: ${dName}`,
        true
      );
    } catch (err) {
    
    }
  
  } catch (error) {

    try {
      await sendMessageFailed(
        api,
        message,
        `❌ Đã xảy ra lỗi khi tắt tất cả bot!\nChi tiết: ${error.message}`,
        true
      );
    } catch (err) {
    
    }
  }
}
async function handleAddAdmin(api, uidFrom, dName, adminUid, threadId, type, message) {
  try {
    const checkResult = await checkBotExists(uidFrom);
    if (!checkResult.exists) {
      try {
        await sendMessageFailed(api, message, "❌ Bạn chưa có bot nào được tạo!", true);
      } catch (err) {
      
      }
      return;
    }
    if (!adminUid || adminUid.trim().length === 0) {
      try {
        await sendMessageFailed(api, message, "❌ UID admin không được để trống!", true);
      } catch (err) {
      
      }
      return;
    }
    if (!/^\d+$/.test(adminUid.trim())) {
      try {
        await sendMessageFailed(api, message, "❌ UID admin phải là một chuỗi số!", true);
      } catch (err) {
      
      }
      return;
    }
    const trimmedUid = adminUid.trim();
    if (!fs.existsSync(configsDir)) {
      fs.mkdirSync(configsDir, { recursive: true });
    }
    const adminFilePath = path.join(configsDir, `admins-${uidFrom}.json`);
    let adminList = [];
    if (fs.existsSync(adminFilePath)) {
      try {
        const adminData = fs.readFileSync(adminFilePath, "utf8");
        adminList = JSON.parse(adminData);
        if (!Array.isArray(adminList)) {
          adminList = [];
        }
      } catch (parseError) {
        adminList = [];
      }
    }
    if (adminList.includes(trimmedUid)) {
      try {
        await sendMessageFailed(api, message, `❌ UID ${trimmedUid} đã là admin của bot này rồi!`, true);
      } catch (err) {
      
      }
      return;
    }
    adminList.push(trimmedUid);
    fs.writeFileSync(adminFilePath, JSON.stringify(adminList, null, 2));
    try {
      await sendMessageComplete(api, message, `✅ Đã thêm UID: ${trimmedUid} vào danh sách admin bot của bạn\n🤖 Bot ID: ${uidFrom}\n👤 Thêm bởi: ${dName}\n\n📊 Tổng admin hiện tại: ${adminList.length}`, true);
    } catch (err) {
    
    }

  } catch (error) {
  
    try {
      await sendMessageFailed(api, message, `❌ Đã xảy ra lỗi khi thêm admin!\nChi tiết: ${error.message}`, true);
    } catch (err) {
    
    }
  }
}

async function handleRemoveAdmin(api, uidFrom, dName, adminUid, threadId, type, message) {
  try {
    const checkResult = await checkBotExists(uidFrom);
    if (!checkResult.exists) {
      try {
        await sendMessageFailed(api, message, "❌ Bạn chưa có bot nào được tạo!", true);
      } catch (err) {
      
      }
      return;
    }
    if (!adminUid || adminUid.trim().length === 0) {
      try {
        await sendMessageFailed(api, message, "❌ UID admin không được để trống!", true);
      } catch (err) {
      
      }
      return;
    }
    if (!/^\d+$/.test(adminUid.trim())) {
      try {
        await sendMessageFailed(api, message, "❌ UID admin phải là một chuỗi số!", true);
      } catch (err) {
      
      }
      return;
    }
    const trimmedUid = adminUid.trim();
    const adminFilePath = path.join(configsDir, `admins-${uidFrom}.json`);
    let adminList = [];
    if (fs.existsSync(adminFilePath)) {
      try {
        const adminData = fs.readFileSync(adminFilePath, "utf8");
        adminList = JSON.parse(adminData);
        if (!Array.isArray(adminList)) {
          adminList = [];
        }
      } catch (parseError) {
        adminList = [];
      }
    }
    if (!adminList.includes(trimmedUid)) {
      try {
        await sendMessageFailed(api, message, `❌ UID ${trimmedUid} không phải là admin của bot này!`, true);
      } catch (err) {
      
      }
      return;
    }
    adminList = adminList.filter(uid => uid !== trimmedUid);
    fs.writeFileSync(adminFilePath, JSON.stringify(adminList, null, 2));
    try {
      await sendMessageComplete(api, message, `✅ Đã xóa UID: ${trimmedUid} khỏi danh sách admin bot của bạn\n🤖 Bot ID: ${uidFrom}\n👤 Xóa bởi: ${dName}\n\n📊 Tổng admin hiện tại: ${adminList.length}`, true);
    } catch (err) {
    
    }

  } catch (error) {
   
    try {
      await sendMessageFailed(api, message, `❌ Đã xảy ra lỗi khi xóa admin!\nChi tiết: ${error.message}`, true);
    } catch (err) {
    
    }
  }
}

async function handleListAdmins(api, uidFrom, dName, threadId, type, message) {
  try {
    const checkResult = await checkBotExists(uidFrom);
    if (!checkResult.exists) {
      try {
        await sendMessageFailed(api, message, "❌ Bạn chưa có bot nào được tạo!", true);
      } catch (err) {

      }
      return;
    }
    const adminFilePath = path.join(configsDir, `admins-${uidFrom}.json`);
    let adminList = [];
    if (fs.existsSync(adminFilePath)) {
      try {
        const adminData = fs.readFileSync(adminFilePath, "utf8");
        adminList = JSON.parse(adminData);
        if (!Array.isArray(adminList)) {
          adminList = [];
        }
      } catch (parseError) {

        adminList = [];
      }
    }
    if (adminList.length === 0) {
      try {
        await sendMessageComplete(api, message, `📋 Danh sách admin bot của bạn trống!\n🤖 Bot ID: ${uidFrom}`, true);
      } catch (err) {

      }
      return;
    }
    let listMessage = `📋 DANH SÁCH ADMIN BOT (${adminList.length} admin)\n\n`;
    adminList.forEach((uid, index) => {
      listMessage += `${index + 1}. 🆔 UID: ${uid}\n`;
    });
    listMessage += `\n🤖 Bot ID: ${uidFrom}\n👤 Yêu cầu bởi: ${dName}`;
    try {
      await sendMessageComplete(api, message, listMessage, true);
    } catch (err) {

    }
  } catch (error) {
 
    try {
      await sendMessageFailed(api, message, `❌ Không thể lấy danh sách admin!\nChi tiết: ${error.message}`, true);
    } catch (err) {

    }
  }
}

async function handleNotify(api, uidFrom, dName, content, threadId, type, message) {
  try {
    if (!fs.existsSync(myBotsPath)) {
      try {
        const messageOptions = { 
          msg: "❌ File mybots.json không tồn tại!", 
          ttl: 120000 
        };
        if (message && typeof message === 'object' && message.messageID) {
          messageOptions.quote = message;
        }
        await api.sendMessage(messageOptions, threadId, type);
      } catch (err) {

      }
      return;
    }

    const myBots = JSON.parse(fs.readFileSync(myBotsPath, "utf8"));
    let sentUids = new Set();
    let successCount = 0;
    let failCount = 0;

    for (const [botUid, botInfo] of Object.entries(myBots)) {
      if (!/^\d+$/.test(botUid)) {
 
        failCount++;
        continue;
      }

      if (!sentUids.has(botUid)) {
        try {
          await api.sendMessage(
            {
              msg: `📢 Thông báo từ hệ thống:\n${content}\n\n👤 Gửi bởi: ${dName}`,
              ttl: 120000,
            },
            botUid,
            MessageType.DirectMessage
          );
          sentUids.add(botUid);
          successCount++;

        } catch (err) {
   
          failCount++;
        }
      }

      const adminFilePath = path.join(configsDir, `admins-${botUid}.json`);
      if (fs.existsSync(adminFilePath)) {
        let adminList = [];
        try {
          const adminData = fs.readFileSync(adminFilePath, "utf8");
          adminList = JSON.parse(adminData);
          if (!Array.isArray(adminList)) {
            adminList = [];
          }
        } catch (parseError) {
  
          adminList = [];
        }

        for (const adminUid of adminList) {
          if (adminUid !== botUid && !sentUids.has(adminUid)) {
            if (!/^\d+$/.test(adminUid)) {

              failCount++;
              continue;
            }

            try {
              await api.sendMessage(
                {
                  msg: `📢 Thông báo từ hệ thống (dành cho admin bot ${botUid}):\n${content}\n\n👤 Gửi bởi: ${dName}`,
                  ttl: 120000,
                },
                adminUid,
                MessageType.DirectMessage
              );
              sentUids.add(adminUid);
              successCount++;

            } catch (err) {
        
              failCount++;
            }
          }
        }
      }
    }

    try {
      const messageOptions = {
        msg: `✅ Đã gửi thông báo đến ${successCount} người dùng!!!\n\nNội dung: ${content}\n👤 Gửi bởi: ${dName}`,
        ttl: 120000,
      };
      if (message && typeof message === 'object' && message.messageID) {
        messageOptions.quote = message;
      }
      await api.sendMessage(messageOptions, threadId, type);
    } catch (err) {
    
    }

  } catch (error) {

    try {
      const messageOptions = {
        msg: `❌ Đã xảy ra lỗi khi gửi thông báo!\nChi tiết: ${error.message}`,
        ttl: 120000,
      };
      if (message && typeof message === 'object' && message.messageID) {
        messageOptions.quote = message;
      }
      await api.sendMessage(messageOptions, threadId, type);
    } catch (err) {
    
    }
  }
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

async function updateBotField(uidFrom, field, value) {
  try {
    if (!fs.existsSync(myBotsPath)) {
      throw new Error("File mybots.json không tồn tại");
    }
    const myBots = JSON.parse(fs.readFileSync(myBotsPath, "utf8"));
    if (!myBots[uidFrom]) {
      throw new Error("Bot không tồn tại trong danh sách");
    }
    myBots[uidFrom][field] = value;
    myBots[uidFrom].lastUpdated = new Date().toISOString();
    myBots[uidFrom].hsd = formatDateTime(new Date(myBots[uidFrom].expiryAt));
    fs.writeFileSync(myBotsPath, JSON.stringify(myBots, null, 2));

    return true;
  } catch (error) {

    return false;
  }
}
async function handleLoadBots(api, uidFrom, dName, threadId, type, message) {
  try {
    if (!fs.existsSync(myBotsPath)) {
      try {
        const messageOptions = { 
          msg: "❌ File mybots.json không tồn tại!", 
          ttl: 120000 
        };
        if (message && typeof message === 'object' && message.messageID) {
          messageOptions.quote = message;
        }
        await api.sendMessage(messageOptions, threadId, type);
      } catch (err) {
      
      }
      return;
    }

    let myBots;
    try {
      myBots = JSON.parse(fs.readFileSync(myBotsPath, "utf8"));
    } catch (parseError) {

      try {
        const messageOptions = { 
          msg: `❌ Lỗi khi phân tích file mybots.json!\nChi tiết: ${parseError.message}`, 
          ttl: 120000 
        };
        if (message && typeof message === 'object' && message.messageID) {
          messageOptions.quote = message;
        }
        await api.sendMessage(messageOptions, threadId, type);
      } catch (err) {
      
      }
      return;
    }

    const botCount = Object.keys(myBots).length;
    if (botCount === 0) {
      try {
        const messageOptions = { 
          msg: "❌ Danh sách bot trống!", 
          ttl: 120000 
        };
        if (message && typeof message === 'object' && message.messageID) {
          messageOptions.quote = message;
        }
        await api.sendMessage(messageOptions, threadId, type);
      } catch (err) {
      
      }
      return;
    }

    fs.writeFileSync(myBotsPath, JSON.stringify(myBots, null, 2));

    try {
      const messageOptions = { 
        msg: `✅ Đã tải lại dữ liệu bot thành công!\n📊 Số lượng bot: ${botCount}\n👤 Thực hiện bởi: ${dName}`, 
        ttl: 120000 
      };
      if (message && typeof message === 'object' && message.messageID) {
        messageOptions.quote = message;
      }
      await api.sendMessage(messageOptions, threadId, type);
    } catch (err) {

    }
 
  } catch (error) {
  
    try {
      const messageOptions = { 
        msg: `❌ Đã xảy ra lỗi khi tải lại dữ liệu bot!\nChi tiết: ${error.message}`, 
        ttl: 120000 
      };
      if (message && typeof message === 'object' && message.messageID) {
        messageOptions.quote = message;
      }
      await api.sendMessage(messageOptions, threadId, type);
    } catch (err) {

    }
  }
}
async function handleUpdateName(api, uidFrom, dName, newName, threadId, type, message) {
  try {
    if (!newName || newName.trim().length === 0) {
      try {
        await sendMessageFailed(
          api,
          message,
          "Tên bot không được để trống!",
          true
        );
      } catch (err) {
       
      }
      return;
    }
    const success = await updateBotField(uidFrom, "displayName", newName.trim());
    if (success) {
      try {
        await sendMessageComplete(
          api,
          message,
          `Đã cập nhật tên bot thành: ${newName.trim()}\n🤖 Bot ID: ${uidFrom}\n👤 Cập nhật bởi: ${dName}`,
          true
        );
      } catch (err) {
       
      }
    } else {
      try {
        await sendMessageFailed(
          api,
          message,
          "Không thể cập nhật tên bot!",
          true
        );
      } catch (err) {
        
      }
    }
  } catch (error) {
    
    try {
      await sendMessageFailed(
        api,
        message,
        `Đã xảy ra lỗi khi cập nhật tên bot!\nChi tiết: ${error.message}`,
        true
      );
    } catch (err) {
    
    }
  }
}

async function handleUpdateDescription(api, uidFrom, dName, description, threadId, type, message) {
  try {
    if (!description || description.trim().length === 0) {
      try {
        await sendMessageFailed(
          api,
          message,
          "Mô tả không được để trống!",
          true
        );
      } catch (err) {
      
      }
      return;
    }
    const success = await updateBotField(uidFrom, "description", description.trim());
    if (success) {
      try {
        await sendMessageComplete(
          api,
          message,
          `Đã cập nhật mô tả bot: ${description.trim()}\n🤖 Bot ID: ${uidFrom}\n👤 Cập nhật bởi: ${dName}`,
          true
        );
      } catch (err) {
      
      }
    } else {
      try {
        await sendMessageFailed(
          api,
          message,
          "Không thể cập nhật mô tả bot!",
          true
        );
      } catch (err) {
      
      }
    }
  } catch (error) {
   
    try {
      await sendMessageFailed(
        api,
        message,
        `Đã xảy ra lỗi khi cập nhật mô tả bot!\nChi tiết: ${error.message}`,
        true
      );
    } catch (err) {
    
    }
  }
}

async function handleUpdateNameServer(api, uidFrom, dName, nameServer, threadId, type, message) {
  try {
    if (!nameServer || nameServer.trim().length === 0) {
      try {
        await sendMessageFailed(
          api,
          message,
          "Tên server không được để trống!",
          true
        );
      } catch (err) {
      
      }
      return;
    }
    const databaseFile = path.join(myBotDir, "json-data", `database_config-${uidFrom}.json`);
    if (!fs.existsSync(databaseFile)) {
      try {
        await sendMessageFailed(
          api,
          message,
          "Không tìm thấy file cấu hình database!",
          true
        );
      } catch (err) {
      
      }
      return;
    }
    const dbConfig = JSON.parse(fs.readFileSync(databaseFile, "utf8"));
    dbConfig.nameServer = nameServer.trim();
    fs.writeFileSync(databaseFile, JSON.stringify(dbConfig, null, 2));
    try {
      await sendMessageComplete(
        api,
        message,
        `Đã cập nhật tên server thành: ${nameServer.trim()}\n🤖 Bot ID: ${uidFrom}\n👤 Cập nhật bởi: ${dName}`,
        true
      );
    } catch (err) {
    
    }

  } catch (error) {

    try {
      await sendMessageFailed(
        api,
        message,
        `Đã xảy ra lỗi khi cập nhật tên server!\nChi tiết: ${error.message}`,
        true
      );
    } catch (err) {
    
    }
  }
}

function parseDuration(duration) {
  if (duration === "-1") return -1;
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) return null;
  const value = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000
  };
  return value * multipliers[unit];
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
