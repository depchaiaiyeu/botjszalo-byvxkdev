import { ZaloApiError } from "../Errors/ZaloApiError.js";
import { appContext } from "../context.js";
import { makeURL, encodeAES, request, handleZaloResponse } from "../utils.js";

export function removeGroupBlockedMemberFactory(api) {
    const serviceURL = makeURL(`${api.zpwServiceMap.group[0]}/api/group/blockedmems/remove`);

    /**
     * Remove group blocked member
     *
     * @param memberId member id(s)
     * @param groupId group id
     *
     * @throws {ZaloApiError}
     */
    return async function removeGroupBlockedMember(memberId, groupId) {
        if (!Array.isArray(memberId)) memberId = [memberId];

        const params = {
            grid: groupId,
            members: memberId,
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
