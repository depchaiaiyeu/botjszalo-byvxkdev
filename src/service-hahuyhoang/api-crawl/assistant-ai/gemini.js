import { GoogleGenerativeAI } from "@google/generative-ai";
import { getGlobalPrefix } from "../../service.js";
import { getContent } from "../../../utils/format-util.js";
import { 
  sendMessageFromSQL,
  sendMessageQuery
} from "../../chat-zalo/chat-style/chat-style.js";
import * as fs from "fs";
import * as path from "path";
import axios from "axios";
import { checkExstentionFileRemote } from "../../../utils/util.js";

const geminiApiKey = "AIzaSyBaluNjfNY9HEykFgoFCSNapC_Q_jkRRTA";
const genAI = new GoogleGenerativeAI(geminiApiKey);
let geminiModel;
const requestQueue = [];
let isProcessing = false;
const DELAY_BETWEEN_REQUESTS = 4000;
const MAX_MESSAGE_LENGTH = 3500;
const systemInstruction = `Bạn tên là Gem.
Bạn được tạo ra bởi duy nhất Vũ Xuân Kiên và cũng là trợ lý của anh ấy.
Nếu người hỏi là Vũ Xuân Kiên, xưng hô anh-em, với người khác thì tôi-bạn.
Trả lời chính xác vấn đề.`;

const SUPPORTED_IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "jxl"];

export function initGeminiModel() {
  if (geminiModel) return;
  geminiModel = genAI.getGenerativeModel({
    model: "gemini-2.0-flash-exp",
    generationConfig: {
      temperature: 0.9,
      topK: 40,
      topP: 0.8,
    }
  });
}

function splitMessage(text, maxLength = MAX_MESSAGE_LENGTH) {
  if (text.length <= maxLength) return [text];
  
  const messages = [];
  let currentMessage = "";
  const lines = text.split("\n");
  
  for (const line of lines) {
    if ((currentMessage + line + "\n").length > maxLength) {
      if (currentMessage) {
        messages.push(currentMessage.trim());
        currentMessage = "";
      }
      
      if (line.length > maxLength) {
        const words = line.split(" ");
        for (const word of words) {
          if ((currentMessage + word + " ").length > maxLength) {
            if (currentMessage) {
              messages.push(currentMessage.trim());
              currentMessage = "";
            }
            if (word.length > maxLength) {
              for (let i = 0; i < word.length; i += maxLength) {
                messages.push(word.slice(i, i + maxLength));
              }
            } else {
              currentMessage = word + " ";
            }
          } else {
            currentMessage += word + " ";
          }
        }
      } else {
        currentMessage = line + "\n";
      }
    } else {
      currentMessage += line + "\n";
    }
  }
  
  if (currentMessage.trim()) {
    messages.push(currentMessage.trim());
  }
  
  return messages;
}

async function processQueue() {
  if (isProcessing || requestQueue.length === 0) return;
  isProcessing = true;
  while (requestQueue.length > 0) {
    const { api, message, question, imageUrl, resolve, reject } = requestQueue.shift();
    try {
      initGeminiModel();
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
          return;
        }

        const mimeType = extension === "jpg" || extension === "jxl" ? "image/jpeg" : `image/${extension}`;

        const response = await axios.get(fileUrl, { responseType: "arraybuffer" });
        const fileSizeMB = response.data.byteLength / (1024 * 1024);
        if (fileSizeMB > 20) {
          reject(new Error("File quá lớn"));
          return;
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

      let replyText = null;
      const maxRetries = 3;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const result = await geminiModel.generateContent({
            contents: [{ role: "user", parts }]
          });
          replyText = result.response.text();
          break;
        } catch (err) {
          if (attempt === maxRetries) {
            throw err;
          }
          await new Promise(res => setTimeout(res, 1000 * attempt));
        }
      }

      resolve(replyText);
    } catch (error) {
      reject(error);
    }
    await new Promise(r => setTimeout(r, DELAY_BETWEEN_REQUESTS));
  }
  isProcessing = false;
}

export async function callGeminiAPI(api, message, question, imageUrl = null) {
  return new Promise((resolve, reject) => {
    requestQueue.push({ api, message, question, imageUrl, resolve, reject });
    processQueue();
  });
}

export async function askGeminiCommand(api, message, aliasCommand) {
  const content = getContent(message);
  const prefix = getGlobalPrefix();
  let question = content.replace(`${prefix}${aliasCommand}`, "").trim();
  
  if (!question) {
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
      const attachData = JSON.parse(quotedAttach);
      imageUrl = attachData.hdUrl || attachData.href || attachData.oriUrl || attachData.normalUrl || attachData.thumbUrl;
      if (attachData.title) {
        fullPrompt = `${senderName} hỏi về ảnh có caption: "${attachData.title}"\n\n${question}`;
      } else {
        fullPrompt = `${senderName} hỏi về một ảnh\n\n${question}`;
      }
    } else if (quotedMessage) {
      fullPrompt = `${senderName} hỏi về tin nhắn: "${quotedMessage}"\n\n${question}`;
    }
  }

  try {
    let replyText = await callGeminiAPI(api, message, fullPrompt, imageUrl);
    if (!replyText) replyText = "Xin lỗi, hiện tại tôi không thể trả lời câu hỏi này. 🙏";
    
    const messages = splitMessage(replyText);
    
    for (let i = 0; i < messages.length; i++) {
      const prefix = messages.length > 1 ? `[${i + 1}/${messages.length}]\n` : "";
      await sendMessageFromSQL(api, message, { success: true, message: prefix + messages[i] }, false);
      if (i < messages.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  } catch (error) {
    console.error("Lỗi khi xử lý yêu cầu Gemini:", error);
    await sendMessageFromSQL(api, message, { success: false, message: "Xin lỗi, có lỗi xảy ra khi xử lý yêu cầu của bạn. 😢" }, true);
  }
}
