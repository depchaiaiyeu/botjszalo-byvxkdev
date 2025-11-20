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
    const multipliers = { 'h': 3600000, 'p': 60000, 'm': 60000, 'd': 86400000 };
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
        return new Map();
    }
}

function formatPm2Status(status, isRunningInConfig) {
    if (!status) {
        if (isRunningInConfig) return "🟡 Đang khởi động lại...";
        return "⚪ Chưa chạy";
    }
    switch (status) {
        case 'online': return '✅ Đang chạy';
        case 'stopping': return '⏳ Đang dừng...';
        case 'stopped': return '🚫 Đã dừng';
        case 'launching': return '🚀 Đang khởi động...';
        case 'errored': return '❌ Lỗi (Crash)';
        default: return `❓ ${status}`;
    }
}

async function ensureDirectories() {
    const dirs = [paths.myBotDataDir, paths.myBotDataFolder, paths.myBotJsonDataFolder, paths.tempDir, paths.cacheDir];
    for (const dir of dirs) {
        try { await fs.mkdir(dir, { recursive: true }); } catch (e) {}
    }
}

async function getBotDataPath(botId) {
    return path.resolve("./mybot", `${botId}.json`);
}

async function getBotConfig(botId) {
    const botPath = await getBotDataPath(botId);
    try {
        const data = await fs.readFile(botPath, "utf-8");
        return JSON.parse(data);
    } catch (error) {
        return null;
    }
}

async function saveBotConfig(botId, config) {
    const botPath = await getBotDataPath(botId);
    await fs.writeFile(botPath, JSON.stringify(config, null, 2));
}

async function createGroupSettingsFile(botId) {
    try { await fs.writeFile(path.resolve(paths.myBotDataFolder, `group_settings_${botId}.json`), JSON.stringify({}, null, 2)); } catch (e) {}
}

async function createAdminListFile(botId, adminId = null) {
    try { await fs.writeFile(path.resolve(paths.myBotDataFolder, `list_admin_${botId}.json`), JSON.stringify(adminId ? [adminId.toString()] : [], null, 2)); } catch (e) {}
}

async function createWebConfigFile(botId) {
    try { await fs.writeFile(path.resolve(paths.myBotJsonDataFolder, `web-config_${botId}.json`), JSON.stringify({}, null, 2)); } catch (e) {}
}

async function createManagerBotFile(botId) {
    try { await fs.writeFile(path.resolve(paths.myBotJsonDataFolder, `manager-bot_${botId}.json`), JSON.stringify({}, null, 2)); } catch (e) {}
}

async function createProphylacticFile(botId) {
    const defaultProphylactic = { prophylacticUploadAttachment: { enable: false, lastBlocked: "", numRequestZalo: 0 } };
    try { await fs.writeFile(path.resolve(paths.myBotJsonDataFolder, `prophylactic_${botId}.json`), JSON.stringify(defaultProphylactic, null, 2)); } catch (e) {}
}

async function createConfigFile(botId) {
    try { await fs.writeFile(path.resolve(paths.myBotDataFolder, `config_${botId}.json`), JSON.stringify({}, null, 2)); } catch (e) {}
}

async function createLogFiles(botId) {
    const logBotDir = path.resolve(paths.logsDir, botId);
    try {
        await fs.mkdir(logBotDir, { recursive: true });
        await fs.mkdir(path.resolve(paths.resourcesDir, botId), { recursive: true });
        await fs.mkdir(path.resolve(paths.tempDir, botId), { recursive: true });
        await fs.writeFile(path.resolve(logBotDir, "message.txt"), "", "utf-8");
        await fs.writeFile(path.resolve(logBotDir, "message.json"), "{}", "utf-8");
        await fs.writeFile(path.resolve(logBotDir, "bot-manager.log"), "", "utf-8");
    } catch (e) {}
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
    let lineCount = 0;
    const maxLines = 30;
    
    const killStream = () => { try { logStream.kill(); } catch (e) {} };
    const timeout = setTimeout(killStream, 10000);

    logStream.stdout.on('data', (data) => {
        const lines = data.toString().split('\n');
        for (const line of lines) {
            if (line.trim() && lineCount < maxLines) {
                process.stdout.write(`[ Logs • ${botName} ] ${line}\n`);
                lineCount++;
            }
        }
        if (lineCount >= maxLines) { clearTimeout(timeout); killStream(); }
    });
}

