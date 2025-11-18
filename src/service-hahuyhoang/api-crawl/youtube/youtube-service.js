import fs from "fs";
import path from "path";
import axios from "axios";
import { JSDOM } from "jsdom";
import schedule from "node-schedule";
import yt from "yt-dlp-wrap").default;
import { tempDir } from "../../../utils/io-json.js";
import { deleteFile } from "../../../utils/util.js";
import { removeMention } from "../../../utils/format-util.js";
import { getGlobalPrefix } from "../../service.js";
import {
  sendMessageCompleteRequest,
  sendMessageProcessingRequest,
  sendMessageWarningRequest,
} from "../../chat-zalo/chat-style/chat-style.js";
import { sendVoiceMusic } from "../../chat-zalo/chat-special/send-voice/send-voice.js";
import { getCachedMedia, setCacheData } from "../../../utils/link-platform-cache.js";
import { createSearchResultImage } from "../../../utils/canvas/search-canvas.js";
import { getBotId, isAdmin } from "../../../index.js";
import { uploadAudioFile } from "../../chat-zalo/chat-special/send-voice/process-audio.js";
import { setSelectionsMapData } from "../index.js";
import { MessageMention } from "../../../api-zalo/index.js";

const CONFIG = {
  baseUrl: "https://www.youtube.com",
  searchPath: "/results",
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
  },
  maxResults: 10,
  timeWaitSelection: 60000,
};

const PLATFORM = "youtube";
const ytdlp = new yt();

const audioFormat = "bestaudio[ext=m4a]/bestaudio";
const videoFormat360 = "best[height<=360][vcodec^=avc1]/best[height<=360]";
const videoFormat720 = "best[height<=720][vcodec^=avc1]/best[height<=720]";
const videoFormat1080 = "best[height<=1080][vcodec^=avc1]/best[height<=1080]";
const videoFormatMax = "best[vcodec^=avc1]/best";

const videoSelectionsMap = new Map();

schedule.scheduleJob("*/5 * * * *", () => {
  const now = Date.now();
  for (const [key, data] of videoSelectionsMap.entries()) {
    if (now - data.timestamp > CONFIG.timeWaitSelection) videoSelectionsMap.delete(key);
  }
});

const extractYoutubeUrl = (text) => {
  const regex = /(https?:\/\/)?((www\.)?(youtube\.com|youtu\.be)\/(watch\?v=|shorts\/)?)([a-zA-Z0-9_-]{11})/i;
  const match = text.match(regex);
  return match ? `https://www.youtube.com/watch?v=${match[6]}` : null;
};

const extractYoutubeId = (url) => url.match(/[a-zA-Z0-9_-]{11}/)?.[0] || null;

const searchYouTube = async (query) => {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
  const { data } = await axios.get(url, { headers: CONFIG.headers, timeout: 10000 });
  const dom = new JSDOM(data);
  const scripts = dom.window.document.querySelectorAll("script");
  let ytInitialData;
  for (const script of scripts) {
    const txt = script.textContent;
    if (txt.includes("ytInitialData")) {
      const json = txt.split("ytInitialData = ")[1]?.split(";</script>")[0];
      if (json) ytInitialData = JSON.parse(json);
    }
  }
  if (!ytInitialData) return [];
  const items = ytInitialData.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents || [];
  const results = [];
  for (const item of items) {
    const v = item.videoRenderer;
    if (v?.videoId) {
      results.push({
        videoId: v.videoId,
        title: v.title?.runs?.[0]?.text || "No title",
        thumbnail: v.thumbnail?.thumbnails?.[0]?.url || "",
        duration: v.lengthText?.simpleText || "",
        viewCount: v.viewCountText?.simpleText || "0 views",
        publishedTime: v.publishedTimeText?.simpleText || "",
        channelName: v.ownerText?.runs?.[0]?.text || "Unknown",
        url: `https://www.youtube.com/watch?v=${v.videoId}`,
      });
    }
  }
  return results.filter(v => v.duration);
};

const getYoutubeVideoInfo = async (url) => {
  const info = await ytdlp.execPromise([url, "--dump-json", "--no-playlist"]);
  const data = JSON.parse(info);
  return {
    videoId: data.id,
    title: data.title,
    thumbnail: data.thumbnail,
    duration: data.duration || 0,
    viewCount: data.view_count?.toLocaleString() || "0",
    channelName: data.channel || "Unknown",
    publishedTime: data.upload_date ? formatUploadDate(data.upload_date) : "Unknown",
    url: data.webpage_url || url,
  };
};

