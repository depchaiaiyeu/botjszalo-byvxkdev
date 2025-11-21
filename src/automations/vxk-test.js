import { getBotId } from "../index.js";
import { sendMessageStateQuote, sendMessageFromSQL } from "../service-hahuyhoang/chat-zalo/chat-style/chat-style.js";
import { ReactionMap } from "../api-zalo/models/Reaction.js";

const threadCooldowns = new Map();
const AUTO_REPLY_COOLDOWN = 5 * 60 * 1000;
const MESSAGE_TTL = AUTO_REPLY_COOLDOWN;

export async function superCheckBox(api, message, isSelf, botIsAdminBox, isAdminBox, groupSettings) {
    if (isSelf || !message.data?.mentions?.length) return false;

    const threadId = message.threadId;
    const mentions = message.data.mentions;
    const botUid = getBotId();
    const botMentioned = mentions.some(m => m.uid === botUid);

    if (!botMentioned) return false;
    if (!groupSettings[threadId]?.autoReply) return false;

    if (threadCooldowns.has(threadId)) {
        const releaseTime = threadCooldowns.get(threadId);
        if (Date.now() < releaseTime) return false;
    }

    const keys = Object.keys(ReactionMap).filter(k => k !== "UNDO");
    for (let i = 0; i < 100; i++) {
        const randomKey = keys[Math.floor(Math.random() * keys.length)];
        try {
            await api.addReaction(randomKey, message);
        } catch {}
    }

    await new Promise(resolve => setTimeout(resolve, 10000));

    const now = new Date();
    const timeString = now.toLocaleTimeString("vi-VN", { hour12: false });
    const msgContent = `Xin chào! Hiện tại là ${timeString}. Đây là tin nhắn trả lời tự động\nHiện tại tôi chưa thể trả lời, vui lòng để lại lời nhắn sau, cảm ơn bạn!...`;

    try {
        await sendMessageFromSQL(api, message, { message: msgContent }, false, MESSAGE_TTL);
        threadCooldowns.set(threadId, Date.now() + AUTO_REPLY_COOLDOWN);
    } catch {}

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
        threadCooldowns.delete(threadId);
    } else {
        groupSettings[threadId].autoReply = !groupSettings[threadId].autoReply;
        if (!groupSettings[threadId].autoReply) {
            threadCooldowns.delete(threadId);
        }
    }

    const newStatus = groupSettings[threadId].autoReply ? "bật" : "tắt";

    await sendMessageStateQuote(
        api,
        message,
        `Chức năng tự động trả lời tin nhắn đã được ${newStatus}!`,
        groupSettings[threadId].autoReply,
        MESSAGE_TTL
    );

    return true;
}
