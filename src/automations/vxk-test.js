import { getBotId } from "../index.js";
import { sendMessageStateQuote, sendMessageFromSQL } from "../service-hahuyhoang/chat-zalo/chat-style/chat-style.js";
import { ReactionMap } from "../api-zalo/models/Reaction.js";

const pendingReplies = new Map();
const lastAutoReplyMap = new Map();
const AUTO_REPLY_COOLDOWN = 5 * 60 * 1000;

export async function superCheckBox(api, message, isSelf, botIsAdminBox, isAdminBox, groupSettings) {
  const threadId = message.threadId;
  const botUid = getBotId();
  const uidFrom = message.data.uidFrom;

  if (uidFrom === botUid || isSelf || message.data?.quote?.ownerId === botUid || message.data?.quote?.senderId === botUid) {
    if (pendingReplies.has(threadId)) {
      clearTimeout(pendingReplies.get(threadId));
      pendingReplies.delete(threadId);
    }
    if (isSelf) return false;
  }

  if (!message.data?.mentions?.length) return false;

  const mentions = message.data.mentions;
  const botMentioned = mentions.some(m => m.uid === botUid);
  if (!botMentioned) return false;

  if (!groupSettings[threadId]?.autoReply) return false;

  const senderId = uidFrom;
  if (!lastAutoReplyMap.has(threadId)) {
    lastAutoReplyMap.set(threadId, new Map());
  }
  const groupMap = lastAutoReplyMap.get(threadId);
  const lastSent = groupMap.get(senderId) || 0;
  const now = Date.now();

  if (now - lastSent < AUTO_REPLY_COOLDOWN) {
    return true;
  }

  if (pendingReplies.has(threadId)) {
    clearTimeout(pendingReplies.get(threadId));
  }

  const keys = Object.keys(ReactionMap).filter(k => k !== "UNDO");
  for (let i = 0; i < 12; i++) {
    const randomKey = keys[Math.floor(Math.random() * keys.length)];
    try {
      await api.addReaction(randomKey, message);
    } catch {}
  }

  const timeoutId = setTimeout(async () => {
    pendingReplies.delete(threadId);
    try {
      const currentTime = new Date();
      const timeString = currentTime.toLocaleTimeString("vi-VN", {
        hour12: false
      });
      const autoReplyContent = `Xin chào!\nHiện tại là ${timeString}.\nĐây là tin nhắn trả lời tự động\nHiện tại tôi chưa thể trả lời, vui lòng để lại lời nhắn sau, cảm ơn bạn!...`;

      await sendMessageFromSQL(api, message, {
        message: autoReplyContent
      }, false, 300000);

      groupMap.set(senderId, Date.now());
    } catch (err) {}
  }, 10000);

  pendingReplies.set(threadId, timeoutId);

  return true;
}

export async function handleAutoReplyCommand(api, message, groupSettings) {
  const content = message.data?.content || "";
  const threadId = message.threadId;
  const args = content.split(" ");
  const command = args[1]?.toLowerCase();

  if (!groupSettings[threadId]) groupSettings[threadId] = {};

  if (command === "on") {
    groupSettings[threadId].autoReply = true;
  } else if (command === "off") {
    groupSettings[threadId].autoReply = false;
  } else {
    groupSettings[threadId].autoReply = !groupSettings[threadId].autoReply;
  }

  const newStatus = groupSettings[threadId].autoReply ? "bật" : "tắt";
  await sendMessageStateQuote(
    api,
    message,
    `Chức năng tự động trả lời tin nhắn đã được ${newStatus}!`,
    groupSettings[threadId].autoReply,
    300000
  );
  return true;
}
