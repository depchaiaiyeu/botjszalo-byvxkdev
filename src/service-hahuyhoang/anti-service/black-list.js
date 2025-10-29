import { MessageType } from "zlbotdqt";
import { isAdmin } from "../../index.js";
import {
  sendMessageComplete,
  sendMessageQuery,
  sendMessageWarning,
} from "../chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../service.js";
import { removeMention } from "../../utils/format-util.js";
import { createBlackListImage } from "../../utils/canvas/info.js";
import { getUserInfoData } from "../info-service/user-info.js";
import path from "path";
import fs from "fs/promises";

export async function handleBlackList(api, message, groupSettings, groupAdmins) {
  const threadId = message.threadId;
  const content = removeMention(message);
  const prefix = getGlobalPrefix();
  const parts = content.split(" ");
  const command = parts[1];
  let isChangeSetting = false;

  if (!command || (command !== "add" && command !== "remove")) {
    if (Object.keys(groupSettings[threadId].blackList || {}).length === 0) {
      await sendMessageWarning(
        api,
        message,
        "Hiện không có người dùng nào trong danh sách blacklist."
      );
      return isChangeSetting;
    }

    const blackListData = [];
    for (const [userId, userInfo] of Object.entries(groupSettings[threadId].blackList)) {
      const userData = await getUserInfoData(api, userId);
      blackListData.push({
        name: userInfo.name,
        avatar: userData ? userData.avatar : null,
        uid: userId
      });
    }

    const imagePath = path.resolve(process.cwd(), "assets", "temp", `blacklist_${threadId}.png`);
    
    await createBlackListImage(blackListData, imagePath);

    await api.sendMessage(
      {
        msg: "Danh sách người dùng trong blacklist",
        attachments: [imagePath],
      },
      threadId,
      message.type
    );

    try {
      await fs.unlink(imagePath);
    } catch (error) {
      console.error("Không thể xóa file ảnh tạm:", error);
    }

    return isChangeSetting;
  }

  const mentions = message.data.mentions;
  
  if (command === "remove") {
    const indexToRemove = parseInt(parts[2]);
    if (!isNaN(indexToRemove)) {
      const blackList = groupSettings[threadId].blackList || {};
      const blackListArray = Object.entries(blackList);
      
      if (indexToRemove > 0 && indexToRemove <= blackListArray.length) {
        const [userId, userInfo] = blackListArray[indexToRemove - 1];
        delete groupSettings[threadId].blackList[userId];
        await sendMessageComplete(
          api,
          message,
          `Đã xóa ${userInfo.name} khỏi danh sách blacklist.`
        );
        return true;
      } else {
        await sendMessageWarning(
          api,
          message,
          `Số thứ tự không hợp lệ. Vui lòng chọn số từ 1 đến ${blackListArray.length}.`
        );
        return false;
      }
    }
  }

  if (!mentions || mentions.length === 0) {
    await sendMessageQuery(
      api,
      message,
      "Vui lòng đề cập (@mention) người dùng hoặc nhập số thứ tự để thêm/xóa khỏi blacklist."
    );
    return isChangeSetting;
  }

  if (!groupSettings[threadId].blackList) {
    groupSettings[threadId].blackList = {};
  }

  for (const mention of mentions) {
    const userId = mention.uid;
    const userName = message.data.content
      .substr(mention.pos, mention.len)
      .replace("@", "");

    if (command === "add") {
      if (isAdmin(userId, threadId)) {
        await sendMessageWarning(
          api,
          message,
          `${userName} là quản trị viên nên không thể thêm vào blacklist`
        );
        continue;
      }

      if (!groupSettings[threadId].blackList[userId]) {
        groupSettings[threadId].blackList[userId] = {
          name: userName,
        };
        
        try {
          await api.removeUserFromGroup(threadId, userId);
          await sendMessageComplete(
            api,
            message,
            `Đã thêm ${userName} vào danh sách blacklist và kick khỏi nhóm.`
          );
        } catch (error) {
          await sendMessageWarning(
            api,
            message,
            `Đã thêm ${userName} vào blacklist nhưng không thể kick khỏi nhóm.`
          );
        }
        
        isChangeSetting = true;
      } else {
        await sendMessageWarning(
          api,
          message,
          `${userName} đã có trong danh sách blacklist.`
        );
      }
    } else if (command === "remove") {
      if (groupSettings[threadId].blackList[userId]) {
        const userName = groupSettings[threadId].blackList[userId].name;
        delete groupSettings[threadId].blackList[userId];
        await sendMessageComplete(
          api,
          message,
          `Đã xóa ${userName} khỏi danh sách blacklist.`
        );
        isChangeSetting = true;
      } else {
        await sendMessageWarning(
          api,
          message,
          `${userName} không có trong danh sách blacklist.`
        );
      }
    }
  }

  return isChangeSetting;
}

export function isInBlackList(groupSettings, threadId, senderId) {
  const blackList = groupSettings[threadId]?.blackList || {};
  return blackList[senderId];
}
