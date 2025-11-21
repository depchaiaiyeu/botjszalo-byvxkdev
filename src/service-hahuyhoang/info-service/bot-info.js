import os from "os";
import si from "systeminformation";
import disk from "diskusage";
import { readFileSync } from "fs";
import { join } from "path";
import { getBotId } from "../../index.js";
import { getUserInfoData } from "./user-info.js";
import { createBotInfoImage, clearImagePath } from "../../utils/canvas/index.js";

export async function getBotDetails(api, message) {
  const threadId = message.threadId;
  const uptime = getUptime();
  const memoryUsage = getMemoryUsage();
  const botVersion = getBotVersion();
  const botId = getBotId();

  const botInfo = await getUserInfoData(api, botId);

  const path = os.platform() === 'win32' ? 'C:' : '/';
  const [cpuData, diskData] = await Promise.all([
    si.currentLoad(),
    disk.check(path)
  ]);

  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedRam = ((totalMem - freeMem) / 1024 / 1024 / 1024).toFixed(1);
  const totalRam = (totalMem / 1024 / 1024 / 1024).toFixed(1);
  const freeRam = (freeMem / 1024 / 1024 / 1024).toFixed(1);

  const diskUsage = diskData ? `${((diskData.total - diskData.available) / 1024 / 1024 / 1024).toFixed(1)}GB `
    + `/`
    + ` ${(diskData.total / 1024 / 1024 / 1024).toFixed(1)}GB`
    + ` (Free ${(diskData.available / 1024 / 1024 / 1024).toFixed(1)}GB)` : "N/A";

  const botStats = {
    version: botVersion,
    os: getOsInfo(),
    memoryUsage,
    cpu: `${os.cpus().length} Cores - Utilization ${cpuData.currentLoad.toFixed(1)}% `,
    ram: `${usedRam} GB / ${totalRam} GB (Free ${freeRam} GB)`,
    cpuModel: os.cpus()[0].model,
    disk: diskUsage,
  };

  let imagePath = null;
  try {
    imagePath = await createBotInfoImage(botInfo, uptime, botStats);
    await api.sendMessage({ msg: "", attachments: [imagePath] }, threadId, message.type, 5000000);
  } catch (error) {
    console.error("Lỗi khi tạo hình ảnh thông tin bot:", error);
  } finally {
    if (imagePath) await clearImagePath(imagePath);
  }
}

function getOsInfo() {
  let typeOs = "Unknown";
  switch (os.type()) {
    case "Linux":
      typeOs = "Linux";
      break;
    case "Darwin":
      typeOs = "macOS";
      break;
    case "Windows_NT":
      typeOs = "Windows";
      break;
  }
  return `${typeOs} ${os.release()}`;
}

function getUptime() {
  const uptimeInSeconds = process.uptime();
  const days = Math.floor(uptimeInSeconds / 86400);
  const hours = Math.floor((uptimeInSeconds % 86400) / 3600);
  const minutes = Math.floor((uptimeInSeconds % 3600) / 60);
  const seconds = Math.floor(uptimeInSeconds % 60);

  return `${days} ngày, ${hours} giờ, ${minutes} phút, ${seconds} giây`;
}

function getMemoryUsage() {
  const usedMem = process.memoryUsage().heapUsed;
  return `${Math.round((usedMem / 1024 / 1024) * 100) / 100} MB`;
}

function getBotVersion() {
  try {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
    return packageJson.version || "Không xác định";
  } catch (error) {
    console.error("Lỗi khi đọc phiên bản bot:", error);
    return "Không xác định";
  }
}
