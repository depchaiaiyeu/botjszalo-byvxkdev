import { sendMessageQuery } from "../../service-hahuyhoang/chat-zalo/chat-style/chat-style.js";
import fs from "fs/promises";
import { createCalendarImage, clearImagePath } from "../../utils/canvas/lich-van-nien.js";

export async function handleCalendarCommand(api, message) {
  const threadId = message.threadId;

  try {
    const imagePath = await createCalendarImage();
    await api.sendMessage(
      {
        attachments: [imagePath],
      },
      threadId,
      message.type
    );

    await clearImagePath(imagePath);
  } catch (error) {
    console.error("Lỗi khi tạo lịch vạn niên:", error);
    await sendMessageQuery(
      api,
      message,
      "Đã xảy ra lỗi khi tạo lịch vạn niên. Vui lòng thử lại sau."
    );
  }

  return true;
}
