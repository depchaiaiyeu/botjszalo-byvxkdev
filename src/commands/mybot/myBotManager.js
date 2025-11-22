import { sendMessageComplete, sendMessageQuery, sendMessageWarning } from "../../service-hahuyhoang/chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service-hahuyhoang/service.js";
import { removeMention } from "../../utils/format-util.js";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import path from "path";
import { getUserInfoData } from "../../service-hahuyhoang/info-service/user-info.js";
import { exec, spawn } from "child_process";
import { promisify } from "util";
import { initSession, verifyClient, generateQRCode, waitingScan, waitingConfirm } from "../../utils/zalo-qrlogin.js";

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
    tempDir: path.resolve("./assets/temp"),
    cacheDir: path.resolve(".cache")
};

function getRandomUserAgent() {
    return userAgents[Math.floor(Math.random() * userAgents.length)];
}

function parseTimeToMs(timeStr) {
    if (timeStr === '-1') return -1;
    
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

function formatRemainingTime(expiresAt) {
    if (expiresAt === -1) return "Vô hạn ♾️";
    
    const remaining = expiresAt - Date.now();
    
    if (remaining <= 0) return "⚠️ Hết hạn";
    
    const days = Math.floor(remaining / 86400000);
    const hours = Math.floor((remaining % 86400000) / 3600000);
    const mins = Math.floor((remaining % 3600000) / 60000);
    
    return `${days}d ${hours}h ${mins}p`;
}

async function getPm2ProcessMap() {
    try {
        const { stdout } = await execAsync('pm2 jlist');
        const processes = JSON.parse(stdout);
        const processMap = new Map();
        
        for (const proc of processes) {
            processMap.set(proc.name, {
                status: proc.pm2_env.status,
                cpu: proc.monit.cpu,
                memory: proc.monit.memory
            });
        }
        return processMap;
    } catch (error) {
        console.error(`[MyBot] 🚫 Lỗi khi lấy trạng thái PM2:`, error.message);
        return new Map();
    }
}

function formatPm2Status(status, isRunningInConfig) {
    if (!status) {
        if (isRunningInConfig) {
            return "🟡 Không tìm thấy (Lỗi)";
        }
        return "⚪ Chưa chạy";
    }

    switch (status) {
        case 'online':
            return '✅ Đang chạy';
        case 'stopping':
            return '⏳ Đang dừng...';
        case 'stopped':
            return '🚫 Đã dừng';
        case 'launching':
            return '🚀 Đang khởi động...';
        case 'errored':
            return '❌ Lỗi (Crash)';
        default:
            return `❓ ${status}`;
    }
}

async function ensureDirectories() {
    const dirs = [
        paths.myBotDataDir,
        paths.myBotDataFolder,
        paths.myBotJsonDataFolder,
        paths.tempDir,
        paths.cacheDir
    ];

    for (const dir of dirs) {
        try {
            await fs.mkdir(dir, { recursive: true });
        } catch (error) {
            console.error(`[MyBot] 🚫 Lỗi tạo thư mục ${dir}:`, error);
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
        return config;
    } catch (error) {
        return null;
    }
}

async function saveBotConfig(botId, config) {
    const botPath = await getBotDataPath(botId);
    try {
        await fs.writeFile(botPath, JSON.stringify(config, null, 2));
    } catch (error) {
        console.error(`[MyBot] 🚫 Lỗi lưu config ${botId}:`, error);
        throw error;
    }
}

async function createGroupSettingsFile(botId) {
    const filePath = path.resolve(paths.myBotDataFolder, `group_settings_${botId}.json`);
    try {
        await fs.writeFile(filePath, JSON.stringify({}, null, 2));
    } catch (error) {}
}

async function createAdminListFile(botId, adminId = null) {
    const filePath = path.resolve(paths.myBotDataFolder, `list_admin_${botId}.json`);
    try {
        const defaultAdmins = adminId ? [adminId.toString()] : [];
        await fs.writeFile(filePath, JSON.stringify(defaultAdmins, null, 2));
    } catch (error) {}
}

async function createWebConfigFile(botId) {
    const filePath = path.resolve(paths.myBotJsonDataFolder, `web-config_${botId}.json`);
    try {
        await fs.writeFile(filePath, JSON.stringify({}, null, 2));
    } catch (error) {}
}

async function createManagerBotFile(botId) {
    const filePath = path.resolve(paths.myBotJsonDataFolder, `manager-bot_${botId}.json`);
    try {
        await fs.writeFile(filePath, JSON.stringify({}, null, 2));
    } catch (error) {}
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
    } catch (error) {}
}

async function createConfigFile(botId) {
    const filePath = path.resolve(paths.myBotDataFolder, `config_${botId}.json`);
    try {
        await fs.writeFile(filePath, JSON.stringify({}, null, 2));
    } catch (error) {}
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
    } catch (error) {}
}

