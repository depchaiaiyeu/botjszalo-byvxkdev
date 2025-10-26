import { createCanvas, loadImage } from "canvas";
import fs from "fs";
import path from "path";
import * as cv from "./index.js";
import { formatCurrency } from "../format-util.js";

export function hanldeNameUser(name) {
  const words = name.split(" ");
  let line1 = "";
  let line2 = "";

  if (name.length <= 16) {
    return [name, ""];
  }

  if (words.length === 1) {
    line1 = name.substring(0, 16);
    line2 = name.substring(16);
  } else {
    for (let i = 0; i < words.length; i++) {
      if ((line1 + " " + words[i]).trim().length <= 16) {
        line1 += (line1 ? " " : "") + words[i];
      } else {
        line2 = words.slice(i).join(" ");
        break;
      }
    }
  }

  return [line1.trim(), line2.trim()];
}

export function handleNameLong(name, lengthLine = 16) {
  const words = name.split(" ");
  const lines = [];
  let currentLine = "";

  for (const word of words) {
    if ((currentLine + " " + word).trim().length <= lengthLine) {
      currentLine += (currentLine ? " " : "") + word;
    } else {
      if (currentLine) {
        lines.push(currentLine.trim());
      }
      currentLine = word;
    }
  }

  if (currentLine) {
    lines.push(currentLine.trim());
  }

  // Nếu không có dòng nào được tạo (tên ngắn hơn 16 ký tự), thêm tên gốc vào mảng
  if (lines.length === 0) {
    lines.push(name);
  }

  return {
    lines: lines,
    totalLines: lines.length,
  };
}

