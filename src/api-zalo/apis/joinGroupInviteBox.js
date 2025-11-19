import { Zalo, ZaloApiError } from "../index.js";
import { appContext } from "../context.js";
import { encodeAES, handleZaloResponse, request, makeURL } from "../utils.js";

export function joinGroupInviteBoxFactory(api) {
  const serviceURL = makeURL(`${api.zpwServiceMap.group[0]}/api/group/inv-box/join`, {
    zpw_ver: Zalo.API_VERSION,
    zpw_type: Zalo.API_TYPE,
  });

  /**
   * Join group invite box
   *
   * @param groupId - The group id
   *
   * @throws {ZaloApiError}
   */
  return async function joinGroupInviteBox(groupId) {
    if (!appContext.secretKey || !appContext.imei || !appContext.cookie || !appContext.userAgent)
      throw new ZaloApiError("Missing required app context fields");

    const params = {
      grid: groupId,
      lang: appContext.language,
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