async function handleMyBotCreate(api, message) {
    const mentions = message.data.mentions;
    const content = removeMention(message);
    const parts = content.split(/\s+/).filter(p => p.trim());

    if (!mentions || mentions.length === 0) {
        await sendMessageQuery(api, message, "Vui lòng @mention người dùng để tạo bot");
        return;
    }

    const mention = mentions[0];
    const botId = mention.uid;
    const botName = message.data.content.substring(mention.pos, mention.pos + mention.len).replace("@", "");
    let cookie, imei;

    if (parts.includes("qrlogin")) {
        try {
            await sendMessageComplete(api, message, "Đang khởi tạo QR...");
            await ensureDirectories();
            let session = await initSession();
            if (!session) throw new Error("Lỗi session");
            session = await verifyClient(session);
            if (!session) throw new Error("Lỗi verify client");
            
            const [code, updatedSession] = await generateQRCode(session);
            session = updatedSession;
            if (!code) throw new Error("Lỗi tạo QR");

            const qrImagePath = path.resolve(paths.cacheDir, "qr_code.png");
            await api.sendMessage({
                msg: `Quét mã để đăng nhập (Bot ID: ${botId})`,
                attachments: [qrImagePath],
                ttl: 86400000
            }, message.threadId, message.type);

            const scanResult = await waitingScan(code, session);
            if (!scanResult) throw new Error("Timeout");
            const [resultData, rawCookies] = await waitingConfirm(code, session);
            if (!resultData || !rawCookies) throw new Error("Login thất bại");

            imei = resultData.imei;
            cookie = rawCookies.cookies; 
            await sendMessageComplete(api, message, "✅ Đăng nhập OK! Đang setup...");
        } catch (error) {
            await sendMessageWarning(api, message, `🚫 Lỗi QR: ${error.message}`);
            return;
        }
    } else {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return sendMessageWarning(api, message, "🚫 Sai cú pháp JSON");
        const cookieStr = jsonMatch[0];
        const imeiMatch = content.substring(content.lastIndexOf("}") + 1).trim().split(/\s+/);
        imei = imeiMatch[imeiMatch.length - 1];
        if (!imei) return sendMessageWarning(api, message, "🚫 Thiếu IMEI");
        try { cookie = JSON.parse(cookieStr); } catch (err) { return sendMessageWarning(api, message, "🚫 JSON lỗi"); }
    }

    try {
        const processName = `mybot-${botId}`;
        const indexPath = path.resolve("src/index.js");
        try { await execAsync(`pm2 delete ${processName}`); } catch (e) {}
        await initializeBotFiles(botId, imei, cookie, null, null);
        await execAsync(`pm2 start ${indexPath} --name "${processName}" --exp-backoff-restart-delay=100 -- ${botId}`);
        await sendMessageComplete(api, message, `✅ Đã tạo bot ${botName}`);
        streamLogs(processName, botId, botName);
    } catch (error) {
        await sendMessageWarning(api, message, `🚫 Lỗi tạo bot: ${error.message}`);
    }
}

async function listAllBots(api) {
    try {
        const files = await fs.readdir(paths.myBotDataDir);
        const bots = [];
        for (const file of files) {
            if (file.endsWith(".json") && !["defaultCommand.json", "mybots.json"].includes(file)) {
                const botId = file.replace(".json", "");
                if (isNaN(botId) || botId.length < 10) continue;
                const botConfig = await getBotConfig(botId);
                if (botConfig) {
                    let botName = botId;
                    if (api) {
                        try {
                            const userInfo = await getUserInfoData(api, botId);
                            if (userInfo && userInfo.name) botName = userInfo.name;
                        } catch (e) {}
                    }
                    bots.push({ uid: botId, name: botName, config: botConfig });
                }
            }
        }
        return bots;
    } catch (error) {
        return [];
    }
}

