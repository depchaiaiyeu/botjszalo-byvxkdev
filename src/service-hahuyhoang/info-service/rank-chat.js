import '../../utils/canvas/register-fonts.js';
import fs from "fs/promises";
import path from "path";
import { createCanvas } from "canvas";
import { MessageType } from "zlbotdqt";
import { getGlobalPrefix } from '../service.js';
import { removeMention } from "../../utils/format-util.js";
import { readGroupSettings } from "../../utils/io-json.js";
import { sendMessageTag, sendMessageWarning } from '../chat-zalo/chat-style/chat-style.js';
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rankInfoPath = path.join(process.cwd(), "assets", "json-data", "rank-info.json");

function readRankInfo() {
  try {
    const data = JSON.parse(fs.readFileSync(rankInfoPath, "utf8"));
    if (!data) data = {};
    if (!data.groups) data.groups = {};
    return data;
  } catch (error) {
    console.error("Lỗi khi đọc file rank-info.json:", error);
    return { groups: {} };
  }
}

function writeRankInfo(data) {
  try {
    fs.writeFileSync(rankInfoPath, JSON.stringify(data, null, 2), "utf8");
  } catch (error) {
    console.error("Lỗi khi ghi file rank-info.json:", error);
  }
}

async function createRankImage(rankData, isToday) {
  const width = 800;
  const headerHeight = 100;
  const rowHeight = 60;
  const totalHeight = headerHeight + rankData.length * rowHeight + 40;

  const canvas = createCanvas(width, totalHeight);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#1a1a2e";
  ctx.fillRect(0, 0, width, totalHeight);

  ctx.fillStyle = "#16213e";
  ctx.fillRect(20, 20, width - 40, totalHeight - 40);

  const today = new Date();
  const dateStr = `${today.getDate().toString().padStart(2, '0')}/${(today.getMonth() + 1).toString().padStart(2, '0')}/${today.getFullYear()}`;
  const headerText = isToday ? `🏆 Tổng số tin nhắn ngày ${dateStr} 🏆` : "🏆 Tổng số tin nhắn 🏆";

  ctx.fillStyle = "#f39c12";
  ctx.font = "bold 32px BeVietnamPro";
  ctx.textAlign = "center";
  ctx.fillText(headerText, width / 2, 70);

  ctx.font = "24px BeVietnamPro";
  
  rankData.forEach((user, index) => {
    const y = headerHeight + index * rowHeight + 40;
    
    if (index % 2 === 0) {
      ctx.fillStyle = "#0f3460";
      ctx.fillRect(40, y, width - 80, rowHeight);
    }

    ctx.fillStyle = "#e94560";
    ctx.textAlign = "left";
    ctx.fillText(`#${index + 1}. ${user.UserName}`, 60, y + 38);

    ctx.fillStyle = "#00d9ff";
    ctx.textAlign = "right";
    ctx.fillText(`${user.messageCount} tin nhắn`, width - 60, y + 38);
  });

  const buffer = canvas.toBuffer("image/png");
  return buffer;
}

export function updateUserRank(groupId, userId, userName, nameGroup) {
  const rankInfo = readRankInfo();
  if (!rankInfo.groups[groupId]) {
    rankInfo.groups[groupId] = { users: [] };
  }
  if (rankInfo.groups[groupId].nameGroup !== nameGroup) {
    rankInfo.groups[groupId].nameGroup = nameGroup;
  }

  const currentDate = new Date().toISOString().split('T')[0];
  const userIndex = rankInfo.groups[groupId].users.findIndex((user) => user.UID === userId);

  rankInfo.groups[groupId].users.forEach((user) => {
    if (user.lastMessageDate !== currentDate) {
      user.messageCountToday = 0; 
    }
  });

  if (userIndex !== -1) {
    const user = rankInfo.groups[groupId].users[userIndex];
    user.messageCountToday++;
    user.lastMessageDate = currentDate;
    user.UserName = userName;
    user.Rank++;
  } else {
    rankInfo.groups[groupId].users.push({
      UserName: userName,
      UID: userId,
      Rank: 1,
      messageCountToday: 1,
      lastMessageDate: currentDate,
    });
  }

  writeRankInfo(rankInfo);
}

