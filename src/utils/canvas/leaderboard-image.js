import { createCanvas } from 'canvas';
import fs from 'fs';
import path from 'path';
import * as cv from './index.js';
import { createHelpBackground } from './help.js';

const tempDir = path.join(process.cwd(), "temp");
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

export async function drawLeaderboardImage(topUsers, isToday, targetUser, currentUserUid, rankInfo) {
  const WIDTH = 800;
  const HEADER_HEIGHT_TOP = 180;
  const HEADER_HEIGHT_TABLE = 60;
  const ROW_HEIGHT = 70;
  const FOOTER_HEIGHT = 70;
  const PADDING = 40;
  const RADIUS = 12;
  const GAP = 8;

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

  const totalRowsHeight = listLength * (ROW_HEIGHT + GAP);
  const showFooter = !targetUser && currentUsersRank && !userInTop10 && currentUsersRank.rank > listLength;
  const totalHeight = HEADER_HEIGHT_TOP + (targetUser ? 0 : HEADER_HEIGHT_TABLE) + totalRowsHeight + (showFooter ? FOOTER_HEIGHT : 0) + (targetUser ? 0 : 30) + 20;
  const canvas = createCanvas(WIDTH, totalHeight);
  const ctx = canvas.getContext('2d');
  createHelpBackground(ctx, WIDTH, totalHeight);

  const titleText = targetUser ? "🏆 THỐNG KÊ TƯƠNG TÁC 🏆" : (isToday ? "🏆 BXH TƯƠNG TÁC HÔM NAY 🏆" : "🏆 BXH TƯƠNG TÁC 🏆");
  ctx.textAlign = 'center';
  ctx.fillStyle = cv.getRandomGradient(ctx, WIDTH);
  ctx.font = 'bold 48px "BeVietnamPro", Arial';
  ctx.fillText(titleText, WIDTH / 2, 65);

  if (!targetUser) {
    ctx.font = 'bold 28px "BeVietnamPro"';
    ctx.fillStyle = cv.getRandomGradient(ctx, WIDTH);
    ctx.fillText("Top 10 Mõm Thủ", WIDTH / 2, 120);
  }

  let currentY = HEADER_HEIGHT_TOP;

  const drawRoundedRect = (x, y, w, h, r) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  };

  if (targetUser) {
    const user = topUsers[0];
    const count = isToday ? user.messageCountToday : user.Rank;
    const rank = user.Rank !== -1 ? user.Rank : "N/A";
    const bgGradient = ctx.createLinearGradient(PADDING, currentY, WIDTH - PADDING, currentY + ROW_HEIGHT + 30);
    bgGradient.addColorStop(0, 'rgba(90, 110, 235, 0.35)');
    bgGradient.addColorStop(1, 'rgba(167, 182, 255, 0.15)');
    ctx.fillStyle = bgGradient;
    drawRoundedRect(PADDING, currentY, WIDTH - PADDING * 2, ROW_HEIGHT + 30, RADIUS);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 32px "BeVietnamPro"';
    ctx.textAlign = 'center';
    const detailText = rank !== -1 ? `#${rank} - ${user.UserName}: ${count} ${isToday ? "(Hôm nay)" : "(Tổng)"}` : `${user.UserName}: ${count} ${isToday ? "(Hôm nay)" : "(Tổng)"}`;
    ctx.fillText(detailText, WIDTH / 2, currentY + (ROW_HEIGHT + 30) / 2 + 10);
    currentY += ROW_HEIGHT + 30;
  } else {
    const HEADER_Y_TABLE = currentY + HEADER_HEIGHT_TABLE / 2 + 5;
    ctx.font = 'bold 24px "BeVietnamPro"';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'left';
    ctx.fillText('Hạng', PADDING + 10, HEADER_Y_TABLE);
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
      const y = currentY + i * (ROW_HEIGHT + GAP);
      const rank = i + 1;
      const count = isToday ? user.messageCountToday : user.Rank;
      const isCurrentUser = user.UID === currentUserUid;
      const bgGradient = ctx.createLinearGradient(PADDING, y, WIDTH - PADDING, y + ROW_HEIGHT);
      if (rank === 1) {
        bgGradient.addColorStop(0, 'rgba(255, 215, 0, 0.4)');
        bgGradient.addColorStop(1, 'rgba(255, 240, 150, 0.25)');
      } else if (rank === 2) {
        bgGradient.addColorStop(0, 'rgba(192, 192, 192, 0.4)');
        bgGradient.addColorStop(1, 'rgba(230, 230, 230, 0.25)');
      } else if (rank === 3) {
        bgGradient.addColorStop(0, 'rgba(205, 127, 50, 0.4)');
        bgGradient.addColorStop(1, 'rgba(230, 160, 100, 0.25)');
      } else {
        if (i % 2 === 0) {
          bgGradient.addColorStop(0, 'rgba(90, 110, 235, 0.25)');
          bgGradient.addColorStop(1, 'rgba(167, 182, 255, 0.15)');
        } else {
          bgGradient.addColorStop(0, 'rgba(80, 100, 220, 0.25)');
          bgGradient.addColorStop(1, 'rgba(150, 170, 245, 0.15)');
        }
      }
      ctx.fillStyle = bgGradient;
      drawRoundedRect(PADDING, y, WIDTH - PADDING * 2, ROW_HEIGHT, RADIUS);
      ctx.fill();
      if (isCurrentUser) {
        ctx.fillStyle = 'rgba(109, 40, 217, 0.4)';
        drawRoundedRect(PADDING, y, WIDTH - PADDING * 2, ROW_HEIGHT, RADIUS);
        ctx.fill();
      }
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 28px "BeVietnamPro"';
      ctx.textAlign = 'left';
      let rankText = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
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
      drawRoundedRect(PADDING, footerY, WIDTH - PADDING * 2, ROW_HEIGHT, RADIUS);
      ctx.fill();
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

export async function drawTopChatImage(topUsers, lastMessageTime) {
  const WIDTH = 800;
  const HEADER_HEIGHT_TOP = 210;
  const HEADER_HEIGHT_TABLE = 60;
  const ROW_HEIGHT = 70;
  const PADDING = 40;
  const RADIUS = 12;
  const GAP = 8;

  const listLength = topUsers.length;
  const totalRowsHeight = listLength * (ROW_HEIGHT + GAP);
  const totalHeight = HEADER_HEIGHT_TOP + HEADER_HEIGHT_TABLE + totalRowsHeight + 20;
  const canvas = createCanvas(WIDTH, totalHeight);
  const ctx = canvas.getContext('2d');
  createHelpBackground(ctx, WIDTH, totalHeight);

  ctx.textAlign = 'center';
  ctx.fillStyle = cv.getRandomGradient(ctx, WIDTH);
  ctx.font = 'bold 48px "BeVietnamPro", Arial';
  ctx.fillText("🏆 THỐNG KÊ TƯƠNG TÁC 🏆", WIDTH / 2, 65);

  ctx.font = 'bold 28px "BeVietnamPro"';
  ctx.fillStyle = cv.getRandomGradient(ctx, WIDTH);
  ctx.fillText("Top 10 Mõm Thủ", WIDTH / 2, 120);

  ctx.font = '22px "BeVietnamPro"';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText(`Cập nhật: ${lastMessageTime}`, WIDTH / 2, 160);

  let currentY = HEADER_HEIGHT_TOP;

  const drawRoundedRect = (x, y, w, h, r) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  };

  const HEADER_Y_TABLE = currentY + HEADER_HEIGHT_TABLE / 2 + 5;
  ctx.font = 'bold 24px "BeVietnamPro"';
  ctx.fillStyle = '#94a3b8';
  ctx.textAlign = 'left';
  ctx.fillText('Hạng', PADDING + 10, HEADER_Y_TABLE);
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
    const y = currentY + i * (ROW_HEIGHT + GAP);
    const rank = i + 1;
    const count = user.messageCount;
    const bgGradient = ctx.createLinearGradient(PADDING, y, WIDTH - PADDING, y + ROW_HEIGHT);
    if (rank === 1) {
      bgGradient.addColorStop(0, 'rgba(255, 215, 0, 0.4)');
      bgGradient.addColorStop(1, 'rgba(255, 240, 150, 0.25)');
    } else if (rank === 2) {
      bgGradient.addColorStop(0, 'rgba(192, 192, 192, 0.4)');
      bgGradient.addColorStop(1, 'rgba(230, 230, 230, 0.25)');
    } else if (rank === 3) {
      bgGradient.addColorStop(0, 'rgba(205, 127, 50, 0.4)');
      bgGradient.addColorStop(1, 'rgba(230, 160, 100, 0.25)');
    } else {
      if (i % 2 === 0) {
        bgGradient.addColorStop(0, 'rgba(90, 110, 235, 0.25)');
        bgGradient.addColorStop(1, 'rgba(167, 182, 255, 0.15)');
      } else {
        bgGradient.addColorStop(0, 'rgba(80, 100, 220, 0.25)');
        bgGradient.addColorStop(1, 'rgba(150, 170, 245, 0.15)');
      }
    }
    ctx.fillStyle = bgGradient;
    drawRoundedRect(PADDING, y, WIDTH - PADDING * 2, ROW_HEIGHT, RADIUS);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px "BeVietnamPro"';
    ctx.textAlign = 'left';
    let rankText = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
    ctx.fillText(rankText, PADDING + 10, y + ROW_HEIGHT / 2 + 10);
    ctx.font = '26px "BeVietnamPro"';
    ctx.textAlign = 'left';
    ctx.fillText(user.UserName, PADDING + 130, y + ROW_HEIGHT / 2 + 10);
    ctx.font = 'bold 26px "BeVietnamPro"';
    ctx.textAlign = 'right';
    ctx.fillText(`${count}`, WIDTH - PADDING - 10, y + ROW_HEIGHT / 2 + 10);
  }

  const imagePath = path.join(tempDir, `topchat_image_${Date.now()}.png`);
  const buffer = canvas.toBuffer('image/png');
  await fs.promises.writeFile(imagePath, buffer);
  return imagePath;
}
