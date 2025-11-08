import {
  sendMessageFromSQL,
  sendMessageWarningRequest,
} from "../chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../service.js";
import { removeMention } from "../../utils/format-util.js";

export async function handleCheckOrderCommand(api, message) {
  const prefix = getGlobalPrefix();
  const content = removeMention(message);

  const commandParts = content.split(" ");
  const trackingNumber = commandParts[1];

  if (!trackingNumber) {
    await sendMessageFromSQL(
      api,
      message,
      {
        success: false,
        message: `Cú pháp: ${prefix}checkorder [mã vận đơn]\nVí dụ: ${prefix}checkorder SPXVN05144905142B`,
      },
      false,
      30000
    );
    return;
  }

  try {
    const response = await fetch(
      `https://spx.vn/shipment/order/open/order/get_order_info?spx_tn=${encodeURIComponent(trackingNumber)}&language_code=vi`,
      {
        headers: {
          Accept: "application/json",
        },
      }
    );

    const data = await response.json();

    if (data.retcode !== 0 || !data.data) {
      await sendMessageFromSQL(
        api,
        message,
        {
          success: false,
          message: "Không tìm thấy thông tin đơn hàng!",
        },
        true,
        30000
      );
      return;
    }

    const slsInfo = data.data.sls_tracking_info;
    const records = slsInfo.records || [];
    
    let messageContent = `🍁 Thông tin đơn hàng:\n`;
    messageContent += `🏆 Mã: ${trackingNumber}\n`;
    messageContent += `📋 SLS: ${slsInfo.sls_tn}\n\n`;

    const latestRecord = records.find(r => r.display_flag === 1);
    if (latestRecord) {
      messageContent += `📍 Trạng thái: ${latestRecord.description}\n`;
      
      if (latestRecord.current_location && latestRecord.current_location.location_name) {
        messageContent += `📌 Vị trí: ${latestRecord.current_location.location_name}\n`;
      }
      
      if (latestRecord.next_location && latestRecord.next_location.location_name) {
        messageContent += `🎯 Đến: ${latestRecord.next_location.location_name}\n`;
      }
    }

    messageContent += `\n📜 Lịch sử:\n\n`;

    for (const record of records) {
      if (record.display_flag === 1) {
        const date = new Date(record.actual_time * 1000);
        const formattedDate = `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
        
        let icon = "📍";
        if (record.tracking_code === "F980") icon = "✅";
        else if (record.tracking_code === "F600") icon = "🚚";
        else if (record.tracking_code === "F599") icon = "🏪";
        else if (record.tracking_code === "F510") icon = "🏭";
        else if (record.tracking_code === "F440") icon = "📦";
        else if (record.tracking_code === "F100") icon = "📥";
        else if (record.tracking_code === "F000") icon = "📋";
        
        messageContent += `${icon} ${record.description}\n`;
        messageContent += `   🕐 ${formattedDate}\n\n`;
      }
    }

    await sendMessageFromSQL(
      api,
      message,
      {
        success: true,
        message: messageContent,
      },
      true,
      600000
    );
  } catch (error) {
    console.log(`Lỗi khi kiểm tra đơn hàng: ${error.message}`);
    await sendMessageWarningRequest(
      api,
      message,
      {
        caption: `Lỗi khi kiểm tra đơn hàng: ${error.message}`,
      },
      600000
    );
  }
}
