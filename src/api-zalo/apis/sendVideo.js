import { appContext } from "../context.js";
import { ZaloApiError } from "../Errors/ZaloApiError.js";
import { encodeAES, handleZaloResponse, makeURL, request } from "../utils.js";
import { Zalo } from "../index.js";
import { MessageType } from "../models/Message.js";

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
    if (!Array.isArray(mentions) || type !== MessageType.GroupMessage) return [];
    return mentions
      .filter((m) => m.pos >= 0 && m.uid && m.len > 0)
      .map((m) => ({
        pos: m.pos,
        uid: m.uid,
        len: m.len,
        type: m.uid === "-1" ? 1 : 0,
      }));
  }

  return async function sendVideo({ videoUrl, threadId, threadType, message = null }) {
    if (!appContext.secretKey || !appContext.imei || !appContext.cookie || !appContext.userAgent)
      throw new ZaloApiError("Missing required app context fields");
    if (!videoUrl) throw new ZaloApiError("Missing videoUrl");

    const payload = {
      params: {
        clientId: String(Date.now()),
        ttl: 0,
        zsource: 704,
        msgType: 5,
        msgInfo: JSON.stringify({
          videoUrl: String(videoUrl),
          thumbUrl: videoUrl.replace(/\.[^/.]+$/, ".jpg"),
          duration: 0,
          width: 1280,
          height: 720,
          fileSize: 0,
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

    if (message?.mentions) {
      payload.params.mentionInfo = handleMentions(message.type, message.text, message.mentions);
    }

    let url;
    if (threadType === MessageType.DirectMessage) {
      url = directMessageServiceURL;
      payload.params.toId = String(threadId);
    } else if (threadType === MessageType.GroupMessage) {
      url = groupMessageServiceURL;
      payload.params.grid = String(threadId);
      payload.params.visibility = 0;
    } else {
      throw new ZaloApiError("Thread type is invalid");
    }

    payload.params.imei = appContext.imei;
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
