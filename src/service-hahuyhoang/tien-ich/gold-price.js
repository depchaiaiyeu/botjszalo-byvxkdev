import { sendMessageFromSQL, sendMessageFailed } from "../../service-hahuyhoang/chat-zalo/chat-style/chat-style.js";
import axios from 'axios';
import * as cheerio from 'cheerio';
import { parseString } from 'xml2js';
import { promisify } from 'util';

const parseXML = promisify(parseString);

async function fetchFromSJCXML() {
  const response = await axios.get('https://sjc.com.vn/xml/tygiavang.xml', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/xml'
    },
    timeout: 10000
  });

  const xmlData = await parseXML(response.data);
  const items = xmlData.Root.ratelist[0].item;
  
  const goldData = [];
  for (const item of items) {
    if (item.$.type.toLowerCase().includes('sjc')) {
      goldData.push({
        name: item.$.type,
        buy: parseFloat(item.$.buy) * 1000,
        sell: parseFloat(item.$.sell) * 1000
      });
    }
  }
  
  return goldData;
}

async function fetchFromTyGia() {
  const response = await axios.get('https://tygia.com/json.php', {
    params: {
      ran: Math.random(),
      rate: 0,
      gold: 1,
      bank: 'VIETCOM',
      date: 'now'
    },
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json',
      'Referer': 'https://tygia.com'
    },
    timeout: 10000
  });

  const goldData = [];
  if (response.data && response.data.golds && response.data.golds[0] && response.data.golds[0].value) {
    for (const item of response.data.golds[0].value) {
      if (item.type.toLowerCase().includes('sjc')) {
        goldData.push({
          name: item.type,
          buy: parseFloat(item.buy.replace(/,/g, '')) * 1000,
          sell: parseFloat(item.sell.replace(/,/g, '')) * 1000
        });
      }
    }
  }
  
  return goldData;
}

async function fetchFromCafeF() {
  const response = await axios.get('https://cafef.vn/du-lieu/gia-vang-hom-nay/trong-nuoc.chn', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
    },
    timeout: 10000,
  });

  const $ = cheerio.load(response.data);
  const table = $('.tblListGoldPrice');
  
  if (table.length === 0) {
    throw new Error('Không tìm thấy bảng giá vàng');
  }

  const rows = table.find('tbody tr');
  if (rows.length === 0) {
    throw new Error('Không có dữ liệu giá vàng');
  }

  const goldData = [];
  rows.filter((index, row) => $(row).find('td:nth-child(1)').text().trim().toLowerCase().includes('sjc')).slice(0, 5).each((index, row) => {
    const $row = $(row);
    const typeName = $row.find('td:nth-child(1)').text().trim();
    const buyPrice = $row.find('td:nth-child(2)').text().trim();
    const sellPrice = $row.find('td:nth-child(3)').text().trim();

    if (typeName && buyPrice && sellPrice) {
      goldData.push({
        name: typeName,
        buy: parseFloat(buyPrice.replace(/\./g, '').replace(/,/g, '')),
        sell: parseFloat(sellPrice.replace(/\./g, '').replace(/,/g, ''))
      });
    }
  });

  return goldData;
}

async function fetchFromDOJI() {
  const response = await axios.get('https://giavang.doji.vn/api/gold-price', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json',
      'Referer': 'https://giavang.doji.vn/'
    },
    timeout: 10000
  });

  const goldData = [];
  if (response.data && response.data.data) {
    for (const item of response.data.data) {
      if (item.name && item.name.toLowerCase().includes('sjc')) {
        goldData.push({
          name: item.name,
          buy: parseFloat(item.buy),
          sell: parseFloat(item.sell)
        });
      }
    }
  }

  return goldData;
}

export async function handleGoldPriceCommand(api, message) {
  const sources = [
    { name: 'SJC XML', func: fetchFromSJCXML },
    { name: 'TyGia.com', func: fetchFromTyGia },
    { name: 'DOJI API', func: fetchFromDOJI },
    { name: 'CafeF', func: fetchFromCafeF }
  ];

  let goldData = null;
  let usedSource = null;

  for (const source of sources) {
    try {
      goldData = await source.func();
      if (goldData && goldData.length > 0) {
        usedSource = source.name;
        break;
      }
    } catch (error) {
      console.log(`Failed to fetch from ${source.name}:`, error.message);
      continue;
    }
  }

  if (!goldData || goldData.length === 0) {
    await sendMessageFailed(api, message, "Không thể lấy dữ liệu giá vàng từ tất cả các nguồn!");
    return;
  }

  try {
    const formatCurrency = (value) => {
      return new Intl.NumberFormat('vi-VN').format(value) + ' VND/lượng';
    };

    let resultMessage = `💰 GIÁ VÀNG SJC - Cập nhật mới nhất\n`;
    resultMessage += `📡 Nguồn: ${usedSource}\n\n`;

    for (const item of goldData) {
      resultMessage += `🏢 ${item.name}:\n`;
      resultMessage += `   💵 Mua vào: ${formatCurrency(item.buy)}\n`;
      resultMessage += `   💰 Bán ra: ${formatCurrency(item.sell)}\n`;
      resultMessage += '\n';
    }

    resultMessage += '─'.repeat(50);
    await sendMessageFromSQL(api, message, { message: resultMessage, success: true }, true, 1800000);
  } catch (error) {
    console.error("Error formatting gold price data:", error);
    await sendMessageFailed(api, message, `Đã xảy ra lỗi khi xử lý dữ liệu: ${error.message || error}`);
  }
}
