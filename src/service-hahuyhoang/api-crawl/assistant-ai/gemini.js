import { GoogleGenerativeAI } from "@google/generative-ai";
import { getGlobalPrefix } from "../../service.js";
import { getContent } from "../../../utils/format-util.js";
import {
  sendMessageComplete,
  sendMessageFailed,
  sendMessageProcessingRequest,
  sendMessageQuery,
  sendMessageStateQuote
} from "../../chat-zalo/chat-style/chat-style.js";
import * as fs from "fs";
import * as path from "path";
import axios from "axios";
import { checkExstentionFileRemote } from "../../../utils/util.js";

const GEMINI_API_KEYS = [
  "AIzaSyAcjgP3ia83DLvrBefVZWb4VAwOaxtY9Ho",
  "AIzaSyBDTyLJCj2etA-GEeObscK85s4GIkRhqYE"
];

const MODEL_PRIORITY = [
  "gemini-2.5-flash",
  "gemini-2.0-flash-lite",
  "gemini-2.0-flash-exp"
];

let geminiAiInstance;
let geminiModel;
let currentApiKeyIndex = 0;
let currentModelIndex = 0;

const requestQueue = [];
let isProcessing = false;
const DELAY_BETWEEN_REQUESTS = 4000;
const systemInstruction = `Bạn tên là Gem.
Bạn được tạo ra bởi duy nhất Vũ Xuân Kiên và cũng là trợ lý của anh ấy.
Nếu người hỏi là Vũ Xuân Kiên, xưng hô anh-em, với người khác thì tôi-bạn.
Trả lời chính xác vấn đề của câu hỏi, câu trả lời không vượt tổng thể 3k5-3k7 kí tự(tuyệt đối nhé).`;

const SUPPORTED_IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "jxl"];

function initializeGemini() {
  const apiKey = GEMINI_API_KEYS[currentApiKeyIndex];
  const modelName = MODEL_PRIORITY[currentModelIndex];

  if (!apiKey || !modelName) {
    throw new Error("Không còn API key hoặc model nào để sử dụng.");
  }

  if (!geminiAiInstance || geminiAiInstance._apiKey !== apiKey) {
    geminiAiInstance = new GoogleGenerativeAI(apiKey);
  }

  if (!geminiModel || geminiModel.model !== modelName) {
    geminiModel = geminiAiInstance.getGenerativeModel({
      model: modelName,
      generationConfig: {
        temperature: 0.9,
        topK: 40,
        topP: 0.8,
      }
    });
  }
  return { modelName, apiKey };
}

function switchGeminiConfig() {
  currentModelIndex++;
  if (currentModelIndex >= MODEL_PRIORITY.length) {
    currentModelIndex = 0;
    currentApiKeyIndex++;
    if (currentApiKeyIndex >= GEMINI_API_KEYS.length) {
      currentApiKeyIndex = 0;
      console.error("Đã hết API Key để chuyển đổi. Quay lại key đầu tiên.");
      return false;
    }
  }

  try {
    const { modelName } = initializeGemini();
    console.warn(`Chuyển đổi thành công: API Key Index ${currentApiKeyIndex}, Model: ${modelName}`);
    return true;
  } catch (error) {
    console.error("Lỗi khi chuyển đổi cấu hình Gemini:", error.message);
    return false;
  }
}

