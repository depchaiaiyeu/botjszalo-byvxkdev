import fs from "fs";
import path from "path";
import { createCanvas } from 'canvas';
import { MessageType } from "zlbotdqt";
import { getGlobalPrefix } from '../service.js';
import { removeMention } from "../../utils/format-util.js";
import { readGroupSettings } from "../../utils/io-json.js";


const rankInfoPath = path.join(process.cwd(), "assets", "json-data", "rank-info.json");
const tempDirPath = path.join(process.cwd(), 'temp');

if (!fs.existsSync(tempDirPath)) {
    fs.mkdirSync(tempDirPath, { recursive: true });
}

function getTempFilePath() {
  const fileName = `rank_${Date.now()}.png`;
  return path.join(tempDirPath, fileName);
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.arcTo(x + width, y, x + width, y + radius, radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.arcTo(x + width, y + height, x + width - radius, y + height, radius);
  ctx.lineTo(x + radius, y + height);
  ctx.arcTo(x, y + height, x, y + height - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}

async function createRankImage(rankData, title, isToday, targetUser = null) {
  const CARD_WIDTH = 800;
  const ITEM_HEIGHT = 70;
  const HEADER_HEIGHT = 120;
  const PADDING = 20;

  const dataToRender = targetUser ? [targetUser] : rankData;
  const CANVAS_HEIGHT = HEADER_HEIGHT + dataToRender.length * ITEM_HEIGHT + PADDING * 2;
  
  const canvas = createCanvas(CARD_WIDTH, CANVAS_HEIGHT);
  const ctx = canvas.getContext('2d');
  
  ctx.fillStyle = '#1e1e2d'; 
  ctx.fillRect(0, 0, CARD_WIDTH, CANVAS_HEIGHT);
  
  ctx.fillStyle = '#ffcc00'; 
  ctx.font = 'bold 32px BeVietnamPro';
  ctx.textAlign = 'center';
  ctx.fillText(title, CARD_WIDTH / 2, PADDING + 40);

  ctx.strokeStyle = '#6a6a85';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PADDING, HEADER_HEIGHT - 10);
  ctx.lineTo(CARD_WIDTH - PADDING, HEADER_HEIGHT - 10);
  ctx.stroke();

  let currentY = HEADER_HEIGHT + PADDING;

  for (let i = 0; i < dataToRender.length; i++) {
    const user = dataToRender[i];
    const rank = i + 1; // Rank displayed in the image
    const count = isToday ? user.messageCountToday : user.Rank;
    const userName = user.UserName;

    const x = PADDING;
    const y = currentY;
    const width = CARD_WIDTH - PADDING * 2;
    const height = ITEM_HEIGHT - 10;
    const radius = 10;
    
    const gradient = ctx.createLinearGradient(0, y, CARD_WIDTH, y + height);
    if (rank === 1) {
        gradient.addColorStop(0, '#ffd700'); 
        gradient.addColorStop(1, '#ff8c00');
        ctx.fillStyle = gradient;
    } else if (rank === 2) {
        gradient.addColorStop(0, '#c0c0c0'); 
        gradient.addColorStop(1, '#708090');
        ctx.fillStyle = gradient;
    } else if (rank === 3) {
        gradient.addColorStop(0, '#cd7f32'); 
        gradient.addColorStop(1, '#a0522d');
        ctx.fillStyle = gradient;
    } else {
        ctx.fillStyle = i % 2 === 0 ? '#2a2a3a' : '#353545';
    }

    roundRect(ctx, x, y, width, height, radius);
    ctx.fill();

    ctx.fillStyle = rank <= 3 ? '#1e1e2d' : '#ffffff'; 
    ctx.font = 'bold 28px BeVietnamPro';
    ctx.textAlign = 'left';
    ctx.fillText(`#${rank}`, x + 20, y + height / 2 + 10);

    ctx.fillStyle = rank <= 3 ? '#1e1e2d' : '#ffffff';
    ctx.font = '26px BeVietnamPro';
    ctx.textAlign = 'left';
    ctx.fillText(userName, x + 80, y + height / 2 + 10);

    ctx.fillStyle = rank <= 3 ? '#1e1e2d' : '#78ff78'; 
    ctx.font = 'bold 28px BeVietnamPro';
    ctx.textAlign = 'right';
    ctx.fillText(`${count} tin nhắn`, x + width - 20, y + height / 2 + 10);

    currentY += ITEM_HEIGHT;
  }

  const filePath = getTempFilePath();
  const out = fs.createWriteStream(filePath);
  const stream = canvas.createPNGStream();
  
  return new Promise((resolve, reject) => {
    stream.pipe(out);
    out.on('finish', () => resolve(filePath));
    out.on('error', reject);
  });
}

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
    await api.sendMessage(
      { msg: "Chưa có dữ liệu topchat cho nhóm này.", quote: message },
      threadId,
      MessageType.GroupMessage
    );
    return;
  }

  let filePath = null;
  let responseMsg = ""; // Dùng cho trường hợp fallback

  try {
    if (targetUid) {
      const targetUser = groupUsers.find(user => user.UID === targetUid);
      if (!targetUser) {
        throw new Error(`Không tìm thấy dữ liệu topchat cho user: ${targetUid}`);
      }

      const currentDate = new Date();
      const formattedDate = `${currentDate.getDate()}/${currentDate.getMonth() + 1}/${currentDate.getFullYear()}`;
      let title = `🏆 Tổng số tin nhắn của ${targetName || targetUser.UserName} ${isToday ? `(ngày ${formattedDate})` : ''} 🏆`;
      
      filePath = await createRankImage([], title, isToday, targetUser); 

    } else {
      let rankData = [];
      let title = "";
      if (isToday) {
        const currentDate = new Date();
        const formattedDate = `${currentDate.getDate()}/${currentDate.getMonth() + 1}/${currentDate.getFullYear()}`;
        const currentDateString = currentDate.toISOString().split("T")[0];
        const todayUsers = groupUsers.filter((user) => user.lastMessageDate === currentDateString);
        if (todayUsers.length === 0) {
          throw new Error("Chưa có người dùng nào tương tác hôm nay.");
        }
        rankData = todayUsers.sort((a, b) => b.messageCountToday - a.messageCountToday).slice(0, 10);
        title = `🏆 Tổng số tin nhắn (ngày ${formattedDate}) 🏆`;
      } else {
        rankData = groupUsers.sort((a, b) => b.Rank - a.Rank).slice(0, 10);
        title = "🏆 Tổng số tin nhắn 🏆";
      }
      filePath = await createRankImage(rankData, title, isToday);
    }

    if (filePath) {
      await api.sendMessage(
        {
          attachments: [filePath],
        },
        threadId,
        message.type
      );
    } else {
        throw new Error("Không thể tạo ảnh bảng xếp hạng.");
    }
  } catch (error) {
    console.error("Lỗi khi tạo hoặc gửi hình ảnh topchat:", error);
    // Fallback sang tin nhắn văn bản khi có lỗi
    if (targetUid) {
        const targetUser = groupUsers.find(user => user.UID === targetUid);
        if (targetUser) {
            let count = 0;
            if (isToday) {
                const currentDateString = new Date().toISOString().split("T")[0];
                count = targetUser.lastMessageDate === currentDateString ? targetUser.messageCountToday : 0;
            } else {
                count = targetUser.Rank;
            }
            const userName = targetName || targetUser.UserName;
            responseMsg = `📊${isToday ? " Hôm nay" : " Tổng"} số tin nhắn mà người dùng ${userName} đã nhắn là: ${count}`;
        } else {
            responseMsg = `Không tìm thấy dữ liệu topchat cho user: ${targetUid}`;
        }
    } else {
        // Tạo tin nhắn fallback cho top 10
        let rankDataFallback = [];
        if (isToday) {
            const currentDateString = new Date().toISOString().split("T")[0];
            rankDataFallback = groupUsers.filter((user) => user.lastMessageDate === currentDateString)
                                .sort((a, b) => b.messageCountToday - a.messageCountToday).slice(0, 10);
            responseMsg = "🏆 Bảng topchat hôm nay:\n\n";
        } else {
            rankDataFallback = groupUsers.sort((a, b) => b.Rank - a.Rank).slice(0, 10);
            responseMsg = "🏆 Bảng topchat:\n\n";
        }

        if (rankDataFallback.length === 0) {
            responseMsg = isToday ? "Chưa có người dùng nào tương tác hôm nay." : "Chưa có dữ liệu topchat cho nhóm này.";
        } else {
            rankDataFallback.forEach((user, index) => {
                const count = isToday ? user.messageCountToday : user.Rank;
                responseMsg += `${index + 1}. ${user.UserName}: ${count} tin nhắn\n`;
            });
            if (!isToday) {
                responseMsg += `\nDùng ${prefix}${aliasCommand} today để xem topchat hàng ngày.`;
            }
        }
    }
    await api.sendMessage({ msg: responseMsg, quote: message, ttl: 600000 }, threadId, MessageType.GroupMessage);
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
