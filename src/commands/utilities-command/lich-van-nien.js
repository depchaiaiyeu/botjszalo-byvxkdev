import { sendMessageQuery } from "../../service-hahuyhoang/chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service-hahuyhoang/service.js";
import { removeMention } from "../../utils/format-util.js";
import fs from "fs/promises";
import { createCalendarImage, clearImagePath } from "../../utils/canvas/calendar.js";

export async function handleCalendarCommand(api, message) {
  const content = removeMention(message);
  const prefix = getGlobalPrefix();
  const threadId = message.threadId;

  if (!content.includes(`${prefix}lichvannien`)) {
    return false;
  }

  try {
    const imagePath = await createCalendarImage();

    await api.sendMessage(
      {
        msg: "📅 Lịch Vạn Niên",
        attachments: [imagePath]
      },
      threadId,
      message.type
    );

    await clearImagePath(imagePath);
  } catch (error) {
    console.error("Lỗi khi tạo lịch vạn niên:", error);
    await sendMessageQuery(api, message, "Đã xảy ra lỗi khi tạo lịch vạn niên. Vui lòng thử lại sau.");
  }

  return true;
}
