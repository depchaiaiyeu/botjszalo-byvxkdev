import fs from "fs";
import path from "path";
import https from "https";
import http from "http";
import { getGlobalPrefix } from "../../../service.js";
import { deleteFile, downloadFileFake } from "../../../../utils/util.js";
import { MessageType } from "../../../../api-zalo/index.js";
import { tempDir } from "../../../../utils/io-json.js";
import { appContext } from "../../../../api-zalo/context.js";
import { sendMessageComplete, sendMessageWarning, sendMessageFailed } from "../../chat-style/chat-style.js";
import { execSync } from "child_process";
import { removeMention } from "../../../../utils/format-util.js";
import { createCircleWebp } from "./create-webp.js";

function getRedirectUrl(url) {
  return new Promise((resolve) => {
    const protocol = url.startsWith("https") ? https : http;
    protocol.get(url, { method: "HEAD" }, (res) => {
      if (res.headers.location) resolve(res.headers.location);
      else resolve(url);
    }).on("error", () => resolve(url));
  });
}

async function getVideoRedirectUrl(url) {
  try {
    const response = await getRedirectUrl(url);
    return response;
  } catch (error) {
    console.error("Lỗi khi lấy redirect URL:", error);
    return url;
  }
}

function normalizeImageUrl(url) {
  if (url.endsWith(".jxl")) {
    return url.replace("/jxl/", "/jpg/").replace(".jxl", ".jpg");
  }
  return url;
}

function isWebpWithParams(url) {
  return url.includes(".webp") && url.includes("?");
}

function replaceWebpParams(url) {
  const parts = url.split("?");
  return parts[0] + "?creator=VXK-Service-BOT.webp";
}

function getFileExtension(url) {
  const urlLower = url.toLowerCase();
  if (urlLower.includes('.mp4')) return 'mp4';
  if (urlLower.includes('.mov')) return 'mov';
  if (urlLower.includes('.webm')) return 'webm';
  if (urlLower.includes('.webp')) return 'webp';
  if (urlLower.includes('.gif')) return 'gif';
  if (urlLower.includes('.jpg') || urlLower.includes('.jpeg')) return 'jpg';
  if (urlLower.includes('.png')) return 'png';
  
  const urlObj = new URL(url);
  const urlExt = path.extname(urlObj.pathname);
  if (urlExt) return urlExt.slice(1);
  
  return 'jpg';
}

function isVideoExtension(ext) {
  return ['mp4', 'mov', 'webm'].includes(ext.toLowerCase());
}

export async function processAndSendSticker(api, message, mediaUrl, width, height, senderName, useSpinDisk = false, frameRate = null) {
  const threadId = message.threadId;
  let downloadPath = null;
  let webpPath = null;

  try {
    if (useSpinDisk) {
      const ext = getFileExtension(mediaUrl);
      const redirectUrl = isVideoExtension(ext) ? await getVideoRedirectUrl(mediaUrl) : normalizeImageUrl(mediaUrl);
      const idImage = Date.now();
      const result = await createCircleWebp(api, message, redirectUrl, idImage, frameRate);
      if (!result) throw new Error("Tạo spin disk sticker thất bại");
      await api.sendCustomSticker(message, result.url + "?creator=VXK-Service-BOT.webp", result.url + "?createdBy=VXK-Service-BOT.Webp", result.stickerData.width, result.stickerData.height);
      return true;
    }

    if (isWebpWithParams(mediaUrl)) {
      const staticUrl = replaceWebpParams(mediaUrl);
      const animUrl = staticUrl.replace("?creator=", "?createdBy=").replace(".webp", ".Webp");
      await api.sendCustomSticker(message, staticUrl, animUrl, width, height);
      return true;
    }

    const ext = getFileExtension(mediaUrl);
    let finalUrl = mediaUrl;
    
    if (isVideoExtension(ext)) {
      finalUrl = await getVideoRedirectUrl(mediaUrl);
    } else {
      finalUrl = normalizeImageUrl(mediaUrl);
    }

    downloadPath = path.join(tempDir, `sticker_${Date.now()}.${ext}`);
    await downloadFileFake(finalUrl, downloadPath);

    if (!fs.existsSync(downloadPath) || fs.statSync(downloadPath).size === 0) {
      throw new Error(`File tải về rỗng`);
    }

    if (ext === 'webp') {
      webpPath = downloadPath;
    } else {
      webpPath = path.join(tempDir, `sticker_${Date.now()}.webp`);
      execSync(`ffmpeg -y -i "${downloadPath}" -c:v libwebp -q:v 80 "${webpPath}"`, { stdio: 'pipe' });
    }

    if (!fs.existsSync(webpPath) || fs.statSync(webpPath).size === 0) {
      throw new Error(`File WebP đầu ra rỗng hoặc không tồn tại`);
    }

    const webpUpload = await api.uploadAttachment([webpPath], threadId, appContext.send2meId, MessageType.DirectMessage);
    const webpUrl = webpUpload?.[0]?.fileUrl;
    if (!webpUrl) throw new Error("Upload attachment thất bại");

    const staticUrl = webpUrl + "?creator=VXK-Service-BOT.webp";
    const animUrl = webpUrl + "?createdBy=VXK-Service-BOT.Webp";

    await api.sendCustomSticker(message, staticUrl, animUrl, width, height);

    return true;
  } catch (error) {
    console.error("Lỗi khi xử lý sticker:", error);
    throw error;
  } finally {
    if (downloadPath && downloadPath !== webpPath) await deleteFile(downloadPath);
    if (webpPath) await deleteFile(webpPath);
  }
}

