import fs from "fs";
import path from "path";
import { getGroupName } from "../../info-service/group-info.js";
import {
  sendMessageComplete,
  sendMessageStateQuote,
  sendMessageWarning,
  sendMessageFromSQL,
  MessageType,
} from "../../chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service.js";
import natural from "natural";
import { removeMention } from "../../../utils/format-util.js";

const antiSpamCache = {};
const ANTI_SPAM_TIMEOUT = 5000;

const dataTrainingPath = path.resolve(process.cwd(), "assets", "json-data", "data-training.json");
const uploadedFilePath = path.resolve(process.cwd(), "assets", "json-data", "uploaded-files.json");
const cardReceiverPath = path.resolve(process.cwd(), "assets/json-data/card-receivers.json");
const RESOURCE_BASE_PATH = path.join(process.cwd(), "assets", "resources");
const IMAGE_RESOURCE_PATH = path.join(RESOURCE_BASE_PATH, "file");

function loadCardReceivers() {
  try {
    const data = fs.readFileSync(cardReceiverPath, "utf-8");
    return JSON.parse(data);
  } catch {
    return {};
  }
}

function saveCardReceivers(data) {
  fs.writeFileSync(cardReceiverPath, JSON.stringify(data, null, 2), "utf-8");
}

function loadUploadedFiles() {
  try {
    const data = fs.readFileSync(uploadedFilePath, "utf-8");
    return JSON.parse(data);
  } catch {
    return {};
  }
}

function saveUploadedFiles(data) {
  fs.writeFileSync(uploadedFilePath, JSON.stringify(data, null, 2), "utf-8");
}

function checkAntiSpam(threadId, senderId, keyword) {
  if (antiSpamCache[threadId] && antiSpamCache[threadId][keyword] && antiSpamCache[threadId][keyword][senderId]) {
    return Date.now() - antiSpamCache[threadId][keyword][senderId] < ANTI_SPAM_TIMEOUT;
  }
  return false;
}

function updateAntiSpam(threadId, senderId, keyword) {
  if (!antiSpamCache[threadId]) {
    antiSpamCache[threadId] = {};
  }
  if (!antiSpamCache[threadId][keyword]) {
    antiSpamCache[threadId][keyword] = {};
  }
  antiSpamCache[threadId][keyword][senderId] = Date.now();
}

export async function handleChatBot(api, message, threadId, groupSettings, nameGroup, isHandleCommand) {
  if (isHandleCommand) return;

  let content = message.data.content;
  let response = null;
  let matchedQuestion = null;

  if (
    groupSettings[threadId].replyEnabled &&
    !content.startsWith(`${getGlobalPrefix()}`) &&
    !content.startsWith(`!`) &&
    !content.startsWith(`.`)
  ) {
    const result = findResponse(content, threadId);
    if (!result) return;
    response = result.response;
    matchedQuestion = result.matchedQuestion;
  }

  if (response) {
    const senderId = message.data.uidFrom;

    if (message.type === MessageType.GroupMessage) {
      const keyword = matchedQuestion || content;
      if (checkAntiSpam(threadId, senderId, keyword)) {
        return;
      }
      updateAntiSpam(threadId, senderId, keyword);
    }

    if (response.startsWith("__card__")) {
      const textParts = response.split("__text__");
      const cardContent = textParts[0].replace("__card__", "").trim();
      const optionalText = textParts[1]?.trim();

      if (optionalText) {
        await sendMessageFromSQL(api, message, { message: optionalText }, false, 600000);
      }

      const cardReceivers = loadCardReceivers();
      const cardKeyword = matchedQuestion?.toLowerCase() || content.toLowerCase();
      const savedUid = cardReceivers[cardKeyword];
      const targetUid = savedUid || senderId;

      await api.sendBusinessCard(null, targetUid, cardContent, message.type, threadId, 60000);
      return;
    }

    const filePath = path.join(IMAGE_RESOURCE_PATH, response);
    if (fs.existsSync(filePath)) {
      const uploadedCache = loadUploadedFiles();
      const cachedInfo = uploadedCache[response];

      if (cachedInfo?.fileUrl) {
        await api.sendFile(
          message,
          cachedInfo.fileUrl,
          0,
          cachedInfo.fileName,
          cachedInfo.totalSize,
          path.extname(cachedInfo.fileName).slice(1),
          cachedInfo.checksum
        );
        return;
      }

      try {
        const uploaded = await api.uploadAttachment([filePath], threadId, message.type);
        if (uploaded && uploaded.length > 0 && uploaded[0].fileUrl) {
          const fileInfo = uploaded[0];
          await api.sendFile(
            message,
            fileInfo.fileUrl,
            0,
            fileInfo.fileName,
            fileInfo.totalSize,
            path.extname(fileInfo.fileName).slice(1),
            fileInfo.checksum
          );
          uploadedCache[response] = { ...fileInfo };
          saveUploadedFiles(uploadedCache);
        } else {
          await sendMessageFromSQL(api, message, { message: `❌ Upload thất bại cho file "${response}".` }, false, 600000);
        }
        return;
      } catch (err) {
        await sendMessageFromSQL(api, message, { message: `❌ Có lỗi xảy ra khi upload file.` }, false, 600000);
        return;
      }
    }
    await sendMessageFromSQL(api, message, { message: response }, false, 600000);
  } else {
    if (groupSettings[threadId].learnEnabled && message.data.quote) {
      const nameQuote = message.data.quote.fromD;
      const botResponse = message.data.quote.msg;
      content = content.replace(nameQuote, "").replace("@", "").trim();
      if (content !== "" && content.length > 6) {
        learnFromChat(botResponse, threadId, content, nameGroup);
      }
    }
  }
}

