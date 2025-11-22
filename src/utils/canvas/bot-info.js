import { createCanvas, loadImage, registerFont } from "canvas";
import fs from "fs";
import path from "path";
import * as cv from "./index.js";

function drawRoundedBox(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawProgressBar(ctx, x, y, width, height, percentage, color) {
  ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
  ctx.beginPath();
  if (ctx.roundRect) {
      ctx.roundRect(x, y, width, height, height / 2);
  } else {
      ctx.rect(x, y, width, height);
  }
  ctx.fill();

  if (percentage > 0) {
    const fillWidth = Math.max(height, (percentage / 100) * width);
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 15;
    ctx.beginPath();
    if (ctx.roundRect) {
        ctx.roundRect(x, y, fillWidth, height, height / 2);
    } else {
        ctx.rect(x, y, fillWidth, height);
    }
    ctx.fill();
    ctx.shadowBlur = 0; 
  }
}

export async function createBotInfoImage(botInfo, data) {
  const width = 1200;
  const height = 1550; 
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const bgGradient = ctx.createLinearGradient(0, 0, 0, height);
  bgGradient.addColorStop(0, "#051937"); 
  bgGradient.addColorStop(0.5, "#001f3f"); 
  bgGradient.addColorStop(1, "#001220"); 
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, width, height);

  const boxPadding = 40;
  const boxWidth = width - (boxPadding * 2);
  
  const valueColor = "#FFFFFF"; 

  const headerY = 40;
  const headerHeight = 380;
  
  ctx.save();
  drawRoundedBox(ctx, boxPadding, headerY, boxWidth, headerHeight, 30);
  ctx.fillStyle = "rgba(16, 28, 48, 0.7)"; 
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
  ctx.stroke();
  ctx.restore();

  ctx.textAlign = "center";
  ctx.font = "bold 50px BeVietnamPro";
  ctx.fillStyle = cv.getRandomGradient(ctx, width); 
  ctx.fillText("Tổng Quan - Overview", width / 2, headerY + 70);
  
  ctx.font = "bold 32px BeVietnamPro";
  ctx.fillStyle = "#E2E8F0";
  ctx.fillText(data.botName, width / 2, headerY + 120);

  if (data.avatar) {
    try {
      const avatarSize = 180;
      const avatarX = boxPadding + 50;
      const avatarY = headerY + 140;
      const avatar = await loadImage(data.avatar);
      
      ctx.save();
      ctx.beginPath();
      ctx.arc(avatarX + avatarSize/2, avatarY + avatarSize/2, avatarSize/2, 0, Math.PI*2);
      ctx.lineWidth = 4;
      ctx.strokeStyle = cv.getRandomGradient(ctx, width); 
      ctx.stroke();
      ctx.clip();
      ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
      ctx.restore();
    } catch (e) {}
  }

  const headerInfoX = 320; 
  let headerInfoY = headerY + 180;
  const headerLineH = 50;

  const headerFields = [
    { icon: "🔢", label: "Tên Đại Diện của Bot:", value: data.nameServer },
    { icon: "🕒", label: "Thời gian hoạt động:", value: data.uptimeBot },
    { icon: "💾", label: "Bộ nhớ bot sử dụng:", value: data.memoryBot },
    { icon: "🤖", label: "Phiên bản vận hành:", value: data.botVersion }
  ];

  ctx.textAlign = "left";
  headerFields.forEach(field => {
    ctx.font = "bold 28px BeVietnamPro";
    ctx.fillStyle = cv.getRandomGradient(ctx, width); 
    ctx.fillText(`${field.icon}  ${field.label}`, headerInfoX, headerInfoY);
    
    ctx.textAlign = "right";
    ctx.font = "bold 28px BeVietnamPro"; 
    ctx.fillStyle = valueColor;
    ctx.fillText(field.value, width - boxPadding - 40, headerInfoY);
    ctx.textAlign = "left";
    
    headerInfoY += headerLineH;
  });

  const perfY = headerY + headerHeight + 30;
  const perfHeight = 640; 

  ctx.save();
  drawRoundedBox(ctx, boxPadding, perfY, boxWidth, perfHeight, 30);
  ctx.fillStyle = "rgba(16, 28, 48, 0.7)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
  ctx.stroke();
  ctx.restore();

  ctx.textAlign = "center";
  ctx.font = "bold 42px BeVietnamPro";
  ctx.fillStyle = cv.getRandomGradient(ctx, width);
  ctx.fillText("Information & Performance", width / 2, perfY + 60);

  let infoY = perfY + 130;
  const infoLineH = 55;
  const leftLabelX = boxPadding + 40;
  
  const perfFields = [
    { label: "Operating System:", value: data.osInfo },
    { label: "Uptime OS:", value: data.uptimeOS },
    { label: "CPU Model:", value: data.cpuModel },
    { label: "CPU Usage:", value: data.cpuUsage },
    { label: "Processes:", value: data.processes },
  ];

  ctx.textAlign = "left";
  perfFields.forEach(f => {
    ctx.font = "bold 28px BeVietnamPro";
    ctx.fillStyle = cv.getRandomGradient(ctx, width);
    ctx.fillText(f.label, leftLabelX, infoY);
    
    ctx.textAlign = "right";
    ctx.font = "bold 28px BeVietnamPro";
    ctx.fillStyle = valueColor;
    ctx.fillText(f.value, width - boxPadding - 40, infoY);
    
    ctx.textAlign = "left";
    infoY += infoLineH;
  });

  infoY += 15;
  ctx.font = "bold 28px BeVietnamPro";
  ctx.fillStyle = cv.getRandomGradient(ctx, width);
  ctx.fillText("RAM Usage:", leftLabelX, infoY);
  
  ctx.textAlign = "right";
  ctx.fillStyle = valueColor;
  ctx.fillText(data.ramText, width - boxPadding - 40, infoY);
  
  // Thanh RAM dùng màu xanh dương
  drawProgressBar(ctx, leftLabelX, infoY + 20, boxWidth - 80, 20, data.ramPercent, "#63B3ED");

  infoY += 90;
  ctx.textAlign = "left";
  ctx.fillStyle = cv.getRandomGradient(ctx, width);
  ctx.fillText("Disk Usage:", leftLabelX, infoY);
  
  ctx.textAlign = "right";
  ctx.fillStyle = valueColor;
  ctx.fillText(data.diskText, width - boxPadding - 40, infoY);
  
  // Thanh Disk dùng màu xanh lá
  drawProgressBar(ctx, leftLabelX, infoY + 20, boxWidth - 80, 20, data.diskPercent, "#68D391");

  const netY = perfY + perfHeight + 30;
  const netHeight = 380;

  ctx.save();
  drawRoundedBox(ctx, boxPadding, netY, boxWidth, netHeight, 30);
  ctx.fillStyle = "rgba(16, 28, 48, 0.7)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
  ctx.stroke();
  ctx.restore();

  ctx.textAlign = "center";
  ctx.font = "bold 42px BeVietnamPro";
  ctx.fillStyle = cv.getRandomGradient(ctx, width); 
  ctx.fillText("Network Activity", width / 2, netY + 60);

  let netInfoY = netY + 130;
  const netFields = [
    { label: "Interface Name:", value: data.netInterface },
    { label: "Driver Name:", value: data.netDriver },
    { label: "Protocol Type:", value: data.netProtocol },
    { label: "Connect Type:", value: data.netType },
    { label: "Total Activity Traffic:", value: data.netTraffic },
  ];

  ctx.textAlign = "left";
  netFields.forEach(f => {
    ctx.font = "bold 28px BeVietnamPro";
    ctx.fillStyle = cv.getRandomGradient(ctx, width);
    ctx.fillText(f.label, leftLabelX, netInfoY);
    
    ctx.textAlign = "right";
    ctx.font = "bold 28px BeVietnamPro";
    ctx.fillStyle = valueColor;
    ctx.fillText(f.value, width - boxPadding - 40, netInfoY);
    
    ctx.textAlign = "left";
    netInfoY += 50;
  });

  const filePath = path.resolve(`./assets/temp/bot_info_${Date.now()}.png`);
  const out = fs.createWriteStream(filePath);
  const stream = canvas.createPNGStream();
  stream.pipe(out);
  return new Promise((resolve, reject) => {
    out.on("finish", () => resolve(filePath));
    out.on("error", reject);
  });
}
