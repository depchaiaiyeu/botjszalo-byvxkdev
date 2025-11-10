import fs from "fs";
import path from "path";
import crypto from "crypto";
import { getGroupName } from "../../info-service/group-info.js";
import { sendMessageComplete, sendMessageState, sendMessageStateQuote, sendMessageWarning, sendMessageFromSQL } from "../../chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service.js";
import natural from "natural";
import { removeMention } from "../../../utils/format-util.js";

const dataTrainingPath = path.resolve(process.cwd(), "assets", "json-data", "data-training.json");
const uploadedFilePath = path.resolve(process.cwd(), "assets", "json-data", "uploaded-files.json");
const cardReceiverPath = path.resolve(process.cwd(), "assets/json-data/card-receivers.json");
const RESOURCE_BASE_PATH = path.join(process.cwd(), "assets", "resources");
const IMAGE_RESOURCE_PATH = path.join(RESOURCE_BASE_PATH, "file");

const responseCooldown = new Map();

function loadJsonFile(filePath) {
  try {
    const data = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error(`Lỗi khi đọc file ${filePath}:`, error);
    }
    return {};
  }
}

function saveJsonFile(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  } catch (error) {
    console.error(`Lỗi khi ghi file ${filePath}:`, error);
  }
}

const loadCardReceivers = () => loadJsonFile(cardReceiverPath);
const saveCardReceivers = (data) => saveJsonFile(cardReceiverPath, data);
const loadUploadedFiles = () => loadJsonFile(uploadedFilePath);
const saveUploadedFiles = (data) => saveJsonFile(uploadedFilePath, data);
export const loadTrainingData = () => loadJsonFile(dataTrainingPath);
export const saveTrainingData = (data) => saveJsonFile(dataTrainingPath, data);

