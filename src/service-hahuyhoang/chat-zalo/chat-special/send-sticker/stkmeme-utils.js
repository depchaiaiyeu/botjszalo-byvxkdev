import axios from "axios";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { getGlobalPrefix } from "../../../service.js";
import { deleteFile, downloadFileFake } from "../../../../utils/util.js";
import { tempDir } from "../../../../utils/io-json.js";
import { removeMention } from "../../../../utils/format-util.js";
import { LRUCache } from "lru-cache";
import { sendMessageCompleteRequest, sendMessageWarningRequest } from "../../chat-style/chat-style.js";
import { createStickerGridImage } from "../../../../utils/canvas/sticker-grid-canvas.js";
import { setSelectionsMapData } from "../../../api-crawl/index.js";
import { getBotId } from "../../../../index.js";
import { MessageType } from "../../../../api-zalo/index.js";
import { appContext } from "../../../../api-zalo/context.js";

const TENOR_API_KEY = "AIzaSyACyC8fxJfIm6yiM1TG0B-gBNXnM2iATFw";
const CLIENT_KEY = "my_bot_app";
const TIME_TO_SELECT = 60000;
const PLATFORM = "stickermeme";
const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 10;

export const stickerSelectionsMap = new LRUCache({
  max: 500,
  ttl: TIME_TO_SELECT
});

function getRandomItems(array, count) {
    const shuffled = [...array].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
}

async function searchTenorSticker(query, limit = DEFAULT_LIMIT) {
    try {
        const searchLimit = Math.min(limit, MAX_LIMIT);
        
        const response = await axios.get('https://tenor.googleapis.com/v2/search', {
            params: {
                q: query,
                key: TENOR_API_KEY,
                client_key: CLIENT_KEY,
                limit: MAX_LIMIT,
                contentfilter: 'high',
                searchfilter: 'sticker',
            },
            timeout: 10000,
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
        });

        const results = response.data.results;
        if (!results || !Array.isArray(results) || results.length === 0) {
            if (query.toLowerCase() === "ếch") {
                return await searchTenorSticker("frog", limit);
            }
            return null;
        }

        const validResults = results.filter(gif => {
            if (!gif || !gif.media_formats || typeof gif.media_formats !== 'object') {
                return false;
            }
            const formats = gif.media_formats;
            return (
                (formats.mediumgif && formats.mediumgif.url && formats.mediumgif.url.trim()) ||
                (formats.gif && formats.gif.url && formats.gif.url.trim()) ||
                (formats.tinygif && formats.tinygif.url && formats.tinygif.url.trim()) ||
                (formats.webp && formats.webp.url && formats.webp.url.trim())
            );
        });

        if (validResults.length === 0) {
            if (query.toLowerCase() === "ếch") {
                return await searchTenorSticker("frog", limit);
            }
            return null;
        }

        return getRandomItems(validResults, searchLimit);
    } catch (error) {
        console.error('Lỗi khi tìm kiếm GIF trên Tenor:', error.message);
        return null;
    }
}

async function downloadAndConvertToWebp(url, outputPath) {
    const tempDownload = path.join(tempDir, `temp_download_${Date.now()}.gif`);
    
    try {
        await downloadFileFake(url, tempDownload);

        if (!fs.existsSync(tempDownload)) {
            throw new Error(`File tải về không tồn tại`);
        }
        
        const fileSize = fs.statSync(tempDownload).size;
        if (fileSize === 0) {
            throw new Error(`File tải về rỗng`);
        }

        execSync(`ffmpeg -y -i "${tempDownload}" -c:v libwebp -q:v 80 -vf "scale=512:512:force_original_aspect_ratio=decrease" "${outputPath}"`, { stdio: 'pipe' });

        if (!fs.existsSync(outputPath)) {
            throw new Error(`File WebP đầu ra không tồn tại`);
        }
        
        const webpSize = fs.statSync(outputPath).size;
        if (webpSize === 0) {
            throw new Error(`File WebP đầu ra rỗng`);
        }

        return true;
    } catch (error) {
        throw error;
    } finally {
        if (fs.existsSync(tempDownload)) {
            await deleteFile(tempDownload);
        }
    }
}

