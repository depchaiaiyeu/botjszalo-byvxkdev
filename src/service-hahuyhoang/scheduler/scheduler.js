import fs from "fs";
import { readGroupSettings, writeGroupSettings } from "../../utils/io-json.js";
import { MessageType } from "../../api-zalo/index.js";
import { sendRandomGirlVideo } from "../chat-zalo/chat-special/send-video/send-video.js";
import { createCalendarImage, clearImagePath } from "../../utils/canvas/lich-van-nien.js";
import path from "path";
import { sendTaskTopChat } from "../info-service/rank-chat.js";

const scheduledTasks = [
  {
    time: "06:05",
    task: async (api) => {
      const caption = "-> SendTask 06:05 <-\nXem lịch của ngày hôm nay nào\n\nChúc bạn một ngày mới tràn đầy năng lượng!";
      const timeToLive = 1000 * 60 * 60 * 6;
      await sendTaskCalendar(api, caption, timeToLive);
    },
  },
  {
    time: "08:05",
    task: async (api) => {
      const caption = `-> SendTask 08:05 <-\nChào buổi sáng đầy năng lượng!\n\nCung cấp vitamin gái cho anh em đây!!!`;
      const timeToLive = 1000 * 60 * 60 * 1;
      await sendTaskGirlVideo(api, caption, timeToLive);
    },
  },
  {
    time: "09:05",
    task: async (api) => {
      const caption = `-> SendTask 09:05 <-\nChào một buổi sáng sôi động!\n\nCung cấp vitamin gái cực sexy cho anh em đây!!!`;
      const timeToLive = 1000 * 60 * 60 * 1;
      await sendTaskGirlVideo(api, caption, timeToLive, "sexy");
    },
  },
  {
    time: "10:05",
    task: async (api) => {
      const caption = `-> SendTask 10:05 <-\nGiữa buổi sáng, thư giãn chút!\n\nGiải trí với nữ cosplay cho anh em đây!!!`;
      const timeToLive = 1000 * 60 * 60 * 1;
      await sendTaskGirlVideo(api, caption, timeToLive, "cosplay");
    },
  },
  {
    time: "11:05",
    task: async (api) => {
      const caption = `-> SendTask 11:05 <-\nChuẩn bị trưa, chill đi!\n\nGiải trí anime cho bớt căng não anh em nhé!!!`;
      const timeToLive = 1000 * 60 * 60 * 1;
      await sendTaskGirlVideo(api, caption, timeToLive, "anime");
    },
  },
  {
    time: "12:05",
    task: async (api) => {
      const caption = "-> SendTask 12:05 <-\nCùng nhau xem lại lịch của ngày hôm nay\nChúc bạn buổi trưa vui vẻ!";
      const timeToLive = 1000 * 60 * 60 * 6;
      await sendTaskCalendar(api, caption, timeToLive);
    },
  },
  {
    time: "13:05",
    task: async (api) => {
      const caption = `-> SendTask 13:05 <-\nChào buổi chiều năng động!\n\nCung cấp vitamin gái cho anh em đây!!!`;
      const timeToLive = 1000 * 60 * 60 * 1;
      await sendTaskGirlVideo(api, caption, timeToLive);
    },
  },
  {
    time: "14:05",
    task: async (api) => {
      const caption = `-> SendTask 14:05 <-\nGiữa chiều, boost năng lượng!\n\nCung cấp vitamin gái cực sexy cho anh em đây!!!`;
      const timeToLive = 1000 * 60 * 60 * 1;
      await sendTaskGirlVideo(api, caption, timeToLive, "sexy");
    },
  },
  {
    time: "15:05",
    task: async (api) => {
      const caption = `-> SendTask 15:05 <-\nXế chiều rồi, vui vẻ lên!\n\nGiải trí với nữ cosplay cho anh em đây!!!`;
      const timeToLive = 1000 * 60 * 60 * 1;
      await sendTaskGirlVideo(api, caption, timeToLive, "cosplay");
    },
  },
  {
    time: "16:05",
    task: async (api) => {
      const caption = `-> SendTask 16:05 <-\nCuối chiều, relax chút!\n\nGiải trí anime cho bớt căng não anh em nhé!!!`;
      const timeToLive = 1000 * 60 * 60 * 1;
      await sendTaskGirlVideo(api, caption, timeToLive, "anime");
    },
  },
  {
    time: "17:05",
    task: async (api) => {
      const caption = `-> SendTask 17:05 <-\nChiều tà, tiếp tục năng lượng!\n\nCung cấp vitamin gái cho anh em đây!!!`;
      const timeToLive = 1000 * 60 * 60 * 1;
      await sendTaskGirlVideo(api, caption, timeToLive);
    },
  },
  {
    time: "18:05",
    task: async (api) => {
      const caption = `-> SendTask 18:05 <-\nTối nay chill thôi!\n\nCung cấp vitamin gái cực sexy cho anh em đây!!!`;
      const timeToLive = 1000 * 60 * 60 * 1;
      await sendTaskGirlVideo(api, caption, timeToLive, "sexy");
    },
  },
  {
    time: "21:27",
    task: async (api) => {
      const caption = `-> SendTask 21:05 <-\nTổng kết tương tác trong ngày 📝\n\n`;
      const timeToLive = 1000 * 60 * 60 * 8;
      await sendTaskTopChat(api, caption, timeToLive);
    },
  },
];

async function sendTaskCalendar(api, caption, timeToLive) {
  const groupSettings = readGroupSettings();
  let imagePath = null;
  
  try {
    imagePath = await createCalendarImage();
    
    for (const threadId of Object.keys(groupSettings)) {
      if (groupSettings[threadId].sendTask) {
        try {
          await api.sendMessage(
            {
              msg: caption,
              attachments: [imagePath],
              ttl: timeToLive,
            },
            threadId,
            MessageType.GroupMessage
          );
        } catch (error) {
          console.error(`Lỗi khi gửi lịch vạn niên đến nhóm ${threadId}:`, error);
          if (error.message && error.message.includes("không tồn tại")) {
            groupSettings[threadId].sendTask = false;
            writeGroupSettings(groupSettings);
          }
        }
      }
    }
  } catch (error) {
    console.error("Lỗi khi tạo lịch vạn niên:", error);
  } finally {
    if (imagePath) {
      await clearImagePath(imagePath);
    }
  }
}

async function sendTaskGirlVideo(api, caption, timeToLive, type = "default") {
  const groupSettings = readGroupSettings();
  for (const threadId of Object.keys(groupSettings)) {
    if (groupSettings[threadId].sendTask) {
      try {
        const message = {
          threadId: threadId,
          type: MessageType.GroupMessage,
        };
        await sendRandomGirlVideo(api, message, caption, type, timeToLive);
      } catch (error) {
        console.error(`Lỗi khi gửi video gái in ${threadId}:`, error);
        if (error.message && error.message.includes("không tồn tại")) {
          groupSettings[threadId].sendTask = false;
          writeGroupSettings(groupSettings);
        }
      }
    }
  }
}

export async function initializeScheduler(api) {
  setInterval(() => {
    const now = new Date();
    const hour = now.getHours().toString().padStart(2, "0");
    const minute = now.getMinutes().toString().padStart(2, "0");
    const currentTime = `${hour}:${minute}`;

    const task = scheduledTasks.find((t) => t.time === currentTime);
    if (task) {
      task.task(api).catch((error) => {
        console.error("Lỗi khi thực thi tác vụ định kỳ:", error);
      });
    }
  }, 60000);
}
