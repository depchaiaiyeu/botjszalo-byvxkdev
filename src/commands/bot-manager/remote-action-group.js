import schedule from "node-schedule";
import {
  sendMessageComplete,
  sendMessageCompleteRequest,
  sendMessageFromSQL,
  sendMessageWarningRequest,
} from "../../service-hahuyhoang/chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service-hahuyhoang/service.js";
import { getDataAllGroup } from "../../service-hahuyhoang/info-service/group-info.js";
import { getUserInfoData } from "../../service-hahuyhoang/info-service/user-info.js";
import { removeMention } from "../../utils/format-util.js";
import { handleCommand } from "../command.js";

const requestJoinGroupMap = new Map();
const waitingActionGroupMap = new Map();
const waitingActionJoinGroup = 30000;
const timeOutWaitingActionGroup = 60000;

schedule.scheduleJob("*/5 * * * * *", () => {
  const currentTime = Date.now();
  for (const [msgId, data] of requestJoinGroupMap.entries()) {
    if (currentTime - data.timestamp > waitingActionJoinGroup) {
      requestJoinGroupMap.delete(msgId);
    }
  }
  for (const [msgId, data] of waitingActionGroupMap.entries()) {
    if (currentTime - data.timestamp > timeOutWaitingActionGroup) {
      waitingActionGroupMap.delete(msgId);
    }
  }
});

async function handleBatchGroupJoin(api, message, listIdsToJoin, targetName) {
  let successCount = 0;
  let failCount = 0;
  let resultMessage = "";

  for (const groupId of listIdsToJoin) {
    try {
      await api.joinGroupInviteBox(String(groupId));
      successCount++;
    } catch (error) {
      failCount++;
    }
  }
  
  resultMessage = `Nhóm: ${targetName}\n`;
  resultMessage += `\n- Tham gia thành công: ${successCount}`;
  if (failCount > 0) resultMessage += `\n- Thất bại: ${failCount}`;

  await sendMessageFromSQL(api, message, { success: true, message: resultMessage }, true, 180000);
}