export async function handleSendStickerMeme(api, message, selectedSticker, senderName) {
    const threadId = message.threadId;
    let webpPath = null;
  
    await sendMessageCompleteRequest(api, message, {
        caption: `Đang tạo sticker cho bạn, vui lòng chờ một chút!`
    }, 5000);

    try {
        webpPath = path.join(tempDir, `tenor_sticker_${Date.now()}.webp`);
        
        await downloadAndConvertToWebp(selectedSticker.url, webpPath);

        const webpUpload = await api.uploadAttachment([webpPath], threadId, appContext.send2meId, MessageType.DirectMessage);
        const webpUrl = webpUpload?.[0]?.fileUrl;
        
        if (!webpUrl) {
            throw new Error("Upload attachment thất bại");
        }

        const staticUrl = webpUrl + "?creator=VXK-Service-BOT.webp";
        const animUrl = webpUrl + "?createdBy=VXK-Service-BOT.Webp";

        await sendMessageCompleteRequest(api, message, {
            caption: `Sticker Của Bạn Đây!!!`
        }, 600000);
        await api.sendCustomSticker(message, staticUrl, animUrl, selectedSticker.width || 512, selectedSticker.height || 512);
      
        return true;
    } catch (error) {
        throw error;
    } finally {
        if (webpPath && fs.existsSync(webpPath)) {
            await deleteFile(webpPath);
        }
    }
}

export async function handleStkmemeCommand(api, message, aliasCommand = 'stkmeme') {
    const senderId = message.data.uidFrom;
    const senderName = message.data.dName || "Người dùng";
    const prefix = getGlobalPrefix();
    const content = message.data.content ? message.data.content.trim() : '';
    const commandContent = content.replace(`${prefix}${aliasCommand}`, "").trim();
    
    let imagePath = null;

    if (!commandContent) {
        await sendMessageWarningRequest(api, message, {
            caption: `Vui lòng nhập từ khóa tìm kiếm sticker!\nVí dụ: ${prefix}${aliasCommand} Nội dung cần tìm`
        }, 30000);
        return 0;
    }

    let query = commandContent;
    let limit = DEFAULT_LIMIT;

    const limitMatch = commandContent.match(/&&\s*(\d+)$/i);
    if (limitMatch) {
        const requestedLimit = parseInt(limitMatch[1]);
        limit = Math.min(Math.max(requestedLimit, 1), MAX_LIMIT);
        query = commandContent.replace(/&&\s*\d+$/i, "").trim();
    }

    if (!query) {
        await sendMessageWarningRequest(api, message, {
            caption: `Vui lòng nhập từ khóa tìm kiếm sticker!\nVí dụ: ${prefix}${aliasCommand} Nội dung cần tìm`
        }, 30000);
        return 0;
    }

    try {
        const validResults = await searchTenorSticker(query, limit);

        if (!validResults || validResults.length === 0) {
            await sendMessageWarningRequest(api, message, {
                caption: `Không tìm thấy sticker nào với từ khóa "${query}"! Hãy thử từ khóa khác phổ biến.`
            }, 30000);
            return 0;
        }

        const stickers = validResults.map((gif, index) => {
            const media = gif.media_formats;
            const selectedFormat = media.mediumgif || media.gif || media.tinygif || media.webp || null;
            
            if (!selectedFormat || !selectedFormat.url) {
                return null;
            }

            const dims = selectedFormat.dims || [512, 512];
            const width = dims[0] || 512;
            const height = dims[1] || 512;

            return {
                url: selectedFormat.url,
                preview: media.tinygif?.url || media.gifpreview?.url || selectedFormat.url,
                width: width,
                height: height
            };
        }).filter(s => s && s.url);

        if (stickers.length === 0) {
            await sendMessageWarningRequest(api, message, {
                caption: `Không tìm thấy sticker hợp lệ nào cho từ khóa "${query}"! Hãy thử từ khóa khác.`
            }, 30000);
            return 0;
        }

        if (stickers.length === 1) {
            await sendMessageCompleteRequest(api, message, {
                caption: `Đang tạo sticker cho bạn, vui lòng chờ một chút!`
            }, 5000);
            
            await handleSendStickerMeme(api, message, stickers[0], senderName);
            return 0;
        }

        imagePath = await createStickerGridImage(stickers);

        const stickerListMessage = await sendMessageCompleteRequest(api, message, {
            caption: `Đây là danh sách sticker cho từ khóa "${query}":\nHãy trả lời tin nhắn này với số index của sticker bạn muốn!`,
            imagePath: imagePath
        }, TIME_TO_SELECT);

        const quotedMsgId = stickerListMessage?.message?.msgId || stickerListMessage?.attachment?.[0]?.msgId;
        if (quotedMsgId) {
            stickerSelectionsMap.set(quotedMsgId.toString(), {
                userRequest: senderId,
                collection: stickers,
                timestamp: Date.now(),
            });

            setSelectionsMapData(senderId, {
                quotedMsgId: quotedMsgId.toString(),
                collection: stickers,
                timestamp: Date.now(),
                platform: PLATFORM,
            });
        }

    } catch (error) {
        let errorMessage = `${senderName}, Lỗi khi xử lý sticker: ${error.message}`;
        if (error.message.includes("File đầu vào rỗng") || error.message.includes("không tồn tại")) {
            errorMessage = `${senderName}, File GIF từ Tenor không hợp lệ hoặc không tải được. Hãy thử từ khóa khác.`;
        } else if (error.message.includes("Lỗi khi chuyển đổi sang WebP")) {
            errorMessage = `${senderName}, Lỗi khi chuyển đổi GIF sang sticker. Vui lòng thử lại sau.`;
        } else if (error.message.includes("không hợp lệ")) {
            errorMessage = `${senderName}, File từ Tenor không hợp lệ. Hãy thử từ khóa khác.`;
        }
        await sendMessageWarningRequest(api, message, {
            caption: errorMessage
        }, 30000);
    } finally {
        if (imagePath) {
            await deleteFile(imagePath);
        }
    }

    return 0;
}

