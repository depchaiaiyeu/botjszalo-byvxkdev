import { sendMessageFromSQL, sendMessageFailed, sendMessageQuery } from "../../service-hahuyhoang/chat-zalo/chat-style/chat-style.js";
import axios from 'axios';
import FormData from 'form-data';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { pipeline } from 'stream';

const streamPipeline = promisify(pipeline);

const VIRUSTOTAL_API_KEY = '8c33bc9a4690c56559bc11ea0ca949b0f492fb739ff6baf6a216e06f1e087474';
const VIRUSTOTAL_UPLOAD_URL = 'https://www.virustotal.com/api/v3/files';
const VIRUSTOTAL_REPORT_URL = 'https://www.virustotal.com/api/v3/analyses/';

export async function handleVirusScanCommand(api, message) {
  try {
    if (!message.data.quote || !message.data.quote.attach || !message.data.quote.attach.href) {
      await sendMessageQuery(api, message, "Vui lòng quote file cần kiểm tra virus!");
      return;
    }

    const fileUrl = message.data.quote.attach.href;
    const fileName = message.data.quote.attach.name || 'file_' + Date.now();
    const tempDir = path.join(process.cwd(), 'temp');
    const tempFilePath = path.join(tempDir, fileName);

    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const downloadResponse = await axios({
      method: 'GET',
      url: fileUrl,
      responseType: 'stream',
      timeout: 60000
    });

    await streamPipeline(downloadResponse.data, fs.createWriteStream(tempFilePath));

    await sendMessageFromSQL(api, message, { message: "🔍 Đang phân tích file... Vui lòng đợi", success: true }, true, 5000);

    const formData = new FormData();
    formData.append('file', fs.createReadStream(tempFilePath));

    const uploadResponse = await axios.post(VIRUSTOTAL_UPLOAD_URL, formData, {
      headers: {
        'x-apikey': VIRUSTOTAL_API_KEY,
        ...formData.getHeaders()
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 120000
    });

    const analysisId = uploadResponse.data.data.id;

    await new Promise(resolve => setTimeout(resolve, 30000));

    const reportResponse = await axios.get(VIRUSTOTAL_REPORT_URL + analysisId, {
      headers: {
        'x-apikey': VIRUSTOTAL_API_KEY
      },
      timeout: 30000
    });

    const stats = reportResponse.data.data.attributes.stats;
    const results = reportResponse.data.data.attributes.results;

    let resultMessage = `🛡️ KẾT QUẢ QUÉT VIRUS\n`;
    resultMessage += `═`.repeat(50) + '\n\n';
    resultMessage += `📄 Tên file: ${fileName}\n`;
    resultMessage += `🔍 Công cụ quét: VirusTotal\n\n`;
    resultMessage += `📊 THỐNG KÊ:\n`;
    resultMessage += `─`.repeat(50) + '\n';
    resultMessage += `✅ An toàn: ${stats.harmless || 0}\n`;
    resultMessage += `🔴 Phát hiện virus: ${stats.malicious || 0}\n`;
    resultMessage += `⚠️ Nghi ngờ: ${stats.suspicious || 0}\n`;
    resultMessage += `❓ Không xác định: ${stats.undetected || 0}\n`;
    resultMessage += `⏱️ Timeout: ${stats.timeout || 0}\n\n`;

    if (stats.malicious > 0) {
      resultMessage += `⚠️ CẢNH BÁO: File có thể chứa mã độc!\n\n`;
      resultMessage += `🦠 DANH SÁCH PHÁT HIỆN:\n`;
      resultMessage += `─`.repeat(50) + '\n';
      
      let detectionCount = 0;
      for (const [engine, result] of Object.entries(results)) {
        if (result.category === 'malicious' && detectionCount < 10) {
          resultMessage += `🔸 ${engine}: ${result.result}\n`;
          detectionCount++;
        }
      }
      
      if (stats.malicious > 10) {
        resultMessage += `\n... và ${stats.malicious - 10} phát hiện khác\n`;
      }
    } else if (stats.suspicious > 0) {
      resultMessage += `⚠️ CHÚ Ý: File có dấu hiệu nghi ngờ!\n`;
    } else {
      resultMessage += `✅ File an toàn! Không phát hiện mã độc.\n`;
    }

    resultMessage += `\n═`.repeat(50);
    resultMessage += `\n🔗 Chi tiết: https://www.virustotal.com/gui/file-analysis/${analysisId}`;

    fs.unlinkSync(tempFilePath);

    await sendMessageFromSQL(api, message, { message: resultMessage, success: true }, true, 1800000);

  } catch (error) {
    console.error("Error in handleVirusScanCommand:", error);
    
    let errorMessage = "🚫 Đã xảy ra lỗi khi quét virus: ";
    
    if (error.response) {
      if (error.response.status === 401) {
        errorMessage += "API Key không hợp lệ!";
      } else if (error.response.status === 429) {
        errorMessage += "Vượt quá giới hạn API. Vui lòng thử lại sau!";
      } else {
        errorMessage += `Lỗi từ VirusTotal (${error.response.status})`;
      }
    } else if (error.code === 'ECONNABORTED') {
      errorMessage += "Timeout khi kết nối đến VirusTotal!";
    } else {
      errorMessage += error.message || "Lỗi không xác định";
    }
    
    await sendMessageFailed(api, message, errorMessage);
  }
}
