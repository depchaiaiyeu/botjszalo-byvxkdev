import os from "os";
import si from "systeminformation";
import disk from "diskusage";
import { readFileSync } from "fs";
import { join } from "path";
import { getBotId } from "../../index.js";
import { getNameServer } from "../../database/index.js";
import { getUserInfoData } from "./user-info.js";
import { createBotInfoImage, clearImagePath } from "../../utils/canvas/index.js";

export async function getBotDetails(api, message) {
  const threadId = message.threadId;
  const botId = getBotId();
  
  try {
    const botInfo = await getUserInfoData(api, botId);
    const botVersion = getBotVersion();
    const nameServer = await getNameServer();
    
    const rootPath = os.platform() === 'win32' ? 'C:' : '/';
    const [cpuData, diskData, memData, netStats, netInterfaces, processes] = await Promise.all([
      si.currentLoad(),
      disk.check(rootPath),
      si.mem(),
      si.networkStats(),
      si.networkInterfaces(),
      si.processes()
    ]);

    const uptimeBotSeconds = process.uptime();
    const uptimeBotString = formatUptimeOS(uptimeBotSeconds);

    const memUsed = process.memoryUsage().rss; 
    const totalMem = os.totalmem();
    const usedMemSystem = totalMem - os.freemem();
    
    const diskTotal = diskData.total;
    const diskFree = diskData.available;
    const diskUsed = diskTotal - diskFree;
    const diskPercent = (diskUsed / diskTotal) * 100;

    const defaultNet = netInterfaces.find(i => !i.internal && i.mac) || netInterfaces[0];
    const mainNetStats = netStats.find(i => i.iface === defaultNet.iface) || netStats[0];

    const osInfo = await si.osInfo();
    const osString = `(${os.type()}) ${osInfo.distro} ${osInfo.release}`;

    const ramPercent = (usedMemSystem / totalMem) * 100;

    const data = {
      botName: botInfo.name,
      nameServer: nameServer || "VXK Bot Team",
      avatar: botInfo.avatar,
      uptimeBot: uptimeBotString,
      memoryBot: `${(memUsed / 1024 / 1024).toFixed(2)} MB on ${(totalMem / 1024 / 1024).toFixed(2)} MB (Mem)`,
      botVersion: `${botVersion}`,
      
      osInfo: osString,
      uptimeOS: formatUptimeOS(os.uptime()), 
      cpuModel: os.cpus()[0].model,
      cpuUsage: `${os.cpus().length} Cores - Utilization ${cpuData.currentLoad.toFixed(1)}%`,
      processes: `${processes.all} Processes | ${processes.running} Running | ${processes.blocked} Blocked`,
      
      ramText: `${(usedMemSystem / 1024 / 1024 / 1024).toFixed(1)} GB / ${(totalMem / 1024 / 1024 / 1024).toFixed(1)} GB (Free ${(os.freemem() / 1024 / 1024 / 1024).toFixed(1)} GB)`,
      ramPercent: ramPercent,
      
      diskText: `${(diskUsed / 1024 / 1024 / 1024).toFixed(1)} GB / ${(diskTotal / 1024 / 1024 / 1024).toFixed(1)} GB (Free ${(diskFree / 1024 / 1024 / 1024).toFixed(1)} GB)`,
      diskPercent: diskPercent,

      netInterface: defaultNet.iface,
      netDriver: defaultNet.name || "Virtual Adapter",
      netProtocol: defaultNet.virtual ? "Giao Thức Mạng Ảo" : "IPv4/IPv6 Standard",
      netType: `${defaultNet.type} | ${defaultNet.operstate === 'up' ? 'Kết Nối' : 'Ngắt'}`,
      netTraffic: `${(mainNetStats.tx_bytes / 1024 / 1024 / 1024).toFixed(1)} GB (Sent) / ${(mainNetStats.rx_bytes / 1024 / 1024 / 1024).toFixed(1)} GB (Received)`
    };

    const imagePath = await createBotInfoImage(data);
    await api.sendMessage({ msg: "", attachments: [imagePath] }, threadId, message.type, 50000);
    
    if (imagePath) await clearImagePath(imagePath);

  } catch (error) {
    console.error("Lỗi getBotDetails:", error);
    await api.sendMessage("❌ Lỗi khi lấy thông tin bot.", threadId);
  }
}

function formatUptimeOS(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return `${days} ngày, ${hours} giờ, ${minutes} phút, ${secs} giây`;
}

function getBotVersion() {
  try {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
    return packageJson.version || "1.0.0";
  } catch {
    return "Unknown";
  }
}
