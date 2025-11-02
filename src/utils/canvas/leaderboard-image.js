import { createCanvas, loadImage } from 'canvas';
import fs from 'fs';
import path from 'path';
import * as cv from './index.js';
import { createHelpBackground } from './help.js';
import https from 'https';

const tempDir = path.join(process.cwd(), "temp");
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

const rankDir = path.join(process.cwd(), "assets", "ranks");
if (!fs.existsSync(rankDir)) fs.mkdirSync(rankDir, { recursive: true });

const rankImages = {
  'bronze': 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Elo_bronze.svg/200px-Elo_bronze.svg.png',
  'silver': 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/Elo_silver.svg/200px-Elo_silver.svg.png',
  'gold': 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8d/Elo_gold.svg/200px-Elo_gold.svg.png',
  'platinum': 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3b/Elo_platinum.svg/200px-Elo_platinum.svg.png',
  'diamond': 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ee/Elo_diamond.svg/200px-Elo_diamond.svg.png',
  'master': 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c0/Elo_master.svg/200px-Elo_master.svg.png',
  'grandmaster': 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b8/Elo_grandmaster.svg/200px-Elo_grandmaster.svg.png',
  'challenger': 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/02/Elo_challenger.svg/200px-Elo_challenger.svg.png'
};

async function downloadRankImage(url, filename) {
  const filepath = path.join(rankDir, filename);
  if (fs.existsSync(filepath)) {
    return filepath;
  }
  
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      const fileStream = fs.createWriteStream(filepath);
      response.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close();
        resolve(filepath);
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

function getRankByMessageCount(count) {
  if (count < 3) return { tier: 'Đồng', division: 'III', stars: 0, imageName: 'bronze' };
  if (count < 6) return { tier: 'Đồng', division: 'II', stars: 0, imageName: 'bronze' };
  if (count < 9) return { tier: 'Đồng', division: 'I', stars: 0, imageName: 'bronze' };
  if (count < 12) return { tier: 'Bạc', division: 'III', stars: 0, imageName: 'silver' };
  if (count < 15) return { tier: 'Bạc', division: 'II', stars: 0, imageName: 'silver' };
  if (count < 18) return { tier: 'Bạc', division: 'I', stars: 0, imageName: 'silver' };
  if (count < 23) return { tier: 'Vàng', division: 'III', stars: count - 18, imageName: 'gold' };
  if (count < 28) return { tier: 'Vàng', division: 'II', stars: count - 23, imageName: 'gold' };
  if (count < 33) return { tier: 'Vàng', division: 'I', stars: count - 28, imageName: 'gold' };
  if (count < 38) return { tier: 'Bạch Kim', division: '5', stars: count - 33, imageName: 'platinum' };
  if (count < 43) return { tier: 'Bạch Kim', division: '4', stars: count - 38, imageName: 'platinum' };
  if (count < 48) return { tier: 'Bạch Kim', division: '3', stars: count - 43, imageName: 'platinum' };
  if (count < 53) return { tier: 'Bạch Kim', division: '2', stars: count - 48, imageName: 'platinum' };
  if (count < 58) return { tier: 'Bạch Kim', division: '1', stars: count - 53, imageName: 'platinum' };
  if (count < 63) return { tier: 'Kim Cương', division: '5', stars: count - 58, imageName: 'diamond' };
  if (count < 68) return { tier: 'Kim Cương', division: '4', stars: count - 63, imageName: 'diamond' };
  if (count < 73) return { tier: 'Kim Cương', division: '3', stars: count - 68, imageName: 'diamond' };
  if (count < 78) return { tier: 'Kim Cương', division: '2', stars: count - 73, imageName: 'diamond' };
  if (count < 83) return { tier: 'Kim Cương', division: '1', stars: count - 78, imageName: 'diamond' };
  if (count < 88) return { tier: 'Tinh Anh', division: '5', stars: count - 83, imageName: 'master' };
  if (count < 93) return { tier: 'Tinh Anh', division: '4', stars: count - 88, imageName: 'master' };
  if (count < 98) return { tier: 'Tinh Anh', division: '3', stars: count - 93, imageName: 'master' };
  if (count < 103) return { tier: 'Tinh Anh', division: '2', stars: count - 98, imageName: 'master' };
  if (count < 108) return { tier: 'Tinh Anh', division: '1', stars: count - 103, imageName: 'master' };
  if (count < 118) return { tier: 'Cao Thủ', division: '', stars: count - 108, imageName: 'master' };
  
  const totalStars = Math.floor((count - 118) / 10);
  if (totalStars < 50) return { tier: 'Đại Cao Thủ', division: '', stars: totalStars, imageName: 'grandmaster' };
  if (totalStars < 100) return { tier: 'Chiến Tướng', division: '', stars: totalStars, imageName: 'grandmaster' };
  return { tier: 'Thách Đấu', division: '', stars: totalStars, imageName: 'challenger' };
}

function drawStars(ctx, x, y, count, maxStars) {
  const starSize = 28;
  const starSpacing = 35;
  const totalWidth = (maxStars - 1) * starSpacing;
  const startX = x - totalWidth / 2;
  
  for (let i = 0; i < maxStars; i++) {
    const starX = startX + i * starSpacing;
    if (i < count) {
      ctx.fillStyle = '#FFD700';
    } else {
      ctx.fillStyle = '#4a5568';
    }
    
    ctx.beginPath();
    for (let j = 0; j < 5; j++) {
      const angle = (j * 4 * Math.PI) / 5 - Math.PI / 2;
      const radius = j % 2 === 0 ? starSize / 2 : starSize / 4;
      const px = starX + Math.cos(angle) * radius;
      const py = y + Math.sin(angle) * radius;
      if (j === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }
}

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
    const rankData = getRankByMessageCount(count);
    
    const bgGradient = ctx.createLinearGradient(PADDING, currentY, WIDTH - PADDING, currentY + 220);
    bgGradient.addColorStop(0, 'rgba(90, 110, 235, 0.35)');
    bgGradient.addColorStop(1, 'rgba(167, 182, 255, 0.15)');
    ctx.fillStyle = bgGradient;
    drawRoundedRect(PADDING, currentY, WIDTH - PADDING * 2, 220, RADIUS);
    ctx.fill();
    
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 32px "BeVietnamPro"';
    ctx.textAlign = 'center';
    ctx.fillText(user.UserName, WIDTH / 2, currentY + 35);
    
    ctx.font = '24px "BeVietnamPro"';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`💬 ${count} tin nhắn ${isToday ? "trong hôm nay" : ""}`, WIDTH / 2, currentY + 70);
    
    try {
      const rankImagePath = await downloadRankImage(rankImages[rankData.imageName], `${rankData.imageName}.png`);
      const rankImage = await loadImage(rankImagePath);
      const imgSize = 70;
      ctx.drawImage(rankImage, WIDTH / 2 - imgSize / 2, currentY + 85, imgSize, imgSize);
    } catch (error) {
      console.log('Error loading rank image:', error);
    }
    
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 26px "BeVietnamPro"';
    const rankText = rankData.division ? `${rankData.tier} ${rankData.division}` : rankData.tier;
    ctx.fillText(rankText, WIDTH / 2, currentY + 175);
    
    if (rankData.stars > 0) {
      const maxStars = rankData.tier === 'Cao Thủ' ? 9 : (rankData.tier.includes('Cao Thủ') || rankData.tier === 'Chiến Tướng' || rankData.tier === 'Thách Đấu') ? 5 : 5;
      drawStars(ctx, WIDTH / 2, currentY + 195, Math.min(rankData.stars, maxStars), maxStars);
    }
    
    currentY += 220;
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
  const ROW_HEIGHT = 100;
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

  ctx.font = '20px "BeVietnamPro"';
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
  ctx.font = 'bold 22px "BeVietnamPro"';
  ctx.fillStyle = '#94a3b8';
  ctx.textAlign = 'left';
  ctx.fillText('Hạng', PADDING + 10, HEADER_Y_TABLE);
  ctx.fillText('Người Dùng', PADDING + 100, HEADER_Y_TABLE);
  ctx.textAlign = 'center';
  ctx.fillText('Rank', WIDTH - 150, HEADER_Y_TABLE);
  ctx.textAlign = 'right';
  ctx.fillText('Tin Nhắn', WIDTH - PADDING - 10, HEADER_Y_TABLE);
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
    const rankData = getRankByMessageCount(count);
    
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
    ctx.font = 'bold 26px "BeVietnamPro"';
    ctx.textAlign = 'left';
    let rankText = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
    ctx.fillText(rankText, PADDING + 10, y + 35);
    
    ctx.font = '24px "BeVietnamPro"';
    ctx.fillText(user.UserName, PADDING + 100, y + 35);
    
    try {
      const rankImagePath = await downloadRankImage(rankImages[rankData.imageName], `${rankData.imageName}.png`);
      const rankImage = await loadImage(rankImagePath);
      const imgSize = 50;
      ctx.drawImage(rankImage, WIDTH - 240, y + 10, imgSize, imgSize);
    } catch (error) {
      console.log('Error loading rank image:', error);
    }
    
    ctx.font = 'bold 18px "BeVietnamPro"';
    ctx.fillStyle = '#FFD700';
    ctx.textAlign = 'center';
    const rankLabelText = rankData.division ? `${rankData.tier} ${rankData.division}` : rankData.tier;
    ctx.fillText(rankLabelText, WIDTH - 215, y + 75);
    
    if (rankData.stars > 0) {
      const maxStars = rankData.tier === 'Cao Thủ' ? 9 : 5;
      const displayStars = Math.min(rankData.stars, maxStars);
      const starSize = 12;
      const starSpacing = 16;
      const totalWidth = (maxStars - 1) * starSpacing;
      const startX = WIDTH - 215 - totalWidth / 2;
      
      for (let j = 0; j < maxStars; j++) {
        const starX = startX + j * starSpacing;
        if (j < displayStars) {
          ctx.fillStyle = '#FFD700';
        } else {
          ctx.fillStyle = '#4a5568';
        }
        
        ctx.beginPath();
        for (let k = 0; k < 5; k++) {
          const angle = (k * 4 * Math.PI) / 5 - Math.PI / 2;
          const radius = k % 2 === 0 ? starSize / 2 : starSize / 4;
          const px = starX + Math.cos(angle) * radius;
          const py = y + 88 + Math.sin(angle) * radius;
          if (k === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
      }
    }
    
    ctx.font = 'bold 24px "BeVietnamPro"';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'right';
    ctx.fillText(`${count}`, WIDTH - PADDING - 10, y + ROW_HEIGHT / 2 + 10);
  }

  const imagePath = path.join(tempDir, `topchat_image_${Date.now()}.png`);
  const buffer = canvas.toBuffer('image/png');
  await fs.promises.writeFile(imagePath, buffer);
  return imagePath;
}