export async function handleJoinGroup(api, message) {
  const prefix = getGlobalPrefix();
  const content = removeMention(message);

  let linkJoin = null;

  if (message.data.quote) {
    const quote = message.data.quote;
    if (quote.msg) {
      linkJoin = quote.msg;
    }
    if (!linkJoin && quote.attach && quote.attach !== "") {
      try {
        let attachData = quote.attach;
        if (typeof attachData === "string") {
          attachData = JSON.parse(attachData);
          if (attachData.params && typeof attachData.params === "string") {
            attachData.params = JSON.parse(
              attachData.params.replace(/\\\\/g, "\\").replace(/\\\//g, "/")
            );
          }
        }
        if (attachData.href) {
          linkJoin = attachData.href;
        }
      } catch (e) {
        linkJoin = quote.attach;
      }
    }
  }

  if (!linkJoin) {
    const commandParts = content.split(" ");
    linkJoin = commandParts[1];
  }

  if (!linkJoin) {
    await sendMessageFromSQL(
      api,
      message,
      {
        success: false,
        message: `Cú pháp tham gia nhóm thông qua link:\n${prefix}join [link] hoặc reply vào tin nhắn có link nhóm cần tham gia`,
      },
      false,
      30000
    );
    return;
  }

  if (!linkJoin.includes("zalo.me/g/")) {
    await sendMessageFromSQL(
      api,
      message,
      {
        success: false,
        message: `Link phải có định dạng zalo.me/g/`,
      },
      false,
      30000
    );
    return;
  }

  let groupInfo = null;
  try {
    groupInfo = await api.getGroupInfoByLink(linkJoin);
  } catch {
    await sendMessageFromSQL(
      api,
      message,
      {
        success: false,
        message: `Link này không tồn tại nhóm/cộng đồng nào!`,
      },
      true,
      30000
    );
    return;
  }
  if (!groupInfo) return;
  const typeGroup = groupInfo.type === 2 ? "Cộng đồng" : "Nhóm";
  const msgResponse = await sendMessageCompleteRequest(
    api,
    message,
    {
      caption:
        `Tên ${typeGroup}: ${groupInfo.name}\nMô tả: ${groupInfo.desc || "Không có mô tả"}\nTổng số thành viên: ${groupInfo.totalMember}` +
        `\n\nXác nhận tham gia ${typeGroup} bằng cách thả reaction like hoặc heart!`,
    },
    waitingActionJoinGroup
  );
  const msgId = msgResponse.message.msgId.toString();
  requestJoinGroupMap.set(msgId, {
    message,
    timestamp: Date.now(),
    groupInfo,
    linkJoin,
  });
}

export async function handleReactionConfirmJoinGroup(api, reaction) {
  const msgId = reaction.data.content.rMsg[0].gMsgID.toString();
  const data = requestJoinGroupMap.get(msgId);
  if (!data) return false;
  const senderId = reaction.data.uidFrom;
  if (senderId !== data.message.data.uidFrom) return false;
  const rType = reaction.data.content.rType;
  if (rType !== 3 && rType !== 5) return false;
  const message = data.message;
  requestJoinGroupMap.delete(msgId);
  try {
    await api.joinGroup(data.linkJoin);
    await sendMessageFromSQL(
      api,
      message,
      {
        success: true,
        message: `Bé đã tham gia vào nhóm thành công!`,
      },
      true,
      180000
    );
  } catch (error) {
    if (error.message.includes("Waiting for approve")) {
      await sendMessageWarningRequest(
        api,
        message,
        {
          caption: `Bé đã gửi yêu cầu tham gia nhóm này và đang chờ chủ nhóm phê duyệt!`,
        },
        180000
      );
    }
    if (error.message.includes("đã là thành viên")) {
      await sendMessageWarningRequest(
        api,
        message,
        {
          caption: `Bé đã là thành viên của nhóm này!`,
        },
        180000
      );
    }
    if (error.message.includes("chặn tham gia nhóm")) {
      await sendMessageWarningRequest(
        api,
        message,
        {
          caption: `Bé đã bị chặn tham gia nhóm này!`,
        },
        180000
      );
    }
  }
  return true;
}

export async function handleLeaveGroup(api, message) {
  const threadId = message.threadId;

  await sendMessageFromSQL(
    api,
    message,
    {
      success: true,
      message: "Tạm biệt mọi người",
    },
    true,
    30000
  );

  await api.leaveGroup(threadId);
}

export async function handleShowGroupsList(api, message, aliasCommand) {
  const prefix = getGlobalPrefix();
  const content = removeMention(message);
  const command = content.replace(`${prefix}${aliasCommand}`, "").trim();
  try {
    const groups = await getDataAllGroup(api);
    let filteredGroups;
    if (!command) {
      filteredGroups = groups;
    } else {
      filteredGroups = groups.filter((group) =>
        group.name.toUpperCase().includes(command.toUpperCase())
      );
    }
    if (!filteredGroups.length) {
      await sendMessageFromSQL(
        api,
        message,
        {
          success: false,
          message: `Không tìm thấy nhóm nào có tên chứa "${command}"!`,
        },
        false,
        30000
      );
      return;
    }
    let contentMessage =
      `Reply tin nhắn này với số index và "->" + cú pháp ` +
      `liên quan đến hành động mà sếp muốn tôi thực hiện:\n`;
    for (const [index, group] of filteredGroups.entries()) {
      const owner = await getUserInfoData(api, group.creatorId);
      contentMessage +=
        `${index + 1}. ${group.name} (${group.totalMember} thành viên)\n` +
        ` - Trưởng nhóm: ${owner.name}\n\n`;
    }
    const msgResponse = await sendMessageCompleteRequest(
      api,
      message,
      {
        caption: contentMessage,
      },
      timeOutWaitingActionGroup
    );
    const msgId = msgResponse.message.msgId.toString();
    waitingActionGroupMap.set(msgId, {
      message,
      timestamp: Date.now(),
      type: 'group_list',
      groups: filteredGroups,
    });
  } catch (error) {
    console.error(error);
  }
}

export async function handleActionGroupReply(
  api,
  message,
  groupInfo,
  groupAdmins,
  groupSettings,
  isAdminLevelHighest,
  isAdminBot,
  isAdminBox,
  handleChat
) {
  const senderName = message.data.dName;
  const prefix = getGlobalPrefix();
  const senderId = message.data.uidFrom;
  let content = removeMention(message);
  try {
    if (!message.data.quote || !message.data.quote.globalMsgId || !content)
      return false;
    const quotedMsgId = message.data.quote.globalMsgId.toString();
    const dataReply = waitingActionGroupMap.get(quotedMsgId);
    if (!dataReply || dataReply.type !== 'group_list') return false; 
    if (dataReply.message.data.uidFrom !== senderId) return false;
    const commandParts = content.split("->");
    if (commandParts.length !== 2) return false;
    const index = parseInt(commandParts[0]);
    if (isNaN(index)) {
      const object = {
        caption: `Lựa chọn không hợp lệ. Vui lòng chọn một số từ danh sách.`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return true;
    }
    const action = commandParts[1];
    if (action && !action.startsWith(prefix)) {
      return false;
    }
    if (index < 1 || index > dataReply.groups.length) {
      await sendMessageFromSQL(
        api,
        message,
        {
          success: false,
          message: `Số index không hợp lệ!`,
        },
        false,
        30000
      );
      return false;
    }
    const group = dataReply.groups[index - 1];
    switch (action) {
      default:
        const idHere = message.threadId;
        message.threadId = group.groupId;
        message.data.content = action;
        message.data.mentions = [];
        const numHandleCommand = await handleCommand(
          api,
          message,
          groupInfo,
          groupAdmins,
          groupSettings,
          isAdminLevelHighest,
          isAdminBot,
          isAdminBox,
          handleChat
        );
        message.threadId = idHere;
        if (numHandleCommand === 1 || numHandleCommand === 2 || numHandleCommand === 3 || numHandleCommand === 5) {
          const result = {
            success: true,
            message: `Đã thực hiện hành động "${action}" trong nhóm "${group.name}"!`,
          };
          await sendMessageFromSQL(api, message, result, true, 60000);
        }
        break;
    }
    return true;
  } catch (error) {
    console.error(error);
  }
}


export async function handleInviteGroupCommand(api, message, aliasCommand) {
  const prefix = getGlobalPrefix();
  let content = removeMention(message);
  content = content.replace(`${prefix}${aliasCommand}`, "").trim();
  
  const args = content.split(" ");
  const action = args[0]?.toLowerCase();
  
  try {
    const response = await api.getGroupInviteBoxList();
    const invitations = response.invitations || [];

    if (invitations.length === 0) {
      await sendMessageFromSQL(api, message, { 
        success: false, 
        message: "Hiện tại không có lời mời tham gia nhóm nào." 
      }, false, 30000);
      return;
    }

    if (action === "approve") {
      const target = args[1] ? args[1].toLowerCase() : "";
      const listIdsToJoin = [];
      let targetName = "";

      if (!target) {
        await sendMessageWarningRequest(api, message, { 
          caption: `Vui lòng nhập index hoặc 'all'. Ví dụ: ${prefix}${aliasCommand} approve all` 
        }, 30000);
        return;
      }
      
      if (target === "all") {
        listIdsToJoin.push(...invitations.map(inv => String(inv.groupInfo.id)));
        targetName = "toàn bộ";
      } else {
        const index = parseInt(target);
        if (isNaN(index) || index < 1 || index > invitations.length) {
          await sendMessageWarningRequest(api, message, { 
            caption: `Index không hợp lệ. Vui lòng chọn từ 1 đến ${invitations.length}.` 
          }, 30000);
          return;
        }
        const group = invitations[index - 1];
        listIdsToJoin.push(String(group.groupInfo.groupId));
        targetName = group.groupInfo.name;
      }

      await handleBatchGroupJoin(api, message, listIdsToJoin, targetName);
      return;
    }

    let contentMessage = `📋 Danh sách ${invitations.length} lời mời tham gia nhóm:\n\n`;
    
    for (const [index, invite] of invitations.entries()) {
      const groupName = invite.groupInfo.name;
      const inviterName = invite.inviterInfo.dName;
      contentMessage += `${index + 1}. ${groupName}\n   • Mời bởi: ${inviterName}\n\n`;
    }

    contentMessage += `👉 Sử dụng: ${prefix}${aliasCommand} approve [index/all] để tham gia.`;

    await sendMessageCompleteRequest(api, message, { caption: contentMessage }, 60000);

  } catch (error) {
    console.error("Lỗi invite group:", error);
    await sendMessageWarningRequest(api, message, { 
      caption: `Có lỗi xảy ra khi xử lý lời mời nhóm: ${error.message}` 
    }, 60000);
  }
}
