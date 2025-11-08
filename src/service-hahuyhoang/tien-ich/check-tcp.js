import {
  sendMessageFromSQL,
  sendMessageWarningRequest,
} from "../chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../service.js";
import { removeMention } from "../../utils/format-util.js";

export async function handleCheckTcpCommand(api, message) {
  const prefix = getGlobalPrefix();
  const content = removeMention(message);

  const commandParts = content.split(" ");
  const targetHost = commandParts[1];
  const maxNodes = commandParts[2] ? parseInt(commandParts[2]) : 20;

  if (!targetHost) {
    await sendMessageFromSQL(
      api,
      message,
      {
        success: false,
        message: `Cú pháp: ${prefix}checktcp [host:port] [số nodes (tùy chọn, mặc định 20)]\nVí dụ: ${prefix}checktcp google.com:443 10`,
      },
      false,
      30000
    );
    return;
  }

  try {
    const checkResponse = await fetch(
      `https://check-host.net/check-tcp?host=${encodeURIComponent(targetHost)}&max_nodes=${maxNodes}`,
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
          message: "Không thể thực hiện kiểm tra TCP!",
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

    let messageContent = `TCP Result:\n`;

    for (const [nodeKey, results] of Object.entries(resultData)) {
      const nodeInfo = checkData.nodes[nodeKey];
      const location = nodeInfo ? `${nodeInfo[1]}, ${nodeInfo[2]}` : nodeKey;

      if (results === null) {
        messageContent += `  ⏳ ${location}: Đang kiểm tra...\n`;
      } else if (Array.isArray(results) && results.length > 0) {
        const result = results[0];
        if (result.error) {
          messageContent += `  ❌ ${location}: ${result.error}\n`;
        } else if (result.time !== undefined) {
          messageContent += `  ✅ ${location}: ${result.time}s (${result.address})\n`;
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
    console.log(`Lỗi khi kiểm tra TCP: ${error.message}`);
    await sendMessageWarningRequest(
      api,
      message,
      {
        caption: `Lỗi khi kiểm tra TCP: ${error.message}`,
      },
      60000
    );
  }
}