// Tạo Hình Lệnh !Info
export async function createUserInfoImage(userInfo) {
  const [nameLine1, nameLine2] = hanldeNameUser(userInfo.name);
  const width = 1000;
  let yTemp = 400;
  const lineBio = 35;

  // Thêm bio vào giữa bức ảnh
  if (userInfo.bio !== "Không có thông tin bio") {
    const bioLines = [...userInfo.bio.split("\n")];
    const lineHeight = lineBio;
    yTemp += 20;

    bioLines.forEach((line, index) => {
      const { lines, totalLines } = handleNameLong(line, 56);
      yTemp += lineHeight * totalLines;
    });
  }

  yTemp += 30;
  const height = yTemp > 430 ? yTemp : 430;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  if (userInfo.cover && cv.isValidUrl(userInfo.cover)) {
    try {
      const cover = await loadImage(userInfo.cover);
      ctx.drawImage(cover, 0, 0, width, height);

      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(0, 0, width, height);

    } catch (error) {
      console.error("Lỗi load cover:", error);
      const backgroundGradient = ctx.createLinearGradient(0, 0, 0, height);
      backgroundGradient.addColorStop(0, "#3B82F6");
      backgroundGradient.addColorStop(1, "#111827");
      ctx.fillStyle = backgroundGradient;
      ctx.fillRect(0, 0, width, height);
    }
  } else {
    // Nếu không có cover, sử dụng gradient mặc định
    const backgroundGradient = ctx.createLinearGradient(0, 0, 0, height);
    backgroundGradient.addColorStop(0, "#3B82F6");
    backgroundGradient.addColorStop(1, "#111827");
    ctx.fillStyle = backgroundGradient;
    ctx.fillRect(0, 0, width, height);
  }

  let xAvatar = 170;
  let widthAvatar = 180;
  let heightAvatar = 180;
  let yAvatar = 100; // Đặt yAvatar cố định là 100
  let yA1 = height / 2 - heightAvatar / 2 - yAvatar; // Tính toán lại yA1

  if (userInfo && cv.isValidUrl(userInfo.avatar)) {
    try {
      const avatar = await loadImage(userInfo.avatar);

      // Vẽ vòng tròn 7 màu cầu vồng
      const borderWidth = 10;
      const gradient = ctx.createLinearGradient(
        xAvatar - widthAvatar / 2 - borderWidth,
        yAvatar - borderWidth,
        xAvatar + widthAvatar / 2 + borderWidth,
        yAvatar + heightAvatar + borderWidth
      );

      const rainbowColors = [
        "#FF0000", // Đỏ
        "#FF7F00", // Cam
        "#FFFF00", // Vàng
        "#00FF00", // Lục
        "#0000FF", // Lam
        "#4B0082", // Chàm
        "#9400D3", // Tím
      ];

      // Xáo trộn mảng màu sắc
      const shuffledColors = [...rainbowColors].sort(() => Math.random() - 0.5);

      // Thêm các màu vào gradient
      shuffledColors.forEach((color, index) => {
        gradient.addColorStop(index / (shuffledColors.length - 1), color);
      });

      ctx.save();
      ctx.beginPath();
      ctx.arc(
        xAvatar,
        yAvatar + heightAvatar / 2,
        widthAvatar / 2 + borderWidth,
        0,
        Math.PI * 2,
        true
      );
      ctx.fillStyle = gradient;
      ctx.fill();

      // Vẽ avatar
      ctx.beginPath();
      ctx.arc(
        xAvatar,
        yAvatar + heightAvatar / 2,
        widthAvatar / 2,
        0,
        Math.PI * 2,
        true
      );
      ctx.clip();
      ctx.drawImage(
        avatar,
        xAvatar - widthAvatar / 2,
        yAvatar,
        widthAvatar,
        heightAvatar
      );
      ctx.restore();

      // Vẽ chấm trạng thái
      const dotSize = 26;
      const dotX = xAvatar + widthAvatar / 2 - dotSize / 2;
      const dotY = yAvatar + heightAvatar - dotSize / 2;
      ctx.beginPath();
      ctx.arc(dotX, dotY, dotSize / 2, 0, Math.PI * 2);
      if (userInfo.isOnline) {
        ctx.fillStyle = "#00FF00"; // Màu xanh lá cây cho trạng thái hoạt động
      } else {
        ctx.fillStyle = "#808080"; // Màu xám cho trạng thái không hoạt động
      }
      ctx.fill();
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 3;
      ctx.stroke();

      // Vẽ tên người dùng dưới avatar
      ctx.font = "bold 32px BeVietnamPro";
      ctx.fillStyle = "#FFFFFF";
      ctx.textAlign = "center";
      const nameY = yAvatar + heightAvatar + 54;
      if (nameLine2) {
        ctx.font = "bold 24px BeVietnamPro";
        ctx.fillText(nameLine1, xAvatar, nameY);
        ctx.font = "bold 24px BeVietnamPro";
        ctx.fillText(nameLine2, xAvatar, nameY + 28);
      } else {
        ctx.fillText(nameLine1, xAvatar, nameY);
      }

      // Vẽ các biểu tượng
      const iconSize = 24;
      const iconSpacing = 10;
      const icons = [];

      if (userInfo.isActive) icons.push("📱");
      if (userInfo.isActivePC) icons.push("💻");
      if (userInfo.isActiveWeb) icons.push("🌐");

      const totalWidth =
        icons.length * iconSize + (icons.length - 1) * iconSpacing;
      const iconsY = nameY + (nameLine2 ? 68 : 40); // Đặt biểu tượng cách tên 40px

      ctx.font = `${iconSize}px NotoEmojiBold`;
      icons.forEach((icon, index) => {
        const x =
          xAvatar + (index - (icons.length - 1) / 2) * (iconSize + iconSpacing);
        ctx.fillText(icon, x, iconsY);
      });
    } catch (error) {
      console.error("Lỗi load avatar:", error);
    }
  }

  let y1 = 60;

  ctx.textAlign = "center";
  ctx.font = "bold 48px BeVietnamPro";
  ctx.fillStyle = cv.getRandomGradient(ctx, width);
  ctx.fillText(userInfo.title, width / 2, y1);

  // Sau khi vẽ tên và biểu tượng
  // const nameWidth = ctx.measureText(nameLine1).width;
  const infoStartX = xAvatar + widthAvatar / 2 + 86;

  ctx.textAlign = "left";
  let y = y1 + 60;

  const fields = [
    { label: "🆔 Username", value: userInfo.username },
    { label: "🎂 Ngày sinh", value: userInfo.birthday },
    { label: "🧑‍🤝‍🧑 Giới tính", value: userInfo.gender },
    { label: "💼 Tài khoản Business", value: userInfo.businessType },
    { label: "📅 Ngày tạo tài khoản", value: userInfo.createdDate },
    { label: "🕰️ Lần cuối hoạt động", value: userInfo.lastActive },
  ];

  ctx.font = "bold 28px BeVietnamPro";
  for (const field of fields) {
    ctx.fillStyle = cv.getRandomGradient(ctx, width);
    const labelText = field.label + ":";
    const labelWidth = ctx.measureText(labelText).width;
    ctx.fillText(labelText, infoStartX, y);
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(" " + field.value, infoStartX + labelWidth, y);
    y += 52;
  }

  if (userInfo.bio !== "Không có thông tin bio") {
    ctx.textAlign = "center";

    ctx.beginPath();
    ctx.moveTo(width * 0.05, y - 20);
    ctx.lineTo(width * 0.95, y - 20);
    ctx.strokeStyle = "rgba(255, 255, 255)";
    ctx.lineWidth = 2;
    ctx.stroke();

    y += 25;
    const bioLines = [...userInfo.bio.split("\n")];

    bioLines.forEach((line, index) => {
      const { lines } = handleNameLong(line, 56);
      for (const line of lines) {
        const lineGradient = cv.getRandomGradient(ctx, width);
        ctx.fillStyle = lineGradient;

        ctx.fillText(line, width / 2, y);
        y += lineBio;
      }
    });
  }

  const filePath = path.resolve(`./assets/temp/user_info_${Date.now()}.png`);
  const out = fs.createWriteStream(filePath);
  const stream = canvas.createPNGStream();
  stream.pipe(out);
  return new Promise((resolve, reject) => {
    out.on("finish", () => resolve(filePath));
    out.on("error", reject);
  });
}

