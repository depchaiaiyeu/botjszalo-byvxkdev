import { writeGroupSettings } from "../../utils/io-json.js";
import { sendMessageComplete, sendMessageInsufficientAuthority, sendMessageQuery, sendMessageWarning } from "../../service-hahuyhoang/chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service-hahuyhoang/service.js";
import { removeMention } from "../../utils/format-util.js";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import path from "path";
import { createAdminListImage } from "../../utils/canvas/info.js";
import { getUserInfoData } from "../../service-hahuyhoang/info-service/user-info.js";
import { exec, spawn } from "child_process";
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
  myBotJsonDataFolder: path.resolve("./mybot/json-data"),
  assetsJsonDataDir: path.resolve("./assets/json-data"),
  logsDir: path.resolve("./logs"),
  resourcesDir: path.resolve("./resources"),
  tempDir: path.resolve("./temp")
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
    await fs.writeFile(botPath, JSON.stringify(config, null, 2));
    console.log(`[MyBot] ✅ Lưu config bot ${botId} tại: ${botPath}`);
  } catch (error) {
    console.error(`[MyBot] ❌ Lỗi lưu config ${botId}:`, error);
    throw error;
  }
}

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

async function copyCommandFile(botId) {
  const sourcePath = path.resolve(paths.assetsJsonDataDir, `command.json`);
  const destPath = path.resolve(paths.myBotJsonDataFolder, `command_${botId}.json`);
  try {
    await fs.copyFile(sourcePath, destPath);
    console.log(`[MyBot] ✅ Copy command.json thành command_${botId}.json: ${destPath}`);
  } catch (error) {
    console.error(`[MyBot] ❌ Lỗi copy file command.json:`, error);
  }
}

