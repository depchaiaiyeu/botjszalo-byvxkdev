import { Zalo, ZaloApiError } from "../index.js";
import { appContext } from "../context.js";
import { encodeAES, handleZaloResponse, request, makeURL } from "../utils.js";

export function disperseGroupFactory(api) {
  const serviceURL = makeURL(`${api.zpwServiceMap.group[0]}/api/group/disperse`, {
    zpw_ver: Zalo.API_VERSION,
    zpw_type: Zalo.API_TYPE,
  });

  /**
   * Disperse Group
   *
   * @param groupId Group ID to disperse Group from
   *
   * @throws {ZaloApiError}
   */
  return async function disperseGroup(groupId) {
    if (!appContext.secretKey || !appContext.imei || !appContext.cookie || !appContext.userAgent)
      throw new ZaloApiError("Missing required app context fields");

    const params = {
      grid: groupId,
      imei: appContext.imei,
    };

    const encryptedParams = encodeAES(appContext.secretKey, JSON.stringify(params));
    if (!encryptedParams) throw new ZaloApiError("Failed to encrypt params");

    const response = await request(serviceURL, {
      method: "POST",
      body: new URLSearchParams({
        params: encryptedParams,
      }),
    });

    const result = await handleZaloResponse(response);
    if (result.error) throw new ZaloApiError(result.error.message, result.error.code);

    return result.data;
  };
}
