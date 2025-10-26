import { sendMessageFromSQL, sendMessageFailed } from "../../service-hahuyhoang/chat-zalo/chat-style/chat-style.js";
import axios from 'axios';
import * as cheerio from 'cheerio';

export async function handleGoldPriceCommand(api, message) {
  try {
    const response = await axios.get('https://cafef.vn/du-lieu/gia-vang-hom-nay/trong-nuoc.chn', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
      timeout: 10000,
    });

    const html = response.data;
    const $ = cheerio.load(html);

    const table = $('.tblListGoldPrice');
    if (table.length === 0) {
      await sendMessageFailed(api, message, "Không tìm thấy bảng giá vàng trên CafeF!");
      return;
    }

    const rows = table.find('tbody tr');
    if (rows.length === 0) {
      await sendMessageFailed(api, message, "Không có dữ liệu giá vàng!");
      return;
    }

    const formatCurrency = (value) => {
      const numValue = parseFloat(value.replace(/\./g, '').replace(/,/g, ''));
      return new Intl.NumberFormat('vi-VN').format(numValue) + ' VND/lượng';
    };

    let resultMessage = `💰 GIÁ VÀNG SJC - Cập nhật mới nhất\n\n`;

    rows.filter((index, row) => $(row).find('td:nth-child(1)').text().trim().toLowerCase().includes('sjc')).slice(0, 5).each((index, row) => {
      const $row = $(row);
      const typeName = $row.find('td:nth-child(1)').text().trim();
      const buyPrice = $row.find('td:nth-child(2)').text().trim();
      const sellPrice = $row.find('td:nth-child(3)').text().trim();

      if (typeName && buyPrice && sellPrice) {
        resultMessage += `🏢 ${typeName}:\n`;
        resultMessage += `   💵 Mua vào: ${formatCurrency(buyPrice)}\n`;
        resultMessage += `   💰 Bán ra: ${formatCurrency(sellPrice)}\n`;
        resultMessage += '\n';
      }
    });

    if (resultMessage === `💰 GIÁ VÀNG SJC - Cập nhật mới nhất\n\n`) {
      await sendMessageFailed(api, message, "Không extract được dữ liệu SJC!");
      return;
    }

    resultMessage += '─'.repeat(50);

    await sendMessageFromSQL(api, message, { message: resultMessage, success: true }, true, 1800000);
  } catch (error) {
    console.error("Error in handleGoldPriceCommand:", error);
    await sendMessageFailed(api, message, `Đã xảy ra lỗi khi lấy giá vàng: ${error.message || error}`);
  }
}
