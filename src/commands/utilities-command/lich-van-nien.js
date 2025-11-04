import { sendMessageQuery } from "../../service-hahuyhoang/chat-zalo/chat-style/chat-style.js";
import fs from "fs/promises";
import { createCalendarImage, clearImagePath } from "../../utils/canvas/lich-van-nien.js";

export async function handleCalendarCommand(api, message) {
  const threadId = message.threadId;
  
  try {
    const command = (message.data.content || "").toLowerCase().trim();
    
    let imagePath;
    
    if (command.includes("month")) {
      const monthMatch = command.match(/month\s+(\d+)/);
      
      if (monthMatch) {
        const inputMonth = parseInt(monthMatch[1]);
        if (inputMonth >= 1 && inputMonth <= 12) {
          imagePath = await createCalendarImage(inputMonth, true);
        } else {
          imagePath = await createCalendarImage();
        }
      } else {
        const currentMonth = new Date().getMonth() + 1;
        imagePath = await createCalendarImage(currentMonth, true);
      }
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