async function initializeBotFiles(botId, imei, cookie, adminId = null, userAgent = null) {
    await ensureDirectories();

    const botConfig = {
        cookie: cookie,
        imei: imei,
        userAgent: userAgent || getRandomUserAgent(),
        createdAt: new Date().toISOString(),
        expiresAt: Date.now() + 3600000,
        isRunning: true,
        processId: `mybot-${botId}`
    };

    await saveBotConfig(botId, botConfig);
    await createGroupSettingsFile(botId);
    await createAdminListFile(botId, adminId);
    await createWebConfigFile(botId);
    await createManagerBotFile(botId);
    await createProphylacticFile(botId);
    await createConfigFile(botId);
    await createLogFiles(botId);
}

function streamLogs(processName, botId, botName) {
    const logStream = spawn('pm2', ['logs', processName, '--raw']);

    logStream.stdout.on('data', (data) => {
        const lines = data.toString().split('\n');
        for (const line of lines) {
            if (line.trim()) {
                process.stdout.write(`[ Logs • ${botName} ] ${line}\n`);
            }
        }
    });

    logStream.stderr.on('data', (data) => {
        const lines = data.toString().split('\n');
        for (const line of lines) {
            if (line.trim()) {
                process.stderr.write(`[ ERROR • ${botName} ] ${line}\n`);
            }
        }
    });
}

async function handleMyBotCreate(api, message) {
    const mentions = message.data.mentions;
    const content = removeMention(message);
    const parts = content.split(/\s+/).filter(p => p.trim());

    if (!mentions || mentions.length === 0) {
        await sendMessageQuery(api, message, "Vui lòng @mention người dùng để tạo bot cho họ");
        return;
    }

    const mention = mentions[0];
    const botId = mention.uid;
    const botName = message.data.content.substring(mention.pos, mention.pos + mention.len).replace("@", "");

    let cookie, imei;

    if (parts.includes("qrlogin")) {
        try {
            await sendMessageComplete(api, message, "Đang khởi tạo phiên đăng nhập QR, vui lòng đợi...");
            
            await ensureDirectories();
            let session = await initSession();
            if (!session) {
                throw new Error("Không thể khởi tạo session");
            }

            session = await verifyClient(session);
            if (!session) {
                throw new Error("Không thể xác thực client");
            }

            const [code, updatedSession] = await generateQRCode(session);
            session = updatedSession;

            if (!code) {
                throw new Error("Không thể tạo mã QR");
            }

            const qrImagePath = path.resolve(paths.cacheDir, "qr_code.png");
            
            await api.sendMessage({
                msg: `Quét mã QR để đăng nhập..!\n\nMở Zalo trên điện thoại của tài khoản cần tạo Bot và quét mã này.\nSau đó nhấn "Đăng nhập" trên điện thoại.\n\nBot sẽ tự động thiết lập sau khi bạn xác nhận.`,
                attachments: [qrImagePath],
                ttl: 86400000
            }, message.threadId, message.type);

            const scanResult = await waitingScan(code, session);
            if (!scanResult) {
                throw new Error("Hết thời gian chờ quét mã hoặc lỗi kết nối");
            }

            const [resultData, rawCookies] = await waitingConfirm(code, session);
            if (!resultData || !rawCookies) {
                throw new Error("Xác nhận đăng nhập thất bại hoặc hết hạn");
            }

            imei = resultData.imei;
            cookie = rawCookies.cookies; 

            await sendMessageComplete(api, message, "✅ Đăng nhập thành công! Đang khởi tạo bot...");

        } catch (error) {
            console.error(`[MyBot] 🚫 Lỗi QR Login:`, error);
            await sendMessageWarning(api, message, `🚫 Lỗi quy trình QR: ${error.message}`);
            return;
        }

    } else {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            await sendMessageWarning(api, message, "🚫 Cú pháp sai. Hãy dùng 'qrlogin' hoặc cung cấp JSON cookie thủ công.");
            return;
        }

        const cookieStr = jsonMatch[0];
        const imeiMatch = content.substring(content.lastIndexOf("}") + 1).trim().split(/\s+/);
        imei = imeiMatch[imeiMatch.length - 1];

        if (!imei) {
            await sendMessageWarning(api, message, "🚫 IMEI không hợp lệ");
            return;
        }

        try {
            cookie = JSON.parse(cookieStr);
        } catch (err) {
            await sendMessageWarning(api, message, `🚫 Cookie JSON không hợp lệ: ${err.message}`);
            return;
        }
    }

    try {
        const processName = `mybot-${botId}`;
        const indexPath = path.resolve("src/index.js");

        try {
            await execAsync(`pm2 delete ${processName}`);
        } catch (err) {}

        await initializeBotFiles(botId, imei, cookie, null, null);

        const { stdout } = await execAsync(`pm2 start ${indexPath} --name "${processName}" --exp-backoff-restart-delay=100 -- ${botId}`);

        await sendMessageComplete(api, message, `✅ Đã tạo bot cho ${botName} thành công.\n🆔 ID: ${botId}\n🚀 Bot đang khởi động...`);

        streamLogs(processName, botId, botName);

    } catch (error) {
        console.error(`[MyBot] 🚫 Lỗi khi tạo bot:`, error.message);
        await sendMessageWarning(api, message, `🚫 Lỗi khi tạo bot: ${error.message}`);
    }
}

