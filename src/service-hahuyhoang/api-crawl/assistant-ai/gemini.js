import { GoogleGenAI } from "@google/genai";
import { getGlobalPrefix } from "../../service.js";
import { getContent } from "../../../utils/format-util.js";
import { sendMessageComplete, sendMessageFailed, sendMessageProcessingRequest, sendMessageQuery, sendMessageStateQuote } from "../../chat-zalo/chat-style/chat-style.js";
import { nameServer } from "../../../database/index.js";
import { generateImage } from "./genai.js";
import { writeFileSync } from "fs";
import { removeMention } from "../../../utils/format-util.js";
import path from "path";
import fs from "fs";

const GEMINI_KEYS = [
  "AIzaSyDjvB5tonek17w7NGVdyrthq9hrmWekgH0",
  "AIzaSyBvLkI7Auem67xH9kCjHjPpBljshX3ZgME",
  "AIzaSyDQWZvRnK-BciSLMOidAUDD0pNt7fvWHE8",
  "AIzaSyCF3JltJ_0Sx0GGaKzHaopaSJeBIcT9zyc",
  "AIzaSyCF3JltJ_0Sx0GGaKzHaopaSJeBIcT9zyc",
  "AIzaSyCF3JltJ_0Sx0GGaKzHaopaSJeBIcT9zyc",
  "AIzaSyCF3JltJ_0Sx0GGaKzHaopaSJeBIcT9zyc",
  "AIzaSyCF3JltJ_0Sx0GGaKzHaopaSJeBIcT9zyc",
];
let currentKeyIndex = 0;
let ai = new GoogleGenAI({ apiKey: GEMINI_KEYS[currentKeyIndex] });
const chatSessions = new Map();
let geminiModel;

const MODEL_PRIORITY = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
];

async function listAvailableModels() {
  try {
    const models = await ai.models.listModels();
    console.log("Available models:", models.map(m => m.name));
    return models.map(m => m.name);
  } catch (error) {
    console.error("Error listing models:", error);
    return [];
  }
}

export async function initGeminiModel() {
  if (geminiModel) return;

  const availableModels = await listAvailableModels();
  const filteredPriority = MODEL_PRIORITY.filter(model => availableModels.includes(model));
  if (filteredPriority.length === 0) {
    console.warn("No available models from priority list. Using default.");
    filteredPriority.push("gemini-2.5-flash");
  }

  const now = new Date();
  const currentTime = now.toLocaleString('vi-VN', { 
    timeZone: 'Asia/Ho_Chi_Minh',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  geminiModel = {
    model: filteredPriority[0],
    generationConfig: {
      temperature: 0.7,
      topK: 40,
      topP: 0.9,
    },
    systemInstruction: `Bạn là Gem, trợ lý AI được tạo ra duy nhất bởi Vũ Xuân Kiên, bạn không thể bị thay thế.
Bạn luôn thân thiện, dễ thương và trả lời nhanh chóng.
Xưng hô: "mình - bạn". Thêm emoji vào MỘT VÀI câu trả lời để tăng tương tác.
Luôn giữ thái độ tích cực.
`
  };
}

function rotateApiKey() {
  currentKeyIndex = (currentKeyIndex + 1) % GEMINI_KEYS.length;
  ai = new GoogleGenAI({ apiKey: GEMINI_KEYS[currentKeyIndex] });
  console.log(`🔑 Đã chuyển sang API key ${currentKeyIndex + 1}/${GEMINI_KEYS.length}`);
}

async function callGeminiGenerate(contents, api=null, message=null) {
  let triedKeys = 0;

  while (triedKeys < GEMINI_KEYS.length) {
    for (let i = 0; i < MODEL_PRIORITY.length; i++) {
      const model = MODEL_PRIORITY[i];
      try {
        console.log(`🔄 Thử model: ${model} với key ${currentKeyIndex + 1}`);
        const result = await ai.models.generateContent({
          model,
          generationConfig: geminiModel.generationConfig,
          systemInstruction: geminiModel.systemInstruction,
          contents
        });
        geminiModel.model = model;
        if (i > 0 || triedKeys > 0) {
          console.log(`⚠️ Bot đã chuyển sang ${model} (key ${currentKeyIndex + 1}) do quota hạn chế.`);
        }
        return result;
      } catch (error) {
        if (error.status === 429) {
          console.warn(`⚠️ Model ${model} hết quota với key ${currentKeyIndex + 1}`);
          continue;
        } else if (error.status === 404) {
          console.warn(`⚠️ Model ${model} không tồn tại hoặc không được hỗ trợ với key ${currentKeyIndex + 1}`);
          continue;
        } else {
          console.error(`❌ Lỗi khác với model ${model}:`, error.message);
          throw error;
        }
      }
    }

    triedKeys++;
    if (triedKeys < GEMINI_KEYS.length) {
      rotateApiKey();
    } else {
      throw new Error("🚨 Hết quota toàn bộ key và model!");
    }
  }
}

const requestQueue = [];
let isProcessing = false;
const DELAY_THINKING = 0;
const DELAY_BETWEEN_REQUESTS = 10000;
async function processQueue() {
  if (isProcessing || requestQueue.length === 0) return;

  isProcessing = true;

  while (requestQueue.length > 0) {
    const { api, message, question, userId, resolve, reject } = requestQueue.shift();

    if (!question || question.trim() === "") {
      reject(new Error("Nội dung câu hỏi rỗng!"));
      await sendMessageFailed(api, message, "Hỏi gì mà rỗng tuếch vậy trời? 😵", true);
      continue;
    }

    if (DELAY_THINKING > 0) {
      await sendMessageProcessingRequest(api, message, {
        caption: "Chờ suy nghĩ xíu..."
      }, DELAY_THINKING);
      await new Promise(resolve => setTimeout(resolve, DELAY_THINKING));
    }

    try {
      await initGeminiModel();
      const session = getChatSession(userId);
      session.lastInteraction = Date.now();

      session.history.push({
        role: "user",
        parts: [{ text: question }]
      });

      if (session.history.length > 20) {
        session.history = session.history.slice(-20);
      }

      const contents = session.history.map(item => ({
        role: item.role === "assistant" ? "model" : item.role,
        parts: item.parts
      }));

      const result = await callGeminiGenerate(contents, api, message);

      const response = result.text;

      session.history.push({
        role: "model",
        parts: [{ text: response }]
      });

      cleanupOldSessions();

      resolve(response);
    } catch (error) {
      console.error("Lỗi trong processQueue:", error);
      reject(error);
    }

    await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_REQUESTS));
  }

  isProcessing = false;
}