// Tạo Hình Card Game
export async function createUserCardGame(playerInfo) {
  const [nameLine1, nameLine2] = cv.hanldeNameUser(playerInfo.playerName);
  const width = 1080;

  const height = 535;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  cv.drawDynamicGradientBackground(ctx, width, height);
  cv.drawAnimatedBackground(ctx, width, height);

  let xAvatar = 180;
  let widthAvatar = 180;
  let heightAvatar = 180;
  let yAvatar = 100; // Đặt yAvatar cố định là 100
  let yA1 = height / 2 - heightAvatar / 2 - yAvatar; // Tính toán lại yA1

  if (playerInfo && cv.isValidUrl(playerInfo.avatar)) {
    try {
      const avatar = await loadImage(playerInfo.avatar);

      // Vẽ vòng tròn 7 màu cầu vồng
      const borderWidth = 10;
      const gradient = ctx.createLinearGradient(
        xAvatar - widthAvatar / 2 - borderWidth,
        yAvatar - borderWidth,
        xAvatar + widthAvatar / 2 + borderWidth,
        yAvatar + heightAvatar + borderWidth
      );

      const rainbowColors = [
        "#FF0000", // Đỏ
        "#FF7F00", // Cam
        "#FFFF00", // Vàng
        "#00FF00", // Lục
        "#0000FF", // Lam
        "#4B0082", // Chàm
        "#9400D3", // Tím
      ];

      // Xáo trộn mảng màu sắc
      const shuffledColors = [...rainbowColors].sort(() => Math.random() - 0.5);

      // Thêm các màu vào gradient
      shuffledColors.forEach((color, index) => {
        gradient.addColorStop(index / (shuffledColors.length - 1), color);
      });

      ctx.save();
      ctx.beginPath();
      ctx.arc(
        xAvatar,
        yAvatar + heightAvatar / 2,
        widthAvatar / 2 + borderWidth,
        0,
        Math.PI * 2,
        true
      );
      ctx.fillStyle = gradient;
      ctx.fill();

      // Thêm hiệu ứng bóng mờ màu trắng xung quanh avatar
      ctx.shadowColor = "rgba(255, 255, 255, 0.5)"; // Màu trắng với độ trong suốt
      ctx.shadowBlur = 20; // Độ mờ của bóng
      ctx.shadowOffsetX = 0; // Không có độ lệch theo chiều ngang
      ctx.shadowOffsetY = 0; // Không có độ lệch theo chiều dọc

      // Vẽ avatar
      ctx.beginPath();
      ctx.arc(
        xAvatar,
        yAvatar + heightAvatar / 2,
        widthAvatar / 2,
        0,
        Math.PI * 2,
        true
      );
      ctx.clip();
      ctx.drawImage(
        avatar,
        xAvatar - widthAvatar / 2,
        yAvatar,
        widthAvatar,
        heightAvatar
      );
      ctx.restore();

      // Giữ lại hiệu ứng bóng mờ chỉ xung quanh avatar
      ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
      ctx.shadowBlur = 20;
      ctx.shadowOffsetX = 5;
      ctx.shadowOffsetY = 5;

      // Vẽ chấm trạng thái
      const dotSize = 26;
      const dotX = xAvatar + widthAvatar / 2 - dotSize / 2;
      const dotY = yAvatar + heightAvatar - dotSize / 2;
      ctx.beginPath();
      ctx.arc(dotX, dotY, dotSize / 2, 0, Math.PI * 2);
      if (playerInfo.isOnline) {
        ctx.fillStyle = "#00FF00"; // Màu xanh lá cây cho trạng thái hoạt động
      } else {
        ctx.fillStyle = "#808080"; // Màu xám cho trạng thái không hoạt động
      }
      ctx.fill();
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 3;
      ctx.stroke();

      // Vẽ tên người dùng dưới avatar
      ctx.font = "bold 32px BeVietnamPro";
      ctx.fillStyle = "#FFFFFF";
      ctx.textAlign = "center";
      const nameY = yAvatar + heightAvatar + 54;
      if (nameLine2) {
        ctx.font = "bold 24px BeVietnamPro";
        ctx.fillText(nameLine1, xAvatar, nameY);
        ctx.font = "bold 24px BeVietnamPro";
        ctx.fillText(nameLine2, xAvatar, nameY + 28);
      } else {
        ctx.fillText(nameLine1, xAvatar, nameY);
      }

      // Thêm hiệu ứng gradient cho tên người dùng
      const nameGradient = ctx.createLinearGradient(
        xAvatar,
        nameY,
        xAvatar,
        nameY + 30
      );
      nameGradient.addColorStop(0, "#ff4b1f");
      nameGradient.addColorStop(1, "#1fddff");
      ctx.fillStyle = nameGradient;

      // Thêm khung và hiệu ứng cho avatar
      ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
      ctx.shadowBlur = 20;
      ctx.shadowOffsetX = 5;
      ctx.shadowOffsetY = 5;

      // Vẽ các biểu tượng
      const iconSize = 24;
      const iconSpacing = 10;
      const icons = [];

      if (playerInfo.isActive) icons.push("📱");
      if (playerInfo.isActivePC) icons.push("💻");
      if (playerInfo.isActiveWeb) icons.push("🌐");
      const iconsY = nameY + (nameLine2 ? 68 : 40); // Đặt biểu tượng cách tên 40px

      ctx.font = `${iconSize}px NotoEmojiBold`;
      icons.forEach((icon, index) => {
        const x =
          xAvatar + (index - (icons.length - 1) / 2) * (iconSize + iconSpacing);
        ctx.fillText(icon, x, iconsY);
      });
    } catch (error) {
      console.error("Lỗi load avatar:", error);
    }
  }

  let y1 = 60;

  ctx.textAlign = "center";
  ctx.font = "bold 48px BeVietnamPro";
  ctx.fillStyle = cv.getRandomGradient(ctx, width);
  ctx.fillText(playerInfo.title, width / 2, y1);

  // Sau khi vẽ tên và biểu tượng
  const nameWidth = ctx.measureText(nameLine1).width;
  const infoStartX = Math.max(
    xAvatar + widthAvatar / 2 + 60,
    xAvatar + nameWidth / 2 - 20
  );

  ctx.textAlign = "left";
  let y = y1 + 45;

  // Danh sách các trường thông tin cần hiển thị
  const fields = [
    { label: "🆔 Tên Đăng Nhập", value: playerInfo.account },
    // { label: "🧑‍🤝‍🧑 Giới tính", value: playerInfo.gender },
    {
      label: "💰 Số Dư Hiện Tại",
      value: formatCurrency(playerInfo.balance) + " VNĐ",
    },
    {
      label: "🏆 Tổng Thắng",
      value: formatCurrency(playerInfo.totalWinnings) + " VNĐ",
    },
    {
      label: "💸 Tổng Thua",
      value: formatCurrency(playerInfo.totalLosses) + " VNĐ",
    },
    {
      label: "💹 Lợi Nhuận Ròng",
      value: formatCurrency(playerInfo.netProfit) + " VNĐ",
    },
    {
      label: "🎮 Số Lượt Chơi",
      value:
        playerInfo.totalGames +
        " Games " +
        "(" +
        playerInfo.totalWinGames +
        "W/" +
        (playerInfo.totalGames - playerInfo.totalWinGames) +
        "L)",
    },
    { label: "📊 Tỉ Lệ Thắng", value: playerInfo.winRate + "%" },
    { label: "📅 Created Time", value: playerInfo.registrationTime },
    { label: "🎁 Nhận Quà Daily", value: playerInfo.lastDailyReward },
  ];

  ctx.font = "bold 28px BeVietnamPro";
  for (const field of fields) {
    ctx.fillStyle = cv.getRandomGradient(ctx, width);
    const labelText = field.label + ":";
    const labelWidth = ctx.measureText(labelText).width;
    ctx.fillText(labelText, infoStartX, y);

    if (field.label === "📊 Tỉ Lệ Thắng") {
      // Vẽ thanh trạng thái cho t�� lệ thắng
      const barWidth = 200; // Chiều dài tối đa của thanh trạng thái
      const winRate = parseFloat(field.value); // Giả sử field.value là chuỗi "50%"
      const filledWidth = (winRate / 100) * barWidth; // Tính toán chiều dài đã điền của thanh

      // Tạo gradient nhẹ nhàng cho thanh trạng thái
      const barGradient = ctx.createLinearGradient(
        infoStartX + labelWidth,
        y - 20,
        infoStartX + labelWidth + barWidth,
        y
      );
      barGradient.addColorStop(0, "#b8e994"); // Màu xanh nhạt
      barGradient.addColorStop(0.5, "#96e6a1"); // Màu xanh lá nhạt
      barGradient.addColorStop(1, "#b8e994"); // Màu xanh nhạt

      // Vẽ thanh nền với góc bo tròn
      ctx.fillStyle = "#ddd"; // Màu nền của thanh
      cv.roundRect(
        ctx,
        infoStartX + labelWidth + 20,
        y - 20,
        barWidth,
        20,
        5,
        true,
        false
      );

      // Vẽ phần đã điền của thanh với gradient và góc bo tròn
      ctx.fillStyle = barGradient;
      cv.roundRect(
        ctx,
        infoStartX + labelWidth + 20,
        y - 20,
        filledWidth,
        20,
        5,
        true,
        false
      );

      // Hiển thị phần trăm bên phải thanh trạng thái
      ctx.fillStyle = "#fff"; // Màu chữ
      ctx.fillText(field.value, infoStartX + labelWidth + 30 + barWidth + 5, y); // Vị trí hiển thị phần trăm
    } else {
      // Vẽ giá trị thông thường cho các trường khác
      ctx.fillStyle = "#FFFFFF";
      ctx.fillText(" " + field.value, infoStartX + labelWidth, y);
    }

    y += 42; // Tăng y cho trường tiếp theo
  }

  ctx.beginPath();
  ctx.moveTo(width * 0.05, y - 20);
  ctx.lineTo(width * 0.95, y - 20);
  ctx.strokeStyle = "white";
  ctx.lineWidth = 2;
  ctx.stroke();
  y += 20; // Tăng y cho trường tiếp theo

  ctx.font = "bold 28px BeVietnamPro";
  ctx.fillStyle = cv.getRandomGradient(ctx, width);
  ctx.textAlign = "center";
  ctx.fillText("Chúc Bạn 8386 | Mãi Đỉnh Mãi Đỉnh", width / 2, y);

  const filePath = path.resolve(`./assets/temp/user_info_${Date.now()}.png`);
  const out = fs.createWriteStream(filePath);
  const stream = canvas.createPNGStream();
  stream.pipe(out);
  return new Promise((resolve, reject) => {
    out.on("finish", () => resolve(filePath));
    out.on("error", reject);
  });
}

