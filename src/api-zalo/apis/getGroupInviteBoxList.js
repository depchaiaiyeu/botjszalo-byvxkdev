import { Zalo, ZaloApiError } from "../index.js";
import { appContext } from "../context.js";
import { encodeAES, handleZaloResponse, request, makeURL } from "../utils.js";

export function getGroupInviteBoxListFactory(api) {
  const serviceURL = makeURL(`${api.zpwServiceMap.group[0]}/api/group/inv-box/list`, {
    zpw_ver: Zalo.API_VERSION,
    zpw_type: Zalo.API_TYPE,
  });

  /**
   * Get group invite box list
   *
   * @param payload - The payload of the request
   *
   * @throws {ZaloApiError}
   */
  return async function getGroupInviteBoxList(payload) {
    if (!appContext.secretKey || !appContext.imei || !appContext.cookie || !appContext.userAgent)
      throw new ZaloApiError("Missing required app context fields");
      
    const params = {
      mpage: payload?.mpage ?? 1,
      page: payload?.page ?? 0,
      invPerPage: payload?.invPerPage ?? 12,
      mcount: payload?.mcount ?? 10,
      lastGroupId: null,
      avatar_size: 120,
      member_avatar_size: 120,
    };

    const encryptedParams = encodeAES(appContext.secretKey, JSON.stringify(params));
    if (!encryptedParams) throw new ZaloApiError("Failed to encrypt params");

    const response = await request(makeURL(serviceURL, { params: encryptedParams }), {
      method: "GET",
    });

    const result = await handleZaloResponse(response);
    if (result.error) throw new ZaloApiError(result.error.message, result.error.code);

    return result.data;
  };
}