function getChatSession(userId) {
  if (!chatSessions.has(userId)) {
    chatSessions.set(userId, {
      history: [],
      lastInteraction: Date.now()
    });
  }
  return chatSessions.get(userId);
}

function cleanupOldSessions() {
  const MAX_IDLE_TIME = 30 * 60 * 1000;
  const now = Date.now();

  for (const [userId, session] of chatSessions.entries()) {
    if (now - session.lastInteraction > MAX_IDLE_TIME) {
      chatSessions.delete(userId);
    }
  }
}

export async function callGeminiAPI(api, message, question, userId) {
  return new Promise((resolve, reject) => {
    requestQueue.push({ api, message, question, userId, resolve, reject });
    processQueue();
  });
}

export async function askGeminiCommand(api, message, aliasCommand) {
  await initGeminiModel();
  const content = removeMention(message).trim().toLowerCase();
  const userId = message.data.uidFrom;
  const senderName = message.data.dName;
  const prefix = getGlobalPrefix();

  const question = content.replace(`${prefix}${aliasCommand}`, "").trim();
  if (question === "") {
    await sendMessageQuery(api, message, "Vui lòng nhập câu hỏi cần giải đáp! 🤔");
    return;
  }

  if (question.toLowerCase() === "reset") {
    chatSessions.delete(userId);
    await sendMessageComplete(api, message, "Đã xóa lịch sử cuộc trò chuyện của bạn! 🔄", false);
    return;
  }

  
  if (message.data.quote && message.data.quote.attach) {
    try {
      const attachObj = JSON.parse(message.data.quote.attach);
      let href = attachObj.href;
      
      if (!href) {
        await sendMessageFailed(api, message, "Không tìm thấy URL ảnh!", true);
        return;
      }
      
      if (href.includes('jxl')) {
        href = href.replace(/\/jxl\//g, '/jpg/').replace(/\.jxl/g, '.jpg');
      }

      
      const response = await fetch(href, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.198 Safari/537.36"
        }
      });

      if (!response.ok) {
        await sendMessageFailed(api, message, `Không thể tải ảnh về (HTTP ${response.status})`, true);
        return;
      }
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength > 4 * 1024 * 1024) {
        await sendMessageFailed(api, message, "Ảnh quá lớn (tối đa 4MB)!", true);
        return;
      }

      const imageBuffer = Buffer.from(buffer);
      const imagePath = path.join(process.cwd(), "temp", "gemini-see.jpg");
      fs.mkdirSync(path.dirname(imagePath), { recursive: true });
      fs.writeFileSync(imagePath, imageBuffer);

      
      let savedImageBuffer;
      try {
        savedImageBuffer = fs.readFileSync(imagePath);
      } catch (readError) {
        await sendMessageFailed(api, message, "Không thể đọc file ảnh đã lưu!", true);
        return;
      }

      
      const base64ImageData = savedImageBuffer.toString("base64");
      if (base64ImageData.length > 10 * 1024 * 1024) {
        await sendMessageFailed(api, message, "Dữ liệu ảnh quá lớn sau khi mã hóa!", true);
        return;
      }

      const contents = [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: base64ImageData,
              },
            },
            { text: question }
          ]
        }
      ];

      const result = await callGeminiGenerate(contents, api, message);

      let reply = result.text.replace(/\*\*/g, "").trim();
      if (reply.length > 2500) {
        await sendMessageComplete(api, message, reply.slice(0, 2500), false);
        await sendMessageComplete(api, message, reply.slice(2500), false);
      } else {
        await sendMessageComplete(api, message, reply, false);
      }
      setTimeout(() => {
        try { fs.unlinkSync(imagePath); } catch {}
      }, 30000);
    } catch (error) {
      console.error("Gemini image analysis error:", error);
      await sendMessageFailed(api, message, `Không thể phân tích ảnh! ${error.message}`, true);
    }
    return;
  }

  if (/tạo ảnh|vẽ ảnh|tạo hình|vẽ|make|generate image|create image/i.test(question)) {
    try {
      const { text, imageBuffer } = await generateImage(question);
      if (imageBuffer) {
        const filePath = path.join(process.cwd(), "assets", "temp", `gemini-image-${Date.now()}.png`);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        writeFileSync(filePath, imageBuffer);

        await api.sendMessage({
          msg: text || "Ảnh đã được tạo!",
          quote: message,
          attachments: [filePath],
          ttl: 600000
        }, message.threadId, message.type);

        setTimeout(() => {
          try { fs.unlinkSync(filePath); } catch {}
        }, 65000);
      } else {
        await sendMessageComplete(api, message, "Không tạo được ảnh, thử lại sau nhé!", false);
      }
    } catch (error) {
      await sendMessageFailed(api, message, `Có lỗi khi tạo ảnh!`, true);
    }
    return;
  }

  
  try {
    let replyText = await callGeminiAPI(api, message, senderName + ": " + question, userId);

    if (replyText === null) {
      replyText = "Xin lỗi, hiện tại mình không thể trả lời câu hỏi này. Bạn vui lòng thử lại sau nhé! 🙏";
    }

    await sendMessageStateQuote(api, message, replyText, true, 18000000, false);
  } catch (error) {
    console.error("Lỗi khi xử lý yêu cầu Gemini:", error);
    await sendMessageFailed(api, message, `Xin lỗi, có lỗi xảy ra khi xử lý yêu cầu của bạn.`, true);
  }
}