const formatUploadDate = (dateStr) => {
  if (!dateStr || dateStr.length !== 8) return "Không rõ";
  const year = dateStr.slice(0, 4);
  const month = dateStr.slice(4, 6);
  const day = dateStr.slice(6, 8);
  const date = new Date(`${year}-${month}-${day}`);
  const diff = Date.now() - date.getTime();
  const days = Math.floor(diff / 86400000);
  if (days < 1) return "Hôm nay";
  if (days < 7) return `${days} ngày trước`;
  if (days < 30) return `${Math.floor(days / 7)} tuần trước`;
  if (days < 365) return `${Math.floor(days / 30)} tháng trước`;
  return `${Math.floor(days / 365)} năm trước`;
};

const downloadYoutube = async (url, videoId, format) => {
  const ext = format.includes("bestaudio") ? "m4a" : "mp4";
  const outputPath = path.join(tempDir, `yt_${videoId}_${Date.now()}.${ext}`);

  const args = [
    url,
    "-f", format,
    "--no-playlist",
    "--merge-output-format", "mp4",
    "--remux-video", "mp4",
    "--audio-quality", "0",
    "-o", outputPath,
  ];

  await ytdlp.execPromise(args);
  if (!fs.existsSync(outputPath)) throw new Error("Download failed");
  return outputPath;
};

const getVideoFormat = (type) => {
  switch (type.toLowerCase()) {
    case "audio": return { format: audioFormat, quality: "audio", time: 8000 };
    case "low": case "360": case "360p": return { format: videoFormat360, quality: "360p", time: 8000 };
    case "high": case "1080": case "1080p": return { format: videoFormat1080, quality: "1080p", time: 20000 };
    case "max": return { format: videoFormatMax, quality: "Cao nhất", time: 30000 };
    default: return { format: videoFormat720, quality: "720p", time: 12000 };
  }
};

const sendVideoOrAudio = async (api, message, videoInfo, filePath, qualityText, isAdminHigh) => {
  const isAudio = qualityText === "audio";
  let fileUrl, duration;

  if (isAudio) {
    fileUrl = await uploadAudioFile(filePath, api, message);
  } else {
    const upload = await api.uploadAttachment([filePath], message.threadId, message.type);
    fileUrl = upload[0].fileUrl;
    duration = Math.round(fs.statSync(filePath).size / 1024 / 1024 * 8); // tạm tính nếu cần
  }

  setCacheData(PLATFORM, videoInfo.videoId, { fileUrl, title: videoInfo.title, duration }, qualityText);

  if (isAudio) {
    await sendVoiceMusic(api, message, {
      trackId: videoInfo.videoId,
      title: videoInfo.title,
      artists: videoInfo.channelName,
      source: "Youtube",
      caption: "> From Youtube <\nNhạc đây người đẹp ơi !!!",
      imageUrl: videoInfo.thumbnail,
      voiceUrl: fileUrl,
      viewCount: videoInfo.viewCount,
      publishedTime: videoInfo.publishedTime,
    }, 180000000);
  } else {
    await api.sendVideov2({
      videoUrl: fileUrl,
      threadId: message.threadId,
      threadType: message.type,
      thumbnail: videoInfo.thumbnail,
      duration,
      message: {
        text: `[ ${message.data.dName} ]\n🎵 Tiêu đề: ${videoInfo.title}\n📺 Kênh: ${videoInfo.channelName}\n👀 Lượt xem: ${videoInfo.viewCount}\n📅 Đăng: ${videoInfo.publishedTime}\n📊 Chất lượng: ${qualityText}\n[ Watch More On Youtube ]`,
      },
      ttl: isAdminHigh ? 14400000 : 3600000,
    });
  }
  await deleteFile(filePath);
};

