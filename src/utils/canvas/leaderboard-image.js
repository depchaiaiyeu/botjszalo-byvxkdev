import { createCanvas } from 'canvas';
import fs from 'fs';
import path from 'path';
import * as cv from './index.js';
import { createHelpBackground } from './help.js';

const tempDir = path.join(process.cwd(), "temp");
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

export async function drawRankingImage(options) {
  const {
    data,
    title,
    subtitle = '',
    columns = [],
    showUpdate = true,
    imageName = 'ranking'
  } = options;

  const WIDTH = 800;
  const HEADER_HEIGHT_TOP = subtitle ? 180 : 120;
  const HEADER_HEIGHT_TABLE = 60;
  const ROW_HEIGHT = 70;
  const PADDING = 40;
  const RADIUS = 12;
  const GAP = 8;
  const UPDATE_HEIGHT = showUpdate ? 30 : 0;

  const listLength = data.length;
  const totalRowsHeight = listLength * (ROW_HEIGHT + GAP);
  const totalHeight = HEADER_HEIGHT_TOP + HEADER_HEIGHT_TABLE + totalRowsHeight + 20 + UPDATE_HEIGHT;
  const currentTime = new Date().toLocaleString('vi-VN');
  const canvas = createCanvas(WIDTH, totalHeight);
  const ctx = canvas.getContext('2d');
  createHelpBackground(ctx, WIDTH, totalHeight);

  ctx.textAlign = 'center';
  ctx.fillStyle = cv.getRandomGradient(ctx, WIDTH);
  ctx.font = 'bold 45px "BeVietnamPro", Arial';
  ctx.fillText(title, WIDTH / 2, 65);

  if (subtitle) {
    ctx.font = 'bold 31px "BeVietnamPro"';
    ctx.fillStyle = cv.getRandomGradient(ctx, WIDTH);
    ctx.fillText(subtitle, WIDTH / 2, 120);
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

  const HEADER_Y_TABLE = currentY + HEADER_HEIGHT_TABLE / 2 + 5;
  ctx.font = 'bold 24px "BeVietnamPro"';
  ctx.fillStyle = '#94a3b8';

  columns.forEach((col, idx) => {
    ctx.textAlign = col.align || 'left';
    const xPos = col.x || (idx === 0 ? PADDING + 10 : idx === columns.length - 1 ? WIDTH - PADDING - 10 : PADDING + 130);
    ctx.fillText(col.label, xPos, HEADER_Y_TABLE);
  });

  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PADDING, currentY + HEADER_HEIGHT_TABLE - 5);
  ctx.lineTo(WIDTH - PADDING, currentY + HEADER_HEIGHT_TABLE - 5);
  ctx.stroke();
  currentY += HEADER_HEIGHT_TABLE;

  for (let i = 0; i < listLength; i++) {
    const item = data[i];
    const y = currentY + i * (ROW_HEIGHT + GAP);
    const rank = i + 1;

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

    columns.forEach((col, idx) => {
      ctx.font = col.bold ? 'bold 28px "BeVietnamPro"' : '26px "BeVietnamPro"';
      ctx.textAlign = col.align || 'left';
      const xPos = col.x || (idx === 0 ? PADDING + 10 : idx === columns.length - 1 ? WIDTH - PADDING - 10 : PADDING + 130);
      
      let value;
      if (col.key === 'rank') {
        value = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
      } else if (typeof col.key === 'function') {
        value = col.key(item, rank);
      } else {
        value = item[col.key];
      }
      
      ctx.fillText(String(value), xPos, y + ROW_HEIGHT / 2 + 10);
    });
  }

  currentY += totalRowsHeight + 10;

  if (showUpdate) {
    ctx.font = '22px "BeVietnamPro"';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'center';
    ctx.fillText(`Cập nhật: ${currentTime}`, WIDTH / 2, currentY + UPDATE_HEIGHT / 2);
  }

  const imagePath = path.join(tempDir, `${imageName}_${Date.now()}.png`);
  const buffer = canvas.toBuffer('image/png');
  await fs.promises.writeFile(imagePath, buffer);
  return imagePath;
}

export async function drawTopChatImage(topUsers, lastMessageTime, groupName, isToday) {
  return drawRankingImage({
    data: topUsers,
    title: isToday ? "🏆 BXH Tương Tác Hôm Nay 🏆" : "🏆 BXH Tương Tác 🏆",
    subtitle: groupName,
    columns: [
      { key: 'rank', label: 'Hạng', align: 'left', x: PADDING + 10, bold: true },
      { key: 'UserName', label: 'Người Dùng', align: 'left', x: PADDING + 130 },
      { key: 'messageCount', label: 'Số Tin Nhắn', align: 'right', x: WIDTH - PADDING - 10, bold: true }
    ],
    imageName: 'topchat'
  });
}