function getBotTarget(message, parts, botList) {
    let botId = null, botName = "Bot", mention = null;
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

    if (!botId) return sendMessageWarning(api, message, "Không tìm thấy bot");

    try {
        const botConfig = await getBotConfig(botId);
        if (!botConfig) return sendMessageWarning(api, message, `Bot ${botName} không tồn tại`);

        const pm2Map = await getPm2ProcessMap();
        const processName = `mybot-${botId}`;
        const pm2Info = pm2Map.get(processName);
        const realStatus = pm2Info ? pm2Info.status : 'stopped';
        
        const info = `📜 Info Bot: ${botName}\n`
                   + `📊 Status: ${formatPm2Status(realStatus, botConfig.isRunning)}\n`
                   + `⚙️ Config Run: ${botConfig.isRunning ? "ON" : "OFF"}\n`
                   + `💾 Process: ${processName}\n`
                   + `🎯 Hết hạn: ${formatRemainingTime(botConfig.expiresAt)}\n`
                   + `🌟 Tạo: ${new Date(botConfig.createdAt).toLocaleString("vi-VN")}`;

        await sendMessageComplete(api, message, info);
    } catch (error) {
        await sendMessageWarning(api, message, `Lỗi: ${error.message}`);
    }
}

async function handleMyBotList(api, message) {
    try {
        const bots = await listAllBots(api);
        const pm2Map = await getPm2ProcessMap();
        if (bots.length === 0) return sendMessageQuery(api, message, "Trống");

        let listInfo = "📜 Bot List:\n\n";
        for (let i = 0; i < bots.length; i++) {
            const bot = bots[i];
            const pm2Info = pm2Map.get(`mybot-${bot.uid}`);
            const realStatus = pm2Info ? pm2Info.status : 'stopped';
            listInfo += `${i + 1}. ${bot.name}\n📊 ${formatPm2Status(realStatus, bot.config.isRunning)} | 🎯 ${formatRemainingTime(bot.config.expiresAt)}\n\n`;
        }
        await sendMessageComplete(api, message, listInfo);
    } catch (error) {
        await sendMessageWarning(api, message, `Lỗi: ${error.message}`);
    }
}

async function handleMyBotAddTime(api, message) {
    const content = removeMention(message);
    const parts = content.split(/\s+/).filter(p => p.trim());
    if (parts.length < 3) return sendMessageQuery(api, message, "Sai cú pháp");
    
    const botList = await listAllBots(api);
    const { botId, botName, mention } = getBotTarget(message, parts, botList);
    if (!botId) return sendMessageWarning(api, message, "Không tìm thấy bot");

    const timeStr = mention ? parts[parts.length - 1] : parts[parts.length - 1];
    const timeMs = parseTimeToMs(timeStr);
    if (timeMs === null) return sendMessageWarning(api, message, "Format sai");

    try {
        const botConfig = await getBotConfig(botId);
        if (!botConfig) return sendMessageWarning(api, message, "Bot không tồn tại");

        if (timeMs === -1) {
            botConfig.expiresAt = -1;
        } else {
            const baseTime = (botConfig.expiresAt && botConfig.expiresAt > Date.now()) ? botConfig.expiresAt : Date.now();
            botConfig.expiresAt = baseTime + timeMs;
        }
        botConfig.isRunning = true; 
        await saveBotConfig(botId, botConfig);
        await sendMessageComplete(api, message, `✅ Đã thêm thời gian cho ${botName}\n👉 Hết hạn: ${botConfig.expiresAt === -1 ? "Vô hạn" : new Date(botConfig.expiresAt).toLocaleString("vi-VN")}`);
    } catch (error) {
        await sendMessageWarning(api, message, `Lỗi: ${error.message}`);
    }
}

