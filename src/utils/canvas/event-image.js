import { createCanvas, loadImage } from "canvas";
import fs from "fs";
import path from "path";
import * as cs from "./index.js";

export const linkBackgroundDefault = "https://i.postimg.cc/tTwFPLV1/avt.jpg";
export const linkBackgroundDefaultZalo = "https://i.postimg.cc/tTwFPLV1/avt.jpg";

export async function getLinkBackgroundDefault(userInfo) {
  let backgroundImage;
  try {
    if (userInfo.cover && userInfo.cover !== linkBackgroundDefaultZalo) {
      backgroundImage = await loadImage(userInfo.cover);
    } else {
      backgroundImage = await loadImage(linkBackgroundDefault);
    }
  } catch (error) {
    backgroundImage = await loadImage(linkBackgroundDefault);
  }
  return backgroundImage;
}

function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let currentLine = words[0];

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const width = ctx.measureText(currentLine + " " + word).width;
    if (width < maxWidth) {
      currentLine += " " + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  lines.push(currentLine);
  return lines;
}

async function createImage(userInfo, message, fileName, typeImage = -1) {
  const width = 1000;
  const height = 300;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  let backgroundImage;
  let fluent = 0.8;
  
  if (fileName.includes("goodbye")) {
    typeImage = 1;
    fluent = 0.6;
  } else if (["blocked", "kicked"].some(keyword => fileName.includes(keyword))) {
    typeImage = 2;
    fluent = 0.85;
  } else if (["setting", "update", "link", "board", "admin"].some(keyword => fileName.includes(keyword))) {
    typeImage = 3; 
    fluent = 0.6;
  } else {
    typeImage = 0;
    fluent = 0.6;
  }

  try {
    backgroundImage = await getLinkBackgroundDefault(userInfo);
    ctx.drawImage(backgroundImage, 0, 0, width, height);

    const overlay = ctx.createLinearGradient(0, 0, 0, height);
    overlay.addColorStop(0, `rgba(30, 30, 53, ${fluent})`);
    overlay.addColorStop(0.5, `rgba(26, 37, 71, ${fluent})`);
    overlay.addColorStop(1, `rgba(19, 27, 54, ${fluent})`);

    ctx.fillStyle = overlay;
    ctx.fillRect(0, 0, width, height);
  } catch (error) {
    const backgroundGradient = ctx.createLinearGradient(0, 0, 0, height);
    backgroundGradient.addColorStop(0, "#1E1E35");
    backgroundGradient.addColorStop(0.5, "#1A2547");
    backgroundGradient.addColorStop(1, "#131B36");

    ctx.fillStyle = backgroundGradient;
    ctx.fillRect(0, 0, width, height);
  }

  let xAvatar = 120;
  let widthAvatar = 160;
  let heightAvatar = 160;
  let yAvatar = height / 2 - heightAvatar / 2;

  let gradientColors;
  if (typeImage === 0) {
    gradientColors = ["#00ffcc", "#00ff95", "#00ff80", "#1aff8c", "#33ff99"];
  } else if (typeImage === 1) {
    gradientColors = ["#FFFFFF", "#F0F0F0", "#FAFAFF", "#F8FBFF", "#EAEAFF", "#FFF5FA", "#FFFFFF"];
  } else if (typeImage === 2) {
    gradientColors = ["#ff0000", "#ff1111", "#ff2200", "#ff0022", "#ff3300"];
  } else if (typeImage === 3) {
    gradientColors = ["#FFD700", "#FFA500", "#FF8C00", "#FFC72C", "#FFCC33"]; 
  } else {
    gradientColors = ["#FF1493", "#FF69B4", "#FFD700", "#FFA500", "#FF8C00", "#00FF7F", "#40E0D0"];
  }

  const shuffledColors = [...gradientColors].sort(() => Math.random() - 0.5);

  const userAvatarUrl = userInfo.avatar;
  if (userAvatarUrl && cs.isValidUrl(userAvatarUrl)) {
    try {
      const avatar = await loadImage(userAvatarUrl);
      const borderWidth = 10;
      const gradient = ctx.createLinearGradient(
        xAvatar - widthAvatar / 2 - borderWidth,
        yAvatar - borderWidth,
        xAvatar + widthAvatar / 2 + borderWidth,
        yAvatar + heightAvatar + borderWidth
      );

      shuffledColors.forEach((color, index) => {
        gradient.addColorStop(index / (shuffledColors.length - 1), color);
      });

      ctx.save();
      ctx.beginPath();
      ctx.arc(xAvatar, height / 2, widthAvatar / 2 + borderWidth, 0, Math.PI * 2, true);
      ctx.fillStyle = gradient;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(xAvatar, height / 2, widthAvatar / 2, 0, Math.PI * 2, true);
      ctx.clip();
      ctx.drawImage(avatar, xAvatar - widthAvatar / 2, yAvatar, widthAvatar, heightAvatar);
      ctx.restore();

      ctx.beginPath();
      ctx.moveTo(xAvatar + widthAvatar / 2 + borderWidth + 30, yAvatar + 30);
      ctx.lineTo(xAvatar + widthAvatar / 2 + borderWidth + 30, yAvatar + heightAvatar - 30);
      ctx.strokeStyle = "white";
      ctx.lineWidth = 2;
      ctx.stroke();
    } catch (error) {
      console.error("Lỗi load avatar:", error);
    }
  }

  let x1 = xAvatar - widthAvatar / 2 + widthAvatar;
  let x2 = x1 + (width - x1) / 2 - 5;
  let maxWidth = width - x1 - 80;

  const texts = [
    message.title,
    message.userName,
    message.subtitle,
    message.author
  ].filter(text => text);

  let allLines = [];
  let baseFontSize = 31;
  let smallFontSize = 29;

  texts.forEach((text, index) => {
    let fontSize = (index === 0 || index === 1) ? baseFontSize : smallFontSize;
    let fontWeight = (index === 0 || index === 1) ? "bold" : "normal";
    ctx.font = `${fontWeight} ${fontSize}px BeVietnamPro`;
    
    const textWidth = ctx.measureText(text).width;
    if (textWidth > maxWidth) {
      const lines = wrapText(ctx, text, maxWidth);
      lines.forEach(line => {
        allLines.push({ text: line, fontSize, fontWeight, colorIndex: index });
      });
    } else {
      allLines.push({ text, fontSize, fontWeight, colorIndex: index });
    }
  });

  const lineHeight = 38;
  const totalHeight = (allLines.length - 1) * lineHeight;
  const startY = (height - totalHeight) / 2;

  allLines.forEach((lineObj, index) => {
    const y = startY + (index * lineHeight);
    const textGradient = ctx.createLinearGradient(x2 - 150, y - 30, x2 + 150, y);
    shuffledColors.slice(lineObj.colorIndex, lineObj.colorIndex + 3).forEach((color, colorIndex) => {
      textGradient.addColorStop(colorIndex / 2, color);
    });
    ctx.fillStyle = textGradient;
    ctx.textAlign = "center";
    ctx.font = `${lineObj.fontWeight} ${lineObj.fontSize}px BeVietnamPro`;
    
    ctx.fillText(lineObj.text, x2, y);
  });

  const filePath = path.resolve(`./assets/temp/${fileName}`);
  const out = fs.createWriteStream(filePath);
  const stream = canvas.createPNGStream();
  stream.pipe(out);
  return new Promise((resolve, reject) => {
    out.on("finish", () => resolve(filePath));
    out.on("error", reject);
  });
}