async function createLogFiles(botId) {
  const logBotDir = path.resolve(paths.logsDir, botId);
  const resourceBotDir = path.resolve(paths.resourcesDir, botId);
  const tempBotDir = path.resolve(paths.tempDir, botId);
  const logMessagePath = path.resolve(logBotDir, "message.txt");
  const logMessageJsonPath = path.resolve(logBotDir, "message.json");
  const logManagerPath = path.resolve(logBotDir, "bot-manager.log");

  try {
    await fs.mkdir(logBotDir, { recursive: true });
    await fs.mkdir(resourceBotDir, { recursive: true });
    await fs.mkdir(tempBotDir, { recursive: true });
    await fs.writeFile(logMessagePath, "", "utf-8");
    await fs.writeFile(logMessageJsonPath, "{}", "utf-8");
    await fs.writeFile(logManagerPath, "", "utf-8");
    console.log(`[MyBot] ✅ Tạo thư mục log và file cho ${botId}`);
  } catch (error) {
    console.error(`[MyBot] ❌ Lỗi tạo file log cho ${botId}:`, error);
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

  await createGroupSettingsFile(botId);
  await createAdminListFile(botId, adminId);
  await createWebConfigFile(botId);
  await createManagerBotFile(botId);
  await createProphylacticFile(botId);
  await createConfigFile(botId);
  await copyCommandFile(botId);
  await createLogFiles(botId);

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

  const mention = mentions[0];
  const botId = mention.uid;
  const botName = message.data.content.substring(mention.pos, mention.pos + mention.len).replace("@", "");

  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    await sendMessageWarning(api, message, "❌ Cookie JSON không hợp lệ");
    return;
  }

  const cookieStr = jsonMatch[0];

  const imeiMatch = content.substring(content.lastIndexOf("}") + 1).trim().split(/\s+/);
  const imei = imeiMatch[imeiMatch.length - 1];

  if (!imei) {
    await sendMessageWarning(api, message, "❌ IMEI không hợp lệ");
    return;
  }

  let cookie;
  try {
    cookie = JSON.parse(cookieStr);
  } catch (err) {
    await sendMessageWarning(api, message, `❌ Cookie JSON không hợp lệ: ${err.message}`);
    return;
  }

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

    await initializeBotFiles(botId, imei, cookie, null);

    console.log(`[MyBot] 🚀 Khởi chạy PM2: pm2 start ${indexPath} --name "${processName}" -- ${botId}`);
    const { stdout, stderr } = await execAsync(`pm2 start ${indexPath} --name "${processName}" -- ${botId}`);
    console.log(`[MyBot] ✅ PM2 stdout: ${stdout}`);
    if (stderr) console.log(`[MyBot] ⚠️ PM2 stderr: ${stderr}`);

    await sendMessageComplete(api, message, `✅ Đã tạo bot cho ${botName} thành công!\nBotID: ${botId}\n🚀 Bot đã khởi chạy.\nĐang theo dõi log...`);

    console.log(`[MyBot] 📡 Bắt đầu stream log trực tiếp cho: ${processName}`);
    
    const logStream = spawn('pm2', ['logs', processName, '--raw']);

    logStream.stdout.on('data', (data) => {
      process.stdout.write(`[LOG|${botId}] ${data.toString()}`);
    });

    logStream.stderr.on('data', (data) => {
      process.stderr.write(`[ERR|${botId}] ${data.toString()}`);
    });

    logStream.on('close', (code) => {
      console.log(`[MyBot] 🛑 Stream log cho ${processName} đã dừng (Code: ${code})`);
    });

    logStream.on('error', (err) => {
        console.error(`[MyBot] ❌ Lỗi khi stream log cho ${processName}:`, err);
    });

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
      if (file.endsWith(".json") && !["defaultCommand.json", "mybots.json"].includes(file)) {
        const botId = file.replace(".json", "");

        if (isNaN(botId) || botId.length < 10) {
          console.log(`[MyBot] ⏭️ Bỏ qua file: ${file} (không phải bot config)`);
          continue;
        }

        console.log(`[MyBot] 🔍 Kiểm tra file: ${file} -> Bot ID: ${botId}`);

        const botConfig = await getBotConfig(botId);

        if (botConfig) {
          let botName = botId;
          try {
            const userInfo = await getUserInfoData(null, botId);
            botName = userInfo?.name || botId;
            bots.push({
              uid: botId,
              name: botName,
              config: botConfig
            });
            console.log(`[MyBot] ✅ Thêm bot: ${botId}`);
          } catch (err) {
            console.log(`[MyBot] ⚠️ Không thể lấy thông tin user ${botId}. Dùng UID làm tên.`);
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

function getBotTarget(message, parts, botList) {
  let botId = null;
  let botName = "Bot";
  let mention = null;
  const mentions = message.data.mentions;

  if (mentions && mentions.length > 0) {
    mention = mentions[0];
    botId = mention.uid;
    botName = message.data.content.substring(mention.pos, mention.pos + mention.len).replace("@", "");
  } else if (parts.length >= 3) {
    const index = parseInt(parts[2]) - 1;
    if (index >= 0 && index < botList.length) {
      botId = botList[index].uid;
      botName = botList[index].name;
    }
  }

  return { botId, botName, mention };
}

async function handleMyBotInfo(api, message) {
  console.log(`[MyBot] 📨 Nhận lệnh: mybot info`);

  const content = removeMention(message);
  const parts = content.split(/\s+/).filter(p => p.trim());
  const botList = await listAllBots();
  
  const { botId, botName } = getBotTarget(message, parts, botList);

  if (!botId) {
    await sendMessageWarning(api, message, "Không tìm thấy bot. Vui lòng @mention người dùng hoặc cung cấp index hợp lệ.");
    return;
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
    console.error(`[MyBot] X Lỗi:`, error);
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
      listInfo += `${i + 1}. ${bot.name} • ${bot.uid}\n   ${status} | ⏱️ ${expireInfo} | 📅 ${createdTime}\n\n`;
    }

    await sendMessageComplete(api, message, listInfo);
  } catch (error) {
    console.error(`[MyBot] ❌ Lỗi:`, error);
    await sendMessageWarning(api, message, `❌ Lỗi: ${error.message}`);
  }
}

async function handleMyBotAddTime(api, message) {
  console.log(`[MyBot] 📨 Nhận lệnh: mybot addtime`);

  const content = removeMention(message);
  const parts = content.split(/\s+/).filter(p => p.trim());
  
  if (parts.length < 3) {
    await sendMessageQuery(api, message, "Cú pháp không hợp lệ. Vui lòng cung cấp người dùng (@mention/index) và thời gian (ví dụ: 1d, 5h, -1)");
    return;
  }
  
  const botList = await listAllBots();
  let botId = null;
  let botName = "Bot";
  let timeStr = parts[parts.length - 1];

  const target = getBotTarget(message, parts, botList);
  botId = target.botId;
  botName = target.botName;
  
  if (!botId) {
    await sendMessageWarning(api, message, "Không tìm thấy bot. Vui lòng @mention người dùng hoặc cung cấp index hợp lệ.");
    return;
  }
  
  if (target.mention) {
    timeStr = parts[parts.length - 1];
  } else if (botId) {
    timeStr = parts[parts.length - 1];
  } 

  const timeMs = parseTimeToMs(timeStr);
  
  if (timeMs === null && timeStr !== "-1") {
    await sendMessageWarning(api, message, "Định dạng thời gian không hợp lệ. Sử dụng: 1h (giờ), 5p/5m (phút), 1d (ngày), hoặc -1 (vô hạn)");
    return;
  }

  try {
    const botConfig = await getBotConfig(botId);
    if (!botConfig) {
      await sendMessageWarning(api, message, `Bot của ${botName} không tồn tại`);
      return;
    }

    let newExpiresAt;

    if (timeMs === -1) {
      newExpiresAt = -1;
    } else {
      const currentExpiresAt = botConfig.expiresAt > 0 ? botConfig.expiresAt : Date.now();
      newExpiresAt = currentExpiresAt + timeMs;
    }

    botConfig.expiresAt = newExpiresAt;
    await saveBotConfig(botId, botConfig);

    const expirationInfo = newExpiresAt === -1 
      ? "vô hạn" 
      : new Date(newExpiresAt).toLocaleString("vi-VN");

    await sendMessageComplete(api, message, `✅ Gia hạn cho ${botName} (ID: ${botId}) thành công!\nThời gian hết hạn mới: ${expirationInfo}`);
  } catch (error) {
    console.error(`[MyBot] ❌ Lỗi khi gia hạn bot:`, error);
    await sendMessageWarning(api, message, `❌ Lỗi khi gia hạn bot: ${error.message}`);
  }
}

async function deleteBotFiles(botId) {
  const filePaths = [
    path.resolve(paths.myBotDataDir, `${botId}.json`),
    path.resolve(paths.myBotDataFolder, `group_settings_${botId}.json`),
    path.resolve(paths.myBotDataFolder, `list_admin_${botId}.json`),
    path.resolve(paths.myBotJsonDataFolder, `web-config_${botId}.json`),
    path.resolve(paths.myBotJsonDataFolder, `manager-bot_${botId}.json`),
    path.resolve(paths.myBotJsonDataFolder, `prophylactic_${botId}.json`),
    path.resolve(paths.myBotDataFolder, `config_${botId}.json`),
    path.resolve(paths.myBotJsonDataFolder, `command_${botId}.json`),
  ];
  
  const dirs = [
    path.resolve(paths.logsDir, botId),
    path.resolve(paths.resourcesDir, botId),
    path.resolve(paths.tempDir, botId)
  ];

  for (const filePath of filePaths) {
    try {
      await fs.unlink(filePath);
      console.log(`[MyBot] ✅ Xóa file: ${filePath}`);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error(`[MyBot] ⚠️ Lỗi khi xóa file ${filePath}:`, error.message);
      }
    }
  }

  for (const dirPath of dirs) {
    try {
      await fs.rm(dirPath, { recursive: true, force: true });
      console.log(`[MyBot] ✅ Xóa thư mục: ${dirPath}`);
    } catch (error) {
      console.error(`[MyBot] ⚠️ Lỗi khi xóa thư mục ${dirPath}:`, error.message);
    }
  }
}

async function handleMyBotDelete(api, message) {
  console.log(`[MyBot] 📨 Nhận lệnh: mybot delete/remove`);

  const content = removeMention(message);
  const parts = content.split(/\s+/).filter(p => p.trim());
  const botList = await listAllBots();

  const target = getBotTarget(message, parts, botList);
  const botId = target.botId;
  const botName = target.botName;

  if (!botId) {
    await sendMessageQuery(api, message, "Vui lòng @mention người dùng hoặc cung cấp index để xóa bot.");
    return;
  }

  try {
    const processName = `mybot-${botId}`;
    
    try {
      await execAsync(`pm2 delete ${processName}`);
      console.log(`[MyBot] ✅ Dừng và xóa process PM2 thành công: ${processName}`);
    } catch (err) {
      console.log(`[MyBot] ℹ️ Process PM2 không tồn tại hoặc xóa thất bại (OK): ${processName}`);
    }

    await deleteBotFiles(botId);

    await sendMessageComplete(api, message, `✅ Đã xóa bot và toàn bộ dữ liệu của ${botName} (ID: ${botId}) khỏi VXK Bot Team.`);
  } catch (error) {
    console.error(`[MyBot] ❌ Lỗi khi xóa bot:`, error.message);
    await sendMessageWarning(api, message, `❌ Lỗi khi xóa bot: ${error.message}`);
  }
}

function getHelpMessage() {
  const prefix = getGlobalPrefix();
  return `《 🤖 HỆ THỐNG QUẢN LÝ BOT VXK 🤖 》

➤ 🆕 Tạo/Sửa Bot:
『${prefix}mybot create』
• 📝 Cú pháp: ${prefix}mybot create @mention cookie imei
• ⚙️ Chức năng: Đăng ký/sửa đổi thông tin vào hệ thống VXK Bot Team

---
➤ ➕ Gia hạn/Đặt thời gian:
『${prefix}mybot addtime』
• 📝 Cú pháp: ${prefix}mybot addtime @mention/index thời_gian
• ⏱️ Định dạng: 1h (giờ), 5p/5m (phút), 1d (ngày), -1 (vô hạn)
• ⚙️ Ví dụ: ${prefix}mybot addtime @user 1d

---
➤ 🗑️ Xóa Bot:
『${prefix}mybot delete/remove』
• 📝 Cú pháp: ${prefix}mybot delete @mention/index
• ⚙️ Chức năng: Xóa bot và toàn bộ data

---
➤ 📋 Thông tin Bot:
『${prefix}mybot info』
• 📝 Cú pháp: ${prefix}mybot info @mention/index

---
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
    case "addtime":
      await handleMyBotAddTime(api, message);
      return true;
    case "delete":
    case "remove":
      await handleMyBotDelete(api, message);
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
