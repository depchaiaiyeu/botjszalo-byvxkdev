import { sendMessageFromSQL, sendMessageFailed } from "../../service-hahuyhoang/chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../service.js";
import { removeMention } from "../../utils/format-util.js";
import axios from 'axios';
import * as cheerio from 'cheerio';
import xml2js from 'xml2js';

export async function handleLotteryCommand(api, message) {
  try {
    const prefix = getGlobalPrefix();
    const messageText = removeMention(message);
    const argsString = messageText.replace(`${prefix}xoso`, "").trim();
    
    if (!argsString) {
      const response = await axios.get('https://xskt.com.vn/rss', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        timeout: 15000,
      });

      const $ = cheerio.load(response.data);
      const regions = [];
      
      $('#ulrss li a').each((i, elem) => {
        const text = $(elem).text().replace('RSS feed xổ số ', '').trim();
        if (text && !text.includes('Điện toán') && !text.includes('Thần tài')) {
          regions.push(text);
        }
      });

      if (regions.length === 0) {
        await sendMessageFailed(api, message, "Không tìm thấy dữ liệu xổ số!");
        return;
      }

      let resultMessage = `🎰 DANH SÁCH KHU VỰC XỔ SỐ\n`;
      resultMessage += `📋 Tổng số: ${regions.length} khu vực\n`;
      resultMessage += '═'.repeat(50) + '\n\n';
      
      const regionGroups = {
        '🌴 MIỀN NAM': [],
        '⛰️ MIỀN TRUNG': [],
        '🏔️ MIỀN BẮC': []
      };

      regions.forEach(region => {
        if (region === 'Miền Nam') regionGroups['🌴 MIỀN NAM'].push(region);
        else if (region === 'Miền Trung') regionGroups['⛰️ MIỀN TRUNG'].push(region);
        else if (region === 'Miền Bắc') regionGroups['🏔️ MIỀN BẮC'].push(region);
        else {
          const firstChar = region.charAt(0).toUpperCase();
          if ('ABCĐGH'.includes(firstChar)) regionGroups['🌴 MIỀN NAM'].push(region);
          else if ('KLNPQT'.includes(firstChar)) regionGroups['⛰️ MIỀN TRUNG'].push(region);
          else regionGroups['🌴 MIỀN NAM'].push(region);
        }
      });

      for (const [groupName, groupRegions] of Object.entries(regionGroups)) {
        if (groupRegions.length > 0) {
          resultMessage += `${groupName}\n`;
          resultMessage += '─'.repeat(50) + '\n';
          groupRegions.forEach((region, index) => {
            resultMessage += `${index + 1}. ${region}\n`;
          });
          resultMessage += '\n';
        }
      }

      resultMessage += '═'.repeat(50) + '\n';
      resultMessage += `💡 Để xem kết quả, nhập: ${prefix}xoso <tên vùng>\n`;
      resultMessage += `📝 Ví dụ: ${prefix}xoso vũng tàu`;

      await sendMessageFromSQL(api, message, { message: resultMessage, success: true }, true, 1800000);
      return;
    }

    const regionInput = argsString.toLowerCase().trim();
    
    const response = await axios.get('https://xskt.com.vn/rss', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      timeout: 15000,
    });

    const $ = cheerio.load(response.data);
    let rssUrl = '';
    
    $('#ulrss li a').each((i, elem) => {
      const text = $(elem).text().replace('RSS feed xổ số ', '').toLowerCase().trim();
      const href = $(elem).attr('href');
      
      if (text === regionInput) {
        rssUrl = 'https://xskt.com.vn' + href;
        return false;
      }
    });

    if (!rssUrl) {
      await sendMessageFailed(api, message, `❌ Không tìm thấy khu vực "${argsString}"!\n💡 Nhập "${prefix}xoso" để xem danh sách.`);
      return;
    }

    const rssResponse = await axios.get(rssUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      timeout: 15000,
    });

    const parser = new xml2js.Parser();
    const rssData = await parser.parseStringPromise(rssResponse.data);
    
    const items = rssData.rss.channel[0].item || [];
    const title = rssData.rss.channel[0].title[0];

    if (items.length === 0) {
      await sendMessageFailed(api, message, "Không có dữ liệu xổ số!");
      return;
    }

    const now = new Date();
    const today = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}`;
    
    let todayItem = null;
    for (const item of items) {
      const itemTitle = item.title[0];
      if (itemTitle.includes(today)) {
        todayItem = item;
        break;
      }
    }

    if (!todayItem) {
      let resultMessage = `🎰 ${title.toUpperCase()}\n`;
      resultMessage += `⚠️ Chưa có kết quả ngày ${today}\n`;
      resultMessage += '═'.repeat(50) + '\n\n';
      resultMessage += `📜 CÁC KỲ GÇN ĐÂY:\n\n`;

      items.slice(0, 5).forEach((item, index) => {
        const itemTitle = item.title[0];
        const description = item.description[0];
        const lines = description.split('\n').filter(line => line.trim());
        
        resultMessage += `${index + 1}. ${itemTitle}\n`;
        
        lines.forEach(line => {
          const trimmedLine = line.trim();
          if (trimmedLine.startsWith('ĐB:')) {
            resultMessage += `   🏆 ĐB: ${trimmedLine.replace('ĐB:', '').trim()}\n`;
          }
        });
        resultMessage += '\n';
      });

      resultMessage += '═'.repeat(50) + '\n';
      resultMessage += `⏰ Cập nhật: ${new Date().toLocaleString('vi-VN')}`;

      await sendMessageFromSQL(api, message, { message: resultMessage, success: true }, true, 1800000);
      return;
    }

    const itemTitle = todayItem.title[0];
    const description = todayItem.description[0];

    let resultMessage = `🎰 ${title.toUpperCase()}\n`;
    resultMessage += `📅 ${itemTitle}\n`;
    resultMessage += '═'.repeat(50) + '\n\n';

    const lines = description.split('\n').filter(line => line.trim());
    
    lines.forEach(line => {
      const trimmedLine = line.trim();
      if (!trimmedLine) return;

      if (trimmedLine.startsWith('ĐB:')) {
        resultMessage += `🏆 Giải Đặc Biệt: ${trimmedLine.replace('ĐB:', '').trim()}\n\n`;
      } else if (trimmedLine.match(/^\d+:/)) {
        const [prize, numbers] = trimmedLine.split(':');
        const prizeNames = ['Nhất', 'Nhì', 'Ba', 'Tư', 'Năm', 'Sáu', 'Bảy', 'Tám'];
        const prizeName = prizeNames[parseInt(prize) - 1] || prize;
        resultMessage += `🎯 Giải ${prizeName}: ${numbers.trim()}\n`;
      }
    });

    resultMessage += '\n' + '═'.repeat(50) + '\n';
    resultMessage += `⏰ Cập nhật: ${new Date().toLocaleString('vi-VN')}`;

    await sendMessageFromSQL(api, message, { message: resultMessage, success: true }, true, 1800000);

  } catch (error) {
    console.error("Error in handleLotteryCommand:", error);
    await sendMessageFailed(api, message, `❌ Đã xảy ra lỗi: ${error.message || error}`);
  }
}
