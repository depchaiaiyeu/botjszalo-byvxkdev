import { writeGroupSettings } from "../../utils/io-json.js";
import { sendMessageComplete, sendMessageInsufficientAuthority, sendMessageQuery, sendMessageWarning } from "../../service-hahuyhoang/chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service-hahuyhoang/service.js";
import { removeMention } from "../../utils/format-util.js";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import path from "path";
import { createAdminListImage } from "../../utils/canvas/info.js";
import { getUserInfoData } from "../../service-hahuyhoang/info-service/user-info.js";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const userAgents = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
];

const paths = {
  adminFilePath: path.resolve("./mybot/data/list_admin.json"),
  groupSettingsPath: path.resolve("./assets/data/group_settings.json"),
  configFilePath: path.resolve("./mybot/config.json"),
  commandFilePath: path.resolve("./assets/json-data/command.json"),
  logDir: path.resolve("./logs"),
  resourceDir: path.resolve("./resources"),
  tempDir: path.resolve("./temp"),
  dataGifPath: path.resolve("./assets/gif"),
  DATA_GAME_FILE_PATH: path.resolve("./assets/data/game.json"),
  WEB_CONFIG_PATH: path.resolve("./mybot/json-data/web-config.json"),
  MANAGER_FILE_PATH: path.resolve("./mybot/json-data/manager-bot.json"),
  PROPHYLACTIC_CONFIG_PATH: path.resolve("./mybot/json-data/prophylactic.json"),
  myBotDataDir: path.resolve("./mybot")
};

function getRandomUserAgent() {
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

function parseTimeToMs(timeStr) {
  const match = timeStr.match(/^(-?\d+)([hpmd])$/);
  if (!match) return null;
  
  const value = parseInt(match[1]);
  const unit = match[2];
  
  if (value === -1) return -1;
  
  const multipliers = {
    'h': 3600000,
    'p': 60000,
    'm': 60000,
    'd': 86400000
  };
  
  return value * (multipliers[unit] || 0);
}

async function ensureDirectories() {
  const dirs = [
    path.resolve("./mybot/data"),
    path.resolve("./mybot/json-data"),
    path.resolve("./temp")
  ];
  
  for (const dir of dirs) {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      console.error(`Lỗi tạo thư mục ${dir}:`, error);
    }
  }
}

async function getBotDataPath(botId) {
  return path.resolve(paths.myBotDataDir, `${botId}.json`);
}

async function getBotConfig(botId) {
  const botPath = await getBotDataPath(botId);
  try {
    const data = await fs.readFile(botPath, "utf-8");
    return JSON.parse(data);
  } catch {
    return null;
  }
}

async function saveBotConfig(botId, config) {
  const botPath = await getBotDataPath(botId);
  await fs.writeFile(botPath, JSON.stringify(config, null, 4));
}

async function initializeBotFiles(botId, imei, cookie) {
  await ensureDirectories();
  
  const botConfig = {
    cookie: cookie,
    imei: imei,
    userAgent: getRandomUserAgent(),
    createdAt: new Date().toISOString(),
    expiresAt: Date.now() + 3600000,
    isRunning: true,
    processId: `mybot-${botId}`
  };
  
  const adminList = [botId];
  
  await saveBotConfig(botId, botConfig);
  
  try {
    await fs.readFile(paths.adminFilePath, "utf-8");
  } catch {
    await fs.writeFile(paths.adminFilePath, JSON.stringify(adminList, null, 4));
  }
  
  const defaultFiles = [
    { path: paths.configFilePath, data: {} },
    { path: paths.WEB_CONFIG_PATH, data: {} },
    { path: paths.MANAGER_FILE_PATH, data: {} },
    { path: paths.PROPHYLACTIC_CONFIG_PATH, data: {} }
  ];
  
  for (const file of defaultFiles) {
    try {
      await fs.readFile(file.path, "utf-8");
    } catch {
      await fs.writeFile(file.path, JSON.stringify(file.data, null, 4));
    }
  }
}

