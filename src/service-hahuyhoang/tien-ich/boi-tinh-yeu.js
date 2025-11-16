import fetch from "node-fetch";
import { JSDOM } from "jsdom";
import axios from "axios";
import fs from "fs";
import path from "path";
import { createCanvas, loadImage } from "canvas";
import { MessageType } from "zlbotdqt";
import { sendMessageWarning } from "../chat-zalo/chat-style/chat-style.js";
import { getRandomGradient } from "../../utils/canvas/color.js";

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

const getRandomMatchRate = () => Math.floor(Math.random() * 101);

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

  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, colors.bg);
  gradient.addColorStop(1, '#c2185b');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  const titleGradient = getRandomGradient(ctx, width);
  ctx.fillStyle = titleGradient;
  ctx.font = 'bold 38px "Arial"';
  ctx.textAlign = 'center';
  ctx.fillText(toTitleCase(title), width / 2, 70);

  await drawCircularAvatar(ctx, avatarPath1, 200, 250, 100);
  await drawCircularAvatar(ctx, avatarPath2, 600, 250, 100);

  ctx.font = 'bold 26px "Arial"';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText(name1.length > 15 ? name1.substring(0, 15) + '...' : name1, 200, 390);
  ctx.fillText(name2.length > 15 ? name2.substring(0, 15) + '...' : name2, 600, 390);

  ctx.font = '60px "Arial"';
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
  ctx.font = 'bold 50px "Arial"';
  ctx.textAlign = 'center';
  ctx.fillText(`${rate}%`, width / 2, boxY + 68);

  ctx.font = 'bold 20px "Arial"';
  ctx.fillStyle = colors.bg;
  ctx.fillText('Mức Độ Phù Hợp', width / 2, boxY - 15);

  return canvas.toBuffer('image/png');
};

async function getFormBuildId() {
  const url = "https://vansu.net/boi-tinh-yeu-theo-ten.html";
  try {
    const response = await fetch(url, { 
      method: "GET", 
      headers: { 
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36" 
      } 
    });
    const html = await response.text();
    const dom = new JSDOM(html);
    const document = dom.window.document;
    const formBuildId = document.querySelector("input[name='form_build_id']").value;
    return formBuildId;
  } catch (error) {
    console.error("Lỗi khi lấy form_build_id:", error.message);
    throw new Error("Không thể lấy form_build_id");
  }
}

async function getBoiTinhYeuResult(kieuboi, tenNam, tenNu, formBuildId) {
  const url = "https://vansu.net/system/ajax";
  
  const payload = new URLSearchParams();
  payload.append("kieuboi", kieuboi);
  payload.append("nam", tenNam);
  payload.append("nu", tenNu);
  payload.append("form_build_id", formBuildId);
  payload.append("form_id", "chucnang_boi_tinh_yeu_form");
  payload.append("_triggering_element_name", "op");
  payload.append("_triggering_element_value", "Xem kết quả");

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36",
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json, text/javascript, */*; q=0.01",
      },
      body: payload,
    });

    const data = await response.json();
    const dataHtml = data[1].data;

    const lovePercentageMatch = dataHtml.match(/(\d+)%/);
    const lovePercentage = lovePercentageMatch ? lovePercentageMatch[1] : "Không xác định";

    const messageMatch = dataHtml.match(/<p>(.*?)<\/p>/);
    let messageText = messageMatch ? messageMatch[1] : "Không có lời giải thích";

    messageText = messageText.replace(/[.,]/g, (match) => match + "\n");

    return { lovePercentage, messageText };
  } catch (error) {
    console.error("Lỗi khi gửi yêu cầu bói tình yêu:", error.message);
    throw new Error("Lỗi khi gửi yêu cầu bói tình yêu");
  }
}

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

    const formBuildId = await getFormBuildId();
    const { lovePercentage, messageText } = await getBoiTinhYeuResult(commandType, name1, name2, formBuildId);

    const matchRate = parseInt(lovePercentage);

    const resultImagePath = path.join(tempDir, `love_result_${Date.now()}.png`);
    const imageBuffer = await createLoveMatchImage(avatarPath1, avatarPath2, name1, name2, matchRate, titleText);
    await fs.promises.writeFile(resultImagePath, imageBuffer);

    const fileReady = await ensureFileReady(resultImagePath, 6, 150);
    if (!fileReady) {
      await sendMessageWarning(api, message, '🚫 Không thể tạo ảnh kết quả. Vui lòng thử lại sau!');
      return;
    }

    let emoji = '';
    if (matchRate >= 80) emoji = '🔥 PERFECT MATCH!';
    else if (matchRate >= 60) emoji = '💕 RẤT PHÙ HỢP!';
    else if (matchRate >= 40) emoji = '💗 PHÙ HỢP!';
    else if (matchRate >= 20) emoji = '💓 CÓ THỂ THỬ!';
    else emoji = '💔 KHÔNG PHÙ HỢP...';

    const resultMessage = `${toTitleCase(titleText)}\n\n❤️ Tỷ lệ hợp: ${lovePercentage}%\n${emoji}\n\n💬 Lời giải thích:\n${messageText}`;

    await api.sendMessage(
      {
        msg: resultMessage,
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
  await processLoveCommand(api, message, 'duyenphan', '💕 KẾT QUẢ BÓI DUYÊN PHẬN 💕');
}

export async function tuonglai(api, message) {
  await processLoveCommand(api, message, 'tuonglai', '🔮 KẾT QUẢ BÓI TƯƠNG LAI 🔮');
}

export async function tamdauyhop(api, message) {
  await processLoveCommand(api, message, 'tamdauyhop', '💖 KẾT QUẢ BÓI TÂM ĐẦU Ý HỢP 💖');
}
