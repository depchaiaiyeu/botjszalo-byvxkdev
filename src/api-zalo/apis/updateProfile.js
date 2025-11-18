import { Zalo, ZaloApiError } from "../index.js"; // Import Zalo để lấy API_VERSION
import { appContext } from "../context.js";
import { makeURL, encodeAES, request, handleZaloResponse } from "../utils.js";

export function updateProfileFactory(api) {
    // THÊM params zpw_ver và zpw_type
    const serviceURL = makeURL(`${api.zpwServiceMap.profile[0]}/api/social/profile/update`, {
        zpw_ver: Zalo.API_VERSION,
        zpw_type: Zalo.API_TYPE,
    });

    /**
     * Change account setting information
     * @throws {ZaloApiError}
     */
    return async function updateProfile(payload) {
        const params = {
            profile: JSON.stringify({
                name: payload.profile.name,
                dob: payload.profile.dob,
                gender: payload.profile.gender,
            }),
            biz: JSON.stringify({
                desc: payload.biz?.description,
                cate: payload.biz?.cate,
                addr: payload.biz?.address,
                website: payload.biz?.website,
                email: payload.biz?.email,
            }),
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
