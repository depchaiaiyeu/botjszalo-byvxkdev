import axios from "axios";
import { sendMessageStateQuote } from "../chat-zalo/chat-style/chat-style.js";
import { MultiMsgStyle, MessageStyle, MessageType } from "../../api-zalo/index.js";
import { MessageMention } from "../../api-zalo/index.js";

export const COLOR_RED = "db342e";
export const COLOR_YELLOW = "f7b503";
export const COLOR_GREEN = "15a85f";
export const SIZE_18 = "18";
export const SIZE_16 = "12";
export const IS_BOLD = true;

export async function handleCheckPhatNguoiCommand(api, message) {
  const threadId = message.threadId;
  const senderId = message.data?.uidFrom;
  const senderName = message.data?.dName || "Người dùng";
  const content = message.data?.content?.trim();

  if (!content || content.split(" ").length < 2) {
    await sendMessageStateQuote(
      api,
      message,
      "Vui lòng nhập biển số xe hợp lệ sau lệnh",
      false,
      30000
    );
    return;
  }

  const licensePlate = content.split(" ")[1].trim();

  const url = "https://api.checkphatnguoi.vn/phatnguoi";
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
    Origin: "https://checkphatnguoi.vn",
    Referer: "https://checkphatnguoi.vn/",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  };

  try {
    const response = await axios.post(
      url,
      { bienso: licensePlate },
      { headers }
    );
    const responseData = response.data;

    if (responseData.status === 1 && responseData.data?.length > 0) {
      const violations = responseData.data;

      const summaryHeader = `
📅 Cập nhật lúc: ${responseData.data_info.latest}
📊 Tổng số vi phạm: ${responseData.data_info.total}
🔎 Chưa xử phạt: ${responseData.data_info.chuaxuphat}
✅ Đã xử phạt: ${responseData.data_info.daxuphat}
🛂 Nguồn: Cổng thông tin điện tử Cục Cảnh sát giao thông
      `;

      const firstMessage = `@${senderName},\n${summaryHeader}`;
      const styleHeader = MultiMsgStyle([
        MessageStyle(0, firstMessage.length, COLOR_GREEN, SIZE_16, IS_BOLD),
      ]);
      await api.sendMessage(
        {
          msg: firstMessage,
          mentions: [{ uid: senderId, pos: 0, len: senderName.length + 1 }],
          style: styleHeader,
          ttl: 3000000,
        },
        threadId,
        message.type
      );

      // Gửi từng lỗi vi phạm với độ trễ 3 giây
      for (let i = 0; i < violations.length; i++) {
        const violation = violations[i];
        const resolutionPlaces = violation["Nơi giải quyết vụ việc"]
          .map((place, index) => `- ${index + 1}. ${place}`)
          .join("\n");

        const violationDetails = `
🛑 Lỗi ${i + 1}:
🚗 Biển kiểm soát: ${violation["Biển kiểm soát"]}
🟨 Màu biển: ${violation["Màu biển"]}
🚙 Loại phương tiện: ${violation["Loại phương tiện"]}
⏰ Thời gian vi phạm: ${violation["Thời gian vi phạm"]}
📍 Địa điểm vi phạm: ${violation["Địa điểm vi phạm"]}
⚠️ Hành vi vi phạm: ${violation["Hành vi vi phạm"].replace(
          /\./g,
          ".\u200B"
        )}
🔴 Trạng thái: ${violation["Trạng thái"]}
👮 Đơn vị phát hiện vi phạm: ${violation["Đơn vị phát hiện vi phạm"]}
📌 Nơi giải quyết:
${resolutionPlaces}
        `;
        const styleViolation = MultiMsgStyle([
          MessageStyle(0, violationDetails.length, COLOR_GREEN, SIZE_16, IS_BOLD),
        ]);

        // Thêm await và delay 3 giây trước khi gửi tin nhắn
        await new Promise((resolve) => setTimeout(resolve, 3000));
        await api.sendMessage(
          {
            msg: violationDetails,
            style: styleViolation,
            ttl: 300000,
          },
          threadId,
          message.type
        );
      }

    } else {
      await sendMessageStateQuote(
        api,
        message,
        "🔎 Không tìm thấy thông tin phạt nguội cho biển số này.",
        false,
        30000
      );
    }
  } catch (error) {
    console.error("Lỗi khi kiểm tra phạt nguội:", error.message);
    await sendMessageStateQuote(
      api,
      message,
      `❌ Lỗi khi kiểm tra phạt nguội: ${error.message}`,
      false,
      30000
    );
  }
}
