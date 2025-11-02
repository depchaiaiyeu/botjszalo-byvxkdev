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
  const WIDTH = 800;
  const HEADER_HEIGHT_TOP = 160;
  const HEADER_HEIGHT_TABLE = 60;
  const ROW_HEIGHT = 70; 
  const FOOTER_HEIGHT = 70; 
  const PADDING = 40;

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
  const totalHeight = HEADER_HEIGHT_TOP + (targetUser ? 0 : HEADER_HEIGHT_TABLE) + totalRowsHeight + (showFooter ? FOOTER_HEIGHT : 0) + (targetUser ? 0 : 30) + 20;

  const canvas = createCanvas(WIDTH, totalHeight);
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createLinearGradient(0, 0, 0, totalHeight);
  gradient.addColorStop(0, '#0f172a');
  gradient.addColorStop(1, '#1e293b');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, totalHeight);

  let titleText = targetUser 
    ? "🏆 THỐNG KÊ TƯƠNG TÁC 🏆" 
    : (isToday ? "🏆 BXH TƯƠNG TÁC HÔM NAY 🏆" : "🏆 BXH TƯƠNG TÁC 🏆");
    
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 42px "BeVietnamPro", Arial';
  ctx.fillText(titleText, WIDTH / 2, 60);

  if (!targetUser) {
    ctx.font = 'bold 28px "BeVietnamPro"';
    const textGradient = ctx.createLinearGradient(0, 100, 0, 120);
    textGradient.addColorStop(0, '#fbbf24');
    textGradient.addColorStop(1, '#f59e0b');
    ctx.fillStyle = textGradient;
    ctx.fillText("Top 10 Mõm Thủ", WIDTH / 2, 110);
  }

  let currentY = HEADER_HEIGHT_TOP;

  if (targetUser) {
    const user = topUsers[0];
    const count = isToday ? user.messageCountToday : user.Rank;
    const rank = user.Rank !== -1 ? user.Rank : "N/A";

    ctx.fillStyle = 'rgba(71, 85, 105, 0.5)';
    ctx.fillRect(PADDING, currentY, WIDTH - PADDING * 2, ROW_HEIGHT + 30);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 32px "BeVietnamPro"';
    ctx.textAlign = 'center';
        
    let detailText = rank !== -1 
        ? `#${rank} - ${user.UserName}: ${count} ${isToday ? "(Hôm nay)" : "(Tổng)"}`
        : `${user.UserName}: ${count} ${isToday ? "(Hôm nay)" : "(Tổng)"}`;
        
    ctx.fillText(detailText, WIDTH / 2, currentY + (ROW_HEIGHT + 30) / 2 + 10);
    currentY += ROW_HEIGHT + 30;
  } else {
    const HEADER_Y_TABLE = currentY + HEADER_HEIGHT_TABLE / 2 + 5;
    ctx.font = 'bold 24px "BeVietnamPro"';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'left';
    ctx.fillText('Hạng', PADDING + 10, HEADER_Y_TABLE);
    ctx.textAlign = 'left';
    ctx.fillText('Người Dùng', PADDING + 130, HEADER_Y_TABLE);
    ctx.textAlign = 'right';
    ctx.fillText('Số Tin Nhắn', WIDTH - PADDING - 10, HEADER_Y_TABLE);
    
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(PADDING, currentY + HEADER_HEIGHT_TABLE - 5);
    ctx.lineTo(WIDTH - PADDING, currentY + HEADER_HEIGHT_TABLE - 5);
    ctx.stroke();
    
    currentY += HEADER_HEIGHT_TABLE;

    for (let i = 0; i < listLength; i++) {
      const user = topUsers[i];
      const y = currentY + i * ROW_HEIGHT;
      const rank = i + 1;
      const count = isToday ? user.messageCountToday : user.Rank;
      const isCurrentUser = user.UID === currentUserUid;

      if (rank === 1) {
        const goldGradient = ctx.createLinearGradient(PADDING, y, PADDING, y + ROW_HEIGHT);
        goldGradient.addColorStop(0, '#ffd700');
        goldGradient.addColorStop(1, '#ffed4e');
        ctx.fillStyle = goldGradient;
      } else if (rank === 2) {
        const silverGradient = ctx.createLinearGradient(PADDING, y, PADDING, y + ROW_HEIGHT);
        silverGradient.addColorStop(0, '#c0c0c0');
        silverGradient.addColorStop(1, '#e8e8e8');
        ctx.fillStyle = silverGradient;
      } else if (rank === 3) {
        const bronzeGradient = ctx.createLinearGradient(PADDING, y, PADDING, y + ROW_HEIGHT);
        bronzeGradient.addColorStop(0, '#cd7f32');
        bronzeGradient.addColorStop(1, '#e89b5f');
        ctx.fillStyle = bronzeGradient;
      } else {
        ctx.fillStyle = i % 2 === 0 ? 'rgba(30, 58, 76, 0.6)' : 'rgba(44, 77, 95, 0.6)';
      }
      
      ctx.fillRect(PADDING, y, WIDTH - PADDING * 2, ROW_HEIGHT);
      
      if (isCurrentUser && rank > 3) {
        ctx.fillStyle = 'rgba(109, 40, 217, 0.7)';
        ctx.fillRect(PADDING, y, WIDTH - PADDING * 2, ROW_HEIGHT);
      }
      
      if (rank <= 3) {
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 2;
      }
      
      ctx.fillStyle = rank <= 3 ? '#1a1a1a' : '#ffffff';
      
      ctx.font = 'bold 28px "BeVietnamPro"';
      ctx.textAlign = 'left';
      let rankText = '';
      if (rank === 1) rankText = '🥇';
      else if (rank === 2) rankText = '🥈';
      else if (rank === 3) rankText = '🥉';
      else rankText = `#${rank}`;
      ctx.fillText(rankText, PADDING + 10, y + ROW_HEIGHT / 2 + 10);
      
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      
      ctx.font = rank <= 3 ? 'bold 26px "BeVietnamPro"' : '26px "BeVietnamPro"';
      ctx.textAlign = 'left';
      ctx.fillText(user.UserName, PADDING + 130, y + ROW_HEIGHT / 2 + 10);
      
      ctx.font = 'bold 26px "BeVietnamPro"';
      ctx.textAlign = 'right';
      ctx.fillText(`${count}`, WIDTH - PADDING - 10, y + ROW_HEIGHT / 2 + 10);
    }
    
    currentY += totalRowsHeight;

    if (showFooter) {
        const user = currentUsersRank.user;
        const rank = currentUsersRank.rank;
        const count = currentUsersRank.count;
        const footerY = currentY + 15;
        
        const purpleGradient = ctx.createLinearGradient(PADDING, footerY, PADDING, footerY + ROW_HEIGHT);
        purpleGradient.addColorStop(0, '#7c3aed');
        purpleGradient.addColorStop(1, '#6d28d9');
        ctx.fillStyle = purpleGradient;
        ctx.fillRect(PADDING, footerY, WIDTH - PADDING * 2, ROW_HEIGHT); 

        ctx.fillStyle = '#ffffff';
        
        ctx.font = 'bold 26px "BeVietnamPro"';
        ctx.textAlign = 'left';
        ctx.fillText(`#${rank}`, PADDING + 10, footerY + ROW_HEIGHT / 2 + 10);
        
        ctx.font = '26px "BeVietnamPro"';
        ctx.textAlign = 'left';
        ctx.fillText(user.UserName, PADDING + 130, footerY + ROW_HEIGHT / 2 + 10);

        ctx.textAlign = 'right';
        ctx.fillText(`${count}`, WIDTH - PADDING - 10, footerY + ROW_HEIGHT / 2 + 10);
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
          { msg: `Người bạn mentions là bot, không thể xem topchat.`, quote: message },
          threadId,
          MessageType.GroupMessage
        );
        return;
      }
      
      let sortedUsers = isToday 
        ? [...groupUsers].filter(u => u.lastMessageDate === new Date().toISOString().split("T")[0]).sort((a, b) => b.messageCountToday - a.messageCountToday)
        : [...groupUsers].sort((a, b) => b.Rank - a.Rank);
      
      const rankIndex = sortedUsers.findIndex(u => u.UID === targetUid);
      const userWithRank = { ...targetUser, Rank: rankIndex !== -1 ? rankIndex + 1 : -1 }; 

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