async function listAllBots(api) {
    try {
        const files = await fs.readdir(paths.myBotDataDir);
        const bots = [];

        for (const file of files) {
            if (file.endsWith(".json") && !["defaultCommand.json", "mybots.json"].includes(file)) {
                const botId = file.replace(".json", "");

                if (isNaN(botId) || botId.length < 10) {
                    continue;
                }

                const botConfig = await getBotConfig(botId);

                if (botConfig) {
                    let botName = botId;
                    if (api) {
                        try {
                            const userInfo = await getUserInfoData(api, botId);
                            if (userInfo && userInfo.name) {
                                botName = userInfo.name;
                            }
                        } catch (err) {}
                    }
                    bots.push({
                        uid: botId,
                        name: botName,
                        config: botConfig
                    });
                }
            }
        }
        return bots;
    } catch (error) {
        console.error(`[MyBot] 🚫 Lỗi liệt kê bot:`, error);
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
    const content = removeMention(message);
    const parts = content.split(/\s+/).filter(p => p.trim());
    const botList = await listAllBots(api);
    
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

        const pm2Map = await getPm2ProcessMap();
        const processName = `mybot-${botId}`;
        const pm2Info = pm2Map.get(processName);
        
        const realStatus = pm2Info ? pm2Info.status : 'stopped';
        const isRunning = (realStatus === 'online' || realStatus === 'launching');
        if (botConfig.isRunning !== isRunning) {
            botConfig.isRunning = isRunning;
            await saveBotConfig(botId, botConfig);
        }

        const createdTime = new Date(botConfig.createdAt).toLocaleString("vi-VN");
        const expireInfo = formatRemainingTime(botConfig.expiresAt);
        const status = formatPm2Status(realStatus, botConfig.isRunning);

        const info = `📜 Thông tin Bot >> VXK Bot Team:\n\n`
                   + `1. ${botName}\n`
                   + `📊 Trạng thái: ${status}\n`
                   + `💾 pm2 Name: ${processName}\n`
                   + `🎯 Thời gian còn lại: ${expireInfo}\n`
                   + `🌟 Tạo lúc: ${createdTime}`;

        await sendMessageComplete(api, message, info);
    } catch (error) {
        console.error(`[MyBot] 🚫 Lỗi:`, error);
        await sendMessageWarning(api, message, `🚫 Lỗi: ${error.message}`);
    }
}

