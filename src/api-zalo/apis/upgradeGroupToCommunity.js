import { Zalo, ZaloApiError } from "../index.js";
import { appContext } from "../context.js";
import { encodeAES, handleZaloResponse, request, makeURL } from "../utils.js";

export function upgradeGroupToCommunityFactory(api) {
  const serviceURL = makeURL(`${api.zpwServiceMap.group[0]}/api/group/upgrade/community`, {
    zpw_ver: Zalo.API_VERSION,
    zpw_type: Zalo.API_TYPE,
  });

  /**
   * Upgrade group to community
   *
   * @param groupId Group ID
   * @throws {ZaloApiError}
   */
  return async function upgradeGroupToCommunity(groupId) {
    if (!appContext.secretKey || !appContext.imei || !appContext.cookie || !appContext.userAgent)
      throw new ZaloApiError("Missing required app context fields");

    if (!groupId) throw new ZaloApiError("Missing groupId");

    const params = {
      grId: groupId,
      language: appContext.language,
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
