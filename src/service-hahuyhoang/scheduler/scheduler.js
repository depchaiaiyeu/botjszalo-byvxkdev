import fs from "fs";
import { readGroupSettings, writeGroupSettings } from "../../utils/io-json.js";
import { MessageType } from "../../api-zalo/index.js";
import { sendRandomGirlVideo } from "../chat-zalo/chat-special/send-video/send-video.js";
import { createCalendarImage, clearImagePath } from "../../utils/canvas/lich-van-nien.js";
import path from "path";
import { getClientId, getMusicInfo, getMusicStreamUrl } from "../api-crawl/music/soundcloud.js";
import { downloadAndConvertAudio } from "../chat-zalo/chat-special/send-voice/process-audio.js";
import { sendVoiceMusic } from "../chat-zalo/chat-special/send-voice/send-voice.js";

const rankInfoPath = path.join(process.cwd(), "assets", "json-data", "rank-info.json");

function readRankInfo() {
  try {
    const data = JSON.parse(fs.readFileSync(rankInfoPath, "utf8"));
    if (!data) data = {};
    if (!data.groups) data.groups = {};
    return data;
  } catch (error) {
    console.error("Lỗi khi đọc file rank-info.json:", error);
    return { groups: {} };
  }
}

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
    time: "06:05",
    task: async (api) => {
      const caption = `-> SendTask 06:05 <-\nThức dậy cho một ngày mới\nđầy năng lượng thôi nào!\n\nĐón bình minh ngày mới cùng tớ nhé!!!`;
      const timeToLive = 1000 * 60 * 60 * 3;
      await sendTaskVideo(api, caption, timeToLive, "ngắm bình minh chill");
    },
  },
  {
    time: "09:05",
    task: async (api) => {
      const caption = `-> SendTask 09:05 <-\nChào buổi sáng\ncùng đón nắng ấm suơng mưa nhé!\n\nGiải trí một chút để bớt căng thẳng thôi nào!!!`;
      const timeToLive = 1000 * 60 * 60 * 1;
      await sendTaskVideo(api, caption, timeToLive, "nhạc chill cảnh đẹp");
    },
  },
  {
    time: "10:05",
    task: async (api) => {
      const caption = `-> SendTask 10:05 <-\nChào một buổi trưa đầy năng lượng!\n\nCung cấp vitamin gái cho anh em đây!!!`;
      const timeToLive = 1000 * 60 * 60 * 1;
      await sendTaskGirlVideo(api, caption, timeToLive);
    },
  },
  {
    time: "11:05",
    task: async (api) => {
      const caption = `-> SendTask 11:05 <-\nChào một buổi trưa đầy năng lượng!\n\nCung cấp vitamin gái cực sexy cho anh em đây!!!`;
      const timeToLive = 1000 * 60 * 60 * 1;
      await sendTaskGirlVideo(api, caption, timeToLive, "sexy");
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
    time: "12:05",
    task: async (api) => {
      const caption = `-> SendTask 12:05 <-\nChào một buổi trưa đầy năng lượng!\n\nGiải trí với nữ cosplay cho anh em đây!!!`;
      const timeToLive = 1000 * 60 * 60 * 1;
      await sendTaskGirlVideo(api, caption, timeToLive, "cosplay");
    },
  },
  {
    time: "13:05",
    task: async (api) => {
      const caption = `-> SendTask 13:05 <-\nChào một buổi trưa đầy năng lượng!\n\nGiải trí anime cho bớt căng não anh em nhé!!!`;
      const timeToLive = 1000 * 60 * 60 * 1;
      await sendTaskGirlVideo(api, caption, timeToLive, "anime");
    },
  },
  {
    time: "14:05",
    task: async (api) => {
      const caption = `-> SendTask 14:05 <-\nChào một buổi trưa đầy năng lượng!\n\nCung cấp vitamin gái cho anh em đây!!!`;
      const timeToLive = 1000 * 60 * 60 * 1;
      await sendTaskGirlVideo(api, caption, timeToLive);
    },
  },
  {
    time: "15:05",
    task: async (api) => {
      const caption = `-> SendTask 15:05 <-\nChào một buổi xế chiều đầy năng lượng!\n\nCung cấp vitamin gái cực sexy cho anh em đây!!!`;
      const timeToLive = 1000 * 60 * 60 * 1;
      await sendTaskGirlVideo(api, caption, timeToLive, "sexy");
    },
  },
  {
    time: "16:05",
    task: async (api) => {
      const caption = `-> SendTask 16:05 <-\nChào một buổi xế chiều đầy năng lượng!\n\nGiải trí với nữ cosplay cho anh em đây!!!`;
      const timeToLive = 1000 * 60 * 60 * 1;
      await sendTaskGirlVideo(api, caption, timeToLive, "cosplay");
    },
  },
  {
    time: "17:05",
    task: async (api) => {
      const caption = `-> SendTask 17:05 <-\nChúc buổi chiều thật chill và vui vẻ nhé!\n\nĐón hoàng hôn ánh chiều tà thôi nào!!!`;
      const timeToLive = 1000 * 60 * 60 * 2;
      await sendTaskVideo(api, caption, timeToLive, "ngắm hoàng hôn chill");
    },
  },
  {
    time: "19:05",
    task: async (api) => {
      const caption = `-> SendTask 19:05 <-\nChúc các bạn một buổi tối vui vẻ bên gia đình!\n\nThư giãn cuối ngày thôi nào!!!`;
      const timeToLive = 1000 * 60 * 60 * 3;
      await sendTaskVideo(api, caption, timeToLive, "âm nhạc nhẹ nhàng");
    },
  },
  {
    time: "22:05",
    task: async (api) => {
      const caption = `-> SendTask 22:05 <-\nTổng kết tương tác trong ngày 📝\n\n`;
      const timeToLive = 1000 * 60 * 60 * 8;
      await sendTaskTopChat(api, caption, timeToLive);
    },
  }
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

async function sendTaskVideo(api, caption, timeToLive, query) {
  const groupSettings = readGroupSettings();
  let voiceUrl = null;
  let randomTrack = null;
  try {
    const clientId = await getClientId();
    const musicInfo = await getMusicInfo(query, 20);
    if (!musicInfo || !musicInfo.collection || musicInfo.collection.length === 0) {
      return;
    }
    const tracks = musicInfo.collection.filter((track) => track.artwork_url && track.duration <= 300000);
    if (tracks.length === 0) {
      return;
    }
    randomTrack = tracks[Math.floor(Math.random() * tracks.length)];
    const streamUrl = await getMusicStreamUrl(randomTrack.permalink_url);
    if (!streamUrl) {
      return;
    }
    voiceUrl = await downloadAndConvertAudio(streamUrl, api, null);
    const thumbnailUrl = randomTrack.artwork_url?.replace("-large", "-t500x500");
    const stats = [
      randomTrack.playback_count && `${randomTrack.playback_count.toLocaleString()} 👂`,
      randomTrack.likes_count && `${randomTrack.likes_count.toLocaleString()} ❤️`,
      randomTrack.comment_count && `${randomTrack.comment_count.toLocaleString()} 💬`
    ].filter(Boolean).join(" | ");
    const musicCaption = `> From SoundCloud <\n${caption}\n\n${randomTrack.title} - ${randomTrack.user?.username || "Unknown Artist"}\n${stats}`;
    for (const threadId of Object.keys(groupSettings)) {
      if (groupSettings[threadId].sendTask) {
        try {
          const message = {
            threadId: threadId,
            type: MessageType.GroupMessage,
          };
          const objectMusic = {
            title: randomTrack.title,
            artists: randomTrack.user?.username || "Unknown Artist",
            like: randomTrack.likes_count,
            listen: randomTrack.playback_count,
            comment: randomTrack.comment_count,
            source: "SoundCloud",
            caption: musicCaption,
            imageUrl: thumbnailUrl,
            voiceUrl: voiceUrl,
            stats: stats ? stats.split(" | ") : [],
          };
          await sendVoiceMusic(api, message, objectMusic, timeToLive);
        } catch (error) {
          console.error(`Lỗi khi gửi nhạc soundcloud in ${threadId}:`, error);
          if (error.message && error.message.includes("không tồn tại")) {
            groupSettings[threadId].sendTask = false;
            writeGroupSettings(groupSettings);
          }
        }
      }
    }
  } catch (error) {
    console.error("Lỗi khi gửi nhạc soundcloud:", error);
  } finally {
    if (voiceUrl && fs.existsSync(voiceUrl)) {
      fs.unlinkSync(voiceUrl);
    }
  }
}

async function sendTaskTopChat(api, caption, timeToLive) {
  const groupSettings = readGroupSettings();
  const rankInfo = readRankInfo();
  const currentDate = new Date().toISOString().split("T")[0];

  for (const threadId of Object.keys(groupSettings)) {
    if (groupSettings[threadId].sendTask) {
      try {
        const groupUsers = rankInfo.groups[threadId]?.users || [];
        
        if (groupUsers.length === 0) {
          continue;
        }

        const todayUsers = groupUsers.filter((user) => user.lastMessageDate === currentDate);
        
        if (todayUsers.length === 0) {
          continue;
        }

        const sortedUsers = todayUsers.sort((a, b) => b.messageCountToday - a.messageCountToday);
        const top10Users = sortedUsers.slice(0, 10);
        
        const totalMessages = todayUsers.reduce((sum, user) => sum + user.messageCountToday, 0);

        let rankMessage = `${caption}📊 Thống kê tương tác của hôm nay:\n💬 Tổng số tin nhắn: ${totalMessages}\n\n🏆 Top tương tác:\n`;
        
        top10Users.forEach((user, index) => {
          rankMessage += `${index + 1}. ${user.UserName}: ${user.messageCountToday} tin nhắn\n`;
        });

        await api.sendMessage(
          { msg: rankMessage, ttl: timeToLive },
          threadId,
          MessageType.GroupMessage
        );
      } catch (error) {
        console.error(`Lỗi khi gửi top chat in ${threadId}:`, error);
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