async function processQueue() {
  if (isProcessing || requestQueue.length === 0) return;
  isProcessing = true;
  while (requestQueue.length > 0) {
    const { api, message, question, imageUrl, resolve, reject } = requestQueue.shift();

    let attempt = 0;
    const maxAttempts = GEMINI_API_KEYS.length * MODEL_PRIORITY.length * 3;
    let replyText = null;
    let success = false;

    while (attempt < maxAttempts && !success) {
      attempt++;
      try {
        const { modelName } = initializeGemini();
        console.log(`Đang xử lý với Model: ${modelName}, Key Index: ${currentApiKeyIndex}, Lần thử: ${attempt}`);
        let fullPrompt = `${systemInstruction}\n\n${question}`;
        let parts = [{ text: fullPrompt }];

        if (imageUrl) {
          let fileUrl = imageUrl;
          let extension = await checkExstentionFileRemote(fileUrl);
          if (extension === "jxl") {
            fileUrl = fileUrl.replace("/jxl/", "/jpg/").replace(".jxl", ".jpg");
            extension = "jpg";
          }
          const isImage = SUPPORTED_IMAGE_EXTENSIONS.includes(extension);

          if (!isImage) {
            reject(new Error("File không hỗ trợ"));
            break;
          }

          const mimeType = extension === "jpg" || extension === "jxl" ? "image/jpeg" : `image/${extension}`;

          const response = await axios.get(fileUrl, { responseType: "arraybuffer" });
          const fileSizeMB = response.data.byteLength / (1024 * 1024);
          if (fileSizeMB > 20) {
            reject(new Error("File quá lớn"));
            break;
          }

          const tempDir = path.resolve("assets/temp");
          if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
          }

          const tempPath = path.join(tempDir, `tempfile.${extension}`);
          fs.writeFileSync(tempPath, response.data);

          const base64 = fs.readFileSync(tempPath, { encoding: "base64" });

          parts.push({
            inlineData: {
              mimeType,
              data: base64,
            },
          });

          fs.unlinkSync(tempPath);
        }

        const result = await geminiModel.generateContent({
          contents: [{ role: "user", parts }]
        });
        replyText = result.response.text();
        success = true;
      } catch (err) {
        console.error(`Lỗi khi gọi API (${currentApiKeyIndex}, ${MODEL_PRIORITY[currentModelIndex]}):`, err.message);
        if (!switchGeminiConfig()) {
          reject(new Error("Không thể xử lý yêu cầu do lỗi API và đã hết các tùy chọn chuyển đổi."));
          break;
        }
      }
    }

    if (success) {
      resolve(replyText);
    } else if (!success && attempt >= maxAttempts) {
      reject(new Error("Đã cố gắng hết các API key và model nhưng vẫn lỗi."));
    }

    await new Promise(r => setTimeout(r, DELAY_BETWEEN_REQUESTS));
  }
  isProcessing = false;
}

export async function callGeminiAPI(api, message, question, imageUrl = null) {
  return new Promise((resolve, reject) => {
    requestQueue.push({ api, message, question, imageUrl, resolve, reject });
    if (!isProcessing) {
      try {
        initializeGemini();
        processQueue();
      } catch (error) {
        reject(error);
      }
    }
  });
}

export async function askGeminiCommand(api, message, aliasCommand) {
  const content = getContent(message);
  const prefix = getGlobalPrefix();
  let question = content.replace(`${prefix}${aliasCommand}`, "").trim();

  if (!question && !message.data?.quote) {
    await sendMessageQuery(api, message, "Vui lòng nhập câu hỏi cần giải đáp! 🤔");
    return;
  }

  let fullPrompt = question;
  let imageUrl = null;

  if (message.data?.quote) {
    const senderName = message.data.dName || "Người dùng";
    const quotedMessage = message.data.quote.msg;
    const quotedAttach = message.data.quote.attach;

    if (quotedAttach) {
      try {
        const attachData = JSON.parse(quotedAttach);
        imageUrl = attachData.hdUrl || attachData.href || attachData.oriUrl || attachData.normalUrl || attachData.thumbUrl;
        
        const attachTitle = attachData.title || "";
        if (attachTitle.length > 0) {
          fullPrompt = `${senderName} hỏi về ảnh có caption: "${attachTitle}"\n\n${question}`;
        } else {
          fullPrompt = `${senderName} hỏi về một ảnh\n\n${question}`;
        }
      } catch (e) {
        if (quotedMessage) {
           fullPrompt = `${senderName} hỏi về tin nhắn: "${quotedMessage}"\n\n${question}`;
        } else {
           fullPrompt = `${senderName} hỏi: ${question}`;
        }
      }
    } else if (quotedMessage) {
      fullPrompt = `${senderName} hỏi về tin nhắn: "${quotedMessage}"\n\n${question}`;
    }
  }

  try {
    await sendMessageProcessingRequest(api, message, "Đang xử lý yêu cầu...");
    let replyText = await callGeminiAPI(api, message, fullPrompt, imageUrl);
    if (!replyText) replyText = "Xin lỗi, hiện tại tôi không thể trả lời câu hỏi này. 🙏";
    
    await sendMessageStateQuote(api, message, replyText, true, 1800000, false);
  } catch (error) {
    console.error("Lỗi khi xử lý yêu cầu Gemini:", error);
    await sendMessageFailed(api, message, `Xin lỗi, có lỗi xảy ra khi xử lý yêu cầu của bạn. Chi tiết: ${error.message} 😢`, true);
  }
}
