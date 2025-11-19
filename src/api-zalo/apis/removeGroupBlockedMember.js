import { Zalo, ZaloApiError } from "../index.js";
import { appContext } from "../context.js";
import { encodeAES, handleZaloResponse, request, makeURL } from "../utils.js";

export function removeGroupBlockedMemberFactory(api) {
  const serviceURL = makeURL(`${api.zpwServiceMap.group[0]}/api/group/blockedmems/remove`, {
    zpw_ver: Zalo.API_VERSION,
    zpw_type: Zalo.API_TYPE,
  });

  /**
   * Remove group blocked member
   *
   * @param memberId member id(s)
   * @param groupId group id
   *
   * @throws {ZaloApiError}
   */
  return async function removeGroupBlockedMember(memberId, groupId) {
    if (!appContext.secretKey || !appContext.imei || !appContext.cookie || !appContext.userAgent)
      throw new ZaloApiError("Missing required app context fields");

    if (!Array.isArray(memberId)) memberId = [memberId];

    const params = {
      grid: groupId,
      members: memberId,
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
