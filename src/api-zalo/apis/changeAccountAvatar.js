import FormData from "form-data";
import fs from "fs";
import { Zalo, ZaloApiError } from "../index.js";
import { appContext } from "../context.js";
import { encodeAES, handleZaloResponse, request, makeURL, getImageMetaData } from "../utils.js";

export function changeAccountAvatarFactory(api) {
  const serviceURL = makeURL(`${api.zpwServiceMap.file[0]}/api/profile/upavatar`, {
    zpw_ver: Zalo.API_VERSION,
    zpw_type: Zalo.API_TYPE,
  });

  /**
   * Change account avatar
   *
   * @param avatarSource Attachment source, can be a file path or an Attachment object
   *
   * @throws {ZaloApiError | ZaloApiMissingImageMetadataGetter}
   */
  return async function changeAccountAvatar(avatarSource) {
    if (!appContext.secretKey || !appContext.imei || !appContext.cookie || !appContext.userAgent)
      throw new ZaloApiError("Missing required app context fields");

    const isSourceFilePath = typeof avatarSource === "string";
    const imageMetaData = isSourceFilePath ? await getImageMetaData(avatarSource) : avatarSource.metadata;

    const fileSize = imageMetaData.totalSize || 0;

    const now = new Date();
    const timeString = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")} ${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;

    const params = {
      avatarSize: 120,
      clientId: String(appContext.uid + timeString),
      language: appContext.language,
      metaData: JSON.stringify({
        origin: {
          width: imageMetaData.width || 1080,
          height: imageMetaData.height || 1080,
        },
        processed: {
          width: imageMetaData.width || 1080,
          height: imageMetaData.height || 1080,
          size: fileSize,
        },
      }),
    };

    const avatarData = isSourceFilePath ? fs.readFileSync(avatarSource) : avatarSource.data;
    const formData = new FormData();
    formData.append("fileContent", avatarData, {
      filename: "blob",
      contentType: "image/jpeg",
    });

    const encryptedParams = encodeAES(appContext.secretKey, JSON.stringify(params));
    if (!encryptedParams) throw new ZaloApiError("Failed to encrypt params");

    const response = await request(makeURL(serviceURL, {
      params: encryptedParams,
    }), {
      method: "POST",
      headers: formData.getHeaders(),
      body: formData.getBuffer(),
    });

    const result = await handleZaloResponse(response);
    if (result.error) throw new ZaloApiError(result.error.message, result.error.code);

    return result.data;
  };
}