async function handleMyBotCreate(api, message) {
  const mentions = message.data.mentions;
  const content = removeMention(message);
  
  if (!mentions || mentions.length === 0) {
    await sendMessageQuery(api, message, "Vui lòng @mention người dùng để tạo bot cho họ");
    return;
  }
  
  const parts = content.split(/\s+/).filter(p => p.trim());
  
  if (parts.length < 4) {
    await sendMessageQuery(api, message, "Cú pháp: mybot create @mention cookie imei");
    return;
  }
  
  const mention = mentions[0];
  const botId = mention.uid;
  const botName = message.data.content.substring(mention.pos, mention.pos + mention.len).replace("@", "");
  
  const cookie = parts[2];
  const imei = parts[3];
  
  try {
    const processName = `mybot-${botId}`;
    const indexPath = path.resolve("src/index.js");
    
    try {
      await execAsync(`pm2 delete ${processName}`);
    } catch {}
    
    await initializeBotFiles(botId, imei, cookie);
    
    await execAsync(`pm2 start ${indexPath} --name "${processName}" -- ${botId}`);
    
    await sendMessageComplete(api, message, `✅ Đã tạo bot cho ${botName} thành công!\nBotID: ${botId}\n🚀 Bot đã khởi chạy với thời gian mặc định: 1h`);
  } catch (error) {
    await sendMessageWarning(api, message, `❌ Lỗi khi tạo bot: ${error.message}`);
  }
}

async function handleMyBotAddTime(api, message) {
  const mentions = message.data.mentions;
  const content = removeMention(message);
  const parts = content.split(/\s+/).filter(p => p.trim());
  
  if (parts.length < 3) {
    await sendMessageQuery(api, message, "Cú pháp: mybot addtime @mention/index thời_gian\nVí dụ: mybot addtime @mention 1h hoặc mybot addtime 1 30p");
    return;
  }
  
  let botId = null;
  let botName = "Bot";
  
  if (mentions && mentions.length > 0) {
    botId = mentions[0].uid;
    botName = message.data.content.substring(mentions[0].pos, mentions[0].pos + mentions[0].len).replace("@", "");
  } else {
    const botList = await listAllBots();
    const index = parseInt(parts[1]) - 1;
    if (index >= 0 && index < botList.length) {
      botId = botList[index].uid;
      botName = botList[index].name;
    } else {
      await sendMessageWarning(api, message, "Chỉ số bot không hợp lệ");
      return;
    }
  }
  
  const timeStr = parts[parts.length - 1];
  const timeMs = parseTimeToMs(timeStr);
  
  if (timeMs === null) {
    await sendMessageWarning(api, message, "Định dạng thời gian không hợp lệ. Sử dụng: 1h, 30p, 1d, -1 (vô hạn)");
    return;
  }
  
  try {
    const botConfig = await getBotConfig(botId);
    if (!botConfig) {
      await sendMessageWarning(api, message, `Bot của ${botName} không tồn tại`);
      return;
    }
    
    if (timeMs === -1) {
      botConfig.expiresAt = -1;
    } else {
      botConfig.expiresAt = Date.now() + timeMs;
    }
    
    await saveBotConfig(botId, botConfig);
    await sendMessageComplete(api, message, `✅ Đã gia hạn thời gian cho bot ${botName}: ${timeStr}`);
  } catch (error) {
    await sendMessageWarning(api, message, `❌ Lỗi: ${error.message}`);
  }
}

async function handleMyBotShutdown(api, message) {
  const mentions = message.data.mentions;
  const content = removeMention(message);
  const parts = content.split(/\s+/).filter(p => p.trim());
  
  let botId = null;
  let botName = "Bot";
  
  if (mentions && mentions.length > 0) {
    botId = mentions[0].uid;
    botName = message.data.content.substring(mentions[0].pos, mentions[0].pos + mentions[0].len).replace("@", "");
  } else if (parts.length >= 2) {
    const botList = await listAllBots();
    const index = parseInt(parts[1]) - 1;
    if (index >= 0 && index < botList.length) {
      botId = botList[index].uid;
      botName = botList[index].name;
    } else {
      await sendMessageWarning(api, message, "Chỉ số bot không hợp lệ");
      return;
    }
  } else {
    await sendMessageQuery(api, message, "Cú pháp: mybot shutdown @mention hoặc mybot shutdown index");
    return;
  }
  
  try {
    const botConfig = await getBotConfig(botId);
    if (!botConfig) {
      await sendMessageWarning(api, message, `Bot của ${botName} không tồn tại`);
      return;
    }
    
    botConfig.isRunning = false;
    
    if (botConfig.processId) {
      try {
        await execAsync(`pm2 delete ${botConfig.processId}`);
      } catch {}
    }
    
    await saveBotConfig(botId, botConfig);
    await sendMessageComplete(api, message, `⏸️ Đã dừng bot ${botName}`);
  } catch (error) {
    await sendMessageWarning(api, message, `❌ Lỗi: ${error.message}`);
  }
}

