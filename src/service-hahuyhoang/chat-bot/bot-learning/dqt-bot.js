import fs from "fs";
import path from "path";
import crypto from "crypto";
import { getGroupName } from "../../info-service/group-info.js";
import { sendMessageComplete, sendMessageState, sendMessageStateQuote, sendMessageWarning, sendMessageFromSQL } from "../../chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service.js";
import { removeMention } from "../../../utils/format-util.js";

const dataTrainingPath = path.resolve(process.cwd(), "assets", "json-data", "data-training.json");
const uploadedFilePath = path.resolve(process.cwd(), "assets", "json-data", "uploaded-files.json");
const RESOURCE_BASE_PATH = path.join(process.cwd(), "assets", "resources");
const IMAGE_RESOURCE_PATH = path.join(RESOURCE_BASE_PATH, "image");

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
    let foundResponse = null;

    if (
        groupSettings[threadId].replyEnabled &&
        !content.startsWith(`${getGlobalPrefix()}`) &&
        !content.startsWith(`!`) &&
        !content.startsWith(`.`)
    ) {
        foundResponse = findResponse(content, threadId);
    }

    if (foundResponse) {
        const { response, matchedQuestion } = foundResponse;
        const senderId = message.data.uidFrom;
        const isGroup = message.type === 1;

        if (isGroup) {
            const cooldownKey = `${threadId}-${matchedQuestion}`;
            const now = Date.now();
            const cooldownData = responseCooldown.get(cooldownKey);

            if (cooldownData && cooldownData.userId === senderId && (now - cooldownData.timestamp < 10000)) {
                return;
            }
            responseCooldown.set(cooldownKey, { userId: senderId, timestamp: now });
        }

        if (response.text) {
            const processedText = response.text.replace(/\${senderName}/g, message.data.dName);
            await sendMessageFromSQL(api, message, { message: processedText }, false, 60000);
        }

        if (response.attachment) {
            const { type, content: attachmentContent } = response.attachment;

            if (type === "card") {
                await api.sendBusinessCard(null, senderId, attachmentContent, message.type, threadId, 60000);
            } else if (type === "file") {
                const filePath = path.join(IMAGE_RESOURCE_PATH, attachmentContent);
                if (fs.existsSync(filePath)) {
                    const uploadedCache = loadUploadedFiles();
                    const cachedInfo = uploadedCache[attachmentContent];

                    if (cachedInfo?.fileUrl) {
                        await sendUploadedFile(api, message, cachedInfo);
                        return;
                    }

                    try {
                        const uploaded = await api.uploadAttachment([filePath], threadId, message.type);
                        if (uploaded && uploaded.length > 0 && uploaded[0].fileUrl) {
                            const fileInfo = uploaded[0];
                            await sendUploadedFile(api, message, fileInfo);
                            uploadedCache[attachmentContent] = {
                                fileUrl: fileInfo.fileUrl,
                                fileName: fileInfo.fileName,
                                totalSize: fileInfo.totalSize,
                                checksum: fileInfo.checksum,
                            };
                            saveUploadedFiles(uploadedCache);
                        } else {
                            await sendMessageWarning(api, message, `🚫 Upload thất bại cho file "${attachmentContent}".`, 60000);
                        }
                    } catch (err) {
                        console.error("🚫 Lỗi upload:", err);
                        await sendMessageWarning(api, message, "🚫 Có lỗi xảy ra khi upload file.", 60000);
                    }
                } else {
                    await sendMessageWarning(api, message, `Không tìm thấy file ${attachmentContent} trong resources/image`, 60000);
                }
            }
        }
    } else {
        if (groupSettings[threadId].learnEnabled && message.data.quote) {
            const botResponse = message.data.quote.msg;
            content = content.replace(message.data.quote.fromD, "").replace("@", "").trim();
            if (content !== "" && content.length > 6) {
                const newResponseObject = { text: content, isTemporary: true };
                updateTrainingData(threadId, botResponse, newResponseObject, null, nameGroup);
            }
        }
    }
}

