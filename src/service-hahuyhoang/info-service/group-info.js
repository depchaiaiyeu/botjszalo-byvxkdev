import { MessageType } from "zlbotdqt";
import { createGroupInfoImage, clearImagePath } from "../../utils/canvas/index.js";
import { sendMessageWarning } from "../chat-zalo/chat-style/chat-style.js";
import { getUserInfoData } from "./user-info.js";

export async function groupInfoCommand(api, message, groupSettings = {}) {
  const threadId = message.threadId;

  try {
    const groupInfo = await getGroupInfoData(api, threadId);
    const owner = await getUserInfoData(api, groupInfo.creatorId);
    const { onConfigs, offConfigs } = getConfigStatus(threadId, groupSettings);
    const imagePath = await createGroupInfoImage(groupInfo, owner, onConfigs, offConfigs);
    await api.sendMessage({ msg: "", attachments: [imagePath], quote: message }, threadId, MessageType.GroupMessage);
    clearImagePath(imagePath);
  } catch (error) {
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
  return {
    name: groupInfo.gridInfoMap[threadId].name,
    memberCount: groupInfo.gridInfoMap[threadId].memVerList.length,
    createdTime: new Date(groupInfo.gridInfoMap[threadId].createdTime).toLocaleString(),
    groupType: groupInfo.gridInfoMap[threadId].type,
    memVerList: groupInfo.gridInfoMap[threadId].memVerList,
    creatorId: groupInfo.gridInfoMap[threadId].creatorId,
    adminIds: groupInfo.gridInfoMap[threadId].adminIds,
    admins: groupInfo.gridInfoMap[threadId].admins,
    avt: groupInfo.gridInfoMap[threadId].avt,
    fullAvt: groupInfo.gridInfoMap[threadId].fullAvt,
    globalId: groupInfo.gridInfoMap[threadId].globalId,
    groupId: groupInfo.gridInfoMap[threadId].groupId,
    desc: groupInfo.gridInfoMap[threadId].desc,
    setting: groupInfo.gridInfoMap[threadId].setting,
    totalMember: groupInfo.gridInfoMap[threadId].totalMember,
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

export async function getConfigStatus(threadId, groupSettings) {
  const settings = groupSettings[threadId] || {};
  const onConfigs = [];
  const offConfigs = [];

  Object.entries(settings)
    .filter(([key, value]) => typeof value === "boolean")
    .forEach(([key, value]) => {
      const status = value ? "✅" : "❌";
      const configLine = `${getSettingEmoji(key)} ${getSettingName(key)}: ${status}`;
      if (value) {
        onConfigs.push(configLine);
      } else {
        offConfigs.push(configLine);
      }
    });

  return { onConfigs, offConfigs };
}

export async function getSettingEmoji(settingKey) {
  const emojiMap = {
    antiSpam: "🔰",
    removeLinks: "🔗",
    filterBadWords: "🚫",
    filterBot: "🐳",
    welcomeGroup: "👋",
    byeGroup: "👋",
    enableKickImage: "🚀",
    enableBlockImage: "⛔️",
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

export async function getSettingName(settingKey) {
  const nameMap = {
    activeBot: "Tương tác với thành viên",
    activeGame: "Xử lý tương tác trò chơi",
    antiSpam: "Chống rác spam",
    removeLinks: "Chặn liên kết",
    filterBadWords: "Xoá tin nhắn thô tục",
    filterBot: "Chặn những bot khác ở group",
    welcomeGroup: "Chào thành viên mới",
    byeGroup: "Báo thành viên rời nhóm",
    learnEnabled: "Học máy",
    replyEnabled: "Trả lời tin nhắn nhóm",
    onlyText: "Chỉ được nhắn tin văn bản",
    memberApprove: "Phê duyệt thành viên mới",
    antiNude: "Chống ảnh nhạy cảm",
    antiUndo: "Chống thu hồi tin nhắn",
    sendTask: "Gửi nội dung tự động",
    antiMedia: "Xóa media gửi vào nhóm",
    antiSticker: "Xoá tất cả Sticker",
    removeLinkKeywords: "Chặn link được chỉ định",
    autoReply: "Xử lý tự động trả lời tin nhắn",
    autoDownload: "Tự động tải media từ link",
    blockForward: "Chống tin nhắn chuyển tiếp",
  };
  return nameMap[settingKey] || settingKey;
}
