import { Zalo, ZaloApiError } from "../index.js";
import { appContext } from "../context.js";
import { encodeAES, handleZaloResponse, request, makeURL } from "../utils.js";

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
  const serviceURL = makeURL("https://wpa.chat.zalo.me/api/setting/update", {
    zpw_ver: Zalo.API_VERSION,
    zpw_type: Zalo.API_TYPE,
  });

  /**
   * Set account settings
   *
   * @param type The type of setting to update
   * @param value
   *
   * ViewBirthday
   * * 0: hide
   * * 1: show full day/month/year
   * * 2: show day/month
   *
   * ShowOnlineStatus
   * * 0: hide
   * * 1: show
   *
   * DisplaySeenStatus
   * * 0: hide
   * * 1: show
   *
   * ReceiveMessage
   * * 1: everyone
   * * 2: only friends
   *
   * AcceptCall
   * * 2: only friends
   * * 3: everyone
   * * 4: friends and person who contacted
   *
   * AddFriendViaPhone
   * * 0: disable
   * * 1: enable
   *
   * AddFriendViaQR
   * * 0: disable
   * * 1: enable
   *
   * AddFriendViaGroup
   * * 0: disable
   * * 1: enable
   *
   * AddFriendViaContact
   * * 0: disable
   * * 1: enable
   *
   * DisplayOnRecommendFriend
   * * 0: disable
   * * 1: enable
   *
   * ArchivedChat
   * * 0: disable
   * * 1: enable
   *
   * QuickMessage
   * * 0: disable
   * * 1: enable
   *
   * @throws {ZaloApiError}
   */
  return async function updateSettings(type, value) {
    if (!appContext.secretKey || !appContext.imei || !appContext.cookie || !appContext.userAgent)
      throw new ZaloApiError("Missing required app context fields");

    const params = {
      [type]: value,
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