export async function createAdminListImage(highLevelAdmins, groupAdmins, outputPath) {
  const width = 800;
  const headerHeight = 180;
  const itemHeight = 120;
  const padding = 30;
  
  const totalItems = highLevelAdmins.length + groupAdmins.length;
  const contentHeight = totalItems * itemHeight + padding * 2;
  const height = headerHeight + contentHeight + 50;
  
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const backgroundGradient = ctx.createLinearGradient(0, 0, 0, height);
  backgroundGradient.addColorStop(0, "#4A90E2");
  backgroundGradient.addColorStop(1, "#5B7FCB");
  ctx.fillStyle = backgroundGradient;
  ctx.fillRect(0, 0, width, height);

  ctx.textAlign = "center";
  ctx.font = "bold 48px BeVietnamPro";
  ctx.fillStyle = cv.getRandomGradient(ctx, width);
  ctx.fillText("DANH SÁCH QUẢN TRỊ BOT", width / 2, 70);

  ctx.font = "bold 32px BeVietnamPro";
  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  ctx.fillText("Quản Trị Viên Bot", width / 2, 130);

  let currentY = headerHeight + padding;
  let itemNumber = 1;

  const allAdmins = [
    ...highLevelAdmins.map(admin => ({ ...admin, type: 'high' })),
    ...groupAdmins.map(admin => ({ ...admin, type: 'group' }))
  ];

  for (const admin of allAdmins) {
    const itemY = currentY;
    
    ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
    ctx.fillRect(padding, itemY, width - padding * 2, itemHeight);

    const avatarSize = 80;
    const avatarX = padding + 20;
    const avatarY = itemY + (itemHeight - avatarSize) / 2;

    if (admin.avatar && cv.isValidUrl(admin.avatar)) {
      try {
        const avatar = await loadImage(admin.avatar);
        
        const borderWidth = 3;
        const gradient = ctx.createLinearGradient(
          avatarX - borderWidth,
          avatarY - borderWidth,
          avatarX + avatarSize + borderWidth,
          avatarY + avatarSize + borderWidth
        );

        const rainbowColors = ["#FF0000", "#FF7F00", "#FFFF00", "#00FF00", "#0000FF", "#4B0082", "#9400D3"];
        const shuffledColors = [...rainbowColors].sort(() => Math.random() - 0.5);
        
        shuffledColors.forEach((color, index) => {
          gradient.addColorStop(index / (shuffledColors.length - 1), color);
        });

        ctx.save();
        ctx.beginPath();
        ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 + borderWidth, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
        ctx.restore();
      } catch (error) {
        drawDefaultAvatar(ctx, avatarX, avatarY, avatarSize);
      }
    } else {
      drawDefaultAvatar(ctx, avatarX, avatarY, avatarSize);
    }

    const nameX = avatarX + avatarSize + 20;
    
    ctx.textAlign = "left";
    ctx.font = "bold 28px BeVietnamPro";
    ctx.fillStyle = "#FFFFFF";
    const numberText = `${itemNumber}. ${admin.name}`;
    ctx.fillText(numberText, nameX, itemY + itemHeight / 2 - 5);

    ctx.font = "20px BeVietnamPro";
    ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
    const roleText = admin.type === 'high' ? "Quản Trị Viên Cấp Cao" : "Quản Trị Bot Nhóm";
    ctx.fillText(roleText, nameX, itemY + itemHeight / 2 + 25);

    currentY += itemHeight + 10;
    itemNumber++;
  }

  const out = fs.createWriteStream(outputPath);
  const stream = canvas.createPNGStream();
  stream.pipe(out);
  return new Promise((resolve, reject) => {
    out.on("finish", () => resolve(outputPath));
    out.on("error", reject);
  });
}