async function handleMyBotRestart(api, message) {
  const mentions = message.data.mentions;
  const content = removeMention(message);
  const parts = content.split(/\s+/).filter(p => p.trim());
  
  let botId = null;
  let botName = "Bot";
  
  if (mentions && mentions.length > 0) {
    botId = mentions[0].uid;
    botName = message.data.content.substring(mentions[0].pos, mentions[0].pos + mentions[0].len).replace("@", "");
  } else if (parts.length >= 2) {
    const botList = await listAllBots();
    const index = parseInt(parts[1]) - 1;
    if (index >= 0 && index < botList.length) {
      botId = botList[index].uid;
      botName = botList[index].name;
    } else {
      await sendMessageWarning(api, message, "Chỉ số bot không hợp lệ");
      return;
    }
  }
  
  try {
    const botConfig = await getBotConfig(botId);
    if (!botConfig) {
      await sendMessageWarning(api, message, `Bot của ${botName} không tồn tại`);
      return;
    }
    
    if (botConfig.processId) {
      try {
        await execAsync(`pm2 restart ${botConfig.processId}`);
      } catch {}
    }
    
    botConfig.isRunning = true;
    await saveBotConfig(botId, botConfig);
    await sendMessageComplete(api, message, `🔄 Đã khởi động lại bot ${botName}`);
  } catch (error) {
    await sendMessageWarning(api, message, `❌ Lỗi: ${error.message}`);
  }
}

async function handleMyBotRemove(api, message) {
  const mentions = message.data.mentions;
  const content = removeMention(message);
  const parts = content.split(/\s+/).filter(p => p.trim());
  
  let botId = null;
  let botName = "Bot";
  
  if (mentions && mentions.length > 0) {
    botId = mentions[0].uid;
    botName = message.data.content.substring(mentions[0].pos, mentions[0].pos + mentions[0].len).replace("@", "");
  } else if (parts.length >= 2) {
    const botList = await listAllBots();
    const index = parseInt(parts[1]) - 1;
    if (index >= 0 && index < botList.length) {
      botId = botList[index].uid;
      botName = botList[index].name;
    } else {
      await sendMessageWarning(api, message, "Chỉ số bot không hợp lệ");
      return;
    }
  }
  
  try {
    const botPath = await getBotDataPath(botId);
    await fs.unlink(botPath);
    await sendMessageComplete(api, message, `🗑️ Đã xóa toàn bộ dữ liệu bot ${botName}`);
  } catch (error) {
    await sendMessageWarning(api, message, `❌ Lỗi: ${error.message}`);
  }
}

async function listAllBots() {
  try {
    const files = await fs.readdir(paths.myBotDataDir);
    const bots = [];
    
    for (const file of files) {
      if (file.endsWith(".json") && file !== "config.json") {
        const botId = file.replace(".json", "");
        const botConfig = await getBotConfig(botId);
        
        if (botConfig) {
          const userInfo = await getUserInfoData(null, botId);
          bots.push({
            uid: botId,
            name: userInfo?.name || "Unknown",
            config: botConfig
          });
        }
      }
    }
    
    return bots;
  } catch {
    return [];
  }
}

async function handleMyBotInfo(api, message) {
  const mentions = message.data.mentions;
  const content = removeMention(message);
  const parts = content.split(/\s+/).filter(p => p.trim());
  
  let botId = null;
  let botName = "Bot";
  
  if (mentions && mentions.length > 0) {
    botId = mentions[0].uid;
    botName = message.data.content.substring(mentions[0].pos, mentions[0].pos + mentions[0].len).replace("@", "");
  } else if (parts.length >= 2) {
    const botList = await listAllBots();
    const index = parseInt(parts[1]) - 1;
    if (index >= 0 && index < botList.length) {
      botId = botList[index].uid;
      botName = botList[index].name;
      botConfig = botList[index].config;
    } else {
      await sendMessageWarning(api, message, "Chỉ số bot không hợp lệ");
      return;
    }
  }
  
  try {
    const botConfig = await getBotConfig(botId);
    if (!botConfig) {
      await sendMessageWarning(api, message, `Bot của ${botName} không tồn tại`);
      return;
    }
    
    const createdTime = new Date(botConfig.createdAt).toLocaleString("vi-VN");
    let expireInfo = "🎯 Thời gian còn lại: Vô hạn ♾️";
    
    if (botConfig.expiresAt !== -1) {
      const remaining = botConfig.expiresAt - Date.now();
      if (remaining > 0) {
        const days = Math.floor(remaining / 86400000);
        const hours = Math.floor((remaining % 86400000) / 3600000);
        const mins = Math.floor((remaining % 3600000) / 60000);
        expireInfo = `🎯 Thời gian còn lại: ${days}d ${hours}h ${mins}p`;
      } else {
        expireInfo = `⚠️ Hết hạn`;
      }
    }
    
    const status = botConfig.isRunning ? "✅ Đang chạy" : "❌ Dừng";
    
    const info = `📜 Thông tin BOT Từ dữ liệu VXK Bot Team:\n\n1. ${botName}\n📊 Trạng thái: ${status}\n${expireInfo}\n🌟 Tạo lúc: ${createdTime}`;
    
    await sendMessageComplete(api, message, info);
  } catch (error) {
    await sendMessageWarning(api, message, `❌ Lỗi: ${error.message}`);
  }
}

