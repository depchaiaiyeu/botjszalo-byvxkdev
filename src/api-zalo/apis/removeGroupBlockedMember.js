import { Zalo, ZaloApiError } from "../index.js";
import { appContext } from "../context.js";
import { makeURL, encodeAES, request, handleZaloResponse } from "../utils.js";

export function removeGroupBlockedMemberFactory(api) {
    // THÊM params zpw_ver và zpw_type
    const serviceURL = makeURL(`${api.zpwServiceMap.group[0]}/api/group/blockedmems/remove`, {
        zpw_ver: Zalo.API_VERSION,
        zpw_type: Zalo.API_TYPE,
    });

    /**
     * Remove group blocked member
     * @throws {ZaloApiError}
     */
    return async function removeGroupBlockedMember(memberId, groupId) {
        if (!Array.isArray(memberId)) memberId = [memberId];

        const params = {
            grid: String(groupId),
            members: memberId,
            imei: appContext.imei,
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
