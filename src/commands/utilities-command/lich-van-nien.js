import { sendMessageQuery } from "../../service-hahuyhoang/chat-zalo/chat-style/chat-style.js";
import fs from "fs/promises";
import { createCalendarImage, clearImagePath } from "../../utils/canvas/lich-van-nien.js";

export async function handleCalendarCommand(api, message) {
  const threadId = message.threadId;
  const content = message.data.content.toLowerCase();
  const words = content.split(/\s+/);
  try {
    let imagePath;
    if (words.includes('month')) {
      const monthIndex = words.indexOf('month');
      let month = new Date().getMonth() + 1;
      if (monthIndex + 1 < words.length && !isNaN(words[monthIndex + 1])) {
        const num = parseInt(words[monthIndex + 1]);
        if (num >= 1 && num <= 12) {
          month = num;
        }
      }
      imagePath = await createCalendarImage(month);
    } else {
      imagePath = await createCalendarImage();
    }
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