async function handleMyBotList(api, message) {
    try {
        const bots = await listAllBots(api);
        const pm2Map = await getPm2ProcessMap();

        if (bots.length === 0) {
            await sendMessageQuery(api, message, "Chưa có bot nào trong hệ thống");
            return;
        }

        let listInfo = "📜 Danh sách Bot >> VXK Bot Team:\n\n";

        for (let i = 0; i < bots.length; i++) {
            const bot = bots[i];
            const processName = `mybot-${bot.uid}`;
            const pm2Info = pm2Map.get(processName);
            
            const realStatus = pm2Info ? pm2Info.status : 'stopped';
            
            const isRunning = (realStatus === 'online' || realStatus === 'launching');
            if (bot.config.isRunning !== isRunning) {
                bot.config.isRunning = isRunning;
                await saveBotConfig(bot.uid, bot.config);
            }
            
            const status = formatPm2Status(realStatus, bot.config.isRunning);
            const expireInfo = formatRemainingTime(bot.config.expiresAt);

            listInfo += `${i + 1}. ${bot.name}\n`
                      + `📊 Trạng thái: ${status}\n`
                      + `🎯 Thời gian còn lại: ${expireInfo}\n\n`;
        }
        
        listInfo += "-> Inbox cho admin để gia hạn thời gian bot của bạn..!";

        await sendMessageComplete(api, message, listInfo);
    } catch (error) {
        console.error(`[MyBot] 🚫 Lỗi:`, error);
        await sendMessageWarning(api, message, `🚫 Lỗi: ${error.message}`);
    }
}

async function handleMyBotAddTime(api, message) {
    const content = removeMention(message);
    const parts = content.split(/\s+/).filter(p => p.trim());
    
    if (parts.length < 3) {
        await sendMessageQuery(api, message, "Cú pháp không hợp lệ. Vui lòng cung cấp người dùng (@mention/index) và thời gian (ví dụ: 1d, 5h, -1)");
        return;
    }
    
    const botList = await listAllBots(api);
    let botId = null;
    let botName = "Bot";
    let timeStr = parts[parts.length - 1];

    const target = getBotTarget(message, parts, botList);
    botId = target.botId;
    botName = target.botName;
    
    if (!botId) {
        await sendMessageWarning(api, message, "🚫 Không tìm thấy bot. Vui lòng @mentions người dùng hoặc cung cấp index hợp lệ.");
        return;
    }
    
    if (target.mention) {
        timeStr = parts[parts.length - 1];
    } else if (botId) {
        timeStr = parts[parts.length - 1];
    }

    const timeMs = parseTimeToMs(timeStr);
    
    if (timeMs === null) {
        await sendMessageWarning(api, message, "🚫 Định dạng thời gian không hợp lệ.\nSử dụng: 1h (giờ), 5p/5m (phút), 1d (ngày), hoặc -1 (vô hạn)");
        return;
    }

    try {
        const botConfig = await getBotConfig(botId);
        if (!botConfig) {
            await sendMessageWarning(api, message, `Bot của ${botName} không tồn tại trong hệ thống.`);
            return;
        }

        let newExpiresAt;

        if (timeMs === -1) {
            newExpiresAt = -1;
        } else {
            const baseTime = (botConfig.expiresAt && botConfig.expiresAt > Date.now()) 
                             ? botConfig.expiresAt 
                             : Date.now();
            newExpiresAt = baseTime + timeMs;
        }

        botConfig.expiresAt = newExpiresAt;
        await saveBotConfig(botId, botConfig);

        const expirationInfo = newExpiresAt === -1 
            ? "vô hạn" 
            : new Date(newExpiresAt).toLocaleString("vi-VN");

        await sendMessageComplete(api, message, `✅ Gia hạn thời gian cho Bot của ${botName} thành công.\n🆔 ID: ${botId}\n👉 Thời gian hết hạn mới: ${expirationInfo}`);
    } catch (error) {
        console.error(`[MyBot] 🚫 Lỗi khi gia hạn bot:`, error);
        await sendMessageWarning(api, message, `🚫 Lỗi khi gia hạn bot: ${error.message}`);
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
    ];
    
    const dirs = [
        path.resolve(paths.logsDir, botId),
        path.resolve(paths.resourcesDir, botId),
        path.resolve(paths.tempDir, botId)
    ];

    for (const filePath of filePaths) {
        try {
            await fs.unlink(filePath);
        } catch (error) {}
    }

    for (const dirPath of dirs) {
        try {
            await fs.rm(dirPath, { recursive: true, force: true });
        } catch (error) {}
    }
}

