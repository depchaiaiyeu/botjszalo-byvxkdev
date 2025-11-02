import fs from "fs";
import path from "path";
import { MessageType } from "zlbotdqt";
import { getGlobalPrefix } from '../service.js';
import { removeMention } from "../../utils/format-util.js";
import { readGroupSettings } from "../../utils/io-json.js";
import { drawTopChatImage } from "../../utils/canvas/leaderboard-image.js";
import { sendMessageWarning, sendMessageComplete } from "../chat-zalo/chat-style/chat-style.js";
import { getGroupInfoData } from "./group-info.js";

const rankInfoPath = path.join(process.cwd(), "assets", "json-data", "rank-info.json");

function readRankInfo() {
  try {
    let data = JSON.parse(fs.readFileSync(rankInfoPath, "utf8"));
    if (!data) data = {};
    if (!data.groups) data.groups = {};
    return data;
  } catch (error) {
    return { groups: {} };
  }
}

function writeRankInfo(data) {
  try {
    fs.writeFileSync(rankInfoPath, JSON.stringify(data, null, 2), "utf8");
  } catch (error) {
    
  }
}

export function updateUserRank(groupId, userId, userName, nameGroup) {
  const rankInfo = readRankInfo();
  if (!rankInfo.groups[groupId]) {
    rankInfo.groups[groupId] = { users: [], lastMessageTime: null };
  }
  if (rankInfo.groups[groupId].nameGroup !== nameGroup) {
    rankInfo.groups[groupId].nameGroup = nameGroup;
  }

  const currentDate = new Date().toISOString().split('T')[0];
  const currentTime = new Date();
  const hours = String(currentTime.getHours()).padStart(2, '0');
  const minutes = String(currentTime.getMinutes()).padStart(2, '0');
  const formattedTime = `${hours}:${minutes}`;
  
  rankInfo.groups[groupId].lastMessageTime = formattedTime;

  const userIndex = rankInfo.groups[groupId].users.findIndex((user) => user.UID === userId);

  rankInfo.groups[groupId].users.forEach((user) => {
    if (user.lastMessageDate !== currentDate) {
      user.messageCountToday = 0;
    }
  });

  if (userIndex !== -1) {
    const user = rankInfo.groups[groupId].users[userIndex];
    user.messageCountToday++;
    user.lastMessageDate = currentDate;
    user.UserName = userName;
    user.Rank++;
  } else {
    rankInfo.groups[groupId].users.push({
      UserName: userName,
      UID: userId,
      Rank: 1,
      messageCountToday: 1,
      lastMessageDate: currentDate,
    });
  }

  writeRankInfo(rankInfo);
}

export async function handleRankCommand(api, message, aliasCommand) {
  const content = removeMention(message);
  const prefix = getGlobalPrefix();
  const args = content.replace(`${prefix}${aliasCommand}`, "").trim().split(/\s+/);
  const threadId = message.threadId;

  if (args.length > 0 && args[0].toLowerCase() === "help") {
    const helpMessage = `📜 Hướng dẫn sử dụng:\n\n` +
      `🔹 ${prefix}${aliasCommand}\n→ Xem top chat ngày hôm nay\n\n` +
      `🔹 ${prefix}${aliasCommand} total\n→ Xem tổng toàn bộ tin nhắn\n\n` +
      `🔹 ${prefix}${aliasCommand} help\n→ Hiển thị hướng dẫn này`;
    
    await sendMessageComplete(api, message, helpMessage);
    return;
  }

  let isToday = true;

  if (args.length > 0 && args[0].toLowerCase() === "total") {
    isToday = false;
  }

  const rankInfo = readRankInfo();
  const groupUsers = rankInfo.groups[threadId]?.users || [];
  const lastMessageTime = rankInfo.groups[threadId]?.lastMessageTime || "00:00";

  if (groupUsers.length === 0) {
    await sendMessageWarning(api, message, "Chưa có dữ liệu topchat cho nhóm này.");
    return;
  }

  let filePath = null;

  try {
    const groupInfo = await getGroupInfoData(api, threadId);
    const groupName = groupInfo.name || "Nhóm";

    let usersToList;
    
    if (isToday) {
      const currentDate = new Date().toISOString().split("T")[0];
      usersToList = groupUsers.filter((user) => user.lastMessageDate === currentDate);
      
      if (usersToList.length === 0) {
        await sendMessageWarning(api, message, "Chưa có người dùng nào tương tác hôm nay.");
        return;
      }
      
      usersToList.sort((a, b) => b.messageCountToday - a.messageCountToday);
      
    } else {
      usersToList = [...groupUsers];
      usersToList.sort((a, b) => b.Rank - a.Rank);
    }
    
    const top10Users = usersToList.slice(0, 10).map((user, index) => ({
      ...user,
      messageCount: isToday ? user.messageCountToday : user.Rank
    }));
    
    filePath = await drawTopChatImage(top10Users, lastMessageTime, groupName, isToday);
    
    if (filePath) {
      await api.sendMessage(
        { 
          msg: `🏆 BXH Tương Tác ${isToday ? "Hôm Nay" : "Tổng"}`, 
          attachments: [filePath],
          ttl: 8640000
        }, 
        threadId, 
        MessageType.GroupMessage
      );
    }

  } catch (error) {
    await sendMessageWarning(api, message, "Đã xảy ra lỗi khi tạo ảnh topchat.");
  } finally {
    if (filePath) {
      await fs.promises.unlink(filePath).catch(() => {});
    }
  }
}

export async function initRankSystem() {
  const groupSettings = readGroupSettings();
  const rankInfo = readRankInfo();

  for (const [groupId, groupData] of Object.entries(groupSettings)) {
    if (!rankInfo.groups[groupId]) {
      rankInfo.groups[groupId] = { users: [], lastMessageTime: null };
    }

    if (groupData["adminList"]) {
      for (const [userId, userName] of Object.entries(groupData["adminList"])) {
        const existingUser = rankInfo.groups[groupId].users.find((user) => user.UID === userId);
        if (!existingUser) {
          rankInfo.groups[groupId].users.push({
            UserName: userName,
            UID: userId,
            Rank: 0,
          });
        }
      }
    }
  }

  writeRankInfo(rankInfo);
}