async function deleteBotFiles(botId) {
    try {
        await fs.unlink(path.resolve(paths.myBotDataDir, `${botId}.json`));
        await fs.unlink(path.resolve(paths.myBotDataFolder, `group_settings_${botId}.json`));
        await fs.unlink(path.resolve(paths.myBotDataFolder, `list_admin_${botId}.json`));
        await fs.unlink(path.resolve(paths.myBotJsonDataFolder, `web-config_${botId}.json`));
        await fs.unlink(path.resolve(paths.myBotJsonDataFolder, `manager-bot_${botId}.json`));
        await fs.unlink(path.resolve(paths.myBotJsonDataFolder, `prophylactic_${botId}.json`));
        await fs.unlink(path.resolve(paths.myBotDataFolder, `config_${botId}.json`));
        await fs.rm(path.resolve(paths.logsDir, botId), { recursive: true, force: true });
        await fs.rm(path.resolve(paths.resourcesDir, botId), { recursive: true, force: true });
        await fs.rm(path.resolve(paths.tempDir, botId), { recursive: true, force: true });
    } catch (e) {}
}

async function handleMyBotDelete(api, message) {
    const content = removeMention(message);
    const parts = content.split(/\s+/).filter(p => p.trim());
    const botList = await listAllBots(api);
    const { botId, botName } = getBotTarget(message, parts, botList);

    if (!botId) return sendMessageQuery(api, message, "Chọn bot để xóa");

    try {
        try { await execAsync(`pm2 delete mybot-${botId}`); } catch (e) {}
        await deleteBotFiles(botId);
        await sendMessageComplete(api, message, `✅ Đã xóa bot ${botName}`);
    } catch (error) {
        await sendMessageWarning(api, message, `Lỗi: ${error.message}`);
    }
}

async function handleMyBotShutdown(api, message) {
    const content = removeMention(message);
    const parts = content.split(/\s+/).filter(p => p.trim());
    const botList = await listAllBots(api);
    const { botId, botName } = getBotTarget(message, parts, botList);

    if (!botId) return sendMessageQuery(api, message, "Chọn bot để tắt");

    try {
        const botConfig = await getBotConfig(botId);
        if (!botConfig) return sendMessageWarning(api, message, "Bot không tồn tại");

        await execAsync(`pm2 stop mybot-${botId}`);
        botConfig.isRunning = false;
        await saveBotConfig(botId, botConfig);
        await sendMessageComplete(api, message, `✅ Đã tắt bot ${botName}`);
    } catch (error) {
        await sendMessageWarning(api, message, `Lỗi: ${error.message}`);
    }
}

async function handleMyBotActive(api, message) {
    const content = removeMention(message);
    const parts = content.split(/\s+/).filter(p => p.trim());
    const botList = await listAllBots(api);
    const { botId, botName } = getBotTarget(message, parts, botList);

    if (!botId) return sendMessageQuery(api, message, "Chọn bot để bật");

    try {
        const botConfig = await getBotConfig(botId);
        if (!botConfig) return sendMessageWarning(api, message, "Bot không tồn tại");

        if (botConfig.expiresAt !== -1 && botConfig.expiresAt < Date.now()) {
            botConfig.isRunning = false;
            await saveBotConfig(botId, botConfig);
            return sendMessageWarning(api, message, "🚫 Bot đã hết hạn");
        }

        await execAsync(`pm2 start mybot-${botId}`);
        botConfig.isRunning = true;
        await saveBotConfig(botId, botConfig);
        await sendMessageComplete(api, message, `✅ Đã bật lại bot ${botName}`);
        streamLogs(`mybot-${botId}`, botId, botName);
    } catch (error) {
        await sendMessageWarning(api, message, `Lỗi: ${error.message}`);
    }
}