export async function createJoinRequestImage(userInfo, groupName, groupType, userActionName, isAdmin) {
  const groupTypeText = groupType === 2 ? "Cộng Đồng" : "Nhóm";
  const userName = userInfo.name || "";
  return createImage(
    userInfo,
    {
      title: `Join Request ${groupType === 2 ? "Community" : "Group"}`,
      userName: groupName,
      subtitle: `${isAdmin ? "Sếp " : ""}${userName}`,
      author: `Đã gửi yêu cầu tham gia ${groupTypeText}`,
    },
    `join_request_${Date.now()}.png`
  );
}

export async function createWelcomeImage(userInfo, groupName, groupType, userActionName, isAdmin) {
  const userName = userInfo.name || "";
  const groupTypeText = groupType === 2 ? "Cộng Đồng" : "Nhóm";
  const authorText = userActionName === userName ? "Tham gia trực tiếp hoặc được mời" : `Duyệt bởi ${userActionName}`;
  return createImage(
    userInfo,
    {
      title: groupName,
      userName: `Chào mừng ${isAdmin ? "Sếp " : ""}${userName}`,
      subtitle: `Đã tham gia ${groupTypeText}`,
      author: authorText,
    },
    `welcome_${Date.now()}.png`
  );
}

export async function createGoodbyeImage(userInfo, groupName, groupType, isAdmin) {
  const userName = userInfo.name || "";
  const groupTypeText = groupType === 2 ? "Cộng Đồng" : "Nhóm";
  return createImage(
    userInfo,
    {
      title: "Member Left The Group",
      userName: `${isAdmin ? "Sếp " : ""}${userName}`,
      subtitle: `Vừa rời khỏi ${groupTypeText}`,
      author: groupName
    },
    `goodbye_${Date.now()}.png`
  );
}

