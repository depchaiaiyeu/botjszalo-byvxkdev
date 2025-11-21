import { MessageType } from "zlbotdqt";
import { createGroupInfoImage } from "../../utils/canvas/createGroupInfoImage.js"; 
import { clearImagePath } from "../../utils/canvas/index.js";
import { sendMessageWarning } from "../chat-zalo/chat-style/chat-style.js";
import { getUserInfoData } from "../../service-hahuyhoang/info-service/user-info.js"; 
import { readFileSync } from "fs";
import { join } from "path";

export async function groupInfoCommand(api, message, groupSettings) {
  const threadId = message.threadId;

  try {
    const groupInfo = await getGroupInfoData(api, threadId);
    const owner = await getUserInfoData(api, groupInfo.creatorId);
    
    const botConfig = getConfigStatus(threadId, groupSettings);

    const imagePath = await createGroupInfoImage(groupInfo, owner, botConfig);
    await api.sendMessage({ attachments: [imagePath] }, threadId, MessageType.GroupMessage);
    
    clearImagePath(imagePath);
  } catch (error) {
    console.error("Lỗi khi lấy thông tin nhóm:", error);
    await sendMessageWarning(api, message, "Đã xảy ra lỗi khi lấy thông tin nhóm. Vui lòng thử lại sau!");
  }
}

export async function getGroupAdmins(groupInfo) {
  try {
    const admins = groupInfo.adminIds || [];
    const creatorId = groupInfo.creatorId;

    if (creatorId && !admins.includes(creatorId)) {
      admins.push(creatorId);
    }

    return admins;
  } catch (error) {
    console.error("Lỗi khi lấy danh sách quản trị viên nhóm:", error);
    return [];
  }
}

export async function getGroupName(api, threadId) {
  try {
    const groupInfoResponse = await api.getGroupInfo(threadId);
    const groupName = groupInfoResponse.gridInfoMap[threadId].name;

    return groupName;
  } catch (error) {
    console.error("Lỗi khi lấy tên nhóm:", error);
    return [];
  }
}

export async function getGroupInfoData(api, threadId) {
  const groupInfo = await api.getGroupInfo(threadId);
  return getAllInfoGroup(groupInfo, threadId);
}

function getAllInfoGroup(groupInfo, threadId) {
  const info = groupInfo.gridInfoMap[threadId];
  return {
    name: info.name,
    memberCount: info.memVerList.length,
    createdTime: new Date(info.createdTime).toLocaleDateString("vi-VN"), 
    groupType: info.type,
    memVerList: info.memVerList,
    creatorId: info.creatorId,
    adminIds: info.adminIds,
    admins: info.admins,
    avt: info.avt,
    fullAvt: info.fullAvt,
    globalId: info.globalId,
    groupId: info.groupId,
    desc: info.desc,
    setting: info.setting,
    totalMember: info.totalMember,
  };
}

export async function getDataAllGroup(api) {
  try {
    const allGroupsResult = await api.getAllGroups();

    if (!allGroupsResult || !allGroupsResult.gridVerMap) {
      throw new Error("Không thể lấy danh sách nhóm");
    }

    const groupIds = Object.keys(allGroupsResult.gridVerMap);

    const allGroupsInfo = await Promise.all(
      groupIds.map(async (threadId) => {
        try {
          const groupInfo = await getGroupInfoData(api, threadId);
          return groupInfo;
        } catch (error) {
          console.error(`Lỗi khi lấy thông tin nhóm ${threadId}:`, error);
          return null;
        }
      })
    );

    const validGroupsInfo = allGroupsInfo.filter((info) => info !== null);

    return validGroupsInfo;
  } catch (error) {
    console.error("Lỗi khi lấy thông tin tất cả các nhóm:", error);
    throw error;
  }
}

function getConfigStatus(threadId, groupSettings) {
  const settings = groupSettings[threadId] || {};
  const onConfigs = [];
  const offConfigs = [];

  Object.entries(settings)
    .filter(([key, value]) => typeof value === "boolean")
    .forEach(([key, value]) => {
      const configLine = `${getSettingEmoji(key)} ${getSettingName(key)}`;
      if (value) {
        onConfigs.push(configLine);
      } else {
        offConfigs.push(configLine);
      }
    });

  return { onConfigs, offConfigs };
}

function getSettingEmoji(settingKey) {
  const emojiMap = {
    antiSpam: "🔰",
    removeLinks: "🔗",
    filterBadWords: "🚫",
    filterBot: "🐳",
    welcomeGroup: "👋",
    byeGroup: "👋",
    enableKickImage: "🚀",
    enableBlockImage:"⛔️",
    learnEnabled: "💡",
    replyEnabled: "💬",
    activeBot: "🤖",
    activeGame: "🎮",
    memberApprove: "👥",
    antiNude: "🚫",
    antiUndo: "🚫",
    sendTask: "🔔",
    antiMedia: "🎬",
    antiSticker: "⛔️",
    autoReply: "🤖",
    removeLinkKeywords: "🚫",
    autoDownload: "📥",
    blockForward: "🚫",
  };
  return emojiMap[settingKey] || "⚙️";
}

export function getSettingName(settingKey) {
  const nameMap = {
    activeBot: "Tương tác với thành viên",
    activeGame: "Kích hoạt tương tác trò chơi",
    antiSpam: "Chống rác spam",
    removeLinks: "Chặn liên kết",
    filterBadWords: "Xoá tin nhắn thô tục",
    filterBot: "Chặn những bot khác ở box",
    welcomeGroup: "Chào mừng thành viên mới",
    byeGroup: "Báo cáo thành viên rời nhóm",
    learnEnabled: "Học máy",
    replyEnabled: "Trả lời tin nhắn nhóm",
    onlyText: "Chỉ được nhắn tin văn bản",
    memberApprove: "Phê duyệt thành viên mới",
    antiNude: "Chống ảnh nhạy cảm",
    antiUndo: "Chống thu hồi tin nhắn",
    sendTask: "Gửi nội dung tự động",
    antiMedia: "Xóa media gửi vào nhóm",
    antiSticker: "Xoá tất cả những sticker",
    removeLinkKeywords: "Chặn link được chỉ định",
    autoReply: "Xử lý tự động trả lời tin nhắn",
    autoDownload: "Tự động tải media từ link",
    blockForward: "Chống tin nhắn chuyển tiếp",
  };
  return nameMap[settingKey] || settingKey;
}