async function handleMyBotRestart(api, message) {
    const content = removeMention(message);
    const parts = content.split(/\s+/).filter(p => p.trim());
    const botList = await listAllBots(api);
    const { botId, botName } = getBotTarget(message, parts, botList);

    if (!botId) return sendMessageQuery(api, message, "Chọn bot để restart");

    try {
        const botConfig = await getBotConfig(botId);
        if (!botConfig) return sendMessageWarning(api, message, "Bot không tồn tại");

        if (botConfig.expiresAt !== -1 && botConfig.expiresAt < Date.now()) {
            botConfig.isRunning = false;
            await saveBotConfig(botId, botConfig);
            return sendMessageWarning(api, message, "🚫 Bot hết hạn");
        }

        await execAsync(`pm2 restart mybot-${botId}`);
        botConfig.isRunning = true;
        await saveBotConfig(botId, botConfig);
        await sendMessageComplete(api, message, `✅ Restarted bot ${botName}`);
        streamLogs(`mybot-${botId}`, botId, botName);
    } catch (error) {
        await sendMessageWarning(api, message, `Lỗi: ${error.message}`);
    }
}

async function autoBotMonitor() {
    try {
        const files = await fs.readdir(paths.myBotDataDir);
        const pm2Map = await getPm2ProcessMap();
        const indexPath = path.resolve("src/index.js");

        for (const file of files) {
            if (!file.endsWith(".json") || ["defaultCommand.json", "mybots.json"].includes(file)) continue;

            const botId = file.replace(".json", "");
            const botConfig = await getBotConfig(botId);
            if (!botConfig) continue;

            const processName = `mybot-${botId}`;
            const pm2Info = pm2Map.get(processName);
            const isPm2Online = pm2Info && (pm2Info.status === 'online' || pm2Info.status === 'launching');
            const isExpired = botConfig.expiresAt !== -1 && botConfig.expiresAt < Date.now();

            if (isExpired) {
                if (botConfig.isRunning || isPm2Online) {
                    await execAsync(`pm2 stop ${processName}`);
                    botConfig.isRunning = false;
                    await saveBotConfig(botId, botConfig);
                }
                continue;
            }

            if (botConfig.isRunning && !isPm2Online) {
                try {
                    await execAsync(`pm2 start ${indexPath} --name "${processName}" --exp-backoff-restart-delay=100 -- ${botId}`);
                } catch (e) {}
            }
        }
    } catch (error) {}
}

setInterval(autoBotMonitor, 20000);

function getHelpMessage() {
    const prefix = getGlobalPrefix();
    return `《 🤖 HỆ THỐNG QUẢN LÝ BOT - VXK BOT TEAM 🤖 》\n\n➤ 🆕 Tạo Bot:\n『${prefix}mybot create』\n• 📝 Cú pháp:\n1. ${prefix}mybot create @mention qrlogin\n2. ${prefix}mybot create @mention <cookie_json> <imei>\n\n➤ ➕ Gia hạn:\n『${prefix}mybot addtime』\n• 📝 Cú pháp: ${prefix}mybot addtime @mention/index <time>\n\n➤ 🗑️ Xóa Bot:\n『${prefix}mybot delete』\n\n➤ 🟢 Bật Bot:\n『${prefix}mybot active』\n\n➤ 🔴 Tắt Bot:\n『${prefix}mybot shutdown』\n\n➤ 🔄 Restart:\n『${prefix}mybot restart』\n\n➤ 📋 Info:\n『${prefix}mybot info』\n\n➤ 📊 List:\n『${prefix}mybot list』`;
}

export async function handleMyBotCommands(api, message) {
    const prefix = getGlobalPrefix();
    const content = removeMention(message);

    if (!content.includes(`${prefix}mybot`)) return false;

    const parts = content.split(/\s+/).filter(p => p.trim());

    if (parts.length < 2) {
        await sendMessageComplete(api, message, getHelpMessage());
        return true;
    }

    const command = parts[1];

    switch (command) {
        case "create": await handleMyBotCreate(api, message); return true;
        case "info": await handleMyBotInfo(api, message); return true;
        case "list": await handleMyBotList(api, message); return true;
        case "addtime": await handleMyBotAddTime(api, message); return true;
        case "delete": case "remove": await handleMyBotDelete(api, message); return true;
        case "active": await handleMyBotActive(api, message); return true;
        case "shutdown": await handleMyBotShutdown(api, message); return true;
        case "restart": await handleMyBotRestart(api, message); return true;
        default: await sendMessageComplete(api, message, getHelpMessage()); return true;
    }
}
