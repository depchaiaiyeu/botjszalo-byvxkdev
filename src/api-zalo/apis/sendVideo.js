import { appContext } from "../context.js";
import { ZaloApiError } from "../Errors/ZaloApiError.js";
import { encodeAES, handleZaloResponse, makeURL, request } from "../utils.js";
import { Zalo } from "../index.js";
import { MessageType } from "../models/Message.js";
// Removed: import path from "path";
// Removed: import { deleteFile } from "../../utils/util.js";
// Removed: import { tempDir } from "../../utils/io-json.js";
// Removed: import ffmpeg from "fluent-ffmpeg";
// Removed: import ffprobeInstaller from "@ffprobe-installer/ffprobe";
// Removed: import { getVideoMetadata } from "../utils.js";

// ffmpeg.setFfprobePath(ffprobeInstaller.path); // Removed

export function sendVideoFactory(api) {
  const directMessageServiceURL = makeURL(`${api.zpwServiceMap.file[0]}/api/message/forward`, {
    zpw_ver: Zalo.API_VERSION,
    zpw_type: Zalo.API_TYPE,
    nretry: 0,
  });
  const groupMessageServiceURL = makeURL(`${api.zpwServiceMap.file[0]}/api/group/forward`, {
    zpw_ver: Zalo.API_VERSION,
    zpw_type: Zalo.API_TYPE,
    nretry: 0,
  });

  function handleMentions(type, msg, mentions) {
    let totalMentionLen = 0;
    const mentionsFinal =
      Array.isArray(mentions) && type === MessageType.GroupMessage
        ? mentions
            .filter((m) => m.pos >= 0 && m.uid && m.len > 0)
            .map((m) => {
              totalMentionLen += m.len;
              return {
                pos: m.pos,
                uid: m.uid,
                len: m.len,
                type: m.uid === "-1" ? 1 : 0,
              };
            })
        : [];
    if (totalMentionLen > msg.length) {
      throw new ZaloApiError("Invalid mentions: total mention characters exceed message length");
    }
    return {
      mentionsFinal,
      msgFinal: msg,
    };
  }

  return async function sendVideo({ videoUrl, threadId, threadType, message = null, thumbnail = null, ttl = 0, duration = 0, width = 1280, height = 720, fileSize = 0 }) {
    if (!appContext.secretKey || !appContext.imei || !appContext.cookie || !appContext.userAgent)
      throw new ZaloApiError("Missing required app context fields");

    // --- START: Simplified Video Metadata and Thumbnail Handling ---
    
    // If the video metadata (width, height, fileSize, duration) is not provided by the user,
    // we use the default values set in the function arguments (or 0).
    duration = duration || 0;
    width = width || 1280;
    height = height || 720;
    fileSize = fileSize || 0;

    let thumbnailUrl = null;

    if (thumbnail) {
      // Use the thumbnail provided by the user
      thumbnailUrl = thumbnail;
    } else {
      // Fallback: try replacing the video extension with .jpg
      // This avoids the need for local processing (ffmpeg/ffprobe)
      thumbnailUrl = videoUrl.replace(/\.[^/.]+$/, ".jpg") || null;
    }

    // No try-catch block is necessary as we've removed file system and media processing operations.
    // --- END: Simplified Video Metadata and Thumbnail Handling ---


    const payload = {
      params: {
        clientId: String(Date.now()),
        ttl,
        zsource: 704,
        msgType: 5,
        msgInfo: JSON.stringify({
          videoUrl: String(videoUrl),
          thumbUrl: String(thumbnailUrl),
          duration: Number(duration),
          width: Number(width),
          height: Number(height),
          fileSize: Number(fileSize),
          properties: {
            color: -1,
            size: -1,
            type: 1003,
            subType: 0,
            ext: {
              sSrcType: -1,
              sSrcStr: "",
              msg_warning_type: 0,
            },
          },
          title: message ? message.text : "",
        }),
      },
    };

    if (message && message.mentions) {
      const { mentionsFinal } = handleMentions(message.type, message.text, message.mentions);
      payload.params.mentionInfo = mentionsFinal;
    }

    let url;
    if (threadType === MessageType.DirectMessage) {
      url = directMessageServiceURL;
      payload.params.toId = String(threadId);
      payload.params.imei = appContext.imei;
    } else if (threadType === MessageType.GroupMessage) {
      url = groupMessageServiceURL;
      payload.params.visibility = 0;
      payload.params.grid = String(threadId);
      payload.params.imei = appContext.imei;
    } else {
      throw new ZaloApiError("Thread type is invalid");
    }

    const encryptedParams = encodeAES(appContext.secretKey, JSON.stringify(payload.params));
    if (!encryptedParams) throw new ZaloApiError("Failed to encrypt message");

    const response = await request(url, {
      method: "POST",
      body: new URLSearchParams({ params: encryptedParams }),
    });

    const result = await handleZaloResponse(response);
    if (result.error) throw new ZaloApiError(result.error.message, result.error.code);
    return result.data;
  };
}
