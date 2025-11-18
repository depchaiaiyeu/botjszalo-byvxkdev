import { Zalo, ZaloApiError } from "../index.js";
import { appContext } from "../context.js";
import { makeURL, encodeAES, request, handleZaloResponse } from "../utils.js";

export const UpdateSettingsType = {
    ViewBirthday: "view_birthday",
    ShowOnlineStatus: "show_online_status",
    DisplaySeenStatus: "display_seen_status",
    ReceiveMessage: "receive_message",
    AcceptCall: "accept_stranger_call",
    AddFriendViaPhone: "add_friend_via_phone",
    AddFriendViaQR: "add_friend_via_qr",
    AddFriendViaGroup: "add_friend_via_group",
    AddFriendViaContact: "add_friend_via_contact",
    DisplayOnRecommendFriend: "display_on_recommend_friend",
    ArchivedChat: "archivedChatStatus",
    QuickMessage: "quickMessageStatus",
};

export function updateSettingsFactory(api) {
    // THÊM params zpw_ver và zpw_type
    const serviceURL = makeURL(`https://wpa.chat.zalo.me/api/setting/update`, {
        zpw_ver: Zalo.API_VERSION,
        zpw_type: Zalo.API_TYPE,
    });

    /**
     * Set account settings
     * @throws {ZaloApiError}
     */
    return async function updateSettings(type, value) {
        const params = {
            [type]: value,
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