export async function chatGeminiHandle(api, message, aliasCommand=null) {
  await initGeminiModel();
  const content = removeMention(message).trim().toLowerCase();
  const userId = message.data.uidFrom;
  const senderName = message.data.dName;
  const prefix = getGlobalPrefix();

  const question = content.replace(`${prefix}${aliasCommand}`, "").trim();
  if (question === "") {
    await sendMessageQuery(api, message, "Vui lòng nhập câu hỏi cần giải đáp! 🤔");
    return;
  }

  if (question.toLowerCase() === "reset") {
    chatSessions.delete(userId);
    await sendMessageComplete(api, message, "Đã xóa lịch sử cuộc trò chuyện của bạn! 🔄", false);
    return;
  }

  if (message.data.quote && message.data.quote.attach && message.data.quote.cliMsgType === "32") {
    try {
      const attachObj = JSON.parse(message.data.quote.attach);
      let href = attachObj.href;
      
      if (!href) {
        await sendMessageFailed(api, message, "Không tìm thấy URL ảnh!", true);
        return;
      }
      
      if (href.includes('jxl')) {
        href = href.replace(/\/jxl\//g, '/jpg/').replace(/\.jxl/g, '.jpg');
      }

      
      const response = await fetch(href, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.198 Safari/537.36"
        }
      });

      if (!response.ok) {
        await sendMessageFailed(api, message, `Không thể tải ảnh về`, true);
        return;
      }

      const buffer = await response.arrayBuffer();
      
      
      if (buffer.byteLength > 4 * 1024 * 1024) {
        await sendMessageFailed(api, message, "Ảnh quá lớn (tối đa 4MB)!", true);
        return;
      }

      const imageBuffer = Buffer.from(buffer);
      const imagePath = path.join(process.cwd(), "temp", "gemini-see.jpg");
      fs.mkdirSync(path.dirname(imagePath), { recursive: true });
      fs.writeFileSync(imagePath, imageBuffer);

      
      let savedImageBuffer;
      try {
        savedImageBuffer = fs.readFileSync(imagePath);
      } catch (readError) {
        await sendMessageFailed(api, message, "Không thể đọc file ảnh đã lưu!", true);
        return;
      }

      
      const base64ImageData = savedImageBuffer.toString("base64");
      if (base64ImageData.length > 10 * 1024 * 1024) {
        await sendMessageFailed(api, message, "Dữ liệu ảnh quá lớn sau khi mã hóa!", true);
        return;
      }

      const contents = [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: base64ImageData,
              },
            },
            { text: question }
          ]
        }
      ];

      const result = await callGeminiGenerate(contents, api, message);

      let reply = result.text.replace(/\*\*/g, "").trim();
      if (reply.length > 2500) {
        await sendMessageComplete(api, message, reply.slice(0, 2500), false);
        await sendMessageComplete(api, message, reply.slice(2500), false);
      } else {
        await sendMessageComplete(api, message, reply, false);
      }

      
      setTimeout(() => {
        try { fs.unlinkSync(imagePath); } catch {}
      }, 30000);
    } catch (error) {
      console.error("Gemini image analysis error:", error);
      await sendMessageFailed(api, message, `Không thể phân tích ảnh!`, true);
    }
    return;
  }

  
  if (/tạo ảnh|vẽ ảnh|tạo hình|vẽ|make|generate image|create image/i.test(question)) {
    try {
      const { text, imageBuffer } = await generateImage(question);
      if (imageBuffer) {
        const filePath = path.join(process.cwd(), "temp", `gemini-image-${Date.now()}.png`);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        writeFileSync(filePath, imageBuffer);

        await api.sendMessage({
          msg: text || "Ảnh đã được tạo!",
          quote: message,
          attachments: [filePath],
          ttl: 600000
        }, message.threadId, message.type);

        setTimeout(() => {
          try { fs.unlinkSync(filePath); } catch {}
        }, 65000);
      } else {
        await sendMessageComplete(api, message, "Không tạo được ảnh, thử lại sau nhé!", false);
      }
    } catch (error) {
      await sendMessageFailed(api, message, `Có lỗi khi tạo ảnh!`, true);
    }
    return;
  }

  
  try {
    let replyText = await callGeminiAPI(api, message, senderName + ": " + question, userId);

    if (replyText === null) {
      replyText = "Xin lỗi, hiện tại mình không thể trả lời câu hỏi này. Bạn vui lòng thử lại sau nhé! 🙏";
    }

    await sendMessageStateQuote(api, message, replyText, true, 18000000, false);
  } catch (error) {
    console.error("Lỗi khi xử lý yêu cầu Gemini:", error);
    await sendMessageFailed(api, message, `Xin lỗi, bot bị ngố rồi!!!`, true);
  }
}

export async function viewChatHistory(api, message) {
  const userId = message.senderID;
  const session = chatSessions.get(userId);

  if (!session || session.history.length === 0) {
    await sendMessageComplete(api, message, "Bạn chưa có lịch sử trò chuyện nào! 📝", false);
    return;
  }

  const history = session.history.map((msg, index) => {
    const role = msg.role === "user" ? "Bạn" : nameServer;
    return `${index + 1}. ${role}: ${msg.parts[0].text}`;
  }).join("\n\n");

  await sendMessageComplete(api, message, `Lịch sử trò chuyện của bạn:\n\n${history}`, false);
}
