import { createCanvas } from 'canvas';
import fs from 'fs';
import path from 'path';
import * as cv from './index.js';

const tempDir = path.join(process.cwd(), "temp");

if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

export async function drawLeaderboardImage(topUsers, isToday, targetUser, currentUserUid, rankInfo) {
  const WIDTH = 800;
  const HEADER_HEIGHT_TOP = 160;
  const HEADER_HEIGHT_TABLE = 60;
  const ROW_HEIGHT = 70; 
  const FOOTER_HEIGHT = 70; 
  const PADDING = 40;

  const listLength = topUsers.length;

  let currentUsersRank = null; 
  let threadId = null; 
  let userInTop10 = false;

  if (currentUserUid) {
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
        
        userInTop10 = currentUsersRank.rank <= listLength;
    }
  }

  const totalRowsHeight = listLength * ROW_HEIGHT;
  const showFooter = !targetUser && currentUsersRank && !userInTop10 && currentUsersRank.rank > listLength;
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
  ctx.fillStyle = cv.getRandomGradient(ctx, WIDTH);
  ctx.font = 'bold 42px "BeVietnamPro", Arial';
  ctx.fillText(titleText, WIDTH / 2, 60);

  if (!targetUser) {
    ctx.font = 'bold 28px "BeVietnamPro"';
    ctx.fillStyle = cv.getRandomGradient(ctx, WIDTH);
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

      ctx.fillStyle = i % 2 === 0 ? 'rgba(30, 58, 76, 0.6)' : 'rgba(44, 77, 95, 0.6)';
      ctx.fillRect(PADDING, y, WIDTH - PADDING * 2, ROW_HEIGHT);
      
      if (isCurrentUser) {
        ctx.fillStyle = 'rgba(109, 40, 217, 0.7)';
        ctx.fillRect(PADDING, y, WIDTH - PADDING * 2, ROW_HEIGHT);
      }
      
      ctx.fillStyle = '#ffffff';
      
      ctx.font = 'bold 28px "BeVietnamPro"';
      ctx.textAlign = 'left';
      let rankText = '';
      if (rank === 1) rankText = '🥇';
      else if (rank === 2) rankText = '🥈';
      else if (rank === 3) rankText = '🥉';
      else rankText = `#${rank}`;
      ctx.fillText(rankText, PADDING + 10, y + ROW_HEIGHT / 2 + 10);
      
      ctx.font = '26px "BeVietnamPro"';
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

        ctx.font = 'bold 26px "BeVietnamPro"';
        ctx.textAlign = 'right';
        ctx.fillText(`${count}`, WIDTH - PADDING - 10, footerY + ROW_HEIGHT / 2 + 10);
    }
  }
  
  const imagePath = path.join(tempDir, `rank_image_${Date.now()}.png`);
  const buffer = canvas.toBuffer('image/png');
  await fs.promises.writeFile(imagePath, buffer);
  
  return imagePath;
}
