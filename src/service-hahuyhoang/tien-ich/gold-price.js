import { sendMessageFromSQL, sendMessageFailed } from "../../service-hahuyhoang/chat-zalo/chat-style/chat-style.js";
import axios from 'axios';
import * as cheerio from 'cheerio'; 

export async function handleGoldPriceCommand(api, message) {
  try {
    const response = await axios.get('https://sjc.com.vn/bieu-do-gia-vang');
    const html = response.data;
    const $ = cheerio.load(html);

    const table = $('#gold-price-table');
    if (table.length === 0) {
      await sendMessageFailed(api, message, "Không tìm thấy bảng giá vàng trên trang SJC!");
      return;
    }

    const rows = table.find('tbody tr');
    if (rows.length === 0) {
      await sendMessageFailed(api, message, "Không có dữ liệu giá vàng!");
      return;
    }

    const formatCurrency = (value) => {
      // Giá từ trang là "78,500" (nghìn đồng/lượng), convert sang full VND
      const numValue = parseFloat(value.replace(/,/g, ''));
      return new Intl.NumberFormat('vi-VN').format(numValue * 1000) + ' VND/lượng';
    };

    let resultMessage = `💰 GIÁ VÀNG SJC - Cập nhật mới nhất từ SJC\n\n`;

    rows.each((index, row) => {
      const $row = $(row);
      const stt = $row.find('td:nth-child(1)').text().trim();
      const branchName = $row.find('td:nth-child(2)').text().trim();
      const buyPrice = $row.find('td:nth-child(3)').text().trim();
      const sellPrice = $row.find('td:nth-child(4)').text().trim();

      if (branchName && buyPrice && sellPrice) {
        resultMessage += `🏢 ${branchName}:\n`;
        resultMessage += `   💵 Mua vào: ${formatCurrency(buyPrice)}\n`;
        resultMessage += `   💰 Bán ra: ${formatCurrency(sellPrice)}\n`;
        resultMessage += '\n';
      }
    });

    resultMessage += '─'.repeat(50);

    await sendMessageFromSQL(api, message, { message: resultMessage, success: true }, true, 1800000);
  } catch (error) {
    console.error("Error in handleGoldPriceCommand:", error);
    await sendMessageFailed(api, message, `Đã xảy ra lỗi khi lấy giá vàng: ${error.message || error}`);
  }
}