export async function handleStickerCommand(api, message) {
  const quote = message.data?.quote;
  const senderName = message.data.dName;
  const prefix = getGlobalPrefix();
  const content = removeMention(message);
  
  const useSpinDisk = content.includes("spindisk") || content.includes("spin");
  
  let frameRate = null;
  if (content.includes("fr")) {
    const frMatch = content.match(/fr\s*(\d+)/i);
    if (frMatch) {
      const parsedRate = parseInt(frMatch[1]);
      if (parsedRate > 0 && parsedRate <= 120) {
        frameRate = parsedRate;
      }
    }
  }

  if (!quote) {
    if (useSpinDisk) {
      await sendMessageWarning(api, message, `${senderName}, Hãy reply vào tin nhắn chứa ảnh hoặc video cần tạo sticker spindisk và dùng lại lệnh ${prefix}stk spindisk hoặc ${prefix}sticker spindisk.`, true);
    } else {
      await sendMessageWarning(api, message, `${senderName}, Hãy reply vào tin nhắn chứa ảnh hoặc video cần tạo sticker và dùng lại lệnh ${prefix}sticker.`, true);
    }
    return;
  }

  const attach = quote.attach;
  if (!attach) {
    await sendMessageWarning(api, message, `${senderName}, Không có đính kèm nào trong nội dung reply của bạn.`, true);
    return;
  }

  try {
    let attachData;
    try {
      attachData = typeof attach === 'string' ? JSON.parse(attach) : attach;
    } catch {
      attachData = attach;
    }

    const mediaUrl = attachData.hdUrl || attachData.href;
    if (!mediaUrl) {
      await sendMessageWarning(api, message, `${senderName}, Không tìm thấy URL trong đính kèm của tin nhắn bạn đã reply.`, true);
      return;
    }

    const decodedUrl = decodeURIComponent(mediaUrl.replace(/\\\//g, "/"));
    const params = attachData.params || {};
    const duration = params.duration || 0;
    
    const ext = getFileExtension(decodedUrl);
    if (isVideoExtension(ext) && duration > 5000 && !useSpinDisk) {
      await sendMessageWarning(api, message, `${senderName}, Sticker video chỉ được phép dài tối đa 5 giây!`, true);
      return;
    }

    const width = params.width || 512;
    const height = params.height || 512;
    
    let warningMsg = `Đang tạo sticker${useSpinDisk ? ' xoay tròn' : ''}`;
    if (frameRate) {
      warningMsg += ` với tốc độ ${frameRate} FPS`;
    }
    warningMsg += ` cho ${senderName}, vui lòng chờ một chút!`;
    
    await sendMessageWarning(api, message, warningMsg, true);
    await processAndSendSticker(api, message, decodedUrl, width, height, senderName, useSpinDisk, frameRate);
    await sendMessageComplete(api, message, `Sticker của bạn đây!`, true);
  } catch (error) {
    console.error("Lỗi khi xử lý lệnh sticker:", error);
    await sendMessageFailed(api, message, `${senderName}, Lỗi khi xử lý lệnh sticker: ${error.message}`, true);
  }
}