export async function createKickImage(userInfo, groupName, groupType, gender, userActionName, isAdmin) {
  const userName = userInfo.name || "";
  const genderText = gender === 0 ? "Thằng" : gender === 1 ? "Con" : "Thằng";
  let userNameText = isAdmin ? `Sếp ${userName}` : `${genderText} oắt con ${userName}`;
  const groupTypeText = groupType === 2 ? "Cộng Đồng" : "Nhóm";
  return createImage(
    userInfo,
    {
      title: `Kicked Out Member`,
      userName: userNameText,
      subtitle: `Đã bị ${userActionName} sút khỏi ${groupTypeText}`,
      author: groupName,
    },
    `kicked_${Date.now()}.png`
  );
}

export async function createBlockImage(userInfo, groupName, groupType, gender, userActionName, isAdmin) {
  const userName = userInfo.name || "";
  const genderText = gender === 0 ? "Thằng" : gender === 1 ? "Con" : "Thằng";
  let userNameText = isAdmin ? `Sếp ${userName}` : `${genderText} oắt con ${userName}`;
  const groupTypeText = groupType === 2 ? "Cộng Đồng" : "Nhóm";
  return createImage(
    userInfo,
    {
      title: `Blocked Out Member`,
      userName: userNameText,
      subtitle: `Đã bị ${userActionName} chặn khỏi ${groupTypeText}`,
      author: groupName,
    },
    `blocked_${Date.now()}.png`
  );
}

export async function createBlockSpamImage(userInfo, groupName, groupType, gender) {
  const userName = userInfo.name || "";
  const genderText = gender === 0 ? "Thằng" : gender === 1 ? "Con" : "Thằng";
  const groupTypeText = groupType === 2 ? "Cộng Đồng" : "Nhóm";
  return createImage(
    userInfo,
    {
      title: `Blocked Out Spam Member`,
      userName: `${genderText} oắt con ${userName}`,
      subtitle: `Do spam đã bị chặn khỏi ${groupTypeText}`,
      author: groupName,
    },
    `blocked_spam_${Date.now()}.png`
  );
}

export async function createBlockSpamLinkImage(userInfo, groupName, groupType, gender) {
  const userName = userInfo.name || "";
  const genderText = gender === 0 ? "Thằng" : gender === 1 ? "Con" : "Thằng";
  const groupTypeText = groupType === 2 ? "Cộng Đồng" : "Nhóm";
  return createImage(
    userInfo,
    {
      title: `Blocked Out Spam Link Member`,
      userName: `${genderText} oắt con ${userName}`,
      subtitle: `Do spam link đã bị chặn khỏi ${groupTypeText}`,
      author: groupName,
    },
    `blocked_spam_link_${Date.now()}.png`
  );
}

export async function createBlockAntiBotImage(userInfo, groupName, groupType, gender) {
  const userNames = userInfo.name || "";
  const genderText = gender === 0 ? "Thằng" : gender === 1 ? "Con" : "Thằng";
  const groupTypeText = groupType === 2 ? "Cộng Đồng" : "Nhóm";
  return createImage(
    userInfo,
    {
      title: `Blocked Out Anti Bot Member`,
      userName: `${genderText} oắt con ${userNames}`,
      subtitle: `Do sử dụng bot đã bị chặn khỏi ${groupTypeText}`,
      author: groupName,
    },
    `blocked_anti_bot_${Date.now()}.png`
  );
}

