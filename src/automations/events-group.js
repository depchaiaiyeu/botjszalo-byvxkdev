import { GroupEventType, MessageType } from "../api-zalo/models/index.js";
import { getUserInfoData } from "../service-hahuyhoang/info-service/user-info.js";
import { getGroupInfoData } from "../service-hahuyhoang/info-service/group-info.js";
import * as cv from "../utils/canvas/index.js";
import { readGroupSettings } from "../utils/io-json.js";
import { getBotId, isAdmin } from "../index.js";

const blockedMembers = new Map();
const BLOCK_CHECK_TIMEOUT = 300;
const previousSettings = new Map();

async function sendGroupMessage(api, threadId, imagePath, messageText) {
  const message = messageText ? messageText : "";
  try {
    await api.sendMessage(
      {
        msg: message,
        attachments: imagePath ? [imagePath] : [],
      },
      threadId,
      MessageType.GroupMessage
    );
  } catch (error) {
    console.error("Lỗi khi gửi tin nhắn tới group:", error);
  }
}

function detectChangedSetting(oldSettings, newSettings) {
  if (!oldSettings) return null;
  
  for (const [key, value] of Object.entries(newSettings)) {
    if (oldSettings[key] !== value) {
      return { key, value };
    }
  }
  return null;
}

export async function groupEvents(api, event) {
  console.log(event);
  const type = event.type;
  const { updateMembers } = event.data;
  const groupName = event.data.groupName;
  const threadId = event.threadId;
  const groupType = event.data.groupType;
  const idAction = event.data.sourceId;
  const creatorId = event.data.creatorId;
  const groupSetting = event.data.groupSetting;

  const groupSettings = readGroupSettings();
  const threadSettings = groupSettings[threadId] || {};
  const isEventEnabled = threadSettings.welcomeGroup && threadSettings.byeGroup;

  if (updateMembers) {
    if (updateMembers.length === 1) {
      const user = updateMembers[0];
      const userId = user.id;
      
      if (type === GroupEventType.JOIN && threadSettings.blackList && threadSettings.blackList[userId]) {
        const userInfo = await getUserInfoData(api, userId);
        await api.removeUserFromGroup(threadId, userId);
        await api.sendMessage(
          {
            msg: `Người dùng ${userInfo.name} đã bị kick do nằm trong danh sách đen của nhóm.`
          },
          threadId,
          MessageType.GroupMessage
        );
        return;
      }

      if ((type === GroupEventType.REMOVE_MEMBER || type === GroupEventType.BLOCK_MEMBER) && threadSettings.blackList && threadSettings.blackList[userId]) {
        return;
      }

      const userInfo = await getUserInfoData(api, userId);
      const userActionInfo = await getUserInfoData(api, idAction);
      const idBot = getBotId();
      const userActionName = userActionInfo.name;
      const isAdminBot = isAdmin(userId, threadId);

      let imagePath;
      let messageText = "";

      switch (type) {
        case GroupEventType.JOIN_REQUEST:
          if (threadSettings.welcomeGroup) {
            imagePath = await cv.createJoinRequestImage(userInfo, groupName, groupType, userActionName, isAdminBot);
          }
          break;
      
        case GroupEventType.JOIN:
          if (threadSettings.welcomeGroup) {
            imagePath = await cv.createWelcomeImage(userInfo, groupName, groupType, userActionName, isAdminBot);
          }
          break;

        case GroupEventType.LEAVE:
          if (idBot !== idAction && threadSettings.byeGroup) {
            imagePath = await cv.createGoodbyeImage(userInfo, groupName, groupType, isAdminBot);
          }
          break;

        case GroupEventType.REMOVE_MEMBER:
          if (threadSettings.byeGroup) {
            if (!blockedMembers.has(userId)) {
              await new Promise((resolve) => setTimeout(resolve, BLOCK_CHECK_TIMEOUT));
              if (!blockedMembers.has(userId)) {
                imagePath = await cv.createKickImage(userInfo, groupName, groupType, userInfo.genderId, userActionName, isAdminBot);
              }
            }
          }
          break;

        case GroupEventType.BLOCK_MEMBER:
          if (threadSettings.byeGroup) {
            blockedMembers.set(userId, Date.now());
            imagePath = await cv.createBlockImage(userInfo, groupName, groupType, userInfo.genderId, userActionName, isAdminBot);
            setTimeout(() => {
              blockedMembers.delete(userId);
            }, 1000);
          }
          break;

        default:
          break;
      }

      if (imagePath) {
        await sendGroupMessage(api, threadId, imagePath, messageText);
        await cv.clearImagePath(imagePath);
      }
    } else if (type === GroupEventType.JOIN && updateMembers.length > 1) {
      const userActionInfo = await getUserInfoData(api, idAction);
      const userActionName = userActionInfo.name;
      
      for (const user of updateMembers) {
        const userId = user.id;  
        if (threadSettings.welcomeGroup) {
          const userInfo = await getUserInfoData(api, userId);
          const isAdminUser = isAdmin(userId, threadId);

          const imagePath = await cv.createWelcomeImage(userInfo, groupName, groupType, userActionName, isAdminUser);
          await sendGroupMessage(api, threadId, imagePath, "");
          await cv.clearImagePath(imagePath);
        }
      }
    }
  } else {
    switch (type) {
      case GroupEventType.JOIN_REQUEST:
        if (threadSettings.memberApprove) {
          await api.handleGroupPendingMembers(threadId, true);
        }
        break;
    }
  }

  if (!isEventEnabled) return;

  const link = event.data?.info?.group_link || event.data?.link || "";
  const { subType } = event.data;

  let imagePath = null;
  const actorInfo = await getUserInfoData(api, idAction);
  const actorName = actorInfo.name;

  switch (type) {
    case GroupEventType.UPDATE_SETTING:
      if (groupSetting) {
        const oldSettings = previousSettings.get(threadId);
        const changedSetting = detectChangedSetting(oldSettings, groupSetting);
        
        if (changedSetting) {
          imagePath = await cv.createUpdateSettingImage(
            actorInfo, 
            actorName, 
            groupName, 
            groupType, 
            creatorId, 
            idAction,
            changedSetting.key,
            changedSetting.value
          );
        } else {
          imagePath = await cv.createUpdateSettingImage(
            actorInfo, 
            actorName, 
            groupName, 
            groupType, 
            creatorId, 
            idAction,
            null,
            null
          );
        }
        
        previousSettings.set(threadId, { ...groupSetting });
      }
      break;

    case GroupEventType.UPDATE:
      imagePath = await cv.createUpdateDescImage(actorInfo, actorName, groupName, groupType);
      break;

    case GroupEventType.NEW_LINK:
      imagePath = await cv.createNewLinkImage(actorInfo, actorName, groupName, groupType);
      if (imagePath && link) {
        await sendGroupMessage(api, threadId, imagePath, `🔗 Link ${groupType === 2 ? "community" : "group"} mới: ${link}`);
        await cv.clearImagePath(imagePath);
        return;
      }
      break;

    case GroupEventType.UPDATE_BOARD:
      imagePath = await cv.createUpdateBoardImage(actorInfo, actorName, groupName, groupType);
      break;

    case GroupEventType.ADD_ADMIN:
    case GroupEventType.REMOVE_ADMIN:
      if (subType === 1) {
        const isAdd = type === GroupEventType.ADD_ADMIN;
        const targetRawInfo = event.data?.updateMembers?.[0]; 
        const targetId = targetRawInfo?.id;
        const targetName = targetRawInfo?.dName || "Người dùng";
        
        const targetUserInfo = await getUserInfoData(api, targetId); 
        
        imagePath = await cv.createAdminChangeImage(targetUserInfo, actorName, targetName, groupName, isAdd, groupType); 
      }
      break;

    default:
      break;
  }

  if (imagePath) {
    await sendGroupMessage(api, threadId, imagePath, "");
    await cv.clearImagePath(imagePath);
  }
}
