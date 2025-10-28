import fs from "fs";
import { readGroupSettings, writeGroupSettings } from "../../utils/io-json.js";
import { MessageType } from "../../api-zalo/index.js";
import { createCalendarImage, clearImagePath } from "../../utils/canvas/lich-van-nien.js";
import { getMusicInfo, getMusicStreamUrl } from "../api-crawl/music/soundcloud.js";
import { downloadAndConvertAudio } from "../../chat-zalo/chat-special/send-voice/process-audio.js";
import { sendVoiceMusic } from "../../chat-zalo/chat-special/send-voice/send-voice.js";
import { getCachedMedia, setCacheData } from "../../../utils/link-platform-cache.js";
import path from "path";

const rankInfoPath = path.join(process.cwd(), "assets", "json-data", "rank-info.json");
const PLATFORM = "soundcloud";

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
      const caption = "-> SendTask 06:05 <-\n📅 Lịch Vạn Niên\n\nChúc bạn một ngày mới tràn đầy năng lượng!";
      const timeToLive = 1000 * 60 * 60 * 6;
      await sendTaskCalendar(api, caption, timeToLive);
    },
  },
  {
    time: "06:05",
    task: async (api) => {
      const caption = `-> SendTask 06:05 <-\nThức dậy cho một ngày mới\nđầy năng lượng thôi nào!\n\nĐón bình minh ngày mới cùng tớ nhé!!!`;
      const timeToLive = 1000 * 60 * 60 * 3;
      await sendTaskMusic(api, caption, timeToLive, "nhạc chill buổi sáng");
    },
  },
  {
    time: "09:05",
    task: async (api) => {
      const caption = `-> SendTask 09:05 <-\nChào buổi sáng\ncùng đón nắng ấm suơng mưa nhé!\n\nGiải trí một chút để bớt căng thẳng thôi nào!!!`;
      const timeToLive = 1000 * 60 * 60 * 1;
      await sendTaskMusic(api, caption, timeToLive, "nhạc chill cảnh đẹp");
    },
  },
  {
    time: "10:05",
    task: async (api) => {
      const caption = `-> SendTask 10:05 <-\nChào một buổi trưa đầy năng lượng!\n\nNhạc hay để nâng cao năng suất đây!!!`;
      const timeToLive = 1000 * 60 * 60 * 1;
      await sendTaskMusic(api, caption, timeToLive, "nhạc edm năng lượng");
    },
  },
  {
    time: "11:05",
    task: async (api) => {
      const caption = `-> SendTask 11:05 <-\nChào một buổi trưa đầy năng lượng!\n\nNhạc remix sôi động cho anh em đây!!!`;
      const timeToLive = 1000 * 60 * 60 * 1;
      await sendTaskMusic(api, caption, timeToLive, "nhạc remix hot");
    },
  },
  {
    time: "12:05",
    task: async (api) => {
      const caption = "-> SendTask 12:05 <-\n📅 Lịch Vạn Niên\n\nChúc bạn buổi trưa vui vẻ!";
      const timeToLive = 1000 * 60 * 60 * 6;
      await sendTaskCalendar(api, caption, timeToLive);
    },
  },
  {
    time: "12:05",
    task: async (api) => {
      const caption = `-> SendTask 12:05 <-\nChào một buổi trưa đầy năng lượng!\n\nNhạc jazz thư giãn cho anh em đây!!!`;
      const timeToLive = 1000 * 60 * 60 * 1;
      await sendTaskMusic(api, caption, timeToLive, "nhạc jazz");
    },
  },
  {
    time: "13:05",
    task: async (api) => {
      const caption = `-> SendTask 13:05 <-\nChào một buổi trưa đầy năng lượng!\n\nNhạc anime để bớt căng não anh em nhé!!!`;
      const timeToLive = 1000 * 60 * 60 * 1;
      await sendTaskMusic(api, caption, timeToLive, "anime soundtrack");
    },
  },
  {
    time: "14:05",
    task: async (api) => {
      const caption = `-> SendTask 14:05 <-\nChào một buổi trưa đầy năng lượng!\n\nNhạc k-pop hay để giải trí đây!!!`;
      const timeToLive = 1000 * 60 * 60 * 1;
      await sendTaskMusic(api, caption, timeToLive, "k-pop hot");
    },
  },
  {
    time: "15:05",
    task: async (api) => {
      const caption = `-> SendTask 15:05 <-\nChào một buổi xế chiều đầy năng lượng!\n\nNhạc sôi động để tỉnh táo đây!!!`;
      const timeToLive = 1000 * 60 * 60 * 1;
      await sendTaskMusic(api, caption, timeToLive, "nhạc edm dance");
    },
  },
  {
    time: "16:05",
    task: async (api) => {
      const caption = `-> SendTask 16:05 <-\nChào một buổi xế chiều đầy năng lượng!\n\nNhạc indie mới lạ cho anh em đây!!!`;
      const timeToLive = 1000 * 60 * 60 * 1;
      await sendTaskMusic(api, caption, timeToLive, "nhạc indie hay");
    },
  },
  {
    time: "17:05",
    task: async (api) => {
      const caption = `-> SendTask 17:05 <-\nChúc buổi chiều thật chill và vui vẻ nhé!\n\nĐón hoàng hôn ánh chiều tà thôi nào!!!`;
      const timeToLive = 1000 * 60 * 60 * 2;
      await sendTaskMusic(api, caption, timeToLive, "nhạc acoustic hoàng hôn");
    },
  },
  {
    time: "19:05",
    task: async (api) => {
      const caption = `-> SendTask 19:05 <-\nChúc các bạn một buổi tối vui vẻ bên gia đình!\n\nThư giãn cuối ngày thôi nào!!!`;
      const timeToLive = 1000 * 60 * 60 * 3;
      await sendTaskMusic(api, caption, timeToLive, "âm nhạc nhẹ nhàng");
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

async function sendTaskMusic(api, caption, timeToLive, query) {
  const groupSettings = readGroupSettings();
  
  try {
    const musicInfo = await getMusicInfo(query, 5);
    
    if (!musicInfo || !musicInfo.collection || musicInfo.collection.length === 0) {
      console.error(`Không tìm thấy nhạc cho query: ${query}`);
      return;
    }

    const randomTrack = musicInfo.collection[Math.floor(Math.random() * musicInfo.collection.length)];

    for (const threadId of Object.keys(groupSettings)) {
      if (groupSettings[threadId].sendTask) {
        try {
          await sendMusicToGroup(api, threadId, randomTrack, caption, timeToLive);
        } catch (error) {
          console.error(`Lỗi khi gửi nhạc đến nhóm ${threadId}:`, error);
          if (error.message && error.message.includes("không tồn tại")) {
            groupSettings[threadId].sendTask = false;
            writeGroupSettings(groupSettings);
          }
        }
      }
    }
  } catch (error) {
    console.error("Lỗi khi lấy thông tin nhạc từ SoundCloud:", error);
  }
}

async function sendMusicToGroup(api, threadId, track, caption, timeToLive) {
  const cachedMusic = await getCachedMedia(PLATFORM, track.id, null, track.title);
  let voiceUrl;

  if (cachedMusic) {
    voiceUrl = cachedMusic.fileUrl;
  } else {
    const url = await getMusicStreamUrl(track.permalink_url);

    if (!url) {
      console.error(`Không thể lấy stream URL cho bài: ${track.title}`);
      return;
    }

    voiceUrl = await downloadAndConvertAudio(url, api, null);
    setCacheData(PLATFORM, track.id, {
      title: track.title,
      artist: track.user?.username || "Unknown Artist",
      fileUrl: voiceUrl,
    }, null);
  }

  const thumbnailUrl = track.artwork_url?.replace("-large", "-t500x500");

  const stats = [
    track.playback_count && `${track.playback_count.toLocaleString()} 👂`,
    track.likes_count && `${track.likes_count.toLocaleString()} ❤️`,
    track.comment_count && `${track.comment_count.toLocaleString()} 💬`
  ].filter(Boolean);

  const finalCaption = `${caption}\n\n> From SoundCloud <\n${track.title}`;

  const objectMusic = {
    trackId: track.id,
    title: track.title,
    artists: track.user?.username || "Unknown Artist",
    like: track.likes_count,
    listen: track.playback_count,
    comment: track.comment_count,
    source: "SoundCloud",
    caption: finalCaption,
    imageUrl: thumbnailUrl,
    voiceUrl: voiceUrl,
    stats: stats,
  };

  await api.sendMessage(
    {
      msg: finalCaption,
      attachments: [voiceUrl],
      ttl: timeToLive,
    },
    threadId,
    MessageType.GroupMessage
  );
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
        console.error(`Lỗi khi gửi top chat đến nhóm ${threadId}:`, error);
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