function drawDefaultAvatar(ctx, x, y, size) {
  ctx.fillStyle = "#555555";
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 32px BeVietnamPro";
  ctx.textAlign = "center";
  ctx.fillText("?", x + size / 2, y + size / 2 + 12);
}

export async function createWhiteListImage(whiteListUsers, outputPath) {
  const width = 800;
  const headerHeight = 180;
  const itemHeight = 120;
  const padding = 30;
  
  const totalItems = whiteListUsers.length;
  const contentHeight = totalItems * itemHeight + padding * 2;
  const height = headerHeight + contentHeight + 50;
  
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const backgroundGradient = ctx.createLinearGradient(0, 0, 0, height);
  backgroundGradient.addColorStop(0, "#4A90E2");
  backgroundGradient.addColorStop(1, "#5B7FCB");
  ctx.fillStyle = backgroundGradient;
  ctx.fillRect(0, 0, width, height);

  ctx.textAlign = "center";
  ctx.font = "bold 48px BeVietnamPro";
  ctx.fillStyle = cv.getRandomGradient(ctx, width);
  ctx.fillText("DANH SÁCH WHITE-LIST", width / 2, 70);

  ctx.font = "bold 32px BeVietnamPro";
  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  ctx.fillText("Người Dùng Được Phép", width / 2, 130);

  let currentY = headerHeight + padding;
  let itemNumber = 1;

  for (const user of whiteListUsers) {
    const itemY = currentY;
    
    ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
    ctx.fillRect(padding, itemY, width - padding * 2, itemHeight);

    const avatarSize = 80;
    const avatarX = padding + 20;
    const avatarY = itemY + (itemHeight - avatarSize) / 2;

    if (user.avatar && cv.isValidUrl(user.avatar)) {
      try {
        const avatar = await loadImage(user.avatar);
        
        const borderWidth = 3;
        const gradient = ctx.createLinearGradient(
          avatarX - borderWidth,
          avatarY - borderWidth,
          avatarX + avatarSize + borderWidth,
          avatarY + avatarSize + borderWidth
        );

        const rainbowColors = ["#FF0000", "#FF7F00", "#FFFF00", "#00FF00", "#0000FF", "#4B0082", "#9400D3"];
        const shuffledColors = [...rainbowColors].sort(() => Math.random() - 0.5);
        
        shuffledColors.forEach((color, index) => {
          gradient.addColorStop(index / (shuffledColors.length - 1), color);
        });

        ctx.save();
        ctx.beginPath();
        ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 + borderWidth, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
        ctx.restore();
      } catch (error) {
        drawDefaultAvatar(ctx, avatarX, avatarY, avatarSize);
      }
    } else {
      drawDefaultAvatar(ctx, avatarX, avatarY, avatarSize);
    }

    const nameX = avatarX + avatarSize + 20;
    
    ctx.textAlign = "left";
    ctx.font = "bold 28px BeVietnamPro";
    ctx.fillStyle = "#FFFFFF";
    const numberText = `${itemNumber}. ${user.name}`;
    ctx.fillText(numberText, nameX, itemY + itemHeight / 2 - 5);

    ctx.font = "20px BeVietnamPro";
    ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
    ctx.fillText("Người Dùng White-List", nameX, itemY + itemHeight / 2 + 25);

    currentY += itemHeight + 10;
    itemNumber++;
  }

  const out = fs.createWriteStream(outputPath);
  const stream = canvas.createPNGStream();
  stream.pipe(out);
  return new Promise((resolve, reject) => {
    out.on("finish", () => resolve(outputPath));
    out.on("error", reject);
  });
}