async function updateTrainingData(threadId, question, responseObj, api, groupName = null) {
    const data = loadTrainingData();

    if (!data[threadId]) {
        data[threadId] = {
            nameGroup: groupName || (api ? await getGroupName(api, threadId) : "Unknown"),
            listTrain: {},
        };
    }

    const existingResponses = data[threadId].listTrain[question] || [];
    const isDuplicate = existingResponses.some(r => JSON.stringify(r) === JSON.stringify(responseObj));

    if (isDuplicate) {
        return false;
    }

    existingResponses.push(responseObj);
    data[threadId].listTrain[question] = existingResponses;
    saveTrainingData(data);
    return true;
}

export async function learnNewResponse(api, threadId, question, answerObj) {
    const permanentAnswer = { ...answerObj, isTemporary: false };
    return await updateTrainingData(threadId, question, permanentAnswer, api);
}

export function findResponse(message, threadId) {
    const data = loadTrainingData();
    if (!data[threadId] || !data[threadId].listTrain) {
        return null;
    }

    const matches = [];
    const messageLower = message.toLowerCase();

    for (const [key, responses] of Object.entries(data[threadId].listTrain)) {
        if (!responses || responses.length === 0) continue;

        const keyLower = key.toLowerCase();

        if (messageLower.includes(keyLower)) {
            matches.push({
                question: key,
                responses: responses,
                matchType: 'full',
                length: keyLower.length
            });
        } else {
            const firstKeyWord = keyLower.split(' ')[0];
            if (messageLower.startsWith(firstKeyWord)) {
                matches.push({
                    question: key,
                    responses: responses,
                    matchType: 'start',
                    length: keyLower.length
                });
            }
        }
    }

    if (matches.length === 0) {
        return null;
    }

    matches.sort((a, b) => {
        if (a.matchType === 'full' && b.matchType !== 'full') return -1;
        if (a.matchType !== 'full' && b.matchType === 'full') return 1;
        return b.length - a.length;
    });

    const bestMatch = matches[0];

    const permanentResponses = bestMatch.responses.filter(r => !r.isTemporary);
    const temporaryResponses = bestMatch.responses.filter(r => r.isTemporary);

    let selectedResponse;
    if (permanentResponses.length > 0) {
        selectedResponse = permanentResponses[Math.floor(Math.random() * permanentResponses.length)];
    } else if (temporaryResponses.length > 0) {
        selectedResponse = temporaryResponses[Math.floor(Math.random() * temporaryResponses.length)];
        
        const remainingResponses = bestMatch.responses.filter(r => r !== selectedResponse);
        const dataToSave = loadTrainingData();
        if (remainingResponses.length > 0) {
            dataToSave[threadId].listTrain[bestMatch.question] = remainingResponses;
        } else {
            delete dataToSave[threadId].listTrain[bestMatch.question];
        }
        saveTrainingData(dataToSave);
    }

    if (selectedResponse) {
        return {
            response: selectedResponse,
            matchedQuestion: bestMatch.question,
        };
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
        const data = loadTrainingData();
        if (!data[threadId] || !data[threadId].listTrain || Object.keys(data[threadId].listTrain).length === 0) {
            await sendMessageWarning(api, message, "🚫 Chưa có dữ liệu nào được học trong nhóm này", 60000);
            return true;
        }

        let listMsg = "📋 Danh sách dữ liệu đã học:\n\n";
        let qIndex = 1;
        for (const [question, responses] of Object.entries(data[threadId].listTrain)) {
            listMsg += `${qIndex}. Hỏi: "${question}"\n`;
            responses.forEach((res, rIndex) => {
                const tempLabel = res.isTemporary ? " (tạm thời)" : "";
                listMsg += `   [${qIndex}.${rIndex + 1}] Trả lời${tempLabel}:`;
                if (res.text) {
                    listMsg += ` [Văn bản] "${res.text}"`;
                }
                if (res.attachment) {
                    if(res.text) listMsg += " +";
                    listMsg += ` [${res.attachment.type}] "${res.attachment.content}"`;
                }
                listMsg += "\n";
            });
            listMsg += "\n";
            qIndex++;
        }
        listMsg += `💡 Dùng ${prefix}unlearn [index] để xóa câu trả lời (VD: ${prefix}unlearn 1.2)`;
        await sendMessageComplete(api, message, listMsg, 60000);
        return true;
    }

    if (content.startsWith(`${prefix}learnnow_`)) {
        const commandBody = content.substring(`${prefix}learnnow_`.length);
        const [questionAndResponse, attachmentPart] = commandBody.split("::");

        const parts = questionAndResponse.split("_");
        if (parts.length < 1) {
             await sendMessageWarning(api, message, `🚫 Cú pháp không hợp lệ.`, 60000);
             return true;
        }

        const question = parts[0];
        const textResponse = parts.slice(1).join("_") || null;

        const newResponse = {};
        if (textResponse) {
            newResponse.text = textResponse;
        }

        if (attachmentPart) {
            newResponse.attachment = {};
            const [type, ...contentParts] = attachmentPart.split("_");
            const attachmentContent = contentParts.join("_");

            if (type.toLowerCase() === "card") {
                newResponse.attachment.type = "card";
                newResponse.attachment.content = attachmentContent || "Danh Thiếp Liên Hệ";
            } else {
                newResponse.attachment.type = "file";
                newResponse.attachment.content = attachmentPart;
            }
        }
        
        if (!newResponse.text && !newResponse.attachment) {
            await sendMessageWarning(api, message, `🚫 Phải có ít nhất nội dung trả lời hoặc tệp đính kèm.`, 60000);
            return true;
        }

        const success = await learnNewResponse(api, threadId, question, newResponse);
        if (success) {
            await sendMessageComplete(api, message, `✅ Đã học thành công cho từ khóa "${question}"`, 60000);
        } else {
            await sendMessageWarning(api, message, `⚠️ Phản hồi này đã tồn tại cho từ khóa "${question}"`, 60000);
        }
        return true;
    }

    if (content.startsWith(`${prefix}learn`)) {
        return await handleToggleCommand(api, message, groupSettings, content, "learn", "learnEnabled", {
            on: "bật",
            off: "tắt",
            prefix: "Chế độ học"
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
        prefix: "Chế độ trả lời tự động"
    });

    if (toggled) {
        return true;
    }

    if (content.startsWith(`${prefix}reply`)) {
        await sendMessageWarning(api, message, `Cú pháp không hợp lệ. Dùng ${prefix}reply hoặc ${prefix}reply on/off`, 60000);
        return true;
    }

    return false;
}

async function removeResponseByIndex(threadId, indexStr) {
    const data = loadTrainingData();
    if (!data[threadId] || !data[threadId].listTrain) {
        return false;
    }

    const [questionIdx, responseIdx] = indexStr.split(".").map(n => parseInt(n, 10));
    const questions = Object.keys(data[threadId].listTrain);

    if (isNaN(questionIdx) || isNaN(responseIdx) || questionIdx < 1 || questionIdx > questions.length) {
        return false;
    }

    const question = questions[questionIdx - 1];
    const responses = data[threadId].listTrain[question];

    if (responseIdx < 1 || responseIdx > responses.length) {
        return false;
    }

    responses.splice(responseIdx - 1, 1);

    if (responses.length === 0) {
        delete data[threadId].listTrain[question];
    } else {
        data[threadId].listTrain[question] = responses;
    }

    saveTrainingData(data);
    return true;
}

export async function handleUnlearnCommand(api, message) {
    const threadId = message.threadId;
    const content = message.data.content.trim();
    const prefix = getGlobalPrefix();

    const parts = content.split(" ");
    if (parts.length < 2) {
        await sendMessageWarning(api, message, `🚫 Cú pháp: ${prefix}unlearn [index] (VD: ${prefix}unlearn 1.2)`, 60000);
        return;
    }

    const indexToRemove = parts[1];
    if (!indexToRemove.match(/^\d+\.\d+$/)) {
        await sendMessageWarning(api, message, `🚫 Index không hợp lệ. Phải có dạng "số.số", ví dụ: 1.2`, 60000);
        return;
    }
    
    const removed = await removeResponseByIndex(threadId, indexToRemove);
    if (removed) {
        await sendMessageComplete(api, message, `✅ Đã xóa thành công câu trả lời tại index [${indexToRemove}]`, 60000);
    } else {
        await sendMessageWarning(api, message, `🚫 Không tìm thấy câu trả lời với index [${indexToRemove}]`, 60000);
    }
}
