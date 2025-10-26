import { createCanvas, loadImage } from "canvas";
import fs from "fs";
import path from "path";
import * as cv from "./index.js";
import fsPromises from "fs/promises";

function handleNameLong(name, maxChars = 30) {
  const lines = [];
  let currentLine = "";
  const words = name.split(" ");

  for (const word of words) {
    if ((currentLine + word).length <= maxChars) {
      currentLine += (currentLine ? " " : "") + word;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);

  return { lines, totalLines: lines.length };
}

function drawBox(ctx, x, y, w, h, title) {
  const boxGradient = ctx.createLinearGradient(x, y, x, y + h);
  boxGradient.addColorStop(0, "rgba(0, 0, 0, 0.55)");
  boxGradient.addColorStop(1, "rgba(0, 0, 0, 0.35)");
  ctx.fillStyle = boxGradient;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 16);
  ctx.fill();
  ctx.stroke();

  const titleGradient = ctx.createLinearGradient(x, y, x + w, y);
  titleGradient.addColorStop(0, "#4ECB71");
  titleGradient.addColorStop(1, "#1E90FF");
  ctx.fillStyle = titleGradient;
  ctx.font = "bold 36px BeVietnamPro";
  ctx.textAlign = "center";
  ctx.fillText(title, x + w / 2, y + 45);
}

function drawVerticalDivider(ctx, x, y, h) {
  ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y + 60);
  ctx.lineTo(x, y + h - 60);
  ctx.stroke();
}

function measureTextWidth(ctx, text, font) {
  ctx.font = font;
  return ctx.measureText(text).width;
}