export async function createTopChatImage(rankData, title, api, threadId) {
  const width = 800;
  const headerHeight = 180;
  const itemHeight = 120;
  const padding = 30;
  
  const totalItems = rankData.length;
  const contentHeight = totalItems * itemHeight + padding * 2;
  const height = headerHeight + contentHeight + 50;
  
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const backgroundGradient = ctx.createLinearGradient(0, 0, 0, height);
  backgroundGradient.addColorStop(0, "#0A0A0A");
  backgroundGradient.addColorStop(1, "#121212");
  ctx.fillStyle = backgroundGradient;
  ctx.fillRect(0, 0, width, height);

  ctx.textAlign = "center";
  ctx.font = "bold 48px BeVietnamPro";
  ctx.fillStyle = cv.getRandomGradient(ctx, width);
  ctx.fillText(title, width / 2, 70);

  ctx.font = "bold 32px BeVietnamPro";
  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  const subtitle = title.includes("hôm nay") ? "Top Chat Hôm Nay" : "Top Chat Tổng";
  ctx.fillText(subtitle, width / 2, 130);

  let currentY = headerHeight + padding;
  let itemNumber = 1;

  for (const user of rankData) {
    const itemY = currentY;
    
    ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
    ctx.fillRect(padding, itemY, width - padding * 2, itemHeight);

    const avatarSize = 80;
    const avatarX = padding + 20;
    const avatarY = itemY + (itemHeight - avatarSize) / 2;

    try {
      const userInfo = await api.getUserInfo(user.UID);
      let avatarUrl = null;
      
      if (userInfo && userInfo.changed_profiles && userInfo.changed_profiles[user.UID]) {
        avatarUrl = userInfo.changed_profiles[user.UID].avatar;
      }

      if (avatarUrl && cv.isValidUrl(avatarUrl)) {
        try {
          const avatar = await loadImage(avatarUrl);
          
          const borderWidth = 3;
          const gradient = ctx.createLinearGradient(
            avatarX - borderWidth,
            avatarY - borderWidth,
            avatarX + avatarSize + borderWidth,
            avatarY + avatarSize + borderWidth
          );

          const rainbowColors = ["#FF0000", "#FF7F00", "#FFFF00", "#00FF00", "#0000FF", "#4B0082", "#9400D3"];
          const shuffledColors = [...rainbowColors].sort(() => Math.random() - 0.5);
          
          shuffledColors.forEach((color, index) => {
            gradient.addColorStop(index / (shuffledColors.length - 1), color);
          });

          ctx.save();
          ctx.beginPath();
          ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 + borderWidth, 0, Math.PI * 2);
          ctx.fillStyle = gradient;
          ctx.fill();

          ctx.beginPath();
          ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
          ctx.clip();
          ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
          ctx.restore();
        } catch (error) {
          console.error(`Lỗi load avatar cho ${user.UserName}:`, error);
          drawDefaultAvatar(ctx, avatarX, avatarY, avatarSize);
        }
      } else {
        drawDefaultAvatar(ctx, avatarX, avatarY, avatarSize);
      }
    } catch (error) {
      console.error(`Lỗi getUserInfo cho ${user.UID}:`, error);
      drawDefaultAvatar(ctx, avatarX, avatarY, avatarSize);
    }

    const nameX = avatarX + avatarSize + 20;
    
    ctx.textAlign = "left";
    ctx.font = "bold 28px BeVietnamPro";
    ctx.fillStyle = "#FFFFFF";
    const numberText = `${itemNumber}. ${user.UserName}`;
    ctx.fillText(numberText, nameX, itemY + itemHeight / 2 - 5);

    ctx.font = "20px BeVietnamPro";
    ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
    const messageCount = title.includes("hôm nay") ? user.messageCountToday : user.Rank;
    const messageText = `${messageCount} tin nhắn`;
    ctx.fillText(messageText, nameX, itemY + itemHeight / 2 + 25);

    currentY += itemHeight + 10;
    itemNumber++;
  }

  const outputPath = path.resolve(`./assets/temp/rank_${threadId}_${Date.now()}.png`);
  const out = fs.createWriteStream(outputPath);
  const stream = canvas.createPNGStream();
  stream.pipe(out);
  return new Promise((resolve, reject) => {
    out.on("finish", () => resolve(outputPath));
    out.on("error", reject);
  });
}

