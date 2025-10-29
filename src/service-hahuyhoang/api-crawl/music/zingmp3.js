import { ZingMp3 } from "zingmp3-api-full";
import path from "path";
import fs from "fs";
import { LRUCache } from "lru-cache";
import { fileURLToPath } from "url";
import { MessageMention } from "zlbotdqt";
import { getGlobalPrefix } from "../../service.js";
import { downloadAndConvertAudio } from "../../chat-zalo/chat-special/send-voice/process-audio.js";
import {
  sendMessageCompleteRequest,
  sendMessageWarningRequest,
} from "../../chat-zalo/chat-style/chat-style.js";
import { removeMention } from "../../../utils/format-util.js";
import { sendVoiceMusic, sendVoiceMusicNotQuote } from "../../chat-zalo/chat-special/send-voice/send-voice.js";
import { deleteSelectionsMapData, setSelectionsMapData } from "../index.js";
import { getCachedMedia, setCacheData } from "../../../utils/link-platform-cache.js";
import { createSearchResultImage } from "../../../utils/canvas/search-canvas.js";
import { deleteFile } from "../../../utils/util.js";
import { getBotId } from "../../../index.js";

const PLATFORM = "zingmp3";
const TIME_TO_SELECT = 60000;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, "../config.json");

const musicSelectionsMap = new LRUCache({
  max: 500,
  ttl: TIME_TO_SELECT
});

function extractZingMp3Url(keyword) {
  const urlPattern = /https?:\/\/zingmp3\.vn\/[^\s]+/;
  const match = keyword.match(urlPattern);
  return match ? match[0] : null;
}

async function processSongData(songId, songData) {
  const [songInfo, streamingInfo] = await Promise.all([
    songData ? songData : ZingMp3.getFullInfo(songId),
    ZingMp3.getSong(songId)
  ]);

  if (!songInfo) {
    throw new Error("Không thể lấy thông tin bài hát");
  }

  if (!streamingInfo?.data || !streamingInfo.data[320] && !streamingInfo.data[128]) {
    throw new Error("Không thể lấy stream của bài hát");
  }

  let linkMusic = streamingInfo.data["320"];
  let quality = "320kbps";
  if (!linkMusic) {
    linkMusic = streamingInfo.data["128"];
    quality = "128kbps";
  }

  return {
    songData: songInfo,
    linkMusic,
    quality
  };
}

async function getChartRankInfo(encodeId, chartData) {
  try {
    return chartData.get(encodeId);
  } catch (error) {
    console.error("Lỗi lấy thông tin chart:", error);
    return null;
  }
}

async function prepareAndSendMusic(api, message, songData, linkMusic, quality, captionCustom) {
  const cachedMusic = await getCachedMedia(PLATFORM, songData.encodeId, quality, songData.title);
  let voiceUrl;

  if (cachedMusic) {
    voiceUrl = cachedMusic.fileUrl;
  } else {
    const object = {
      caption: `Chờ bé lấy nhạc một chút, xong bé gọi cho hay.\n\n⏳ ${songData.title}`,
    };
    await sendMessageCompleteRequest(api, message, object, 5000);
    voiceUrl = await downloadAndConvertAudio(linkMusic, api, message);
    setCacheData(PLATFORM, songData.encodeId, {
      fileUrl: voiceUrl,
      title: songData.title,
      artist: songData.artistsNames
    }, quality);
  }

  const thumbnailUrl = songData.thumbnailM.replace(/w\d+_/i, 'w1200_');

  const stats = [
    songData.listen && `${songData.listen.toLocaleString()} 👂`,
    songData.like && `${songData.like.toLocaleString()} ❤️`,
    songData.rank && `🏆 Top ${songData.rank} BXH`
  ].filter(Boolean);

  const objectMusic = {
    trackId: songData.encodeId,
    title: songData.title,
    artists: songData.artistsNames,
    like: songData.like,
    listen: songData.listen,
    comment: songData.comment,
    source: "ZingMP3",
    caption: captionCustom || `> From ZingMP3 <\nNhạc đây người đẹp ơi !!!`,
    imageUrl: thumbnailUrl,
    voiceUrl: voiceUrl,
    stats: stats,
    rank: songData.rankChart || songData.rank,
    score: songData.score || 0,
  };

  await sendVoiceMusic(api, message, objectMusic, 180000000);
}

