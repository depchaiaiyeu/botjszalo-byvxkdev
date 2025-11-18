import { Zalo, ZaloApiError } from "../index.js";
import { appContext } from "../context.js";
import { makeURL, encodeAES, request, handleZaloResponse } from "../utils.js";

export function acceptFriendRequestFactory(api) {
    const serviceURL = makeURL(`${api.zpwServiceMap.friend[0]}/api/friend/accept`, {
        zpw_ver: Zalo.API_VERSION,
        zpw_type: Zalo.API_TYPE,
    });

    /**
     * Accept a friend request from a User
     *
     * @param friendId The friend ID to user request is accept
     *
     * @throws {ZaloApiError}
     */
    return async function acceptFriendRequest(friendId) {
        const params = {
            fid: friendId,
            language: appContext.language,
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