export async function createBotInfoImage(botInfo, uptime, botStats, onConfigs, offConfigs) {
  const isPrivateMessage = onConfigs.length === 0 && offConfigs.length === 0;
  const isOnConfigsEmpty = onConfigs.length === 0;
  const width = isPrivateMessage ? 900 : isOnConfigsEmpty ? 1450 : 1700;
  const maxConfigs = isOnConfigsEmpty ? offConfigs.length : Math.max(onConfigs.length, offConfigs.length);
  const configsBoxH = 100 + maxConfigs * 24;

  // Calculate content height
  const headerHeight = 170; // Avatar (y=80, size=100) + text (110, 140, 170)
  const systemInfoBoxH = 180; // System Info box height
  const resourceUsageBoxH = 200; // Resource Usage box height
  const ramDiskBoxH = 260; // RAM & Disk Usage box height
  const pieChartExtraH = 100; // Extra space for pie chart labels (radius 60 + 25 + 45 + 65)
  const verticalSpacing = 30; // Space between boxes (220-170=50, 420-400=20, 640-620=20, adjusted to 30 for consistency)

  // Total content height
  let contentHeight = headerHeight + systemInfoBoxH + resourceUsageBoxH + ramDiskBoxH + pieChartExtraH;
  if (!isPrivateMessage) {
    contentHeight = Math.max(contentHeight, headerHeight + configsBoxH);
  }
  contentHeight += 2 * verticalSpacing; // Spaces between boxes

  // Desired padding for top and bottom (e.g., 40px each)
  const padding = 40;
  const height = contentHeight + 2 * padding;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Draw background
  try {
    const bg = botInfo?.avatar ? await loadImage(botInfo.avatar) : null;
    if (bg) {
      const scale = Math.max(width / bg.width, height / bg.height);
      ctx.filter = "blur(6px)";
      ctx.drawImage(bg, (width - bg.width * scale) / 2, (height - bg.height * scale) / 2, bg.width * scale, bg.height * scale);
      ctx.filter = "none";
    }
  } catch (error) {
    console.error("Lỗi load background:", error);
  }
  ctx.fillStyle = "rgba(0,0,0,0.75)";
  ctx.fillRect(0, 0, width, height);

  // Calculate starting Y position to center content
  const startY = padding;

  // Draw header (avatar and text)
  if (botInfo?.avatar) {
    try {
      const avatar = await loadImage(botInfo.avatar);
      const size = 100;
      const x = 80, y = startY + 30; // Adjusted for padding

      const borderWidth = 6;
      const gradient = ctx.createLinearGradient(
        x,
        y,
        x + size + borderWidth,
        y + size + borderWidth
      );
      const rainbowColors = [
        "#FF0000",
        "#FF7F00",
        "#FFFF00",
        "#00FF00",
        "#0000FF",
        "#4B0082",
        "#9400D3",
      ];
      rainbowColors.forEach((color, index) => {
        gradient.addColorStop(index / (rainbowColors.length - 1), color);
      });

      ctx.save();
      ctx.beginPath();
      ctx.arc(x + size / 2, y + size / 2, size / 2 + borderWidth / 2, 0, Math.PI * 2, true);
      ctx.strokeStyle = gradient;
      ctx.lineWidth = borderWidth;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2, true);
      ctx.clip();
      ctx.drawImage(avatar, x, y, size, size);
      ctx.restore();
    } catch (error) {
      console.error("Lỗi load avatar:", error);
    }
  }

  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 32px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(botInfo.name || "Vũ Xuân Kiên", 200, startY + 60);
  ctx.font = "20px sans-serif";
  ctx.fillStyle = "#AAAAAA";
  ctx.fillText(`Uptime: ${uptime}`, 200, startY + 90);
  ctx.fillText(`Tên đại của Bot: ${botStats}`, 200, startY + 120);

  function drawBox(title, items, x, y, w, h) {
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    roundRect(ctx, x, y, w, h, 12, true, false);
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, w, h, 12, false, true);

    ctx.fillStyle = cv.getRandomGradient(ctx, w);
    ctx.font = "bold 24px BeVietnamPro";
    ctx.textAlign = "center";
    let titleText = title;
    const maxTitleWidth = w - 40;
    if (ctx.measureText(titleText).width > maxTitleWidth) {
      while (ctx.measureText(titleText + "...").width > maxTitleWidth && titleText.length > 0) {
        titleText = titleText.slice(0, -1);
      }
      titleText += "...";
    }
    ctx.fillText(titleText, x + w / 2, y + 30);

    ctx.textAlign = "left";
    ctx.font = "bold 20px BeVietnamPro";
    let yy = y + 50;
    const maxTextWidth = w - 40;
    items.forEach(item => {
      ctx.fillStyle = cv.getRandomGradient(ctx, w);
      let labelText = item.label + ":";
      if (ctx.measureText(labelText).width > maxTextWidth / 2) {
        while (ctx.measureText(labelText + "...").width > maxTextWidth / 2 && labelText.length > 0) {
          labelText = labelText.slice(0, -1);
        }
        labelText += "...";
      }
      const labelWidth = ctx.measureText(labelText).width;
      ctx.fillText(labelText, x + 20, yy);
      ctx.fillStyle = "#FFFFFF";
      let valueText = item.value.toString();
      if (ctx.measureText(labelText + " " + valueText).width > maxTextWidth) {
        while (ctx.measureText(labelText + " " + valueText + "...").width > maxTextWidth && valueText.length > 0) {
          valueText = valueText.slice(0, -1);
        }
        valueText += "...";
      }
      ctx.fillText(" " + valueText, x + 20 + labelWidth, yy);
      yy += 30;
    });
  }

  const leftBoxWidth = isPrivateMessage ? 820 : isOnConfigsEmpty ? 890 : 740;
  drawBox("System Info", [
    { label: "🔢 Phiên bản", value: botStats.version },
    { label: "💾 Bộ nhớ bot", value: botStats.memoryUsage },
    { label: "💻 Hệ điều hành", value: botStats.os },
    { label: "⚙️ CPU Model", value: botStats.cpuModel },
    { label: "📊 CPU Usage", value: botStats.cpu }
  ], 40, startY + headerHeight, leftBoxWidth, systemInfoBoxH);

  drawBox("Resource Usage", [
    { label: "🌡️ CPU Temp", value: botStats.cpuTemp || "36.0°C" },
    { label: "📈 RAM Usage", value: botStats.ram },
    { label: "💽 Disk Usage", value: botStats.disk },
    { label: "🌍 Network", value: botStats.networkSpeed || "N/A" },
    { label: "📶 Nhà mạng", value: botStats.isp || "FPT Telecom" }
  ], 40, startY + headerHeight + systemInfoBoxH + verticalSpacing, leftBoxWidth, resourceUsageBoxH);

  function drawPieChart(x, y, radius, percent, label) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = "#4ECB71";
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(
      x,
      y,
      radius,
      -Math.PI / 2,
      -Math.PI / 2 + (percent / 100) * Math.PI * 2
    );
    ctx.fillStyle = "#FF6B6B";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 20px BeVietnamPro";
    ctx.textAlign = "center";
    ctx.fillText(`${percent.toFixed(1)}%`, x, y + 5);

    ctx.fillStyle = "#FFFFFF";
    ctx.font = "18px BeVietnamPro";
    ctx.fillText(label, x, y + radius + 25);

    ctx.fillStyle = "#FF6B6B";
    ctx.font = "14px BeVietnamPro";
    ctx.fillText("■ Đã dùng", x, y + radius + 45);

    ctx.fillStyle = "#4ECB71";
    ctx.fillText("■ Còn trống", x, y + radius + 65);
  }

  const ramDiskBoxY = startY + headerHeight + systemInfoBoxH + resourceUsageBoxH + 2 * verticalSpacing;
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  roundRect(ctx, 40, ramDiskBoxY, leftBoxWidth, ramDiskBoxH, 12, true, false);
  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.lineWidth = 2;
  roundRect(ctx, 40, ramDiskBoxY, leftBoxWidth, ramDiskBoxH, 12, false, true);

  ctx.fillStyle = cv.getRandomGradient(ctx, leftBoxWidth);
  ctx.font = "bold 24px BeVietnamPro";
  ctx.textAlign = "center";
  ctx.fillText("RAM & Disk Usage", 40 + leftBoxWidth / 2, ramDiskBoxY + 30);

