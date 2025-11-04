import { sendMessageQuery } from "../../service-hahuyhoang/chat-zalo/chat-style/chat-style.js";
import fs from "fs/promises";
import { createCalendarImage, clearImagePath } from "../../utils/canvas/lich-van-nien.js";

export async function handleCalendarCommand(api, message) {
  const threadId = message.threadId;

  const commandBody = message.data?.content || message.body || "";
  const parts = commandBody.toLowerCase().split(/\s+/).filter(p => p.length > 0);

  let requestedMonth = undefined;

  const monthKeywordIndex = parts.findIndex(p => p === 'month');

  if (monthKeywordIndex !== -1) {
    const potentialMonthToken = parts[monthKeywordIndex + 1];
    const monthNum = parseInt(potentialMonthToken, 10);

    if (!isNaN(monthNum) && monthNum >= 1 && monthNum <= 12) {
      requestedMonth = monthNum;
    }
  }

  try {
    let imagePath;
    if (requestedMonth) {
      imagePath = await createCalendarImage(requestedMonth);
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