async function handleMyBotDelete(api, message) {
    const content = removeMention(message);
    const parts = content.split(/\s+/).filter(p => p.trim());
    const botList = await listAllBots(api);

    const target = getBotTarget(message, parts, botList);
    const botId = target.botId;
    const botName = target.botName;

    if (!botId) {
        await sendMessageQuery(api, message, "Vui lòng @mention người dùng hoặc cung cấp index để xóa khỏi hệ thống VXK Bot Team.");
        return;
    }

    try {
        const processName = `mybot-${botId}`;
        
        try {
            await execAsync(`pm2 delete ${processName}`);
        } catch (err) {}

        await deleteBotFiles(botId);

        await sendMessageComplete(api, message, `✅ Đã xóa bot và toàn bộ dữ liệu của ${botName} khỏi dữ liệu VXK Bot Team.\n🆔 ID: ${botId}`);
    } catch (error) {
        console.error(`[MyBot] 🚫 Lỗi khi xóa bot:`, error);
        await sendMessageWarning(api, message, `🚫 Lỗi khi xóa bot: ${error.message}`);
    }
}

async function handleMyBotShutdown(api, message) {
    const content = removeMention(message);
    const parts = content.split(/\s+/).filter(p => p.trim());
    const botList = await listAllBots(api);

    const target = getBotTarget(message, parts, botList);
    const botId = target.botId;
    const botName = target.botName;

    if (!botId) {
        await sendMessageQuery(api, message, "Vui lòng @mention người dùng hoặc cung cấp index để tắt bot.");
        return;
    }

    try {
        const processName = `mybot-${botId}`;
        const botConfig = await getBotConfig(botId);
        
        if (!botConfig) {
            await sendMessageWarning(api, message, `🚫 Bot của ${botName} không tồn tại trong hệ thống.`);
            return;
        }
        
        await execAsync(`pm2 stop ${processName}`);
        
        botConfig.isRunning = false;
        await saveBotConfig(botId, botConfig);
        
        await sendMessageComplete(api, message, `✅ Đã tắt bot của ${botName}\n🆔 ID: ${botId}`);
    } catch (error) {
        console.error(`[MyBot] 🚫 Lỗi khi tắt bot:`, error);
        await sendMessageWarning(api, message, `🚫 Lỗi khi tắt bot: ${error.message}`);
    }
}

async function handleMyBotActive(api, message) {
    const content = removeMention(message);
    const parts = content.split(/\s+/).filter(p => p.trim());
    const botList = await listAllBots(api);

    const target = getBotTarget(message, parts, botList);
    const botId = target.botId;
    const botName = target.botName;

    if (!botId) {
        await sendMessageQuery(api, message, "Vui lòng @mention người dùng hoặc cung cấp index để bật bot.");
        return;
    }

    try {
        const processName = `mybot-${botId}`;
        const botConfig = await getBotConfig(botId);
        
        if (!botConfig) {
            await sendMessageWarning(api, message, `🚫 Bot của ${botName} không tồn tại trong hệ thống.`);
            return;
        }

        if (botConfig.expiresAt !== -1 && botConfig.expiresAt < Date.now()) {
            await sendMessageWarning(api, message, `🚫 Bot của ${botName} đã hết hạn. Vui lòng inbox admin để gia hạn thêm thời gian.`);
            if (botConfig.isRunning) {
                botConfig.isRunning = false;
                await saveBotConfig(botId, botConfig);
            }
            return;
        }
        
        await execAsync(`pm2 start ${processName}`);
        
        botConfig.isRunning = true;
        await saveBotConfig(botId, botConfig);
        
        await sendMessageComplete(api, message, `✅ Đã bật bot của ${botName}\n🆔 ID: ${botId}\n👉 Bot của bạn đang hoạt động trở lại...`);

        streamLogs(processName, botId, botName);

    } catch (error) {
        console.error(`[MyBot] 🚫 Lỗi khi bật bot:`, error);
        await sendMessageWarning(api, message, `🚫 Lỗi khi bật bot: ${error.message}`);
    }
}