export async function handleRankCommand(api, message, aliasCommand) {
  const prefix = getGlobalPrefix();
  const content = removeMention(message);
  const args = content.replace(`${prefix}${aliasCommand}`, "").trim().split(/\s+/);
  const threadId = message.threadId;
  const uidFrom = message.data.uidFrom;

  let isToday = false;
  let targetUid = null;
  let targetName = "";

  if (args.length > 0 && args[0].toLowerCase() === "today") {
    isToday = true;
    if (args.length > 1 && args[1].toLowerCase() === "me") {
      targetUid = uidFrom;
    } else if (message.data.mentions && message.data.mentions.length > 0) {
      const mention = message.data.mentions[0];
      targetUid = mention.uid;
      targetName = message.data.content.substr(mention.pos, mention.len).replace("@", "").trim();
    }
  } else if (message.data.mentions && message.data.mentions.length > 0) {
    const mention = message.data.mentions[0];
    targetUid = mention.uid;
    targetName = message.data.content.substr(mention.pos, mention.len).replace("@", "").trim();
  }

  const rankInfo = readRankInfo();
  const groupUsers = rankInfo.groups[threadId]?.users || [];

  if (groupUsers.length === 0) {
    await sendMessageWarning(api, message, "Chưa có dữ liệu topchat cho nhóm này.", 60000);
    return;
  }

  if (targetUid) {
    const targetUser = groupUsers.find(user => user.UID === targetUid);
    if (!targetUser) {
      await sendMessageWarning(api, message, `Không tìm thấy dữ liệu topchat cho user: ${targetUid}`, 60000);
      return;
    }

    let count = 0;
    if (isToday) {
      const currentDate = new Date().toISOString().split("T")[0];
      count = targetUser.lastMessageDate === currentDate ? targetUser.messageCountToday : 0;
    } else {
      count = targetUser.Rank;
    }

    const userName = targetName || targetUser.UserName;
    
    try {
      const imageBuffer = await createRankImage([{ UserName: userName, messageCount: count }], isToday);
      const imagePath = path.resolve(process.cwd(), "assets", "temp", `rank_${Date.now()}.png`);
      await fs.writeFile(imagePath, imageBuffer);
      
      const caption = `🏆${isToday ? " Hôm nay" : " Tổng"} số tin nhắn mà người dùng ${userName} đã nhắn là: ${count}`;
      await sendMessageTag(api, message, {
        caption,
        imagePath
      }, 300000);

      try {
        await fs.unlink(imagePath);
      } catch (error) {}
    } catch (error) {
      console.error("Lỗi khi tạo hình ảnh topchat:", error);
      const responseMsg = `🏆${isToday ? " Hôm nay" : " Tổng"} số tin nhắn mà người dùng ${userName} đã nhắn là: ${count}`;
      await sendMessageWarning(api, message, responseMsg, 300000);
    }
  } else {
    let rankData = [];
    if (isToday) {
      const currentDate = new Date().toISOString().split("T")[0];
      const todayUsers = groupUsers.filter((user) => user.lastMessageDate === currentDate);
      if (todayUsers.length === 0) {
        await sendMessageWarning(api, message, "Chưa có người dùng nào tương tác hôm nay.", 60000);
        return;
      }
      rankData = todayUsers.sort((a, b) => b.messageCountToday - a.messageCountToday).slice(0, 10).map(user => ({
        UserName: user.UserName,
        messageCount: user.messageCountToday
      }));
    } else {
      rankData = groupUsers.sort((a, b) => b.Rank - a.Rank).slice(0, 10).map(user => ({
        UserName: user.UserName,
        messageCount: user.Rank
      }));
    }

    try {
      const imageBuffer = await createRankImage(rankData, isToday);
      const imagePath = path.resolve(process.cwd(), "assets", "temp", `rank_${Date.now()}.png`);
      await fs.writeFile(imagePath, imageBuffer);
      
      const caption = isToday ? "🏆 Bảng topchat hôm nay:\n\n" : "🏆 Bảng topchat:\n\n";
      await sendMessageTag(api, message, {
        caption,
        imagePath
      }, 300000);

      try {
        await fs.unlink(imagePath);
      } catch (error) {}
    } catch (error) {
      console.error("Lỗi khi tạo hình ảnh topchat:", error);
      let responseMsg = isToday ? "🏆 Bảng topchat hôm nay:\n\n" : "🏆 Bảng topchat:\n\n";
      rankData.forEach((user, index) => {
        responseMsg += `${index + 1}. ${user.UserName}: ${user.messageCount} tin nhắn\n`;
      });
      if (!isToday) {
        responseMsg += `\nDùng ${prefix}${aliasCommand} today để xem topchat hàng ngày.`;
      }
      await sendMessageWarning(api, message, responseMsg, 300000);
    }
  }
}

export async function initRankSystem() {
  const groupSettings = readGroupSettings();
  const rankInfo = readRankInfo();

  for (const [groupId, groupData] of Object.entries(groupSettings)) {
    if (!rankInfo.groups[groupId]) {
      rankInfo.groups[groupId] = { users: [] };
    }

    if (groupData["adminList"]) {
      for (const [userId, userName] of Object.entries(groupData["adminList"])) {
        const existingUser = rankInfo.groups[groupId].users.find((user) => user.UID === userId);
        if (!existingUser) {
          rankInfo.groups[groupId].users.push({
            UserName: userName,
            UID: userId,
            Rank: 0,
          });
        }
      }
    }
  }

  writeRankInfo(rankInfo);
}