export async function createGroupInfoImage(groupInfo, owner, onConfigs = [], offConfigs = []) {
  let width = 1400;
  let height = 0;

  const groupType = groupInfo.groupType
    ? groupInfo.groupType === 2
      ? "Cộng Đồng"
      : "Nhóm"
    : "Nhóm";

  const { lines: descLines } = handleNameLong(groupInfo.desc || "Không có mô tả", 40);

  const basicFields = [
    { label: "🔢 ID Nhóm:", value: groupInfo.groupId },
    { label: "👑 Trưởng Nhóm:", value: owner.name },
    { label: "👥 Số thành viên:", value: groupInfo.memberCount.toString() },
    { label: "🕰️ Ngày tạo:", value: groupInfo.createdTime },
    { label: "🏷️ Phân Loại:", value: groupType },
  ];

  const statusFields = [
    { label: "👮 Số quản trị viên:", value: (groupInfo.adminIds?.length || 0).toString() },
    { label: "🔐 Trạng thái:", value: groupInfo.setting ? "Hoạt động" : "Không hoạt động" },
  ];

  const descriptionFields = descLines.map((line, index) => ({
    label: index === 0 ? "📝 Mô tả:" : "",
    value: line
  }));

  const tempCanvas = createCanvas(1, 1);
  const tempCtx = tempCanvas.getContext("2d");

  let maxLeftWidth = 0;
  [basicFields, statusFields, descriptionFields].forEach(fields => {
    fields.forEach(f => {
      const textWidth = measureTextWidth(tempCtx, `${f.label} ${f.value}`, "bold 28px BeVietnamPro");
      maxLeftWidth = Math.max(maxLeftWidth, textWidth);
    });
  });

  const leftColumnWidth = Math.max(600, maxLeftWidth + 120);

  let maxConfigWidth = 0;
  let configItemsForMeasure = onConfigs.length > 0 && offConfigs.length > 0 ? [...onConfigs, ...offConfigs] : onConfigs.length > 0 ? onConfigs : offConfigs;
  configItemsForMeasure.forEach(line => {
    const textWidth = measureTextWidth(tempCtx, `${line}`, "bold 22px BeVietnamPro");
    maxConfigWidth = Math.max(maxConfigWidth, textWidth);
  });

  const rightColumnWidth = onConfigs.length > 0 || offConfigs.length > 0 
    ? (onConfigs.length > 0 && offConfigs.length > 0 
        ? Math.max(700, maxConfigWidth * 2 + 180) 
        : Math.max(500, maxConfigWidth + 120))
    : 0;

  width = rightColumnWidth > 0 ? leftColumnWidth + rightColumnWidth + 120 : leftColumnWidth + 120;

  const headerH = 220;
  const headerY = 30;
  const basicBoxHeight = basicFields.length * 50 + 100;
  const statusBoxHeight = statusFields.length * 50 + 100;
  const descBoxHeight = descriptionFields.length * 50 + 100;

  const maxConfigItems = onConfigs.length > 0 && offConfigs.length > 0 
    ? Math.max(onConfigs.length, offConfigs.length) 
    : onConfigs.length > 0 
      ? onConfigs.length 
      : offConfigs.length;
  const cfgBoxHeight = onConfigs.length > 0 || offConfigs.length > 0
    ? (onConfigs.length > 0 && offConfigs.length > 0 
        ? maxConfigItems * 45 + 150 
        : maxConfigItems * 50 + 150)
    : 0;

  const leftColumnHeight = basicBoxHeight + statusBoxHeight + descBoxHeight + 90;
  const rightColumnHeight = cfgBoxHeight > 0 ? cfgBoxHeight + 60 : 0;
  height = Math.max(headerY + headerH + 30 + leftColumnHeight, headerY + headerH + 30 + rightColumnHeight) + 90;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  if (groupInfo && cv.isValidUrl(groupInfo.avt)) {
    try {
      const avatar = await loadImage(groupInfo.avt);
      ctx.globalAlpha = 0.7;
      ctx.drawImage(avatar, 0, 0, width, height);
      ctx.globalAlpha = 1.0;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, 0, width, height);
    } catch {
      const bg = ctx.createLinearGradient(0, 0, 0, height);
      bg.addColorStop(0, "#0F2027");
      bg.addColorStop(0.5, "#203A43");
      bg.addColorStop(1, "#2C5364");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);
    }
  } else {
    const bg = ctx.createLinearGradient(0, 0, 0, height);
    bg.addColorStop(0, "#0F2027");
    bg.addColorStop(0.5, "#203A43");
    bg.addColorStop(1, "#2C5364");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);
  }

  const metallicGradient = ctx.createLinearGradient(0, 0, width, height);
  metallicGradient.addColorStop(0, "rgba(255,255,255,0.05)");
  metallicGradient.addColorStop(0.5, "rgba(255,255,255,0.1)");
  metallicGradient.addColorStop(1, "rgba(255,255,255,0.05)");
  ctx.fillStyle = metallicGradient;
  ctx.fillRect(0, 0, width, height);

  const boxGradient = ctx.createLinearGradient(60, headerY, 60, headerY + headerH);
  boxGradient.addColorStop(0, "rgba(0, 0, 0, 0.55)");
  boxGradient.addColorStop(1, "rgba(0, 0, 0, 0.35)");
  ctx.fillStyle = boxGradient;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(60, headerY, width - 120, headerH, 16);
  ctx.fill();
  ctx.stroke();

  if (groupInfo && cv.isValidUrl(groupInfo.avt)) {
    try {
      const avatar = await loadImage(groupInfo.avt);
      const size = 140;
      const cx = 150;
      const cy = headerY + headerH / 2;
      const grad = ctx.createLinearGradient(cx - size/2, cy - size/2, cx + size/2, cy + size/2);
      grad.addColorStop(0, "#4ECB71");
      grad.addColorStop(1, "#1E90FF");
      ctx.beginPath();
      ctx.arc(cx, cy, size/2 + 8, 0, Math.PI*2);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, size/2, 0, Math.PI*2, true);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(avatar, cx - size/2, cy - size/2, size, size);
      ctx.restore();
    } catch {}
  }

  ctx.textAlign = "left";
  ctx.fillStyle = cv.getRandomGradient ? cv.getRandomGradient(ctx, leftColumnWidth) : "#ffffff";
  ctx.font = "bold 48px BeVietnamPro";
  ctx.fillText(groupInfo.name, 300, headerY + 100);
  ctx.font = "bold 28px BeVietnamPro";
  ctx.fillStyle = cv.getRandomGradient ? cv.getRandomGradient(ctx, leftColumnWidth) : "#ffffff";
  ctx.fillText(`Tổng số thành viên: ${groupInfo.totalMember || groupInfo.memberCount}`, 300, headerY + 140);

  const leftColumnX = 60;

  const basicBoxY = headerY + headerH + 30;
  drawBox(ctx, leftColumnX, basicBoxY, leftColumnWidth, basicBoxHeight, "Group Info");
  let yBasic = basicBoxY + 100;
  const lineHeight = 50;
  basicFields.forEach(f => {
    ctx.textAlign = "left";
    ctx.fillStyle = cv.getRandomGradient ? cv.getRandomGradient(ctx, leftColumnWidth) : "#ffffff";
    ctx.font = "bold 28px BeVietnamPro";
    ctx.fillText(f.label, leftColumnX + 40, yBasic);
    ctx.textAlign = "right";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(f.value, leftColumnX + leftColumnWidth - 40, yBasic);
    yBasic += lineHeight;
  });

  const statusBoxY = basicBoxY + basicBoxHeight + 30;
  drawBox(ctx, leftColumnX, statusBoxY, leftColumnWidth, statusBoxHeight, "Status Info");
  let yStatus = statusBoxY + 100;
  statusFields.forEach(f => {
    ctx.textAlign = "left";
    ctx.fillStyle = cv.getRandomGradient ? cv.getRandomGradient(ctx, leftColumnWidth) : "#ffffff";
    ctx.font = "bold 28px BeVietnamPro";
    ctx.fillText(f.label, leftColumnX + 40, yStatus);
    ctx.textAlign = "right";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(f.value, leftColumnX + leftColumnWidth - 40, yStatus);
    yStatus += lineHeight;
  });

  const descBoxY = statusBoxY + statusBoxHeight + 30;
  drawBox(ctx, leftColumnX, descBoxY, leftColumnWidth, descBoxHeight, "Description");
  let yDesc = descBoxY + 100;
  descriptionFields.forEach(f => {
    ctx.textAlign = "left";
    ctx.fillStyle = cv.getRandomGradient ? cv.getRandomGradient(ctx, leftColumnWidth) : "#ffffff";
    ctx.font = "bold 28px BeVietnamPro";
    if (f.label) {
      ctx.fillText(f.label, leftColumnX + 40, yDesc);
    }
    ctx.fillStyle = "#ffffff";
    const valueX = f.label ? leftColumnX + 40 + measureTextWidth(ctx, f.label, "bold 28px BeVietnamPro") + 10 : leftColumnX + 40;
    ctx.fillText(f.value, valueX, yDesc);
    yDesc += lineHeight;
  });

  if (rightColumnWidth > 0 && (onConfigs.length > 0 || offConfigs.length > 0)) {
    const rightColumnX = leftColumnX + leftColumnWidth + 30;
    const configY = basicBoxY;
    drawBox(ctx, rightColumnX, configY, rightColumnWidth, cfgBoxHeight, "Group Settings");

    const leftColX = rightColumnX + 40;
    const rightColX = rightColumnX + rightColumnWidth / 2 + 40;
    if (onConfigs.length > 0 && offConfigs.length > 0) {
      const dividerX = rightColumnX + rightColumnWidth / 2;
      drawVerticalDivider(ctx, dividerX, configY, cfgBoxHeight);
    }

    let yOff = configY + 90;
    if (offConfigs.length > 0) {
      ctx.fillStyle = "#FF6B6B";
      ctx.font = onConfigs.length === 0 ? "bold 32px BeVietnamPro" : "bold 28px BeVietnamPro";
      ctx.textAlign = "left";
      ctx.fillText("Đang tắt:", leftColX, yOff);
      yOff += 50;
      ctx.font = onConfigs.length === 0 ? "bold 26px BeVietnamPro" : "bold 22px BeVietnamPro";
      offConfigs.forEach(line => {
        ctx.fillStyle = "#ffffff";
        ctx.fillText(`${line}`, leftColX, yOff);
        yOff += onConfigs.length === 0 ? 50 : 45;
      });
    }

    let yOn = configY + 90;
    if (onConfigs.length > 0) {
      ctx.fillStyle = "#4ECB71";
      ctx.font = "bold 28px BeVietnamPro";
      ctx.textAlign = "left";
      const titleX = offConfigs.length === 0 ? rightColumnX + rightColumnWidth / 2 : rightColX;
      ctx.fillText("Đang bật:", titleX, yOn);
      yOn += 50;
      ctx.font = "bold 22px BeVietnamPro";
      onConfigs.forEach(line => {
        ctx.fillStyle = "#ffffff";
        ctx.fillText(`${line}`, titleX, yOn);
        yOn += 45;
      });
    }
  }

  const filePath = path.resolve(`./assets/temp/group_info_${Date.now()}.png`);
  const out = fs.createWriteStream(filePath);
  const stream = canvas.createPNGStream();
  stream.pipe(out);
  return new Promise((resolve, reject) => {
    out.on("finish", () => resolve(filePath));
    out.on("error", reject);
  });
}

export async function clearImagePath(pathFile) {
  try {
    await fsPromises.unlink(pathFile);
  } catch (error) {
    console.error("Error deleting file:", error);
  }
}