export function loadTrainingData() {
  try {
    const data = fs.readFileSync(dataTrainingPath, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    return {};
  }
}

export function saveTrainingData(data) {
  try {
    fs.writeFileSync(dataTrainingPath, JSON.stringify(data, null, 2), "utf-8");
  } catch (error) {}
}

export function learnFromChat(message, threadId, response, groupName) {
  const data = loadTrainingData();

  if (!data[threadId]) {
    data[threadId] = {
      nameGroup: groupName,
      listTrain: {},
    };
  }

  const existingData = data[threadId].listTrain[message] || [];
  let responses = Array.isArray(existingData) ? existingData : [existingData];

  responses.push({
    response: response,
    isTemporary: true,
  });

  data[threadId].listTrain[message] = responses;
  saveTrainingData(data);
}

function calculateSimilarity(str1, str2) {
  return natural.JaroWinklerDistance(str1.toLowerCase(), str2.toLowerCase());
}

function isInvalidResponse(response) {
  const responseLower = response.toLowerCase();
  const linkPatterns = ["http://", "https://", ".com", ".net", ".org", "www.", ".vn", "bit.ly"];
  const invalidKeywords = ["lệnh", "tồn tại", "prefix", "admin", "bot", "help", "hướng dẫn", "command", "!", ".", "không thể", "không tìm thấy", "không tồn tại"];

  return linkPatterns.some((p) => responseLower.includes(p)) || invalidKeywords.some((k) => responseLower.includes(k));
}

function removeSpecificResponse(threadId, question, responseToRemove) {
  const data = loadTrainingData();
  if (!data[threadId]?.listTrain?.[question]) return false;

  let responses = data[threadId].listTrain[question];
  if (!Array.isArray(responses)) responses = [responses];

  const initialLength = responses.length;
  const filteredResponses = responses.filter((item) => (typeof item === "string" ? item : item.response).trim() !== responseToRemove.trim());

  if (filteredResponses.length < initialLength) {
    if (filteredResponses.length === 0) {
      delete data[threadId].listTrain[question];
    } else {
      data[threadId].listTrain[question] = filteredResponses;
    }
    saveTrainingData(data);
    return true;
  }
  return false;
}

function trackResponseUsage(threadId, question, response) {
  return removeSpecificResponse(threadId, question, response);
}

export function findResponse(message, threadId) {
  const data = loadTrainingData();
  if (!data[threadId]?.listTrain) return null;

  const messageLower = message.toLowerCase();
  let bestMatch = null;
  let highestScore = 0.84;

  for (const [key, value] of Object.entries(data[threadId].listTrain)) {
    const similarity = calculateSimilarity(messageLower, key);
    if (similarity > highestScore) {
      highestScore = similarity;
      bestMatch = { question: key, responses: Array.isArray(value) ? value : [value] };
    }
  }

  if (data[threadId].listTrain[message]) {
    bestMatch = { question: message, responses: Array.isArray(data[threadId].listTrain[message]) ? data[threadId].listTrain[message] : [data[threadId].listTrain[message]] };
  }

  if (bestMatch) {
    const validResponses = bestMatch.responses.filter((r) => !isInvalidResponse(typeof r === "string" ? r : r.response));
    if (validResponses.length > 0) {
      const selected = validResponses[Math.floor(Math.random() * validResponses.length)];
      const response = typeof selected === "string" ? selected : selected.response;
      const isTemp = typeof selected === "string" || selected.isTemporary;

      if (isTemp) {
        trackResponseUsage(threadId, bestMatch.question, response);
      }
      return { response, matchedQuestion: bestMatch.question };
    }
  }
  return null;
}

export async function handleLearnCommand(api, message, groupSettings) {
  const threadId = message.threadId;
  const content = removeMention(message);
  const prefix = getGlobalPrefix();

  if (content.startsWith(`${prefix}learnnow_card_`)) {
    const parts = content.split("_");
    if (parts.length >= 4) {
      const question = parts[2];
      const cardContent = parts[3];
      const optionalText = parts.slice(4).join("_");

      let fullAnswer = `__card__${cardContent}`;
      if (optionalText.trim() !== "") {
        fullAnswer += `__text__${optionalText.trim()}`;
      }

      const success = await learnNewResponse(api, threadId, question, fullAnswer);
      if (success) {
        let replyMsg = `✅ Đã lưu danh thiếp "${cardContent}" cho từ khóa "${question}"`;
        if (optionalText.trim()) {
          replyMsg += `\n👉 Câu trả lời: "${optionalText.trim()}"`;
        }
        await sendMessageComplete(api, message, replyMsg);

        const cardReceivers = loadCardReceivers();
        const cardKeyword = question.toLowerCase();
        const targetUid = message.data.mentions?.[0]?.uid || message.data.uidFrom;
        cardReceivers[cardKeyword] = targetUid;
        saveCardReceivers(cardReceivers);
      } else {
        await sendMessageWarning(api, message, `⚠️ Danh thiếp đã tồn tại cho từ khóa "${question}"`);
      }
    } else {
      await sendMessageWarning(api, message, "❌ Cú pháp không hợp lệ. Dùng: !learnnow_card_[Câu Hỏi]_[Nội dung danh thiếp]_[Văn bản tùy chọn]");
    }
    return true;
  }
  if (content.startsWith(`${prefix}learnnow_`)) {
    const parts = content.split("_");
    if (parts.length >= 3) {
      const question = parts[1];
      const answer = parts.slice(2).join("_");
      const success = await learnNewResponse(api, threadId, question, answer);
      if (success) {
        const caption = fs.existsSync(path.join(IMAGE_RESOURCE_PATH, answer))
          ? `✅ Đã lưu file "${answer}" cho từ khóa "${question}"`
          : `✅ Đã lưu văn bản "${answer}" cho từ khóa "${question}"`;
        await sendMessageComplete(api, message, caption);
      } else {
        await sendMessageWarning(api, message, `⚠️ Phản hồi "${answer}" đã tồn tại cho từ khóa "${question}"`);
      }
    } else {
      await sendMessageWarning(api, message, "❌ Cú pháp không hợp lệ. Dùng: !learnnow_[Câu Hỏi]_[Câu Trả Lời]");
    }
    return true;
  }
  if (content.startsWith(`${prefix}unlearn`)) {
    await handleUnlearnCommand(api, message);
    return true;
  }
  if (content.startsWith(`${prefix}learn`)) {
    const parts = content.split(" ");
    if (parts[1] === "list") {
      await handleLearnListCommand(api, message);
    } else if (parts.length === 1 || parts[1] === "on" || parts[1] === "off") {
      const newState = parts.length === 1 ? !groupSettings[threadId].learnEnabled : parts[1] === "on";
      groupSettings[threadId].learnEnabled = newState;
      const caption = `Chế độ học tập đã được ${newState ? "bật" : "tắt"}!`;
      await sendMessageStateQuote(api, message, caption, newState, 30000, false);
    } else {
      await sendMessageWarning(api, message, "❌ Cú pháp không hợp lệ. Dùng: !learn, !learn on/off, !learn list");
    }
    return true;
  }
  return false;
}

export async function handleLearnListCommand(api, message) {
  const threadId = message.threadId;
  const data = loadTrainingData();
  if (!data[threadId] || Object.keys(data[threadId].listTrain).length === 0) {
    await sendMessageWarning(api, message, "Chưa có dữ liệu nào được học trong nhóm này.");
    return;
  }

  let responseList = "📖 DANH SÁCH CÁC CÂU ĐÃ HỌC:\n\n";
  let index = 1;

  for (const [key, value] of Object.entries(data[threadId].listTrain)) {
    const responses = Array.isArray(value) ? value : [value];
    for (const item of responses) {
      const resText = typeof item === "string" ? item : item.response;
      let displayResponse;
      if (resText.startsWith("__card__")) {
        const cardPart = resText.split("__text__")[0].replace("__card__", "").trim();
        displayResponse = `[Danh Thiếp: ${cardPart}]`;
      } else {
        displayResponse = `"${resText}"`;
      }
      responseList += `${index}. ${key} -> ${displayResponse}\n`;
      index++;
    }
  }
  await sendMessageComplete(api, message, responseList);
}

export async function handleReplyCommand(api, message, groupSettings) {
  const threadId = message.threadId;
  const content = removeMention(message);
  const prefix = getGlobalPrefix();

  if (content.startsWith(`${prefix}reply`)) {
    const parts = content.split(" ");
    const newState = parts.length === 1 ? !groupSettings[threadId].replyEnabled : parts[1] === "on";
    groupSettings[threadId].replyEnabled = newState;
    const caption = `Chế độ trả lời đã được ${newState ? "bật" : "tắt"}!`;
    await sendMessageStateQuote(api, message, caption, newState, 30000, false);
    return true;
  }
  return false;
}

export async function learnNewResponse(api, threadId, question, answer) {
  const data = loadTrainingData();
  if (!data[threadId]) {
    data[threadId] = {
      nameGroup: await getGroupName(api, threadId),
      listTrain: {},
    };
  }

  let responses = data[threadId].listTrain[question] || [];
  if (!Array.isArray(responses)) responses = [responses];

  const isDuplicate = responses.some((r) => (typeof r === "string" ? r : r.response) === answer);
  if (isDuplicate) return false;

  responses.push({
    response: answer,
    isTemporary: false,
  });
  data[threadId].listTrain[question] = responses;
  saveTrainingData(data);
  return true;
}

export async function handleUnlearnCommand(api, message) {
  const threadId = message.threadId;
  const prefix = getGlobalPrefix();
  const content = message.data.content.trim();
  const parts = content.split(" ");

  if (parts.length < 2) {
    await sendMessageWarning(api, message, "❌ Cú pháp: !unlearn [Nội dung câu trả lời] hoặc !unlearn [index]");
    return;
  }

  const valueToRemove = parts.slice(1).join(" ");
  const index = parseInt(valueToRemove, 10);
  const isIndex = !isNaN(index) && index > 0;

  const result = await removeLearnedResponse(threadId, isIndex ? index : valueToRemove, isIndex);

  if (result.success) {
    await sendMessageComplete(api, message, `✅ Đã xóa thành công câu trả lời: "${result.removedValue}"`);
  } else {
    await sendMessageWarning(api, message, `❌ Không tìm thấy câu trả lời khớp với "${valueToRemove}"`);
  }
}

export async function removeLearnedResponse(threadId, value, isIndex = false) {
  const data = loadTrainingData();
  if (!data[threadId]?.listTrain) return { success: false };

  let removed = false;
  let removedValue = "";
  let currentIndex = 1;

  for (const key of Object.keys(data[threadId].listTrain)) {
    let responses = data[threadId].listTrain[key];
    if (!Array.isArray(responses)) responses = [responses];

    const initialLength = responses.length;
    const filteredResponses = responses.filter((item) => {
      const currentResponseIndex = currentIndex;
      currentIndex++;
      
      const resText = typeof item === "string" ? item : item.response;
      let shouldRemove = false;

      if (isIndex) {
        if (currentResponseIndex === value) {
          shouldRemove = true;
        }
      } else {
        let compareValue = resText;
        if (resText.startsWith("__card__")) {
          compareValue = resText.split("__text__")[0].replace("__card__", "").trim();
        }
        if (compareValue.trim() === value.trim()) {
          shouldRemove = true;
        }
      }

      if (shouldRemove) {
        removed = true;
        removedValue = resText.startsWith("__card__") ? `Danh thiếp ${resText.split("__text__")[0].replace("__card__", "").trim()}` : resText;
        return false;
      }
      return true;
    });
    
    if (removed) {
      if (filteredResponses.length === 0) {
        delete data[threadId].listTrain[key];
      } else {
        data[threadId].listTrain[key] = filteredResponses;
      }
      saveTrainingData(data);
      return { success: true, removedValue };
    }
  }

  return { success: false };
}
