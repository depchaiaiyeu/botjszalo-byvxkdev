import {
  sendMessageFromSQL,
  sendMessageWarningRequest,
} from "../chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../service.js";
import { removeMention } from "../../utils/format-util.js";

export async function handleCheckHttpCommand(api, message) {
  const prefix = getGlobalPrefix();
  const content = removeMention(message);

  const commandParts = content.split(" ");
  const targetUrl = commandParts[1];
  const maxNodes = commandParts[2] ? parseInt(commandParts[2]) : 20;

  if (!targetUrl) {
    await sendMessageFromSQL(
      api,
      message,
      {
        success: false,
        message: `Cú pháp: ${prefix}checkhttp [url] [số nodes (tùy chọn, mặc định 20)]\nVí dụ: ${prefix}checkhttp google.com 10`,
      },
      false,
      30000
    );
    return;
  }

  try {
    const checkResponse = await fetch(
      `https://check-host.net/check-http?host=${encodeURIComponent(targetUrl)}&max_nodes=${maxNodes}`,
      {
        headers: {
          Accept: "application/json",
        },
      }
    );

    const checkData = await checkResponse.json();

    if (!checkData.ok) {
      await sendMessageFromSQL(
        api,
        message,
        {
          success: false,
          message: "Không thể thực hiện kiểm tra HTTP!",
        },
        true,
        30000
      );
      return;
    }

    const requestId = checkData.request_id;

    await new Promise((resolve) => setTimeout(resolve, 5000));

    const resultResponse = await fetch(
      `https://check-host.net/check-result/${requestId}`,
      {
        headers: {
          Accept: "application/json",
        },
      }
    );

    const resultData = await resultResponse.json();

    let messageContent = `HTTP Result:\n`;

    for (const [nodeKey, results] of Object.entries(resultData)) {
      const nodeInfo = checkData.nodes[nodeKey];
      const location = nodeInfo ? `${nodeInfo[1]}, ${nodeInfo[2]}` : nodeKey;

      if (results === null) {
        messageContent += `  ⏳ ${location}: Đang kiểm tra...\n`;
      } else if (Array.isArray(results) && results.length > 0) {
        const result = results[0];
        if (result.error) {
          messageContent += `  ❌ ${location}: ${result.error}\n`;
        } else if (result[1]) {
          const statusCode = result[1];
          const statusText = result[2] || "";
          const icon = statusCode >= 200 && statusCode < 400 ? "✅" : "❌";
          messageContent += `  ${icon} ${location}: ${statusCode} (${statusText})\n`;
        }
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
      60000
    );
  } catch (error) {
    console.log(`Lỗi khi kiểm tra HTTP: ${error.message}`);
    await sendMessageWarningRequest(
      api,
      message,
      {
        caption: `Lỗi khi kiểm tra HTTP: ${error.message}`,
      },
      60000
    );
  }
}