async function handleMyBotRestart(api, message) {
    const content = removeMention(message);
    const parts = content.split(/\s+/).filter(p => p.trim());
    const botList = await listAllBots(api);

    const target = getBotTarget(message, parts, botList);
    const botId = target.botId;
    const botName = target.botName;

    if (!botId) {
        await sendMessageQuery(api, message, "Vui lòng @mention người dùng hoặc cung cấp index để restart bot.");
        return;
    }

    try {
        const processName = `mybot-${botId}`;
        const botConfig = await getBotConfig(botId);
        
        if (!botConfig) {
            await sendMessageWarning(api, message, `Bot của ${botName} không tồn tại`);
            return;
        }

        if (botConfig.expiresAt !== -1 && botConfig.expiresAt < Date.now()) {
            await sendMessageWarning(api, message, `🚫 Bot của ${botName} đã hết hạn. Nếu là admin, hãy gia hạn cho bot để có thể sử dụng lệnh này.`);
            if (botConfig.isRunning) {
                botConfig.isRunning = false;
                await saveBotConfig(botId, botConfig);
            }
            return;
        }
        
        await execAsync(`pm2 restart ${processName}`);
        
        botConfig.isRunning = true;
        await saveBotConfig(botId, botConfig);
        
        await sendMessageComplete(api, message, `✅ Đã khởi động lại bot của ${botName} (ID: ${botId}).\nĐang theo dõi log...`);

        streamLogs(processName, botId, botName);

    } catch (error) {
        console.error(`[MyBot] 🚫 Lỗi khi restart bot:`, error);
        await sendMessageWarning(api, message, `🚫 Lỗi khi restart bot: ${error.message}`);
    }
}

function getHelpMessage() {
    const prefix = getGlobalPrefix();
    return `《 🤖 HỆ THỐNG QUẢN LÝ BOT - VXK BOT TEAM 🤖 》

➤ 🆕 Tạo Bot:
『${prefix}mybot create』
• 📝 Cú pháp: 
1. ${prefix}mybot create @mention qrlogin (Quét mã QR)
2. ${prefix}mybot create @mention <cookie_json> <imei> (Thủ công)

---
➤ ➕ Gia hạn/Đặt thời gian:
『${prefix}mybot addtime』
• 📝 Cú pháp: ${prefix}mybot addtime @mention/index thời_gian
• ⏱️ Định dạng: 1h (giờ), 5p/5m (phút), 1d (ngày), -1 (vô hạn)
• ⚙️ Ví dụ: ${prefix}mybot addtime @mentions/index -1

---
➤ 🗑️ Xóa Bot:
『${prefix}mybot delete/remove』
• 📝 Cú pháp: ${prefix}mybot delete @mention/index
• ⚙️ Chức năng: Xóa bot và toàn bộ data

---
➤ 🟢 Bật Bot:
『${prefix}mybot active』
• 📝 Cú pháp: ${prefix}mybot active @mention/index
• ⚙️ Chức năng: Khởi động bot đã tắt

---
➤ 🔴 Tắt Bot:
『${prefix}mybot shutdown』
• 📝 Cú pháp: ${prefix}mybot shutdown @mention/index
• ⚙️ Chức năng: Dừng bot (không xóa data)

---
➤ 🔄 Khởi động lại Bot:
『${prefix}mybot restart』
• 📝 Cú pháp: ${prefix}mybot restart @mention/index
• ⚙️ Chức năng: Khởi động lại bot

---
➤ 📋 Thông tin Bot:
『${prefix}mybot info』
• 📝 Cú pháp: ${prefix}mybot info @mention/index

---
➤ 📊 Danh sách Bot:
『${prefix}mybot list』
• 📝 Hiển thị tất cả bot trong hệ thống
`;
}

export async function handleMyBotCommands(api, message) {
    const prefix = getGlobalPrefix();
    const content = removeMention(message);

    if (!content.includes(`${prefix}mybot`)) {
        return false;
    }

    const parts = content.split(/\s+/).filter(p => p.trim());

    if (parts.length < 2) {
        const helpMsg = getHelpMessage();
        await sendMessageComplete(api, message, helpMsg);
        return true;
    }

    const command = parts[1];

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
        case "active":
            await handleMyBotActive(api, message);
            return true;
        case "shutdown":
            await handleMyBotShutdown(api, message);
            return true;
        case "restart":
            await handleMyBotRestart(api, message);
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
