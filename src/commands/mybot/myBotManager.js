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
  myBotDataDir: path.resolve("./mybot"),
  myBotDataFolder: path.resolve("./mybot/data"),
  myBotJsonDataFolder: path.resolve("./mybot/json-data")
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
    paths.myBotDataDir,
    paths.myBotDataFolder,
    paths.myBotJsonDataFolder
  ];
  
  for (const dir of dirs) {
    try {
      await fs.mkdir(dir, { recursive: true });
      console.log(`[MyBot] ✅ Đảm bảo thư mục: ${dir}`);
    } catch (error) {
      console.error(`[MyBot] ❌ Lỗi tạo thư mục ${dir}:`, error);
    }
  }
}

async function getBotDataPath(botId) {
  return path.resolve("./mybot", `${botId}.json`);
}

async function getBotConfig(botId) {
  const botPath = await getBotDataPath(botId);
  try {
    const data = await fs.readFile(botPath, "utf-8");
    const config = JSON.parse(data);
    console.log(`[MyBot] ✅ Đọc config bot ${botId} thành công`);
    return config;
  } catch (error) {
    console.log(`[MyBot] ⚠️ Không thể đọc config bot ${botId}:`, error.message);
    return null;
  }
}

async function saveBotConfig(botId, config) {
  const botPath = await getBotDataPath(botId);
  try {
    await fs.writeFile(botPath, JSON.stringify(config, null, 4));
    console.log(`[MyBot] ✅ Lưu config bot ${botId} tại: ${botPath}`);
    console.log(`[MyBot] 📝 Nội dung: ${JSON.stringify(config, null, 2)}`);
  } catch (error) {
    console.error(`[MyBot] ❌ Lỗi lưu config ${botId}:`, error);
    throw error;
  }
}

// Tạo file group_settings.json cho bot con
async function createGroupSettingsFile(botId) {
  const filePath = path.resolve(paths.myBotDataFolder, `group_settings_${botId}.json`);
  try {
    const defaultSettings = {};
    await fs.writeFile(filePath, JSON.stringify(defaultSettings, null, 2));
    console.log(`[MyBot] ✅ Tạo file group settings: ${filePath}`);
  } catch (error) {
    console.error(`[MyBot] ❌ Lỗi tạo file group settings:`, error);
  }
}

// Tạo file list_admin.json cho bot con
async function createAdminListFile(botId, adminId = null) {
  const filePath = path.resolve(paths.myBotDataFolder, `list_admin_${botId}.json`);
  try {
    const defaultAdmins = adminId ? [adminId.toString()] : [];
    await fs.writeFile(filePath, JSON.stringify(defaultAdmins, null, 2));
    console.log(`[MyBot] ✅ Tạo file admin list: ${filePath}`);
    if (adminId) console.log(`[MyBot] 👤 Thêm admin: ${adminId}`);
  } catch (error) {
    console.error(`[MyBot] ❌ Lỗi tạo file admin list:`, error);
  }
}



// Tạo file web-config.json cho bot con
async function createWebConfigFile(botId) {
  const filePath = path.resolve(paths.myBotJsonDataFolder, `web-config_${botId}.json`);
  try {
    const defaultWebConfig = {};
    await fs.writeFile(filePath, JSON.stringify(defaultWebConfig, null, 2));
    console.log(`[MyBot] ✅ Tạo file web-config: ${filePath}`);
  } catch (error) {
    console.error(`[MyBot] ❌ Lỗi tạo file web-config:`, error);
  }
}

// Tạo file manager-bot.json cho bot con
async function createManagerBotFile(botId) {
  const filePath = path.resolve(paths.myBotJsonDataFolder, `manager-bot_${botId}.json`);
  try {
    const defaultManager = {};
    await fs.writeFile(filePath, JSON.stringify(defaultManager, null, 2));
    console.log(`[MyBot] ✅ Tạo file manager-bot: ${filePath}`);
  } catch (error) {
    console.error(`[MyBot] ❌ Lỗi tạo file manager-bot:`, error);
  }
}

// Tạo file prophylactic.json cho bot con
async function createProphylacticFile(botId) {
  const filePath = path.resolve(paths.myBotJsonDataFolder, `prophylactic_${botId}.json`);
  try {
    const defaultProphylactic = {
      prophylacticUploadAttachment: {
        enable: false,
        lastBlocked: "",
        numRequestZalo: 0
      }
    };
    await fs.writeFile(filePath, JSON.stringify(defaultProphylactic, null, 2));
    console.log(`[MyBot] ✅ Tạo file prophylactic: ${filePath}`);
  } catch (error) {
    console.error(`[MyBot] ❌ Lỗi tạo file prophylactic:`, error);
  }
}

// Tạo config.json cho bot con
async function createConfigFile(botId) {
  const filePath = path.resolve(paths.myBotDataFolder, `config_${botId}.json`);
  try {
    const defaultConfig = {};
    await fs.writeFile(filePath, JSON.stringify(defaultConfig, null, 2));
    console.log(`[MyBot] ✅ Tạo file config.json: ${filePath}`);
  } catch (error) {
    console.error(`[MyBot] ❌ Lỗi tạo file config.json:`, error);
  }
}

async function initializeBotFiles(botId, imei, cookie, adminId = null) {
  console.log(`[MyBot] 🔧 Bắt đầu khởi tạo bot: ${botId}`);
  
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
  
  console.log(`[MyBot] 📦 Config tạo: ${JSON.stringify(botConfig, null, 2)}`);
  
  await saveBotConfig(botId, botConfig);
  
  // Tạo tất cả các file cần thiết (command.json dùng chung với bot chính)
  await createGroupSettingsFile(botId);
  await createAdminListFile(botId, adminId);
  await createWebConfigFile(botId);
  await createManagerBotFile(botId);
  await createProphylacticFile(botId);
  await createConfigFile(botId);
  
  console.log(`[MyBot] ✅ Khởi tạo bot ${botId} hoàn tất`);
}