// Tính phần trăm RAM và Disk từ định dạng "4.9/6.9gb"
const calculatePercent = (str) => {
  if (!str || !str.includes('/')) return 0; // Kiểm tra chuỗi hợp lệ
  const cleanStr = str.replace("gb", "").trim(); // Xóa 'gb'
  const [used, total] = cleanStr.split("/").map(num => parseFloat(num)); // Tách và chuyển thành số
  return total > 0 ? (used / total) * 100 : 0; // Tính phần trăm
};

const ramPercent = calculatePercent(botStats.ram); // Tính % cho RAM
const diskPercent = calculatePercent(botStats.disk); // Tính % cho Disk

// Vẽ biểu đồ tròn với giá trị phần trăm chính xác
drawPieChart(40 + leftBoxWidth / 3, ramDiskBoxY + 120, 60, ramPercent, "RAM");
drawPieChart(40 + (leftBoxWidth / 3) * 2, ramDiskBoxY + 120, 60, diskPercent, "Disk");

  if (!isPrivateMessage) {
    const boxW = isOnConfigsEmpty ? 400 : 800;
    const boxX = 40 + leftBoxWidth + 80;
    const boxY = startY + headerHeight;
    const boxH = configsBoxH;

    ctx.fillStyle = "rgba(255,255,255,0.05)";
    roundRect(ctx, boxX, boxY, boxW, boxH, 12, true, false);
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 2;
    roundRect(ctx, boxX, boxY, boxW, boxH, 12, false, true);

    ctx.fillStyle = cv.getRandomGradient(ctx, boxW);
    ctx.font = "bold 24px BeVietnamPro";
    ctx.textAlign = "center";
    let groupConfigsTitle = "Group Configs";
    const maxTitleWidth = boxW - 40;
    if (ctx.measureText(groupConfigsTitle).width > maxTitleWidth) {
      while (ctx.measureText(groupConfigsTitle + "...").width > maxTitleWidth && groupConfigsTitle.length > 0) {
        groupConfigsTitle = groupConfigsTitle.slice(0, -1);
      }
      groupConfigsTitle += "...";
    }
    ctx.fillText(groupConfigsTitle, boxX + boxW / 2, boxY + 30);

    ctx.textAlign = "left";
    ctx.font = "18px sans-serif";
    const maxConfigWidth = (isOnConfigsEmpty ? boxW : boxW * 0.45) - 40;

    let oy = boxY + 70;
    ctx.fillStyle = "#FF6B6B";
    ctx.fillText("❌ Đang tắt:", boxX + 40, oy);
    oy += 30;
    offConfigs.forEach(line => {
      ctx.fillStyle = "#FFFFFF";
      let configText = "• " + line;
      if (ctx.measureText(configText).width > maxConfigWidth) {
        while (ctx.measureText(configText + "...").width > maxConfigWidth && configText.length > 0) {
          configText = configText.slice(0, -1);
        }
        configText += "...";
      }
      ctx.fillText(configText, boxX + 40, oy);
      oy += 24;
    });

    if (!isOnConfigsEmpty) {
      let py = boxY + 70;
      ctx.fillStyle = "#4ECB71";
      ctx.fillText("✅ Đang bật:", boxX + boxW * 0.55 + 20, py);
      py += 30;
      onConfigs.forEach(line => {
        ctx.fillStyle = "#FFFFFF";
        let configText = "• " + line;
        if (ctx.measureText(configText).width > maxConfigWidth) {
          while (ctx.measureText(configText + "...").width > maxConfigWidth && configText.length > 0) {
            configText = configText.slice(0, -1);
          }
          configText += "...";
        }
        ctx.fillText(configText, boxX + boxW * 0.55 + 20, py);
        py += 24;
      });
    }
  }

  const filePath = path.resolve(`./assets/temp/bot_info_${Date.now()}.png`);
  const out = fs.createWriteStream(filePath);
  const stream = canvas.createPNGStream();
  stream.pipe(out);
  return new Promise((resolve, reject) => {
    out.on("finish", () => resolve(filePath));
    out.on("error", reject);
  });
}
