import axios from "axios";
import fs from "fs";
import path from "path";
import { createCanvas, loadImage } from "canvas";
import { MessageType } from "zlbotdqt";
import { sendMessageWarning } from "../chat-zalo/chat-style/chat-style.js";
import { getRandomGradient } from "../../utils/canvas/color.js";
import { createHelpBackground } from "../../utils/canvas/help.js";

const downloadImage = async (url, filePath) => {
  try {
    const response = await axios.get(url, { 
      responseType: 'arraybuffer',
      timeout: 10000 
    });
    await fs.promises.writeFile(filePath, response.data);
  } catch (error) {
    console.error("Lỗi tải ảnh:", error.message);
    throw error;
  }
};

const getRandomMatchRate = () => Math.floor(Math.random() * 100) + 1;

const getColorByRate = (rate) => {
  if (rate >= 80) return { bg: '#ff1744', text: '#ffffff', heart: '💖' };
  if (rate >= 60) return { bg: '#ff4081', text: '#ffffff', heart: '💕' };
  if (rate >= 40) return { bg: '#f48fb1', text: '#ffffff', heart: '💗' };
  if (rate >= 20) return { bg: '#f8bbd0', text: '#333333', heart: '💓' };
  return { bg: '#e1bee7', text: '#333333', heart: '💔' };
};

const toTitleCase = (str) => {
  return str.split(' ').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  ).join(' ');
};

const drawCircularAvatar = async (ctx, imagePath, x, y, radius) => {
  const img = await loadImage(imagePath);
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(img, x - radius, y - radius, radius * 2, radius * 2);
  ctx.restore();
  
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();
};

const createLoveMatchImage = async (avatarPath1, avatarPath2, name1, name2, rate, title) => {
  const width = 800;
  const height = 600;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const colors = getColorByRate(rate);

  createHelpBackground(ctx, width, height);

  const titleGradient = getRandomGradient(ctx, width);
  ctx.fillStyle = titleGradient;
  ctx.font = 'bold 38px BeVietnamPro, Arial';
  ctx.textAlign = 'center';
  ctx.fillText(toTitleCase(title), width / 2, 70);

  await drawCircularAvatar(ctx, avatarPath1, 200, 250, 100);
  await drawCircularAvatar(ctx, avatarPath2, 600, 250, 100);

  ctx.font = 'bold 26px BeVietnamPro, Arial';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText(name1.length > 15 ? name1.substring(0, 15) + '...' : name1, 200, 390);
  ctx.fillText(name2.length > 15 ? name2.substring(0, 15) + '...' : name2, 600, 390);

  ctx.font = '60px BeVietnamPro, Arial';
  ctx.fillText(colors.heart, width / 2, 270);

  const boxWidth = 400;
  const boxHeight = 100;
  const boxX = (width - boxWidth) / 2;
  const boxY = 460;

  ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
  ctx.shadowBlur = 15;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 5;

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 20);
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  ctx.fillStyle = colors.bg;
  ctx.font = 'bold 52px BeVietnamPro, Arial';
  ctx.textAlign = 'center';
  ctx.fillText(`${rate}%`, width / 2, boxY + 68);

  ctx.font = 'bold 22px BeVietnamPro, Arial';
  ctx.fillStyle = colors.bg;
  ctx.fillText('Mức Độ Phù Hợp', width / 2, boxY - 15);

  return canvas.toBuffer('image/png');
};

const ensureFileReady = async (filePath, maxRetries = 6, delayMs = 150) => {
  for (let i = 0; i < maxRetries; i++) {
    if (fs.existsSync(filePath)) {
      const stats = await fs.promises.stat(filePath);
      if (stats.size > 0) return true;
    }
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  return false;
};