export async function handleStkmemeReply(api, message) {
    const senderId = message.data.uidFrom;
    const idBot = getBotId();
    const senderName = message.data.dName || "Người dùng";

    try {
        if (!message.data.quote || !message.data.quote.globalMsgId) return false;

        const quotedMsgId = message.data.quote.globalMsgId.toString();
        if (!stickerSelectionsMap.has(quotedMsgId)) return false;

        const stickerData = stickerSelectionsMap.get(quotedMsgId);
        if (stickerData.userRequest !== senderId) return false;

        let selection = removeMention(message);
        const selectedIndex = parseInt(selection) - 1;
        
        if (isNaN(selectedIndex)) {
            await sendMessageWarningRequest(api, message, {
                caption: `Lựa chọn không hợp lệ. Vui lòng chọn một số từ danh sách.`
            }, 30000);
            return true;
        }

        const { collection } = stickerData;
        if (selectedIndex < 0 || selectedIndex >= collection.length) {
            await sendMessageWarningRequest(api, message, {
                caption: `Số bạn chọn không nằm trong danh sách. Vui lòng chọn lại.`
            }, 30000);
            return true;
        }

        const selectedSticker = collection[selectedIndex];

        const msgDel = {
            type: message.type,
            threadId: message.threadId,
            data: {
                cliMsgId: message.data.quote.cliMsgId,
                msgId: message.data.quote.globalMsgId,
                uidFrom: idBot,
            },
        };
        await api.deleteMessage(msgDel, false);
        stickerSelectionsMap.delete(quotedMsgId);

        await handleSendStickerMeme(api, message, selectedSticker, senderName);

        return true;

    } catch (error) {
        console.error("Error handling sticker reply:", error);
        await sendMessageWarningRequest(api, message, {
            caption: `Đã xảy ra lỗi khi xử lý sticker: ${error.message}. Vui lòng thử lại sau.`
        }, 30000);
        return true;
    }
}