async function sendUploadedFile(api, message, fileInfo) {
  const ext = path.extname(fileInfo.fileName).slice(1);
  await api.sendFile(
    message,
    fileInfo.fileUrl,
    0,
    fileInfo.fileName,
    fileInfo.totalSize,
    ext,
    fileInfo.checksum
  );
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
    const senderName = message.data.dName;
    const isGroup = message.type === 1;
    
    if (isGroup) {
      const cooldownKey = `${threadId}-${matchedQuestion}`;
      const now = Date.now();
      const cooldownData = responseCooldown.get(cooldownKey);
      
      if (cooldownData && cooldownData.userId === senderId && (now - cooldownData.timestamp < 5000)) {
        return;
      }
      
      responseCooldown.set(cooldownKey, { userId: senderId, timestamp: now });
    }
    
    if (response.startsWith("__card__")) {
      const textParts = response.split("__text__");
      const cardContent = textParts[0].replace("__card__", "").trim();
      const optionalText = textParts[1]?.trim();

      if (optionalText) {
        await sendMessageFromSQL(api, message, { message: optionalText }, false, 60000);
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
        console.log("[Cache] Dùng lại file đã upload:", cachedInfo.fileName);
        await sendUploadedFile(api, message, cachedInfo);
        return;
      }

      try {
        const uploaded = await api.uploadAttachment([filePath], threadId, message.type);
        if (uploaded && uploaded.length > 0 && uploaded[0].fileUrl) {
          const fileInfo = uploaded[0];
          await sendUploadedFile(api, message, fileInfo);
          
          uploadedCache[response] = {
            fileUrl: fileInfo.fileUrl,
            fileName: fileInfo.fileName,
            totalSize: fileInfo.totalSize,
            checksum: fileInfo.checksum,
          };
          saveUploadedFiles(uploadedCache);
        } else {
          console.warn("⚠️ [UploadAttachment] Upload thất bại.");
          await sendMessageWarning(api, message, `🚫 Upload thất bại cho file "${response}".`, 60000);
        }
        return;
      } catch (err) {
        console.error("🚫 Lỗi upload:", err);
        await sendMessageWarning(api, message, "🚫 Có lỗi xảy ra khi upload file.", 60000);
        return;
      }
    }
    
    await sendMessageFromSQL(api, message, { message: response }, false, 60000);
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

async function updateTrainingData(threadId, question, response, isTemporary, api, groupName = null) {
  const data = loadTrainingData();

  if (!data[threadId]) {
    data[threadId] = {
      nameGroup: groupName || (api ? await getGroupName(api, threadId) : "Unknown"),
      listTrain: {},
    };
  }

  const existingData = data[threadId].listTrain[question];
  let responses = [];

  if (Array.isArray(existingData)) {
    responses = existingData;
  } else if (typeof existingData === "string") {
    responses = [{ response: existingData, isTemporary: true }]; 
  } else if (existingData) {
    responses = [existingData];
  }

  const isDuplicate = responses.some((r) => r.response === response);
  
  if (!isTemporary && isDuplicate) {
    return false; 
  }
  
  if (isDuplicate) {
    return true;
  }

  responses.push({
    response: response,
    isTemporary: isTemporary,
  });

  data[threadId].listTrain[question] = responses;
  saveTrainingData(data);
  return true;
}

export function learnFromChat(message, threadId, response, groupName) {
  updateTrainingData(threadId, message, response, true, null, groupName);
}

export async function learnNewResponse(api, threadId, question, answer) {
  return await updateTrainingData(threadId, question, answer, false, api);
}

function calculateSimilarity(str1, str2) {
  const tokenizer = new natural.WordTokenizer();
  const words1 = tokenizer.tokenize(str1.toLowerCase());
  const words2 = tokenizer.tokenize(str2.toLowerCase());

  const distance = natural.JaroWinklerDistance(words1.join(" "), words2.join(" "));
  return distance;
}

function isInvalidResponse(response) {
  const responseLower = response.toLowerCase();
  const linkPatterns = ["http://", "https://", ".com", ".net", ".org", "www.", ".vn", "bit.ly"];
  const invalidKeywords = [
    "lệnh", "tồn tại", "prefix", "admin", "bot", "help",
    "hướng dẫn", "command", "!", ".", "không thể",
    "không tìm thấy", "không tồn tại",
  ];

  if (linkPatterns.some((pattern) => responseLower.includes(pattern))) {
    return true;
  }
  if (invalidKeywords.some((keyword) => responseLower.includes(keyword))) {
    return true;
  }
  return false;
}

function removeSpecificResponse(threadId, question, responseToRemove) {
  const data = loadTrainingData();
  let removed = false;

  if (data[threadId]?.listTrain?.[question]) {
    const responses = data[threadId].listTrain[question];

    if (Array.isArray(responses)) {
      const filteredResponses = responses.filter((item) => {
        const response = typeof item === "string" ? item : item.response;
        return response.trim() !== responseToRemove.trim();
      });

      if (filteredResponses.length < responses.length) {
        removed = true;
        if (filteredResponses.length === 0) {
          delete data[threadId].listTrain[question];
        } else {
          data[threadId].listTrain[question] = filteredResponses;
        }
        saveTrainingData(data);
        console.log(`Đã xóa câu trả lời "${responseToRemove}" của câu hỏi "${question}"`);
      }
    } else {
      const response = typeof responses === "string" ? responses : responses.response;
      if (response.trim() === responseToRemove.trim()) {
        delete data[threadId].listTrain[question];
        removed = true;
        saveTrainingData(data);
        console.log(`Đã xóa câu trả lời "${responseToRemove}" của câu hỏi "${question}"`);
      }
    }
  }
  return removed;
}

function trackResponseUsage(threadId, question, response) {
  removeSpecificResponse(threadId, question, response);
  return true;
}

function normalizeText(text) {
  return text
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function countMatchingWords(message, key) {
  const normalizedMessage = normalizeText(message);
  const normalizedKey = normalizeText(key);

  const messageChars = normalizedMessage.toLowerCase().split("");
  const keyChars = normalizedKey.toLowerCase().split("");

  let matchCount = 0;
  let i = 0;
  let j = 0;

  while (i < messageChars.length && j < keyChars.length) {
    if (messageChars[i] === " ") { i++; continue; }
    if (keyChars[j] === " ") { j++; continue; }

    if (messageChars[i] === keyChars[j]) {
      matchCount++;
      i++;
      j++;
    } else {
      if (i > 0 && messageChars[i] === messageChars[i - 1]) { i++; continue; }
      if (j > 0 && keyChars[j] === keyChars[j - 1]) { j++; continue; }
      i++;
      j++;
    }
  }
  return matchCount;
}

export function findResponse(message, threadId) {
  const data = loadTrainingData();
  const SIMILARITY_THRESHOLD = 0.85;
  const WORD_MATCH_THRESHOLD = 0.4;

  if (data[threadId] && data[threadId].listTrain) {
    const messageLower = message.toLowerCase();
    const messageWords = messageLower.split(/\s+/).filter((word) => word.length > 1);
    const matchedQuestions = [];

    for (const [key, value] of Object.entries(data[threadId].listTrain)) {
      const responses = Array.isArray(value) ? value : [value];
      const permanentResponses = responses.filter((r) => typeof r !== "string" && r.isTemporary === false);

      if (permanentResponses.length > 0) {
        const normalizedMessage = normalizeText(messageLower);
        const normalizedKey = normalizeText(key.toLowerCase());

        const messageWords = normalizedMessage.split(/\s+/);
        const keyWords = normalizedKey.split(/\s+/);

        const hasMatchingWord = messageWords.some((msgWord) =>
          keyWords.some((keyWord) => {
            const normalizedMsgWord = normalizeText(msgWord);
            const normalizedKeyWord = normalizeText(keyWord);

            if (normalizedMsgWord.length < 2) return false;
            if (normalizedMsgWord === normalizedKeyWord) return true;

            if (normalizedKeyWord.match(/[A-Z]/)) {
              const abbreviation = normalizedKeyWord
                .split(/(?=[A-Z])/)
                .map((word) => word.charAt(0).toLowerCase())
                .join("");

              if (abbreviation.length === normalizedMsgWord.length) {
                if (normalizedMsgWord === abbreviation) return true;

                const lastChar = abbreviation.charAt(abbreviation.length - 1);
                const baseWord = normalizedMsgWord.replace(new RegExp(lastChar + "+$"), "");

                if (
                  baseWord === abbreviation.slice(0, -1) &&
                  normalizedMsgWord.slice(baseWord.length).split("").every((c) => c === lastChar)
                ) {
                  return true;
                }
              }
            }

            const lastCharFull = normalizedKeyWord.charAt(normalizedKeyWord.length - 1);
            const baseWordFull = normalizedMsgWord.replace(new RegExp(lastCharFull + "+$"), "");

            if (
              baseWordFull === normalizedKeyWord.slice(0, -1) &&
              normalizedMsgWord.slice(baseWordFull.length).split("").every((c) => c === lastCharFull)
            ) {
              return true;
            }
            return false;
          })
        );

        if (hasMatchingWord) {
          matchedQuestions.push({
            question: key,
            responses: permanentResponses,
            similarity: 1,
            isPermanent: true,
            isPartialMatch: true,
          });
        }
      }
    }

    if (data[threadId].listTrain[message]) {
      const responses = data[threadId].listTrain[message];
      const validResponses = Array.isArray(responses)
        ? responses.filter((r) => !isInvalidResponse(typeof r === "string" ? r : r.response))
        : !isInvalidResponse(typeof responses === "string" ? responses : responses.response)
        ? [responses]
        : [];

      if (validResponses.length > 0) {
        matchedQuestions.push({
          question: message,
          responses: validResponses,
          similarity: 1,
          isPermanent: validResponses.some((r) => typeof r !== "string" && r.isTemporary === false),
          isExactMatch: true,
        });
      }
    }

    for (const [key, value] of Object.entries(data[threadId].listTrain)) {
      const keyLower = key.toLowerCase();
      const keyWords = keyLower.split(/\s+/).filter((word) => word.length > 1);
      const matchedWords = messageWords.filter((word) => keyWords.includes(word));
      const matchRatio = matchedWords.length / Math.max(messageWords.length, keyWords.length);

      if (matchRatio >= WORD_MATCH_THRESHOLD) {
        const similarity = calculateSimilarity(messageLower, keyLower);
        if (similarity >= SIMILARITY_THRESHOLD) {
          const responses = Array.isArray(value) ? value : [value];
          const validResponses = responses.filter((r) => !isInvalidResponse(typeof r === "string" ? r : r.response));

          if (validResponses.length > 0) {
            matchedQuestions.push({
              question: key,
              responses: validResponses,
              similarity: similarity,
              isPermanent: validResponses.some((r) => typeof r !== "string" && r.isTemporary === false),
              isSimilarMatch: true,
            });
          }
        }
      }
    }

    for (const [key, value] of Object.entries(data[threadId].listTrain)) {
      const keyWords = key.toLowerCase().split(/\s+/);
      const messageWords = messageLower.split(/\s+/);

      let isMatch = false;
      for (let i = 0; i <= keyWords.length - messageWords.length; i++) {
        const subWords = keyWords.slice(i, i + messageWords.length);
        if (messageWords.every((word, index) => word === subWords[index])) {
          isMatch = true;
          break;
        }
      }

      if (isMatch) {
        const responses = Array.isArray(value) ? value : [value];
        const validResponses = responses.filter((r) => !isInvalidResponse(typeof r === "string" ? r : r.response));

        if (validResponses.length > 0) {
          matchedQuestions.push({
            question: key,
            responses: validResponses,
            similarity: 0.8,
            isPermanent: validResponses.some((r) => typeof r !== "string" && r.isTemporary === false),
            isPartialMatch: true,
          });
        }
      }
    }

    matchedQuestions.sort((a, b) => {
      if (a.isPermanent !== b.isPermanent) {
        return a.isPermanent ? -1 : 1;
      }
      if (Math.abs(a.similarity - b.similarity) < 0.1) {
        const aMatchCount = countMatchingWords(messageLower, a.question);
        const bMatchCount = countMatchingWords(messageLower, b.question);
        if (aMatchCount !== bMatchCount) {
          return bMatchCount - aMatchCount;
        }
      }
      return b.similarity - a.similarity;
    });

    if (matchedQuestions.length > 0) {
      const bestMatch = matchedQuestions[0];
      const selectedResponse = bestMatch.responses[Math.floor(Math.random() * bestMatch.responses.length)];
      const response = typeof selectedResponse === "string" ? selectedResponse : selectedResponse.response;
      const isTemp = typeof selectedResponse === "string" ? true : selectedResponse.isTemporary;
    
      if (isTemp === true) {
        trackResponseUsage(threadId, bestMatch.question, response);
      }
    
      return {
        response,
        matchedQuestion: bestMatch.question,
      };
    }
  } 
  return null;
}

async function handleToggleCommand(api, message, groupSettings, content, commandName, settingKey, labels) {
  const threadId = message.threadId;
  const prefix = getGlobalPrefix();

  if (content.startsWith(`${prefix}${commandName}`)) {
    const parts = content.split(" ");
    let newState;

    if (parts.length === 1) {
      newState = !groupSettings[threadId][settingKey];
    } else if (parts[1] === "on") {
      newState = true;
    } else if (parts[1] === "off") {
      newState = false;
    } else {
      await sendMessageWarning(api, message, `🚫 Cú pháp không hợp lệ. Dùng: ${prefix}${commandName}, ${prefix}${commandName} on/off`, 60000);
      return true;
    }

    groupSettings[threadId][settingKey] = newState;
    const status = newState ? labels.on : labels.off;
    const caption = `${labels.prefix} đã được ${status}!`;
    await sendMessageStateQuote(api, message, caption, newState, 60000, false);
    return true;
  }
  return false;
}

export async function handleLearnCommand(api, message, groupSettings) {
  const threadId = message.threadId;
  const content = removeMention(message);
  const prefix = getGlobalPrefix();

  if (content.startsWith(`${prefix}learnnow_list`)) {
    const threadId = message.threadId;
    const data = loadTrainingData();

    if (!data[threadId] || !data[threadId].listTrain || Object.keys(data[threadId].listTrain).length === 0) {
      await sendMessageWarning(api, message, "🚫 Chưa có câu hỏi nào được học trong nhóm này", 60000);
      return true;
    }

    let listMsg = "📋 Danh sách câu hỏi và câu trả lời:\n\n";
    let index = 1;

    for (const [question, value] of Object.entries(data[threadId].listTrain)) {
      const responses = Array.isArray(value) ? value : [value];
      listMsg += `${index}. Câu hỏi: "${question}"\n`;
      
      responses.forEach((item, idx) => {
        const response = typeof item === "string" ? item : item.response;
        const isTemp = typeof item === "string" ? true : item.isTemporary;
        const tempLabel = isTemp ? " (tạm thời)" : " (cố định)";
        
        if (response.startsWith("__card__")) {
          const textParts = response.split("__text__");
          const cardContent = textParts[0].replace("__card__", "").trim();
          const optionalText = textParts[1]?.trim();
          listMsg += `   [${index}.${idx + 1}] 💳 Danh thiếp: "${cardContent}"${tempLabel}\n`;
          if (optionalText) {
            listMsg += `        Text: "${optionalText}"\n`;
          }
        } else {
          listMsg += `   [${index}.${idx + 1}] "${response}"${tempLabel}\n`;
        }
      });
      
      listMsg += "\n";
      index++;
    }

    listMsg += `💡 Dùng ${prefix}unlearn [index] để xóa câu trả lời cụ thể (VD: ${prefix}unlearn 1.2)`;

    await sendMessageComplete(api, message, listMsg, 60000);
    return true;
  }

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
      
      const cardReceivers = loadCardReceivers();
      const cardKeyword = question.toLowerCase();
      const targetUid = message.data.mentions?.[0]?.uid || message.data.uidFrom;
      cardReceivers[cardKeyword] = targetUid;
      saveCardReceivers(cardReceivers);
  
      if (success) {
        let resultMsg = `✅ Đã lưu danh thiếp "${cardContent}" cho từ khóa "${question}"`;
        if (optionalText.trim() !== "") {
          resultMsg += `\n👉 Câu trả lời: "${optionalText.trim()}"`;
        }
        await sendMessageComplete(api, message, resultMsg, 60000);
      } else {
        await sendMessageWarning(api, message, `⚠️ Danh thiếp đã tồn tại cho từ khóa "${question}"`, 60000);
      }
    } else {
      await sendMessageWarning(api, message, `🚫 Cú pháp không hợp lệ. Dùng: ${prefix}learnnow_card_[Câu Hỏi]_[Nội dung danh thiếp]_[Nội dung text tùy chọn]`, 60000);
    }
    return true;
  }

  if (content.startsWith(`${prefix}learnnow_`)) {
    const parts = content.split("_");
    if (parts.length >= 3) {
      const question = parts[1];
      const answer = parts.slice(2).join("_");

      const filePath = path.join(IMAGE_RESOURCE_PATH, answer);
      const fileExists = fs.existsSync(filePath);

      const success = await learnNewResponse(api, threadId, question, answer);
      if (success) {
        const caption = fileExists
          ? `✅ Đã lưu phản hồi file "${answer}" cho từ khóa "${question}"`
          : `✅ Đã lưu phản hồi văn bản "${answer}" cho từ khóa "${question}"`;
        await sendMessageComplete(api, message, caption, 60000);
      } else {
        await sendMessageWarning(api, message, `⚠️ Phản hồi "${answer}" đã tồn tại cho từ khóa "${question}"`, 60000);
      }
    } else {
      await sendMessageWarning(api, message, `🚫 Cú pháp không hợp lệ. Dùng: ${prefix}learnnow_[Câu Hỏi]_[Câu Trả Lời]`, 60000);
    }
    return true;
  }

  if (content.startsWith(`${prefix}learn`)) {
    return await handleToggleCommand(api, message, groupSettings, content, "learn", "learnEnabled", {
      on: "bật",
      off: "tắt",
      prefix: "Chế độ học tập"
    });
  }

  if (content.startsWith(`${prefix}unlearn`)) {
    await handleUnlearnCommand(api, message);
    return true;
  }

  return false;
}

