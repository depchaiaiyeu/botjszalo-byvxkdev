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

async function processLoveCommand(api, message, commandType, titleText) {
  const { threadId, type, data } = message;
  const senderId = data.uidFrom;
  const tempDir = path.join(process.cwd(), 'temp');

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  try {
    const mentions = data.mentions;
    
    if (!mentions || mentions.length === 0) {
      await sendMessageWarning(api, message, '🚫 Cần phải tag ít nhất 1 người để xem tình duyên!');
      return;
    }

    let uid1, uid2;
    
    if (mentions.length === 1) {
      uid1 = senderId;
      uid2 = mentions[0].uid;
    } else {
      uid1 = mentions[0].uid;
      uid2 = mentions[1].uid;
    }

    const [info1, info2] = await Promise.all([
      api.getUserInfo(uid1),
      api.getUserInfo(uid2)
    ]);

    const user1 = info1.changed_profiles?.[uid1] || info1.unchanged_profiles?.[uid1];
    const user2 = info2.changed_profiles?.[uid2] || info2.unchanged_profiles?.[uid2];

    if (!user1 || !user2) {
      await sendMessageWarning(api, message, '🚫 Không thể lấy thông tin người dùng. Vui lòng thử lại!');
      return;
    }

    const name1 = user1.zaloName || user1.displayName || "Unknown";
    const name2 = user2.zaloName || user2.displayName || "Unknown";

    const avatarPath1 = path.join(tempDir, `love_${uid1}.jpg`);
    const avatarPath2 = path.join(tempDir, `love_${uid2}.jpg`);
    
    await Promise.all([
      downloadImage(user1.avatar, avatarPath1),
      downloadImage(user2.avatar, avatarPath2)
    ]);

    const matchRate = getRandomMatchRate();

    const resultImagePath = path.join(tempDir, `love_result_${Date.now()}.png`);
    const imageBuffer = await createLoveMatchImage(avatarPath1, avatarPath2, name1, name2, matchRate, titleText);
    await fs.promises.writeFile(resultImagePath, imageBuffer);

    const fileReady = await ensureFileReady(resultImagePath, 6, 150);
    if (!fileReady) {
      await sendMessageWarning(api, message, '🚫 Không thể tạo ảnh kết quả. Vui lòng thử lại sau!');
      return;
    }

    let emoji = '';
    if (matchRate >= 80) emoji = '💖 YÊU LUÔN!';
    else if (matchRate >= 60) emoji = '💕 RẤT PHÙ HỢP!';
    else if (matchRate >= 40) emoji = '💗 PHÙ HỢP!';
    else if (matchRate >= 20) emoji = '💓 CÓ THỂ THỬ!';
    else emoji = '💔 KHÔNG PHÙ HỢP...';

    await api.sendMessage(
      {
        attachments: [resultImagePath],
        ttl: 86400000
      },
      threadId,
      type
    );

    await Promise.all([
      fs.promises.unlink(avatarPath1).catch(() => {}),
      fs.promises.unlink(avatarPath2).catch(() => {}),
      fs.promises.unlink(resultImagePath).catch(() => {})
    ]);

  } catch (error) {
    console.error(`Lỗi khi xử lý lệnh ${commandType}:`, error);
    await sendMessageWarning(api, message, '🚫 Đã xảy ra lỗi khi xử lý yêu cầu. Vui lòng thử lại!');
  }
}

export async function duyenphan(api, message) {
  await processLoveCommand(api, message, 'duyenphan', '💕 Kết Quả Bói Duyên Phận 💕');
}

export async function tuonglai(api, message) {
  await processLoveCommand(api, message, 'tuonglai', '🔮 Kết Quả Bói Tương Lai 🔮');
}

export async function tamdauyhop(api, message) {
  await processLoveCommand(api, message, 'tamdauyhop', '💖 Kết Quả Bói Tâm Đầu Ý Hợp 💖');
}
