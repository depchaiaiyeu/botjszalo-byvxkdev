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
  const HEADER_HEIGHT_TOP = 130;
  const HEADER_HEIGHT_TABLE = 50;
  const ROW_HEIGHT = 60; 
  const FOOTER_HEIGHT = 80; 

  const listLength = topUsers.length;

  let currentUsersRank = null; 
  let threadId = null; 

  if (currentUserUid) {
    const rankInfo = readRankInfo();
    for (const [gId, gData] of Object.entries(rankInfo.groups)) {
      if (gData.users.some(u => u.UID === currentUserUid)) {
        threadId = gId;
        break;
      }
    }

    const groupUsers = rankInfo.groups[threadId]?.users || [];
    
    let sortedUsers = isToday 
        ? [...groupUsers].filter(u => u.lastMessageDate === new Date().toISOString().split("T")[0]).sort((a, b) => b.messageCountToday - a.messageCountToday)
        : [...groupUsers].sort((a, b) => b.Rank - a.Rank);
    
    const currentUserIndex = sortedUsers.findIndex(u => u.UID === currentUserUid);
    
    if (currentUserIndex !== -1) { 
        currentUsersRank = {
            user: sortedUsers[currentUserIndex],
            rank: currentUserIndex + 1,
            count: isToday ? sortedUsers[currentUserIndex].messageCountToday : sortedUsers[currentUserIndex].Rank
        };
    }
  }

  const totalRowsHeight = listLength * ROW_HEIGHT;
  const showFooter = !targetUser && currentUsersRank && currentUsersRank.rank > listLength;
  const totalHeight = HEADER_HEIGHT_TOP + (targetUser ? 0 : HEADER_HEIGHT_TABLE) + totalRowsHeight + (showFooter ? FOOTER_HEIGHT : 0) + (targetUser ? 0 : 20);

  const canvas = createCanvas(WIDTH, totalHeight);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, WIDTH, totalHeight);

  let titleText = targetUser 
    ? "🏆 THỐNG KÊ TƯƠNG TÁC 🏆" 
    : (isToday ? "🏆 BXH TƯƠNG TÁC HÔM NAY 🏆" : "🏆 BXH TƯƠNG TÁC 🏆");
    
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fefefe';
  ctx.font = 'bold 38px "BeVietnamPro", Arial';
  ctx.fillText(titleText, WIDTH / 2, 50);

  if (!targetUser) {
    ctx.font = '26px "BeVietnamPro"';
    ctx.fillStyle = '#facc15';
    ctx.fillText("Top 10 Mõm Thủ", WIDTH / 2, 95);
  }

  let currentY = HEADER_HEIGHT_TOP;

  if (targetUser) {
    for (let i = 0; i < listLength; i++) {
      const user = topUsers[i];
      const count = isToday ? (user.messageCountToday || 0) : (user.Rank || 0);
      const rank = user.Rank !== -1 ? user.Rank : "???";
      const y = currentY + i * (ROW_HEIGHT + 20);

      ctx.fillStyle = '#475569';
      ctx.fillRect(50, y, WIDTH - 100, ROW_HEIGHT + 20);

      ctx.fillStyle = '#fefefe';
      ctx.font = 'bold 30px "BeVietnamPro"';
      ctx.textAlign = 'center';
          
      let detailText = rank !== "???" 
          ? `#${rank} - ${user.UserName}: ${count} ${isToday ? "(Hôm nay)" : "(Tổng)"}`
          : `${user.UserName} (???)`;
          
      ctx.fillText(detailText, WIDTH / 2, y + ROW_HEIGHT / 2 + 10);
    }
    currentY += listLength * (ROW_HEIGHT + 20);
  } else {
    const HEADER_Y_TABLE = currentY + HEADER_HEIGHT_TABLE / 2;
    ctx.font = 'bold 22px "BeVietnamPro"';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'left';
    ctx.fillText('Hạng', 50, HEADER_Y_TABLE);
    ctx.textAlign = 'left';
    ctx.fillText('Tên', 180, HEADER_Y_TABLE);
    ctx.textAlign = 'right';
    ctx.fillText('Số Tin Nhắn', WIDTH - 50, HEADER_Y_TABLE);
    currentY += HEADER_HEIGHT_TABLE;

    for (let i = 0; i < listLength; i++) {
      const user = topUsers[i];
      const y = currentY + i * ROW_HEIGHT;
      const rank = i + 1;
      const count = isToday ? user.messageCountToday : user.Rank;
      const isCurrentUser = user.UID === currentUserUid;

      ctx.fillStyle = i % 2 === 0 ? '#2d3748' : '#334155';
      ctx.fillRect(0, y, WIDTH, ROW_HEIGHT);
      
      if (isCurrentUser) {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, y, WIDTH, ROW_HEIGHT);
      }
      
      ctx.fillStyle = '#fefefe';
      
      ctx.font = 'bold 24px "BeVietnamPro"';
      ctx.textAlign = 'left';
      ctx.fillText(`#${rank}`, 50, y + ROW_HEIGHT / 2 + 8);
      
      ctx.font = '24px "BeVietnamPro"';
      ctx.textAlign = 'left';
      ctx.fillText(user.UserName, 180, y + ROW_HEIGHT / 2 + 8);
      
      ctx.textAlign = 'right';
      ctx.fillText(`${count}`, WIDTH - 50, y + ROW_HEIGHT / 2 + 8);
    }
    
    currentY += totalRowsHeight;

    if (showFooter) {
        const user = currentUsersRank.user;
        const rank = currentUsersRank.rank;
        const count = currentUsersRank.count;
        const footerY = currentY + 10;
        
        ctx.fillStyle = '#6d28d9';
        ctx.fillRect(0, footerY, WIDTH, ROW_HEIGHT); 

        ctx.fillStyle = '#fefefe';
        ctx.font = 'bold 26px "BeVietnamPro"';
        ctx.textAlign = 'left';
        ctx.fillText(`Bạn: #${rank} - ${user.UserName}`, 50, footerY + ROW_HEIGHT / 2 + 8);

        ctx.textAlign = 'right';
        ctx.fillText(`${count}`, WIDTH - 50, footerY + ROW_HEIGHT / 2 + 8);
        currentY += ROW_HEIGHT;

        ctx.fillStyle = '#94a3b8';
        ctx.font = '18px "BeVietnamPro"';
        ctx.textAlign = 'center';
        ctx.fillText(`Bạn đang xếp hạng #${rank} - ${count} ${isToday ? "tin nhắn hôm nay" : "tổng tin nhắn"}`, WIDTH / 2, currentY + 15);
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
  let targetUids = [];

  if (args.length > 0 && args[0].toLowerCase() === "today") {
    isToday = true;
    if (args.length > 1 && args[1].toLowerCase() === "me") {
      targetUids.push(uidFrom);
    } else if (message.data.mentions && message.data.mentions.length > 0) {
      for (const mention of message.data.mentions) {
        targetUids.push(mention.uid);
      }
    } else if (args.length > 1) {
      targetUids.push(args[1]);
    }
  } else if (args.length > 0 && args[0].toLowerCase() === "me") {
    targetUids.push(uidFrom);
  } else if (message.data.mentions && message.data.mentions.length > 0) {
    for (const mention of message.data.mentions) {
      targetUids.push(mention.uid);
    }
  } else if (args.length > 0) {
    targetUids.push(args[0]);
  }

  const rankInfo = readRankInfo();
  const groupUsers = rankInfo.groups[threadId]?.users || [];

  if (groupUsers.length === 0) {
    await api.sendMessage(
      { msg: "Chưa có dữ liệu topchat cho nhóm này." },
      threadId,
      MessageType.GroupMessage
    );
    return;
  }

  let filePath = null;

  try {
    if (targetUids.length > 0) {
      const targetUsersData = [];
      
      for (const targetUid of targetUids) {
        let targetUser = groupUsers.find(user => user.UID === targetUid);
        
        if (!targetUser) {
          targetUser = {
            UserName: targetUid,
            UID: targetUid,
            Rank: 0,
            messageCountToday: 0,
            lastMessageDate: null
          };
        }
        
        let sortedUsers = isToday 
          ? [...groupUsers].filter(u => u.lastMessageDate === new Date().toISOString().split("T")[0]).sort((a, b) => b.messageCountToday - a.messageCountToday)
          : [...groupUsers].sort((a, b) => b.Rank - a.Rank);
        
        const rankIndex = sortedUsers.findIndex(u => u.UID === targetUid);
        const userWithRank = { ...targetUser, Rank: rankIndex !== -1 ? rankIndex + 1 : -1 }; 
        
        targetUsersData.push(userWithRank);
      }

      filePath = await drawLeaderboardImage(targetUsersData, isToday, true, uidFrom);

    } else {
      let usersToList;
      
      if (isToday) {
        const currentDate = new Date().toISOString().split("T")[0];
        usersToList = groupUsers.filter((user) => user.lastMessageDate === currentDate);
        
        if (usersToList.length === 0) {
          await api.sendMessage(
            { msg: "Chưa có người dùng nào tương tác hôm nay." },
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
          ttl: 600000 
        }, 
        threadId, 
        MessageType.GroupMessage
      );
    }

  } catch (error) {
    await api.sendMessage(
      { msg: "Đã xảy ra lỗi khi tạo ảnh topchat." },
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
