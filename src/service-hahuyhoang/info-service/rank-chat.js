import fs from "fs";
import path from "path";
import { MessageType, MessageMention } from "zlbotdqt";
import { getGlobalPrefix } from '../service.js';
import { removeMention } from "../../utils/format-util.js";
import { readGroupSettings } from "../../utils/io-json.js";
import { createCanvas } from 'canvas';

const rankInfoPath = path.join(process.cwd(), "assets", "json-data", "rank-info.json");
const tempDir = path.join(process.cwd(), "temp");

if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

function readRankInfo() {
  try {
    let data = JSON.parse(fs.readFileSync(rankInfoPath, "utf8"));
    if (!data) data = {};
    if (!data.groups) data.groups = {};
    return data;
  } catch (error) {
    return { groups: {} };
  }
}

function writeRankInfo(data) {
  try {
    fs.writeFileSync(rankInfoPath, JSON.stringify(data, null, 2), "utf8");
  } catch (error) {
    
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

async function drawLeaderboardImage(topUsers, isToday, targetUser, currentUserUid) {
  const WIDTH = 700;
  const HEADER_HEIGHT = 150;
  const ROW_HEIGHT = 50;
  const listLength = topUsers.length;
  const HEIGHT = HEADER_HEIGHT + (targetUser ? 100 : listLength * ROW_HEIGHT);

  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  let titleText = targetUser 
    ? "🏆 BXH Tương Tác Người Dùng 🏆" 
    : (isToday ? "🏆 BXH Tương Tác Hôm Nay 🏆" : "🏆 BXH Tương Tác 🏆");
    
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fefefe';
  ctx.font = '36px "BeVietnamPro", Arial';
  ctx.fillText(titleText, WIDTH / 2, 50);

  if (!targetUser) {
    ctx.font = '24px "BeVietnamPro"';
    ctx.fillStyle = '#facc15';
    ctx.fillText("Top 10 Chó Vương", WIDTH / 2, 90);
  }

  const listStart = targetUser ? HEADER_HEIGHT + 20 : HEADER_HEIGHT;

  if (!targetUser && listLength > 0) {
    const HEADER_Y = HEADER_HEIGHT - 30;
    ctx.font = 'bold 20px "BeVietnamPro"';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'left';
    ctx.fillText('Hạng', 50, HEADER_Y);
    ctx.textAlign = 'left';
    ctx.fillText('Tên', 180, HEADER_Y);
    ctx.textAlign = 'right';
    ctx.fillText('Tin Nhắn', WIDTH - 50, HEADER_Y);
  }
  
  if (targetUser) {
    const user = topUsers[0];
    const count = isToday ? user.messageCountToday : user.Rank;
    const rankIndex = topUsers.findIndex(u => u.UID === user.UID);
    const rank = rankIndex !== -1 ? rankIndex + 1 : "N/A";

    ctx.fillStyle = '#475569';
    ctx.fillRect(50, 150, WIDTH - 100, 70);
    
    ctx.fillStyle = '#fefefe';
    ctx.font = 'bold 28px "BeVietnamPro"';
    ctx.textAlign = 'center';
        
    let detailText = rank !== "N/A" 
        ? `#${rank}. ${user.UserName} - ${count} tin nhắn ${isToday ? "(Hôm nay)" : "(Tổng)"}`
        : `${user.UserName}: ${count} tin nhắn ${isToday ? "(Hôm nay)" : "(Tổng)"}`;
        
    ctx.fillText(detailText, WIDTH / 2, 195);
  } else {
    for (let i = 0; i < listLength; i++) {
      const user = topUsers[i];
      const y = listStart + i * ROW_HEIGHT + ROW_HEIGHT / 2;
      const rank = i + 1;
      const count = isToday ? user.messageCountToday : user.Rank;
      const isCurrentUser = user.UID === currentUserUid;

      if (isCurrentUser) {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, listStart + i * ROW_HEIGHT, WIDTH, ROW_HEIGHT);
      }
      
      ctx.fillStyle = '#fefefe';
      
      ctx.font = 'bold 24px "BeVietnamPro"';
      ctx.textAlign = 'left';
      ctx.fillText(`#${rank}.`, 50, y + 8);
      
      ctx.font = '24px "BeVietnamPro"';
      ctx.textAlign = 'left';
      ctx.fillText(user.UserName, 180, y + 8);
      
      ctx.textAlign = 'right';
      ctx.fillText(`${count} tin nhắn`, WIDTH - 50, y + 8);
    }
  }
  
  const imagePath = path.join(tempDir, `rank_image_${Date.now()}.png`);
  const buffer = canvas.toBuffer('image/png');
  await fs.promises.writeFile(imagePath, buffer);
  
  return imagePath;
}


export async function handleRankCommand(api, message, aliasCommand) {
  const content = removeMention(message);
  const prefix = getGlobalPrefix();
  const args = content.replace(`${prefix}${aliasCommand}`, "").trim().split(/\s+/);
  const threadId = message.threadId;
  const uidFrom = message.data.uidFrom;

  let isToday = false;
  let targetUid = null;

  if (args.length > 0 && args[0].toLowerCase() === "today") {
    isToday = true;
    if (args.length > 1 && args[1].toLowerCase() === "me") {
      targetUid = uidFrom;
    } else if (message.data.mentions && message.data.mentions.length > 0) {
      targetUid = message.data.mentions[0].uid;
    } else if (args.length > 1) {
      targetUid = args[1];
    }
  } else if (args.length > 0 && args[0].toLowerCase() === "me") {
    targetUid = uidFrom;
  } else if (message.data.mentions && message.data.mentions.length > 0) {
    targetUid = message.data.mentions[0].uid;
  } else if (args.length > 0) {
    targetUid = args[0];
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
  let targetUser = null;

  try {
    if (targetUid) {
      targetUser = groupUsers.find(user => user.UID === targetUid);
      
      if (!targetUser) {
        await api.sendMessage(
          { msg: `Không tìm thấy dữ liệu topchat cho user: ${targetUid}`, quote: message },
          threadId,
          MessageType.GroupMessage
        );
        return;
      }
      
      // Find the rank of the target user in the current list context (Today/Overall)
      let sortedUsers = isToday 
        ? [...groupUsers].filter(u => u.lastMessageDate === new Date().toISOString().split("T")[0]).sort((a, b) => b.messageCountToday - a.messageCountToday)
        : [...groupUsers].sort((a, b) => b.Rank - a.Rank);
      
      const rankIndex = sortedUsers.findIndex(u => u.UID === targetUid);
      const userWithRank = { ...targetUser, Rank: rankIndex !== -1 ? rankIndex + 1 : -1 }; // Pass a full user object

      filePath = await drawLeaderboardImage([userWithRank], isToday, targetUser, uidFrom);

    } else {
      let usersToList;
      
      if (isToday) {
        const currentDate = new Date().toISOString().split("T")[0];
        usersToList = groupUsers.filter((user) => user.lastMessageDate === currentDate);
        
        if (usersToList.length === 0) {
          await api.sendMessage(
            { msg: "Chưa có người dùng nào tương tác hôm nay.", quote: message },
            threadId,
            MessageType.GroupMessage
          );
          return;
        }
        
        usersToList.sort((a, b) => b.messageCountToday - a.messageCountToday);
        
      } else {
        usersToList = [...groupUsers];
        usersToList.sort((a, b) => b.Rank - a.Rank);
      }
      
      const top10Users = usersToList.slice(0, 10);
      
      filePath = await drawLeaderboardImage(top10Users, isToday, null, uidFrom);
    }
    
    if (filePath) {
      await api.sendMessage(
        { 
          msg: `🏆 BXH Tương Tác ${isToday ? "Hôm Nay" : "Tổng"}`, 
          attachments: [filePath], 
          quote: message, 
          ttl: 600000 
        }, 
        threadId, 
        MessageType.GroupMessage
      );
    }

  } catch (error) {
    await api.sendMessage(
      { msg: "Đã xảy ra lỗi khi tạo ảnh topchat.", quote: message },
      threadId,
      MessageType.GroupMessage
    );
  } finally {
    if (filePath) {
      await fs.promises.unlink(filePath).catch(() => {});
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
