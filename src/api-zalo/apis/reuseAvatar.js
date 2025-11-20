import { Zalo, ZaloApiError } from "../index.js";
import { appContext } from "../context.js";
import { encodeAES, handleZaloResponse, request, makeURL } from "../utils.js";

export function reuseAvatarFactory(api) {
  const serviceURL = makeURL(`${api.zpwServiceMap.profile[0]}/api/social/reuse-avatar`, {
    zpw_ver: Zalo.API_VERSION,
    zpw_type: Zalo.API_TYPE,
  });

  /**
   * Reuse avatar
   *
   * @param photoId photo id from getAvatarList api
   *
   * @throws {ZaloApiError}
   */
  return async function reuseAvatar(photoId) {
    if (!appContext.secretKey || !appContext.imei || !appContext.cookie || !appContext.userAgent)
      throw new ZaloApiError("Missing required app context fields");

    const params = {
      photoId: photoId,
      isPostSocial: 0,
      imei: appContext.imei,
    };

    const encryptedParams = encodeAES(appContext.secretKey, JSON.stringify(params));
    if (!encryptedParams) throw new ZaloApiError("Failed to encrypt params");

    const response = await request(makeURL(serviceURL, {
      params: encryptedParams,
    }), {
      method: "GET",
    });

    const result = await handleZaloResponse(response);
    if (result.error) throw new ZaloApiError(result.error.message, result.error.code);

    return result.data;
  };
}