export async function handleZingMp3Command(api, message, aliasCommand) {
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  let imagePath = null;

  try {
    const content = removeMention(message);
    const prefix = getGlobalPrefix();
    const commandContent = content.replace(`${prefix}${aliasCommand}`, "").trim();
    const [keyword, numberMusic] = commandContent.split("&&");

    if (!keyword) {
      const object = {
        caption: `Vui lòng nhập từ khóa tìm kiếm\nVí dụ:\n${prefix}${aliasCommand} Bài Hát Cần Tìm`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return;
    }

    const url = extractZingMp3Url(keyword);
    if (url) {
      const encodeId = url.split("/").pop().split(".")[0];
      try {
        const { songData, linkMusic, quality } = await processSongData(encodeId);
        await prepareAndSendMusic(api, message, songData, linkMusic, quality);
      } catch (error) {
        const object = {
          caption: `Link Không hợp lệ hoặc link thuộc thể loại album!`
            + `\nNguyên Nhân: ${error.message}`,
        };
        await sendMessageWarningRequest(api, message, object, 30000);
      }
      return;
    }

    const result = await ZingMp3.search(keyword, "song", numberMusic || 10);
    if (!result || !result.length) {
      const object = {
        caption: `Không tìm thấy bài hát nào với từ khóa: ${keyword}`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return;
    }

    const songs = result.slice(0, numberMusic || 10);
    const chartData = await ZingMp3.getChartHome();
    let chartMap = new Map();

    if (chartData?.items) {
      chartData.items.forEach((item, index) => {
        chartMap.set(item.encodeId, {
          rank: index + 1,
          score: item.score
        });
      });
    }

    const songsWithInfo = await Promise.all(
      songs.map(async (song) => {
        const songInfo = await ZingMp3.getFullInfo(song.encodeId);
        const chartInfo = chartMap.get(song.encodeId);
        return {
          ...song,
          ...songInfo,
          rank: chartInfo?.rank
        };
      })
    );

    let musicListTxt = "Đây là danh sách bài hát trên ZingMP3 mà tôi tìm thấy:\n";
    musicListTxt +=
      "Hãy trả lời tin nhắn này với số index của bài hát bạn muốn nghe!\nVD: 1 hoặc 1 lyric";

    const formattedSongs = songsWithInfo.map(song => ({
      title: song.title,
      artistsNames: song.artistsNames,
      thumbnailM: song.thumbnailM,
      listen: song.listen,
      like: song.like,
      rankChart: song.rank,
      comment: song.comment,
      isPremium: false
    }));

    imagePath = await createSearchResultImage(formattedSongs);

    const object = {
      caption: musicListTxt,
      imagePath: imagePath,
    };
    const musicListMessage = await sendMessageCompleteRequest(
      api,
      message,
      object,
      TIME_TO_SELECT
    );

    const quotedMsgId = musicListMessage?.message?.msgId || musicListMessage?.attachment[0]?.msgId;

    musicSelectionsMap.set(quotedMsgId.toString(), {
      userRequest: senderId,
      collection: songsWithInfo,
      timestamp: Date.now(),
    });
    setSelectionsMapData(senderId, {
      quotedMsgId: quotedMsgId.toString(),
      collection: songsWithInfo,
      timestamp: Date.now(),
      platform: PLATFORM,
    });
  } catch (error) {
    console.error("Lỗi xử lý lệnh ZingMP3:", error);
    await api.sendMessage(
      {
        msg: `${senderName} Đã xảy ra lỗi khi xử lý lệnh của bạn. Vui lòng thử lại sau.`,
        mentions: [MessageMention(senderId, senderName.length, 0)],
        ttl: 30000,
      },
      message.threadId,
      message.type
    );
  } finally {
    if (imagePath) deleteFile(imagePath);
  }
}

export async function handleTopChartZingMp3(api, message, aliasCommand) {
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  const prefix = getGlobalPrefix();
  const commandContent = removeMention(message)
    .replace(`${prefix}${aliasCommand}`, "")
    .trim();
  let numberMusic = parseInt(commandContent) || 10;
  let imagePath = null;

  try {
    const result = await ZingMp3.getChartHome();
    if (!result || !result.items) {
      throw new Error("Không thể lấy được danh sách bài hát từ ZingMP3");
    }

    const top20Songs = result.items.slice(0, numberMusic);
    const songsWithRank = await Promise.all(top20Songs.map(async (song, index) => {
      const songInfo = await ZingMp3.getFullInfo(song.encodeId);
      return {
        ...song,
        ...songInfo,
        rankChart: index + 1,
        score: song.score
      };
    }));

    let musicListTxt = `[ TOP ${numberMusic} Bài Hát Hot Nhất ZingMP3 ]\n\n`;
    musicListTxt += "Hãy trả lời tin nhắn này với số thứ tự bài hát bạn muốn nghe!\n\n";

    const formattedSongs = songsWithRank.map(song => ({
      title: song.title,
      artistsNames: song.artistsNames,
      thumbnailM: song.thumbnailM.replace(/w\d+_/i, 'w600_'),
      rankChart: song.rankChart,
      score: song.score
    }));

    imagePath = await createSearchResultImage(formattedSongs);

    const object = {
      caption: musicListTxt,
      imagePath: imagePath,
    };

    const musicListMessage = await sendMessageCompleteRequest(
      api,
      message,
      object,
      TIME_TO_SELECT
    );

    const quotedMsgId = musicListMessage?.message?.msgId || musicListMessage?.attachment[0]?.msgId;

    musicSelectionsMap.set(quotedMsgId.toString(), {
      userRequest: senderId,
      collection: songsWithRank,
      timestamp: Date.now(),
    });
    setSelectionsMapData(senderId, {
      quotedMsgId: quotedMsgId.toString(),
      collection: songsWithRank,
      timestamp: Date.now(),
      platform: PLATFORM,
    });

  } catch (error) {
    console.error("Lỗi xử lý chart ZingMP3:", error);
    await api.sendMessage(
      {
        msg: `${senderName} Đã xảy ra lỗi khi lấy danh sách bài hát. Vui lòng thử lại sau.`,
        mentions: [MessageMention(senderId, senderName.length, 0)],
        ttl: 30000,
      },
      message.threadId,
      message.type
    );
  } finally {
    if (imagePath) deleteFile(imagePath);
  }
}

export async function handleZingMp3Reply(api, message) {
  const senderId = message.data.uidFrom;
  const idBot = getBotId();
  let track;

  try {
    if (!message.data.quote || !message.data.quote.globalMsgId) return false;

    const quotedMsgId = message.data.quote.globalMsgId.toString();
    if (!musicSelectionsMap.has(quotedMsgId)) return false;

    const musicData = musicSelectionsMap.get(quotedMsgId);
    if (musicData.userRequest !== senderId) return false;

    let selection = removeMention(message);
    let [selectedIndex, subCommand] = selection.split(" ");
    selectedIndex = parseInt(selectedIndex) - 1;
    if (isNaN(selectedIndex)) {
      const object = {
        caption: `Lựa chọn Không hợp lệ. Vui lòng chọn một số từ danh sách.`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return true;
    }

    const { collection } = musicSelectionsMap.get(quotedMsgId);
    if (selectedIndex < 0 || selectedIndex >= collection.length) {
      const object = {
        caption: `Số bạn chọn Không nằm trong danh sách. Vui lòng chọn lại.`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return true;
    }

    const msgDel = {
      type: message.type,
      threadId: message.threadId,
      data: {
        cliMsgId: message.data.quote.cliMsgId,
        msgId: message.data.quote.globalMsgId,
        uidFrom: idBot,
      },
    };
    await api.deleteMessage(msgDel, false);
    musicSelectionsMap.delete(quotedMsgId);
    deleteSelectionsMapData(senderId);

    track = collection[selectedIndex];

    return await handleSendTrackZingMp3(api, message, track, subCommand);
  } catch (error) {
    console.error(
      `Không thể lấy stream URL cho track ${track?.encodeId}:`,
      error
    );
    const object = {
      caption:
        `Không thể lấy bài này, vui lòng thử bài khác!\n` +
        `Nguyên Nhân: ${error.message}`,
    };
    await sendMessageWarningRequest(api, message, object, 30000);
    return true;
  }
}

export async function handleSendTrackZingMp3(api, message, track, subCommand) {
  const { linkMusic, quality } = await processSongData(track.encodeId, track);
  await prepareAndSendMusic(api, message, track, linkMusic, quality);

  if (subCommand === "lyric") {
    const lyric = await ZingMp3.getLyric(track.encodeId);
    if (lyric?.sentences && lyric.sentences.length > 0) {
      let formattedLyric = "Lời bài hát:\n\n";
      lyric.sentences.forEach((sentence) => {
        const line = sentence.words.map((word) => word.data).join(" ");
        if (line.trim()) {
          formattedLyric += line + "\n";
        }
      });
      await api.sendMessage(
        { msg: formattedLyric, ttl: 1800000 },
        message.threadId,
        message.type
      );
    } else {
      await api.sendMessage(
        {
          msg: "Không tìm thấy lời cho bài hát này.",
          ttl: 30000,
        },
        message.threadId,
        message.type
      );
    }
  }
  return true;
}

export async function handleRandomChartZingMp3(
  api,
  message,
  caption,
  timeToLive = 1800000
) {
  try {
    const result = await ZingMp3.getChartHome();
    const songsWithRank = await Promise.all(result.items.map(async (song, index) => {
      const songInfo = await ZingMp3.getFullInfo(song.encodeId);
      return {
        ...song,
        ...songInfo,
        rankChart: index + 1,
        score: song.score
      };
    }));
    const randomIndex = Math.floor(Math.random() * 20);
    const randomSong = songsWithRank[randomIndex];
    let captionFinal = caption || `[ Zing MP3 Chart ]\nChào buổi sáng!\n\n`;
    const streamingInfo = await ZingMp3.getSong(randomSong.encodeId);
    if (!streamingInfo?.data || !streamingInfo.data[320] && !streamingInfo.data[128]) {
      throw new Error("Không thể lấy stream của bài hát");
    }

    let linkMusic = streamingInfo.data["320"] || streamingInfo.data["128"];
    const thumbnailUrl = randomSong.thumbnailM.replace(/w\d+_/i, 'w1200_');
    const voiceUrl = await downloadAndConvertAudio(linkMusic, api, message);

    captionFinal += `🎵 Music: ${randomSong.title}\n👤 Artist: ${randomSong.artistsNames
      }\n#Top${randomIndex + 1}_ZingMP3\n\n`;
    captionFinal += `Cùng thưởng thức bài hát hiện tại đang hot thứ ${randomIndex + 1
      } trên nền tảng ZingMP3 nào!!!`;

    const stats = [
      randomSong.listen && `${randomSong.listen.toLocaleString()} 👂`,
      randomSong.like && `${randomSong.like.toLocaleString()} ❤️`,
      randomSong.rank && `🏆 Top ${randomSong.rank} BXH`
    ].filter(Boolean);

    const object = {
      trackId: randomSong.encodeId,
      title: randomSong.title,
      artists: randomSong.artistsNames,
      like: randomSong.like,
      listen: randomSong.listen,
      comment: randomSong.comment,
      source: "ZingMP3",
      caption: captionFinal,
      imageUrl: thumbnailUrl,
      voiceUrl: voiceUrl,
      stats: stats,
      rank: randomSong.rankChart || randomSong.rank,
      score: randomSong.score || 0,
    };

    await sendVoiceMusicNotQuote(api, message, object, timeToLive);
  } catch (error) {
    console.error("Lỗi xử lý chart ZingMP3:", error);
  }
}