export async function handleReplyCommand(api, message, groupSettings) {
  const content = removeMention(message);
  const prefix = getGlobalPrefix();
  
  const toggled = await handleToggleCommand(api, message, groupSettings, content, "reply", "replyEnabled", {
    on: "bật",
    off: "tắt",
    prefix: "Chế độ trả lời"
  });

  if (toggled) {
    return true;
  }

  if (content.startsWith(`${prefix}reply`)) {
    await sendMessageWarning(api, message, `Cú pháp không hợp lệ. Sử dụng ${prefix}reply hoặc ${prefix}reply on/off để bật tắt chế độ trả lời`, 60000);
    return true;
  }
  
  return false;
}

export async function handleUnlearnCommand(api, message) {
  const threadId = message.threadId;
  const content = message.data.content.trim();
  const prefix = getGlobalPrefix();

  if (content.startsWith(`${prefix}unlearn`)) {
    const parts = content.split(" ");
    if (parts.length >= 2) {
      const valueToRemove = parts.slice(1).join(" ");
      
      if (valueToRemove.match(/^\d+\.\d+$/)) {
        const removed = await removeResponseByIndex(threadId, valueToRemove);
        if (removed) {
          await sendMessageComplete(api, message, `✅ Đã xóa thành công câu trả lời [${valueToRemove}]`, 60000);
        } else {
          await sendMessageWarning(api, message, `🚫 Không tìm thấy câu trả lời với index [${valueToRemove}]`, 60000);
        }
      } else {
        const removed = await removeLearnedResponse(threadId, valueToRemove);
        if (removed) {
          await sendMessageComplete(api, message, `✅ Đã xóa thành công câu hỏi có câu trả lời "${valueToRemove}"`, 60000);
        } else {
          await sendMessageWarning(api, message, `🚫 Không tìm thấy câu hỏi nào có câu trả lời "${valueToRemove}"`, 60000);
        }
      }
    } else {
      await sendMessageWarning(api, message, `🚫 Cú pháp không hợp lệ. Vui lòng sử dụng: ${prefix}unlearn [Câu Trả Lời] hoặc ${prefix}unlearn [index] (VD: ${prefix}unlearn 1.2)`, 60000);
    }
    return true;
  }
  return false;
}

