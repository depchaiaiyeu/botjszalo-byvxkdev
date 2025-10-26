import { sendMessageFromSQL, sendMessageFailed } from "../../service-hahuyhoang/chat-zalo/chat-style/chat-style.js";
import axios from 'axios';
import * as cheerio from 'cheerio';

export async function handleGoldPriceCommand(api, message) {
  try {
    const response = await axios.get('https://baomoi.com/tien-ich-gia-vang.epi', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Cache-Control': 'max-age=0',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'Referer': 'https://baomoi.com/'
      },
      timeout: 15000,
    });

    const $ = cheerio.load(response.data);
    const allGoldData = {
      sjc: [],
      doji: [],
      pnj: [],
      btmc: []
    };

    let currentSection = '';
    $('h2, .rc-table-tbody').each((i, elem) => {
      if (elem.name === 'h2') {
        const title = $(elem).text().toLowerCase();
        if (title.includes('sjc')) currentSection = 'sjc';
        else if (title.includes('doji')) currentSection = 'doji';
        else if (title.includes('pnj')) currentSection = 'pnj';
        else if (title.includes('bảo tín minh châu')) currentSection = 'btmc';
      } else if (currentSection && elem.name === 'tbody') {
        $(elem).find('tr').each((index, row) => {
          const cells = $(row).find('td.rc-table-cell');
          const name = $(cells[1]).text().trim();
          const buy = $(cells[2]).text().trim();
          const sell = $(cells[3]).text().trim();

          if (name && buy && sell) {
            allGoldData[currentSection].push({
              name: name,
              buy: parseFloat(buy.replace(/,/g, '')),
              sell: parseFloat(sell.replace(/,/g, ''))
            });
          }
        });
      }
    });

    const totalItems = allGoldData.sjc.length + allGoldData.doji.length + allGoldData.pnj.length + allGoldData.btmc.length;
    
    if (totalItems === 0) {
      await sendMessageFailed(api, message, "Không tìm thấy dữ liệu giá vàng!");
      return;
    }

    const formatCurrency = (value) => {
      return new Intl.NumberFormat('vi-VN').format(value) + ' VND/lượng';
    };

    const formatShort = (value) => {
      return new Intl.NumberFormat('vi-VN').format(value) + ' VND';
    };

    let resultMessage = `💰 GIÁ VÀNG HÔM NAY - Cập nhật mới nhất\n`;
    resultMessage += `📡 Nguồn: Báo Mới\n`;
    resultMessage += `📊 Tổng số loại: ${totalItems}\n`;
    resultMessage += '═'.repeat(50) + '\n\n';

    if (allGoldData.sjc.length > 0) {
      resultMessage += `🏆 VÀNG SJC (${allGoldData.sjc.length} loại)\n`;
      resultMessage += '─'.repeat(50) + '\n';
      for (const item of allGoldData.sjc) {
        const spread = item.sell - item.buy;
        const spreadPercent = ((spread / item.buy) * 100).toFixed(2);
        
        resultMessage += `🏢 ${item.name}\n`;
        resultMessage += `   💵 Mua: ${formatCurrency(item.buy)}\n`;
        resultMessage += `   💰 Bán: ${formatCurrency(item.sell)}\n`;
        resultMessage += `   📊 Chênh lệch: ${formatShort(spread)} (${spreadPercent}%)\n\n`;
      }
    }

    if (allGoldData.doji.length > 0) {
      resultMessage += `\n🏆 VÀNG DOJI (${allGoldData.doji.length} loại)\n`;
      resultMessage += '─'.repeat(50) + '\n';
      for (const item of allGoldData.doji.slice(0, 3)) {
        const spread = item.sell - item.buy;
        const spreadPercent = ((spread / item.buy) * 100).toFixed(2);
        
        resultMessage += `🏢 ${item.name}\n`;
        resultMessage += `   💵 Mua: ${formatCurrency(item.buy)}\n`;
        resultMessage += `   💰 Bán: ${formatCurrency(item.sell)}\n`;
        resultMessage += `   📊 Chênh lệch: ${formatShort(spread)} (${spreadPercent}%)\n\n`;
      }
    }

    if (allGoldData.pnj.length > 0) {
      resultMessage += `\n🏆 VÀNG PNJ (${allGoldData.pnj.length} loại)\n`;
      resultMessage += '─'.repeat(50) + '\n';
      for (const item of allGoldData.pnj.slice(0, 3)) {
        const spread = item.sell - item.buy;
        const spreadPercent = ((spread / item.buy) * 100).toFixed(2);
        
        resultMessage += `🏢 ${item.name}\n`;
        resultMessage += `   💵 Mua: ${formatCurrency(item.buy)}\n`;
        resultMessage += `   💰 Bán: ${formatCurrency(item.sell)}\n`;
        resultMessage += `   📊 Chênh lệch: ${formatShort(spread)} (${spreadPercent}%)\n\n`;
      }
    }

    if (allGoldData.btmc.length > 0) {
      resultMessage += `\n🏆 VÀNG BẢO TÍN MINH CHÂU (${allGoldData.btmc.length} loại)\n`;
      resultMessage += '─'.repeat(50) + '\n';
      for (const item of allGoldData.btmc.slice(0, 3)) {
        const spread = item.sell - item.buy;
        const spreadPercent = ((spread / item.buy) * 100).toFixed(2);
        
        resultMessage += `🏢 ${item.name}\n`;
        resultMessage += `   💵 Mua: ${formatCurrency(item.buy)}\n`;
        resultMessage += `   💰 Bán: ${formatCurrency(item.sell)}\n`;
        resultMessage += `   📊 Chênh lệch: ${formatShort(spread)} (${spreadPercent}%)\n\n`;
      }
    }

    resultMessage += '═'.repeat(50);
    await sendMessageFromSQL(api, message, { message: resultMessage, success: true }, true, 1800000);
  } catch (error) {
    console.error("Error in handleGoldPriceCommand:", error);
    await sendMessageFailed(api, message, `Đã xảy ra lỗi khi lấy giá vàng: ${error.message || error}`);
  }
}