export async function handleYoutubeCommand(api, message, aliasCommand) {
  const content = removeMention(message).trim();
  const senderId = message.data.uidFrom;
  const prefix = getGlobalPrefix();
  const isAdminHigh = isAdmin(senderId);
  let imagePath = null;

  try {
    const keyword = content.replace(new RegExp(`^${prefix}${aliasCommand}\\s*`), "").trim();
    if (!keyword) return await sendMessageCompleteRequest(api, message, { caption: `Dùng: ${prefix}${aliasCommand} <từ khóa hoặc link> [audio/low/high/max]` }, 30000);

    const url = extractYoutubeUrl(keyword);
    if (url) {
      await sendMessageProcessingRequest(api, message, { caption: "Đang lấy thông tin video..." }, 5000);
      const videoInfo = await getYoutubeVideoInfo(url);
      const durationMs = videoInfo.duration * 1000;
      if (!isAdminHigh && durationMs > 30 * 60 * 1000) return await sendMessageWarningRequest(api, message, { caption: `Video dài quá 30 phút không hỗ trợ!\nXem trực tiếp: ${url}` }, 30000);

      const [, , quality = "default"] = keyword.split(/\s+/);
      const { format, quality: qualityText, time } = getVideoFormat(quality);

      const cached = await getCachedMedia(PLATFORM, videoInfo.videoId, qualityText, videoInfo.title);
      if (cached) return await sendVideoOrAudio(api, message, videoInfo, null, qualityText, isAdminHigh, cached.fileUrl);

      await sendMessageProcessingRequest(api, message, { caption: `Đang tải ${qualityText === "audio" ? "nhạc" : "video"}...\n${videoInfo.title}\nChất lượng: ${qualityText}` }, time);

      const filePath = await downloadYoutube(url, videoInfo.videoId, format);
      await sendVideoOrAudio(api, message, videoInfo, filePath, qualityText, isAdminHigh);
      return;
    }

    const [searchQuery, numStr] = keyword.split("&&");
    let videos = await searchYouTube(searchQuery);
    const limit = parseInt(numStr) || CONFIG.maxResults;
    videos = videos.slice(0, limit);

    if (videos.length === 0) return await sendMessageWarningRequest(api, message, { caption: "Không tìm thấy video nào!" }, 30000);

    imagePath = await createSearchResultImage(videos.map(v => ({
      title: v.title,
      artistsNames: v.channelName,
      thumbnailM: v.thumbnail,
      view: v.viewCount,
      publishedTime: v.publishedTime
    })));

    const msg = await sendMessageCompleteRequest(api, message, {
      caption: "Reply số thứ tự để chọn video!\nVD: 1 hoặc 1 audio",
      imagePath
    }, CONFIG.timeWaitSelection);

    const msgId = msg?.message?.msgId || msg?.attachment?.[0]?.msgId;
    videoSelectionsMap.set(msgId.toString(), { userRequest: senderId, collection: videos, timestamp: Date.now() });
    setSelectionsMapData(senderId, { quotedMsgId: msgId.toString(), collection: videos, timestamp: Date.now(), platform: PLATFORM });
  } catch (err) {
    console.error(err);
    await sendMessageWarningRequest(api, message, { caption: "Có lỗi xảy ra, thử lại sau!" }, 30000);
  } finally {
    if (imagePath) await deleteFile(imagePath);
  }
}

export async function handleYoutubeReply(api, message) {
  if (!message.data.quote?.globalMsgId) return false;
  const quotedId = message.data.quote.globalMsgId.toString();
  if (!videoSelectionsMap.has(quotedId)) return false;

  const data = videoSelectionsMap.get(quotedId);
  if (data.userRequest !== message.data.uidFrom) return false;

  const [indexStr, quality = "default"] = removeMention(message).trim().split(/\s+/);
  const index = parseInt(indexStr) - 1;
  if (isNaN(index) || index < 0 || index >= data.collection.length) {
    await sendMessageWarningRequest(api, message, { caption: "Số không hợp lệ!" }, 30000);
    return true;
  }

  const video = data.collection[index];
  const { format, quality: qualityText, time } = getVideoFormat(quality);
  const isAdminHigh = isAdmin(message.data.uidFrom);

  const cached = await getCachedMedia(PLATFORM, video.videoId, qualityText, video.title);
  if (cached) {
    await sendVideoOrAudio(api, message, video, null, qualityText, isAdminHigh, cached.fileUrl);
  } else {
    await sendMessageProcessingRequest(api, message, { caption: `Đang tải ${qualityText}...\n${video.title}` }, time);
    const filePath = await downloadYoutube(video.url, video.videoId, format);
    await sendVideoOrAudio(api, message, video, filePath, qualityText, isAdminHigh);
  }

  videoSelectionsMap.delete(quotedId);
  return true;
}
