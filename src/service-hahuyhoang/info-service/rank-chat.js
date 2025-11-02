import fs from "fs";
import path from "path";
import { MessageType } from "zlbotdqt";
import { getGlobalPrefix } from '../service.js';
import { removeMention } from "../../utils/format-util.js";
import { readGroupSettings } from "../../utils/io-json.js";
import { drawLeaderboardImage } from "../../utils/canvas/leaderboard-image.js";

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
    rankInfo.groups[groupId] = { users: [] };
  }
  if (rankInfo.groups[groupId].nameGroup !== nameGroup) {
    rankInfo.groups[groupId].nameGroup = nameGroup;
  }

  const currentDate = new Date().toISOString().split('T')[0];
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
  const uidFrom = message.data.uidFrom;

  let isToday = false;
  let targetUid = null;

  if (args.length > 0 && args[0].toLowerCase() === "today") {
    isToday = true;
    if (args.length > 1 && args[1].toLowerCase() === "me") {
      targetUid = uidFrom;
    } else if (message.data.mentions && message.data.mentions.length > 0) {
      targetUid = message.data.mentions[0].uid;
    } else if (args.length > 1) {
      targetUid = args[1];
    }
  } else if (args.length > 0 && args[0].toLowerCase() === "me") {
    targetUid = uidFrom;
  } else if (message.data.mentions && message.data.mentions.length > 0) {
    targetUid = message.data.mentions[0].uid;
  } else if (args.length > 0) {
    targetUid = args[0];
  }

  const rankInfo = readRankInfo();
  const groupUsers = rankInfo.groups[threadId]?.users || [];

  if (groupUsers.length === 0) {
    await api.sendMessage(
      { msg: "Chưa có dữ liệu topchat cho nhóm này.", quote: message },
      threadId,
      MessageType.GroupMessage
    );
    return;
  }

  let filePath = null;
  let targetUser = null;

  try {
    if (targetUid) {
      targetUser = groupUsers.find(user => user.UID === targetUid);
      
      if (!targetUser) {
        await api.sendMessage(
          { msg: `Người bạn mentions là bot, không thể xem topchat.`, quote: message },
          threadId,
          MessageType.GroupMessage
        );
        return;
      }
      
      let sortedUsers = isToday 
        ? [...groupUsers].filter(u => u.lastMessageDate === new Date().toISOString().split("T")[0]).sort((a, b) => b.messageCountToday - a.messageCountToday)
        : [...groupUsers].sort((a, b) => b.Rank - a.Rank);
      
      const rankIndex = sortedUsers.findIndex(u => u.UID === targetUid);
      const userWithRank = { ...targetUser, Rank: rankIndex !== -1 ? rankIndex + 1 : -1 }; 

      filePath = await drawLeaderboardImage([userWithRank], isToday, targetUser, uidFrom, rankInfo);

    } else {
      let usersToList;
      
      if (isToday) {
        const currentDate = new Date().toISOString().split("T")[0];
        usersToList = groupUsers.filter((user) => user.lastMessageDate === currentDate);
        
        if (usersToList.length === 0) {
          await api.sendMessage(
            { msg: "Chưa có người dùng nào tương tác hôm nay.", quote: message },
            threadId,
            MessageType.GroupMessage
          );
          return;
        }
        
        usersToList.sort((a, b) => b.messageCountToday - a.messageCountToday);
        
      } else {
        usersToList = [...groupUsers];
        usersToList.sort((a, b) => b.Rank - a.Rank);
      }
      
      const top10Users = usersToList.slice(0, 10);
      
      filePath = await drawLeaderboardImage(top10Users, isToday, null, uidFrom, rankInfo);
    }
    
    if (filePath) {
      await api.sendMessage(
        { 
          msg: `🏆 BXH Tương Tác ${isToday ? "Hôm Nay" : "Tổng"}`, 
          attachments: [filePath]
        }, 
        threadId, 
        MessageType.GroupMessage
      );
    }

  } catch (error) {
    await api.sendMessage(
      { msg: "Đã xảy ra lỗi khi tạo ảnh topchat.", quote: message },
      threadId,
      MessageType.GroupMessage
    );
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
      rankInfo.groups[groupId] = { users: [] };
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
