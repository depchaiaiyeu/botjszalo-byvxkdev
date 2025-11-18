import { Zalo, ZaloApiError } from "../index.js";
import { appContext } from "../context.js";
import { encodeAES, handleZaloResponse, request, makeURL } from "../utils.js";

export function removeGroupBlockedMemberFactory(api) {
  // Endpoint cho remove
  const serviceURL = makeURL(`${api.zpwServiceMap.group[0]}/api/group/blockedmems/remove`, {
    zpw_ver: Zalo.API_VERSION,
    zpw_type: Zalo.API_TYPE,
  });

  /**
   * Xóa thành viên khỏi danh sách chặn của nhóm.
   *
   * Client phải là chủ sở hữu hoặc quản trị viên của nhóm.
   *
   * @param {string|number} groupId - ID của nhóm
   * @param {string|string[]} members - Một hoặc nhiều ID thành viên cần gỡ chặn
   * @throws {ZaloApiError}
   */
  return async function removeGroupBlockedMember(groupId, members) {
    // Kiểm tra các biến môi trường cần thiết cho việc mã hóa và request
    if (!appContext.secretKey) throw new ZaloApiError("Secret key is not available");
    if (!appContext.cookie) throw new ZaloApiError("Cookie is not available");
    if (!appContext.userAgent) throw new ZaloApiError("User agent is not available");
    
    // Chuẩn hóa đầu vào thành mảng string
    members = Array.isArray(members) ? members.map(String) : [String(members)];

    // Logic gốc từ TS: Chỉ có grid và members, KHÔNG CÓ imei
    const params = {
      grid: String(groupId),
      members: members,
    };

    const encryptedParams = encodeAES(appContext.secretKey, JSON.stringify(params));
    if (!encryptedParams) throw new ZaloApiError("Failed to encrypt params");

    // Logic GET: params nằm trên URL
    const finalServiceURL = makeURL(serviceURL, {
      params: encryptedParams,
    });

    const response = await request(finalServiceURL, {
      method: "GET",
    });

    const result = await handleZaloResponse(response);
    if (result.error) throw new ZaloApiError(result.error.message, result.error.code);

    return result.data;
  };
}