async function handleMyBotList(api, message) {
  try {
    const bots = await listAllBots();
    
    if (bots.length === 0) {
      await sendMessageQuery(api, message, "Chưa có bot nào trong hệ thống");
      return;
    }
    
    let listInfo = "📜 DANH SÁCH BOT VXK Bot Team:\n\n";
    
    for (let i = 0; i < bots.length; i++) {
      const bot = bots[i];
      const status = bot.config.isRunning ? "✅" : "❌";
      
      let expireInfo = "♾️ Vô hạn";
      if (bot.config.expiresAt !== -1) {
        const remaining = bot.config.expiresAt - Date.now();
        if (remaining > 0) {
          const days = Math.floor(remaining / 86400000);
          expireInfo = `${days}d`;
        } else {
          expireInfo = "⚠️ Hết hạn";
        }
      }
      
      const createdTime = new Date(bot.config.createdAt).toLocaleDateString("vi-VN");
      listInfo += `${i + 1}. ${bot.name}\n   ${status} | ⏱️ ${expireInfo} | 📅 ${createdTime}\n\n`;
    }
    
    await sendMessageComplete(api, message, listInfo);
  } catch (error) {
    await sendMessageWarning(api, message, `❌ Lỗi: ${error.message}`);
  }
}

function getHelpMessage() {
  const prefix = getGlobalPrefix();
  return `《 🤖 HỆ THỐNG QUẢN LÝ BOT VXK 🤖 》

➤ 🆕 Tạo/Sửa Bot:
『${prefix}mybot create』
• 📝 Cú pháp: ${prefix}mybot create @mention cookie imei
• ⚙️ Chức năng: Đăng ký/sửa đổi thông tin vào hệ thống VXK Bot Team
• ⚠️ Lưu ý: 
   - Không cần nhập dấu []
   - Chỉ hoạt động trong tin nhắn riêng

➤ ⏱️ Gia hạn Thời gian:
『${prefix}mybot addtime』
• 📝 Cú pháp: ${prefix}mybot addtime @mention/index thời_gian
• 💡 Ví dụ: ${prefix}mybot addtime @mention 1h
• 📋 Đơn vị: h (giờ), p/m (phút), d (ngày), -1 (vô hạn)

➤ 🛑 Dừng Bot:
『${prefix}mybot shutdown』
• 📝 Cú pháp: ${prefix}mybot shutdown @mention/index

➤ 📋 Thông tin Bot:
『${prefix}mybot info』
• 📝 Cú pháp: ${prefix}mybot info @mention/index

➤ 📊 Danh sách Bot:
『${prefix}mybot list』
• 📝 Hiển thị tất cả bot trong hệ thống

➤ 🔄 Khởi động lại:
『${prefix}mybot restart』
• 📝 Cú pháp: ${prefix}mybot restart @mention/index

➤ 🗑️ Xóa Bot:
『${prefix}mybot remove』
• 📝 Cú pháp: ${prefix}mybot remove @mention/index

🚨🚨🚨`;
}

export async function handleMyBotCommands(api, message) {
  const prefix = getGlobalPrefix();
  const content = removeMention(message);
  
  if (!content.includes(`${prefix}mybot`)) {
    return false;
  }
  
  const parts = content.split(/\s+/).filter(p => p.trim());
  if (parts.length < 2) return false;
  
  const command = parts[1];
  
  switch (command) {
    case "create":
      await handleMyBotCreate(api, message);
      return true;
    case "addtime":
      await handleMyBotAddTime(api, message);
      return true;
    case "shutdown":
      await handleMyBotShutdown(api, message);
      return true;
    case "info":
      await handleMyBotInfo(api, message);
      return true;
    case "list":
      await handleMyBotList(api, message);
      return true;
    case "restart":
      await handleMyBotRestart(api, message);
      return true;
    case "remove":
      await handleMyBotRemove(api, message);
      return true;
    case "help":
      const helpMsg = getHelpMessage();
      await sendMessageComplete(api, message, helpMsg);
      return true;
    default:
      return false;
  }
}