async function removeResponseByIndex(threadId, indexStr) {
  const data = loadTrainingData();
  
  if (!data[threadId] || !data[threadId].listTrain) {
    return false;
  }

  const [questionIdx, responseIdx] = indexStr.split(".").map(n => parseInt(n));
  const questions = Object.keys(data[threadId].listTrain);
  
  if (questionIdx < 1 || questionIdx > questions.length) {
    return false;
  }

  const question = questions[questionIdx - 1];
  const responses = data[threadId].listTrain[question];
  const responsesArray = Array.isArray(responses) ? responses : [responses];

  if (responseIdx < 1 || responseIdx > responsesArray.length) {
    return false;
  }

  if (responsesArray.length === 1) {
    delete data[threadId].listTrain[question];
  } else {
    responsesArray.splice(responseIdx - 1, 1);
    data[threadId].listTrain[question] = responsesArray;
  }

  saveTrainingData(data);
  return true;
}

export async function removeLearnedResponse(threadId, value) {
  const data = loadTrainingData();
  let removed = false;

  if (data[threadId] && data[threadId].listTrain) {
    const entries = Object.entries(data[threadId].listTrain);

    for (const [key, val] of entries) {
      const responses = Array.isArray(val) ? val : [val];

      const filtered = responses.filter((item) => {
        const resText = typeof item === "string" ? item : item.response;

        if (resText.startsWith("__card__")) {
          const cardPart = resText.split("__text__")[0].replace("__card__", "").trim();
          return cardPart !== value.trim();
        }

        return resText.trim() !== value.trim();
      });

      if (filtered.length < responses.length) {
        removed = true;

        if (filtered.length === 0) {
          delete data[threadId].listTrain[key];
        } else {
          data[threadId].listTrain[key] = filtered;
        }
      }
    }

    if (removed) {
      saveTrainingData(data);
    }
  }
  return removed;
}