async function handleMyBotCreate(api, message) {
  console.log(`[MyBot] 📨 Nhận lệnh: mybot create`);
  console.log(`[MyBot] 📨 Nội dung: ${message.data.content}`);
  
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
  
  console.log(`[MyBot] 👤 Bot ID: ${botId}`);
  console.log(`[MyBot] 👤 Bot Name: ${botName}`);
  console.log(`[MyBot] 🔑 IMEI: ${imei}`);
  
  try {
    const processName = `mybot-${botId}`;
    const indexPath = path.resolve("src/index.js");
    
    console.log(`[MyBot] 🚀 Index path: ${indexPath}`);
    
    try {
      console.log(`[MyBot] 🗑️ Xóa process cũ: ${processName}`);
      await execAsync(`pm2 delete ${processName}`);
      console.log(`[MyBot] ✅ Xóa process thành công`);
    } catch (err) {
      console.log(`[MyBot] ℹ️ Process cũ không tồn tại hoặc xóa thất bại (OK)`);
    }
    
    await initializeBotFiles(botId, imei, cookie, botId);
    
    console.log(`[MyBot] 🚀 Khởi chạy PM2: pm2 start ${indexPath} --name "${processName}" -- ${botId}`);
    const { stdout, stderr } = await execAsync(`pm2 start ${indexPath} --name "${processName}" -- ${botId}`);
    console.log(`[MyBot] ✅ PM2 stdout: ${stdout}`);
    if (stderr) console.log(`[MyBot] ⚠️ PM2 stderr: ${stderr}`);
    
    await sendMessageComplete(api, message, `✅ Đã tạo bot cho ${botName} thành công!\nBotID: ${botId}\n🚀 Bot đã khởi chạy với thời gian mặc định: 1h`);
  } catch (error) {
    console.error(`[MyBot] ❌ Lỗi khi tạo bot:`, error.message);
    await sendMessageWarning(api, message, `❌ Lỗi khi tạo bot: ${error.message}`);
  }
}

async function listAllBots() {
  console.log(`[MyBot] 📋 Liệt kê tất cả bot`);
  try {
    const files = await fs.readdir(paths.myBotDataDir);
    console.log(`[MyBot] 📂 Files trong mybot: ${files}`);
    
    const bots = [];
    
    for (const file of files) {
      if (file.endsWith(".json") && !file.includes("config_") && !file.includes("list_admin_") && !file.includes("group_settings_")) {
        const botId = file.replace(".json", "");
        console.log(`[MyBot] 🔍 Kiểm tra file: ${file} -> Bot ID: ${botId}`);
        
        const botConfig = await getBotConfig(botId);
        
        if (botConfig) {
          try {
            const userInfo = await getUserInfoData(null, botId);
            bots.push({
              uid: botId,
              name: userInfo?.name || "Unknown",
              config: botConfig
            });
            console.log(`[MyBot] ✅ Thêm bot: ${botId}`);
          } catch (err) {
            console.log(`[MyBot] ⚠️ Không thể lấy thông tin user ${botId}`);
            bots.push({
              uid: botId,
              name: botId,
              config: botConfig
            });
          }
        }
      }
    }
    
    console.log(`[MyBot] 📊 Tổng bot tìm được: ${bots.length}`);
    return bots;
  } catch (error) {
    console.error(`[MyBot] ❌ Lỗi liệt kê bot:`, error);
    return [];
  }
}

async function handleMyBotInfo(api, message) {
  console.log(`[MyBot] 📨 Nhận lệnh: mybot info`);
  
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
    console.error(`[MyBot] ❌ Lỗi:`, error);
    await sendMessageWarning(api, message, `❌ Lỗi: ${error.message}`);
  }
}

async function handleMyBotList(api, message) {
  console.log(`[MyBot] 📨 Nhận lệnh: mybot list`);
  
  try {
    const bots = await listAllBots();
    
    console.log(`[MyBot] 📊 Số bot tìm được: ${bots.length}`);
    
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
    console.error(`[MyBot] ❌ Lỗi:`, error);
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

➤ 📋 Thông tin Bot:
『${prefix}mybot info』
• 📝 Cú pháp: ${prefix}mybot info @mention/index

➤ 📊 Danh sách Bot:
『${prefix}mybot list』
• 📝 Hiển thị tất cả bot trong hệ thống

🚨🚨🚨`;
}

export async function handleMyBotCommands(api, message) {
  const prefix = getGlobalPrefix();
  const content = removeMention(message);
  
  console.log(`[MyBot] 📨 Tin nhắn nhận được: ${content}`);
  
  if (!content.includes(`${prefix}mybot`)) {
    return false;
  }
  
  const parts = content.split(/\s+/).filter(p => p.trim());
  console.log(`[MyBot] 🔍 Parts: ${JSON.stringify(parts)}`);
  
  if (parts.length < 2) {
    const helpMsg = getHelpMessage();
    await sendMessageComplete(api, message, helpMsg);
    return true;
  }
  
  const command = parts[1];
  console.log(`[MyBot] 🎯 Command: ${command}`);
  
  switch (command) {
    case "create":
      await handleMyBotCreate(api, message);
      return true;
    case "info":
      await handleMyBotInfo(api, message);
      return true;
    case "list":
      await handleMyBotList(api, message);
      return true;
    case "help":
      const helpMsg = getHelpMessage();
      await sendMessageComplete(api, message, helpMsg);
      return true;
    default:
      const defaultHelp = getHelpMessage();
      await sendMessageComplete(api, message, defaultHelp);
      return true;
  }
}
