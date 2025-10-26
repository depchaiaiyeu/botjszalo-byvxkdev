import { createCanvas, loadImage } from "canvas";
import fs from "fs";
import path from "path";
import * as cv from "./index.js";

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

export async function createGroupInfoImage(groupInfo, owner) {
  if (!groupInfo || !owner) {
    console.error("Dữ liệu groupInfo hoặc owner không hợp lệ");
    return null;
  }

  let width = 1400;
  let height = 0;

  const adminCount = (groupInfo.adminIds || []).length + ((groupInfo.adminIds || []).includes(groupInfo.creatorId) ? 0 : 1);
  const groupType = groupInfo.groupType === 2 ? "Cộng Đồng" : "Nhóm";

  const infoFields = [
    { label: "🆔 ID:", value: groupInfo.groupId || "N/A" },
    { label: "👥 Thành viên:", value: (groupInfo.memberCount || 0).toString() },
    { label: "📅 Ngày tạo:", value: groupInfo.createdTime || "N/A" },
    { label: "🏷️ Loại:", value: groupType },
    { label: "👑 Quản trị viên:", value: adminCount.toString() }
  ];

  const settingsList = [
    { key: 'blockName', label: 'Quyền đổi thông tin nhóm', inverted: false },
    { key: 'signAdminMsg', label: 'Làm nổi tin nhắn từ admin', inverted: false },
    { key: 'addMemberOnly', label: 'Quyền thêm thành viên', inverted: false },
    { key: 'setTopicOnly', label: 'Quyền tạo chủ đề', inverted: true },
    { key: 'enableMsgHistory', label: 'Quyền xem lịch sử tin nhắn', inverted: false },
    { key: 'lockCreatePost', label: 'Quyền tạo bài viết', inverted: false },
    { key: 'lockCreatePoll', label: 'Quyền tạo bình chọn', inverted: false },
    { key: 'joinAppr', label: 'Quyền duyệt thành viên', inverted: false },
    { key: 'lockSendMsg', label: 'Quyền gửi tin nhắn', inverted: false },
    { key: 'lockViewMember', label: 'Quyền xem thành viên', inverted: false }
  ];

  const configFields = settingsList.map(setting => {
    const val = groupInfo.setting ? groupInfo.setting[setting.key] || 0 : 0;
    const isEnabled = setting.inverted ? val === 0 : val === 1;
    return `${setting.label}: ${isEnabled ? "Chỉ admin" : "Thành viên"}`;
  });

  const tempCanvas = createCanvas(1, 1);
  const tempCtx = tempCanvas.getContext("2d");

  let maxLeftWidth = 0;
  infoFields.forEach(f => {
    const textWidth = measureTextWidth(tempCtx, `${f.label} ${f.value}`, "bold 28px BeVietnamPro");
    maxLeftWidth = Math.max(maxLeftWidth, textWidth);
  });

  const leftColumnWidth = Math.max(500, maxLeftWidth + 120);

  let maxConfigWidth = 0;
  configFields.forEach(line => {
    const textWidth = measureTextWidth(tempCtx, line, "bold 22px BeVietnamPro");
    maxConfigWidth = Math.max(maxConfigWidth, textWidth);
  });

  const rightColumnWidth = Math.max(450, maxConfigWidth + 120);
  width = leftColumnWidth + rightColumnWidth + 120;

  const headerH = 220;
  const headerY = 30;
  const infoBoxHeight = infoFields.length * 50 + 100;
  const descBoxHeight = 300;
  const configBoxHeight = configFields.length * 40 + 130;

  const leftColumnHeight = infoBoxHeight + descBoxHeight + 60;
  const rightColumnHeight = configBoxHeight + 30;
  height = Math.max(headerY + headerH + 30 + leftColumnHeight, headerY + headerH + 30 + rightColumnHeight) + 90;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  if (groupInfo.avt && cv.isValidUrl(groupInfo.avt)) {
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

  drawBox(ctx, 60, headerY, width - 120, headerH, "Thông Tin Nhóm");

  if (groupInfo.avt && cv.isValidUrl(groupInfo.avt)) {
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
  const nameGradient = ctx.createLinearGradient(0, 0, width, 0);
  nameGradient.addColorStop(0, "#4ECB71");
  nameGradient.addColorStop(1, "#1E90FF");
  ctx.fillStyle = nameGradient;
  ctx.font = "bold 48px BeVietnamPro";
  ctx.fillText(groupInfo.name || "Unnamed Group", 300, headerY + 100);
  ctx.font = "bold 28px BeVietnamPro";
  ctx.fillStyle = nameGradient;
  ctx.fillText("Trưởng nhóm: " + (owner.name || "N/A"), 300, headerY + 140);

  const leftColumnX = 60;

  const infoBoxY = headerY + headerH + 30;
  drawBox(ctx, leftColumnX, infoBoxY, leftColumnWidth, infoBoxHeight, "Thông Tin Cơ Bản");
  let yInfo = infoBoxY + 100;
  const lineHeight = 50;
  infoFields.forEach(f => {
    ctx.textAlign = "left";
    const fieldGradient = ctx.createLinearGradient(0, 0, leftColumnWidth, 0);
    fieldGradient.addColorStop(0, "#4ECB71");
    fieldGradient.addColorStop(1, "#1E90FF");
    ctx.fillStyle = fieldGradient;
    ctx.font = "bold 28px BeVietnamPro";
    ctx.fillText(f.label, leftColumnX + 40, yInfo);
    ctx.textAlign = "right";
    ctx.fillText(f.value, leftColumnX + leftColumnWidth - 40, yInfo);
    yInfo += lineHeight;
  });

  const descBoxY = infoBoxY + infoBoxHeight + 30;
  drawBox(ctx, leftColumnX, descBoxY, leftColumnWidth, descBoxHeight, "Mô Tả Nhóm");
  let yDesc = descBoxY + 100;
  ctx.textAlign = "left";
  ctx.font = "bold 24px BeVietnamPro";
  const descGradient = ctx.createLinearGradient(0, 0, leftColumnWidth, 0);
  descGradient.addColorStop(0, "#4ECB71");
  descGradient.addColorStop(1, "#1E90FF");
  ctx.fillStyle = descGradient;
  
  if (groupInfo.desc) {
    const descLines = groupInfo.desc.split("\n");
    descLines.forEach(line => {
      ctx.fillText(line, leftColumnX + 40, yDesc);
      yDesc += 35;
    });
  } else {
    ctx.fillText("Không có mô tả", leftColumnX + 40, yDesc);
  }

  const rightColumnX = leftColumnX + leftColumnWidth + 30;
  const configY = infoBoxY;
  drawBox(ctx, rightColumnX, configY, rightColumnWidth, configBoxHeight, "Cài Đặt Nhóm");

  let yConfig = configY + 100;
  ctx.font = "bold 22px BeVietnamPro";
  ctx.textAlign = "left";
  configFields.forEach(line => {
    const configGradient = ctx.createLinearGradient(0, 0, rightColumnWidth, 0);
    configGradient.addColorStop(0, "#4ECB71");
    configGradient.addColorStop(1, "#1E90FF");
    ctx.fillStyle = configGradient;
    ctx.fillText(line, rightColumnX + 40, yConfig);
    yConfig += 40;
  });

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