function getSettingName(key) {
  const settingsMap = {
    blockName: "Chặn sửa thông tin nhóm",
    signAdminMsg: "Làm nổi tin nhắn từ Admin",
    addMemberOnly: "Admin phê duyệt thành viên",
    setTopicOnly: "Chỉ Admin được đổi chủ đề",
    enableMsgHistory: "Thành viên cũ xem lịch sử tin nhắn",
    joinAppr: "Phê duyệt thành viên mới",
    lockCreatePost: "Khóa tạo bài viết",
    lockCreatePoll: "Khóa tạo bình chọn",
    lockSendMsg: "Chặn gửi tin nhắn",
    lockViewMember: "Chặn thành viên xem thành viên"
  };
  return settingsMap[key] || key;
}

export async function createUpdateSettingImage(actorInfo, actorName, groupName, groupType, creatorId, sourceId, settingKey, settingValue) {
  const vnGroupType = groupType === 2 ? "Cộng Đồng" : "Nhóm";
  const settingName = settingKey ? getSettingName(settingKey) : "Cài Đặt";
  const status = settingValue === 1 ? "Bật" : "Tắt";
  const isCreator = creatorId === sourceId;
  const actorRole = isCreator ? `Trưởng ${vnGroupType}` : `Quản Trị ${vnGroupType}`;
  
  return createImage(
    actorInfo,
    {
      title: groupName,
      userName: settingKey ? settingName : `Cài đặt ${vnGroupType} đã được cập nhật`,
      subtitle: settingKey ? `Đã được ${status.toLowerCase()}` : `Thực hiện bởi ${actorRole.toLowerCase()}`,
      author: settingKey ? `Thực hiện bởi ${actorRole} ${actorName}` : actorName,
    },
    `setting_${Date.now()}.png`
  );
}

export async function createUpdateDescImage(actorInfo, actorName, groupName, groupType) {
  const vnGroupType = groupType === 2 ? "Cộng Đồng" : "Nhóm";
  return createImage(
    actorInfo,
    {
      title: groupName,
      userName: `Mô tả ${vnGroupType} đã được cập nhật`,
      subtitle: `Thực hiện bởi quản trị ${vnGroupType}`,
      author: actorName,
    },
    `update_${Date.now()}.png`
  );
}

export async function createNewLinkImage(actorInfo, actorName, groupName, groupType) {
  const vnGroupType = groupType === 2 ? "Cộng Đồng" : "Nhóm";
  return createImage(
    actorInfo,
    {
      title: groupName,
      userName: `Link mời ${vnGroupType} đã được tạo mới`,
      subtitle: `Thực hiện bởi quản trị ${vnGroupType}`,
      author: actorName,
    },
    `link_${Date.now()}.png`
  );
}

export async function createUpdateBoardImage(actorInfo, actorName, groupName, groupType) {
  const vnGroupType = groupType === 2 ? "Cộng Đồng" : "Nhóm";
  return createImage(
    actorInfo,
    {
      title: groupName,
      userName: `Bảng thông báo ${vnGroupType} đã được cập nhật`,
      subtitle: `Thực hiện bởi quản trị ${vnGroupType}`,
      author: actorName,
    },
    `board_${Date.now()}.png`
  );
}

export async function createAdminChangeImage(targetUserInfo, actorName, targetName, groupName, isAdd, groupType) {
  const groupTypeText = groupType === 2 ? "Cộng Đồng" : "Nhóm";
  
  const titleText = groupName;
  const userNameText = isAdd ? `Chúc mừng ${targetName}` : `Chia buồn cùng ${targetName}`;
  const subtitleText = isAdd 
    ? `Đã được phong làm Phó ${groupTypeText}`
    : `Đã bị tước quyền Phó ${groupTypeText}`;
  const authorText = `Thực hiện bởi Trưởng ${groupTypeText} ${actorName}`;

  return createImage(
    targetUserInfo,
    {
      title: titleText,
      userName: userNameText,
      subtitle: subtitleText,
      author: authorText,
    },
    `${isAdd ? "add" : "remove"}_admin_${Date.now()}.png`
  );
}
