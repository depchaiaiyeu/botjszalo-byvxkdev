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
  ctx.fillText("Danh Sách Trắng", width / 2, 130);

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

export function wrapText(ctx, text, maxWidth) {
  const words = text.split(" ");
  const lines = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine + (currentLine ? " " : "") + word;
    if (ctx.measureText(testLine).width <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }

  if (currentLine) lines.push(currentLine);
  return lines;
}

// Tạo Hình Lệnh !Info
export async function createGroupInfoImage(groupInfo, owner) {
  if (!groupInfo || !owner) {
    console.error("Dữ liệu groupInfo hoặc owner không hợp lệ");
    return null;
  }

  const { lines: nameLines, totalLines: nameTotalLines } = handleNameLong(groupInfo.name || "Unnamed Group", 40);
  const padding = 20;
  const avatarSize = 120;
  const headerH = 200;
  const lineH = 28;
  const titleH = 40;
  const infoLines = 5;
  const infoH = titleH + infoLines * lineH + padding * 2;

  // Tính toán chiều rộng tối đa cần thiết cho tên nhóm
  const tempCanvas = createCanvas(2000, 100); // Tăng kích thước canvas tạm để đo chính xác
  const tempCtx = tempCanvas.getContext("2d");
  tempCtx.font = "bold 40px 'BeVietnamPro'";
  const maxNameWidthEstimate = tempCtx.measureText(`★ ${groupInfo.name || 'Unnamed Group'}`).width;
  const maxNameWidth = Math.max(600, maxNameWidthEstimate); // Giới hạn tối thiểu 600px cho tên
  const minWidth = maxNameWidth + (avatarSize + padding * 3) + (padding * 2); // Avatar + padding + nội dung bên phải
  const width = Math.max(1000, minWidth); // Giới hạn tối thiểu 1000px
  const boxW = (width - padding * 3) / 2;

  let bioLinesArray = [];
  if (groupInfo.desc) {
    const bioLines = [...(groupInfo.desc || "").split("\n")];
    bioLines.forEach((line) => {
      const { lines } = handleNameLong(line || "", 60);
      bioLinesArray.push(...lines);
    });
  }
  const descLines = Math.max(bioLinesArray.length, 1);
  const descH = titleH + descLines * lineH + padding * 2;
  const settingsList = [
    { key: 'blockName', label: 'Quyền đổi thông tin nhóm:', inverted: false },
    { key: 'signAdminMsg', label: 'Làm nổi tin nhắn từ admin:', inverted: false },
    { key: 'addMemberOnly', label: 'Quyền thêm thành viên:', inverted: false },
    { key: 'setTopicOnly', label: 'Quyền tạo chủ đề:', inverted: true },
    { key: 'enableMsgHistory', label: 'Quyền xem lịch sử tin nhắn:', inverted: false },
    { key: 'lockCreatePost', label: 'Quyền tạo bài viết:', inverted: false },
    { key: 'lockCreatePoll', label: 'Quyền tạo bình chọn:', inverted: false },
    { key: 'joinAppr', label: 'Quyền duyệt thành viên:', inverted: false },
    { key: 'lockSendMsg', label: 'Quyền gửi tin nhắn:', inverted: false },
    { key: 'lockViewMember', label: 'Quyền xem thành viên:', inverted: false },
  ];
  const settingsLines = settingsList.length;
  const settingsH = titleH + settingsLines * lineH + padding * 2;
  const gapBetweenBoxes = padding * 2;
  const totalContentH = Math.max(infoH + descH + gapBetweenBoxes, settingsH);
  const height = headerH + totalContentH + padding * 2 + (nameTotalLines - 1) * 40;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Áp dụng nền động và gradient
  const backgroundGradient = ctx.createLinearGradient(0, 0, 0, height);
  backgroundGradient.addColorStop(0, "#3B82F6");
  backgroundGradient.addColorStop(1, "#111827");
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, width, height);

  // Vẽ icon nổi như background
  const icons = ["⭐", "⚡", "🔥", "💎", "✨", "🌙", "🎵"];
  for (let i = 0; i < 30; i++) {
    const icon = icons[Math.floor(Math.random() * icons.length)];
    const fontSize = Math.floor(Math.random() * 50) + 30;
    ctx.font = `${fontSize}px Tahoma`;
    ctx.fillStyle = cv.getRandomGradient(ctx, width);
    ctx.globalAlpha = 0.4;
    ctx.shadowColor = "rgba(255,255,255,0.6)";
    ctx.shadowBlur = 12;
    ctx.fillText(icon, Math.random() * width, Math.random() * height);
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;

  let xAvatar = padding * 2;
  let yAvatar = padding;
  if (groupInfo.avt && cv.isValidUrl(groupInfo.avt)) {
    try {
      const avatar = await loadImage(groupInfo.avt);
      const borderWidth = 6;
      const gradient = ctx.createLinearGradient(
        xAvatar,
        yAvatar,
        xAvatar + avatarSize + borderWidth,
        yAvatar + avatarSize + borderWidth
      );
      const rainbowColors = ["#3B82F6", "#60A5FA", "#93C5FD", "#A5B4FC", "#C4B5FD", "#A5B4FC", "#60A5FA"];
      rainbowColors.forEach((color, index) => {
        gradient.addColorStop(index / (rainbowColors.length - 1), color);
      });

      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
      ctx.shadowBlur = 15;
      ctx.shadowOffsetX = 3;
      ctx.shadowOffsetY = 3;
      ctx.beginPath();
      ctx.arc(xAvatar + avatarSize / 2, yAvatar + avatarSize / 2, avatarSize / 2 + borderWidth, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(xAvatar + avatarSize / 2, yAvatar + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(avatar, xAvatar, yAvatar, avatarSize, avatarSize);
      ctx.restore();
    } catch (error) {
      console.error("Lỗi load avatar:", error);
      ctx.fillStyle = "#666";
      ctx.beginPath();
      ctx.arc(xAvatar + avatarSize / 2, yAvatar + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.save();
  ctx.font = "bold 40px 'BeVietnamPro'";
  const nameGradient = ctx.createLinearGradient(0, yAvatar + 50, width, yAvatar + 50);
  nameGradient.addColorStop(0, "#00FFFF");
  nameGradient.addColorStop(1, "#FFFF00");
  ctx.fillStyle = nameGradient;
  ctx.textAlign = "left";
  const maxNameWidthAdjusted = width - (xAvatar + avatarSize + 20 + padding);
  const wrappedName = wrapText(ctx, `${groupInfo.name || 'Unnamed Group'}`, maxNameWidthAdjusted);
  wrappedName.forEach((line, index) => {
    ctx.fillText(line, xAvatar + avatarSize + 20, yAvatar + 50 + (index * 40));
  });
  ctx.restore();

  ctx.font = "24px 'BeVietnamPro'";
  ctx.fillStyle = "#00FFFF", "#FFFF00"; 
  ctx.fillText(`Trưởng Nhóm: ${owner.name || 'N/A'}`, xAvatar + avatarSize + 20, yAvatar + 90 + (wrappedName.length - 1) * 40);

  const boxY = headerH + (wrappedName.length - 1) * 40;
  const leftX = padding;
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  roundRect(ctx, leftX, boxY, boxW, infoH, 12, true, false);
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.lineWidth = 1.5;
  roundRect(ctx, leftX, boxY, boxW, infoH, 12, false, true);

  ctx.save();
  ctx.font = "bold 26px 'BeVietnamPro'";
  const infoGradient = ctx.createLinearGradient(0, boxY, width, boxY);
  infoGradient.addColorStop(0, "#00FFFF");
  infoGradient.addColorStop(1, "#FFFF00");
  ctx.fillStyle = infoGradient;
  ctx.textAlign = "center";
  ctx.fillText("Thông tin nhóm", leftX + boxW / 2, boxY + 30);
  ctx.restore();

  ctx.textAlign = "left";
  ctx.font = "20px 'BeVietnamPro'";
  let y = boxY + 60;
  const adminCount = (groupInfo.adminIds || []).length + ((groupInfo.adminIds || []).includes(groupInfo.creatorId) ? 0 : 1);
  const groupType = groupInfo.groupType === 2 ? "Cộng Đồng" : "Nhóm";
  const infoFields = [
    `🆔 ID: ${groupInfo.groupId || 'N/A'}`,
    `👥 Thành viên: ${groupInfo.memberCount || 0}`,
    `📅 Ngày tạo: ${groupInfo.createdTime || 'N/A'}`,
    `🏷️ Loại: ${groupType}`,
    `👑 Quản trị viên: ${adminCount}`,
  ];
  infoFields.forEach((field) => {
    const fieldGradient = ctx.createLinearGradient(0, y, width, y);
    fieldGradient.addColorStop(0, "#FFFFFF");
    fieldGradient.addColorStop(1, "#FFFFFF");
    ctx.fillStyle = fieldGradient;
    ctx.fillText(field, leftX + 20, y);
    y += lineH;
  });

  const descY = boxY + infoH + gapBetweenBoxes;
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  roundRect(ctx, leftX, descY, boxW, descH, 12, true, false);
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  roundRect(ctx, leftX, descY, boxW, descH, 12, false, true);

  ctx.save();
  ctx.font = "bold 26px 'BeVietnamPro'";
  const descGradient = ctx.createLinearGradient(0, descY, width, descY);
  descGradient.addColorStop(0, "#00FFFF");
  descGradient.addColorStop(1, "#FFFF00");
  ctx.fillStyle = descGradient;
  ctx.textAlign = "center";
  ctx.fillText("Mô tả nhóm", leftX + boxW / 2, descY + 30);
  ctx.restore();

  ctx.textAlign = "left";
  ctx.font = "20px 'BeVietnamPro'";
  y = descY + 60;
  if (bioLinesArray.length === 0) {
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText("Không có mô tả", leftX + 20, y);
  } else {
    bioLinesArray.forEach((line) => {
      ctx.fillStyle = "#FFFFFF";
      ctx.fillText(line, leftX + 20, y);
      y += lineH;
    });
  }

  const rightX = leftX + boxW + padding;
  const settingsY = headerH + (wrappedName.length - 1) * 40;
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  roundRect(ctx, rightX, settingsY, boxW, settingsH, 12, true, false);
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  roundRect(ctx, rightX, settingsY, boxW, settingsH, 12, false, true);

  ctx.save();
  ctx.font = "bold 26px 'BeVietnamPro'";
  const settingsGradient = ctx.createLinearGradient(0, settingsY, width, settingsY);
  settingsGradient.addColorStop(0, "#00FFFF");
  settingsGradient.addColorStop(1, "#FFFF00");
  ctx.fillStyle = settingsGradient;
  ctx.textAlign = "center";
  ctx.fillText("Cài đặt nhóm", rightX + boxW / 2, settingsY + 30);
  ctx.restore();

  ctx.textAlign = "left";
  ctx.font = "20px 'BeVietnamPro'";
  y = settingsY + 60;
  settingsList.forEach((setting) => {
    const settingGradient = ctx.createLinearGradient(0, y, width, y);
    settingGradient.addColorStop(0, "#ffffff");
    settingGradient.addColorStop(1, "#ffffff");
    ctx.fillStyle = settingGradient;
    ctx.fillText(setting.label, rightX + 20, y);
    const val = groupInfo.setting ? groupInfo.setting[setting.key] || 0 : 0;
    const isEnabled = setting.inverted ? val === 0 : val === 1;
    //ctx.fillStyle = isEnabled ? "#34D399" : "#EF4444";
    ctx.fillText(isEnabled ? "Chỉ admin" : "Thành viên", rightX + 20 + ctx.measureText(setting.label).width + 10, y);
    y += lineH;
  });

  const filePath = path.resolve(`./assets/temp/group_info_${Date.now()}.png`);
  const out = fs.createWriteStream(filePath);
  const stream = canvas.createPNGStream();
  stream.pipe(out);
  return new Promise((resolve, reject) => {
    out.on("finish", () => resolve(filePath));
    out.on("error", (err) => reject(err));
  });
}

function roundRect(ctx, x, y, w, h, r, fill = false, stroke = false) {
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
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}
