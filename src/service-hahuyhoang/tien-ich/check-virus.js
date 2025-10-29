import fs from "fs";
import path from "path";
import https from "https";
import http from "http";
import FormData from "form-data";
import { sendMessageFromSQL, sendMessageFailed } from "../../service-hahuyhoang/chat-zalo/chat-style/chat-style.js";

const VIRUSTOTAL_API_KEY = "8c33bc9a4690c56559bc11ea0ca949b0f492fb739ff6baf6a216e06f1e087474";
const tempDir = path.join(process.cwd(), "assets/temp");

async function downloadFile(fileUrl, filePath) {
  return new Promise((resolve, reject) => {
    const protocol = fileUrl.startsWith("https") ? https : http;
    
    protocol.get(fileUrl, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        downloadFile(response.headers.location, filePath)
          .then(resolve)
          .catch(reject);
        return;
      }

      const file = fs.createWriteStream(filePath);
      response.pipe(file);

      file.on("finish", () => {
        file.close();
        resolve(filePath);
      });

      file.on("error", (err) => {
        fs.unlink(filePath, () => {});
        reject(err);
      });
    }).on("error", reject);
  });
}

async function uploadToVirusTotal(filePath) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    const fileStream = fs.createReadStream(filePath);
    form.append("file", fileStream);

    const options = {
      hostname: "www.virustotal.com",
      port: 443,
      path: "/api/v3/files",
      method: "POST",
      headers: {
        ...form.getHeaders(),
        "x-apikey": VIRUSTOTAL_API_KEY,
      },
    };

    const req = https.request(options, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        if (res.statusCode === 200) {
          try {
            const result = JSON.parse(data);
            resolve(result);
          } catch (e) {
            reject(new Error("Failed to parse VirusTotal response"));
          }
        } else {
          reject(new Error(`VirusTotal API error: ${res.statusCode} - ${data}`));
        }
      });
    });

    req.on("error", reject);
    form.pipe(req);
  });
}

async function getAnalysisResult(analysisId) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "www.virustotal.com",
      port: 443,
      path: `/api/v3/analyses/${analysisId}`,
      method: "GET",
      headers: {
        "x-apikey": VIRUSTOTAL_API_KEY,
      },
    };

    https.request(options, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        if (res.statusCode === 200) {
          try {
            const result = JSON.parse(data);
            resolve(result);
          } catch (e) {
            reject(new Error("Failed to parse analysis result"));
          }
        } else {
          reject(new Error(`Failed to get analysis: ${res.statusCode}`));
        }
      });
    }).on("error", reject).end();
  });
}

function extractDownloadLink(attachment) {
  try {
    let attachData = attachment;
    if (typeof attachData === "string") {
      attachData = JSON.parse(attachData);
    }

    if (attachData.href) return attachData.href;
    if (attachData.url) return attachData.url;
    if (attachData.params?.href) return attachData.params.href;
    if (attachData.params?.url) return attachData.params.url;
    
    return null;
  } catch (e) {
    return null;
  }
}

export async function handleVirusScanCommand(api, message) {
  let tempFilePath = null;

  try {
    const quote = message.data?.quote || message.reply;
    
    if (!quote || !quote.attach || quote.attach === "") {
      return;
    }

    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const downloadLink = extractDownloadLink(quote.attach);
    
    if (!downloadLink) {
      return;
    }

    const fileName = `file_${Date.now()}`;
    tempFilePath = path.join(tempDir, fileName);
    
    await downloadFile(downloadLink, tempFilePath);
    const uploadResult = await uploadToVirusTotal(tempFilePath);
    
    if (!uploadResult.data?.id) {
      throw new Error("VirusTotal did not return an analysis ID");
    }

    const analysisId = uploadResult.data.id;

    let analysisResult = await getAnalysisResult(analysisId);
    let status = analysisResult.data?.attributes?.status || "queued";

    if (status === "queued") {
      await sendMessageFromSQL(api, message, { message: "Đang bắt đầu kiểm tra, chờ tí!!!", success: true }, true, 1800000);
    }

    let retries = 0;
    while (status !== "completed" && retries < 30) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      analysisResult = await getAnalysisResult(analysisId);
      status = analysisResult.data?.attributes?.status || "queued";
      retries++;
    }
    
    const attributes = analysisResult.data?.attributes || {};
    const stats = attributes.stats || {};
    const size = attributes.size || 0;
    const type = attributes.type_description || "Unknown";
    const tags = attributes.tags || [];
    const meaningful_name = attributes.meaningful_name || "Unknown";
    const last_submission_date = new Date(attributes.last_submission_date * 1000).toLocaleString("vi-VN") || "N/A";

    const total = stats.harmless + stats.undetected + stats.suspicious + stats.malicious;
    const harmlessPercent = total > 0 ? ((stats.harmless / total) * 100).toFixed(1) : 0;
    const undetectedPercent = total > 0 ? ((stats.undetected / total) * 100).toFixed(1) : 0;
    const suspiciousPercent = total > 0 ? ((stats.suspicious / total) * 100).toFixed(1) : 0;
    const maliciousPercent = total > 0 ? ((stats.malicious / total) * 100).toFixed(1) : 0;

    let resultMessage = `[ 🔍 Kết Quả Quét VirusTotal ]\n\n`;
    resultMessage += `📄 Tên file: ${meaningful_name}\n`;
    resultMessage += `📊 Loại: ${type}\n`;
    resultMessage += `💾 Kích thước: ${(size / 1024).toFixed(2)} KB\n`;
    resultMessage += `📅 Ngày kiểm tra: ${last_submission_date}\n\n`;
    resultMessage += `✅ Sạch: ${stats.harmless || 0} (${harmlessPercent}%)\n`;
    resultMessage += `⚠️  Không chắc chắn: ${stats.undetected || 0} (${undetectedPercent}%)\n`;
    resultMessage += `❓ Đáng ngờ: ${stats.suspicious || 0} (${suspiciousPercent}%)\n`;
    resultMessage += `🚫 Malware: ${stats.malicious || 0} (${maliciousPercent}%)\n\n`;

    if (tags.length > 0) {
      resultMessage += `🏷️  Tags: ${tags.join(", ")}\n\n`;
    }

    if (stats.malicious > 0) {
      resultMessage += `🚫 🚫 🚫 CẢNH BÁO: PHÁT HIỆN MALWARE! 🚫 🚫 🚫\n`;
    } else if (stats.suspicious > 0) {
      resultMessage += `⚠️ CẢNH BÁO: FILE ĐÁNG NGỜ!\n`;
    } else {
      resultMessage += `✅ File an toàn!\n`;
    }

    resultMessage += `\n🔗 Chi tiết phát hiện: https://www.virustotal.com/gui/file/${uploadResult.data.id}`;

    await sendMessageFromSQL(api, message, { message: resultMessage, success: true }, true, 1800000);

  } catch (error) {
    console.error("Error in handleVirusScanCommand:", error);
    await sendMessageFailed(
      api,
      message,
      `🚫 Lỗi quét virus: ${error.message || error}`
    );
  } finally {
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch (e) {
        console.error("Error cleaning up temp file:", e);
      }
    }
  }
}
