import axios from "axios";
import { getGlobalPrefix } from "../../../service.js";
import { deleteFile } from "../../../../utils/util.js";
import { removeMention } from "../../../../utils/format-util.js";
import { LRUCache } from "lru-cache";
import { sendMessageCompleteRequest, sendMessageWarningRequest } from "../../chat-style/chat-style.js";
import { createStickerGridImage } from "../../../../utils/canvas/sticker-grid-canvas.js";
import { setSelectionsMapData } from "../../../api-crawl/index.js";
import { getBotId } from "../../../../index.js";
import { processAndSendSticker } from "./send-sticker.js";

const TENOR_API_KEY = "AIzaSyACyC8fxJfIm6yiM1TG0B-gBNXnM2iATFw";
const CLIENT_KEY = "my_bot_app";
const TIME_TO_SELECT = 60000;
const PLATFORM = "stickermeme";

export const stickerSelectionsMap = new LRUCache({
  max: 500,
  ttl: TIME_TO_SELECT
});

async function searchTenorSticker(query, limit = 10) {
    try {
        const response = await axios.get('https://tenor.googleapis.com/v2/search', {
            params: {
                q: query,
                key: TENOR_API_KEY,
                client_key: CLIENT_KEY,
                limit: limit,
                contentfilter: 'high',
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
                (formats.webp && formats.webp.url && formats.webp.url.trim()) ||
                (formats.gif && formats.gif.url && formats.gif.url.trim()) ||
                (formats.mediumgif && formats.mediumgif.url && formats.mediumgif.url.trim()) ||
                (formats.nanogif && formats.nanogif.url && formats.nanogif.url.trim()) ||
                (formats.mp4 && formats.mp4.url && formats.mp4.url.trim())
            );
        });

        if (validResults.length === 0) {
            if (query.toLowerCase() === "ếch") {
                return await searchTenorSticker("frog", limit);
            }
            return null;
        }

        return validResults;
    } catch (error) {
        console.error('Lỗi khi tìm kiếm GIF trên Tenor:', error.message);
        return null;
    }
}

export async function handleStkmemeCommand(api, message, aliasCommand = 'stkmeme') {
    const senderId = message.data.uidFrom;
    const senderName = message.data.dName || "Người dùng";
    const prefix = getGlobalPrefix();
    const content = message.data.content ? message.data.content.trim() : '';
    const commandContent = content.replace(`${prefix}${aliasCommand}`, "").trim();
    const rawArgs = commandContent.split(/\s+/);
    const input = rawArgs.filter(a => !/^(-d|--debug|-debug)$/i.test(a)).join(" ").trim();

    let imagePath = null;

    if (!commandContent || !input) {
        await sendMessageWarningRequest(api, message, {
            caption: `Vui lòng nhập từ khóa tìm kiếm sticker!\nVí dụ: ${prefix}${aliasCommand} Nội dung cần tìm`
        }, 30000);
        return 0;
    }

    const query = input;
    await sendMessageWarningRequest(api, message, {
        caption: `${senderName}, Đang tìm sticker cho từ khóa "${query}", chờ chút nhé!`
    }, 6000);

    try {
        const validResults = await searchTenorSticker(query, 10);

        if (!validResults || validResults.length === 0) {
            await sendMessageWarningRequest(api, message, {
                caption: `${senderName}, Không tìm thấy GIF nào trên Tenor với từ khóa "${query}"! Hãy thử từ khóa khác như "funny" hoặc "cat".`
            }, 30000);
            return 0;
        }

        const stickers = validResults.map(gif => {
            const media = gif.media_formats;
            let url = null;
            let dims = [512, 512]; 

            if (media.webp && media.webp.url) {
                url = media.webp.url;
                dims = media.webp.dims || dims;
            } else if (media.gif && media.gif.url) {
                url = media.gif.url;
                dims = media.gif.dims || dims;
            } else if (media.mediumgif && media.mediumgif.url) {
                url = media.mediumgif.url;
                dims = media.mediumgif.dims || dims;
            } else if (media.nanogif && media.nanogif.url) {
                url = media.nanogif.url;
                dims = media.nanogif.dims || dims;
            } else if (media.mp4 && media.mp4.url) {
                url = media.mp4.url;
                dims = media.mp4.dims || dims;
            }
            
            return {
                url: url,
                preview: media.tinygif?.url || media.nanogif?.url || media.gif?.url,
                width: dims[0],
                height: dims[1]
            };
        }).filter(s => s.url);

        if (stickers.length === 0) {
            await sendMessageWarningRequest(api, message, {
                caption: `${senderName}, Không tìm thấy sticker hợp lệ nào cho từ khóa "${query}"! Hãy thử từ khóa khác.`
            }, 30000);
            return 0;
        }

        imagePath = await createStickerGridImage(stickers);

        const stickerListMessage = await sendMessageCompleteRequest(api, message, {
            caption: `Đây là danh sách sticker cho "${query}":\nHãy trả lời tin nhắn này với số index của sticker bạn muốn!`,
            imagePath: imagePath
        }, TIME_TO_SELECT);

        const quotedMsgId = stickerListMessage?.message?.msgId || stickerListMessage?.attachment?.[0]?.msgId;
        if (!quotedMsgId) return 0;

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
        if (imagePath) await deleteFile(imagePath);
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

        const { collection } = stickerSelectionsMap.get(quotedMsgId);
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

        await processAndSendSticker(
            api, 
            message, 
            selectedSticker.url, 
            selectedSticker.width, 
            selectedSticker.height, 
            senderName
        );
        return true;

    } catch (error) {
        console.error("Error handling sticker reply:", error);
        await sendMessageWarningRequest(api, message, {
            caption: `${senderName}, Đã xảy ra lỗi khi xử lý sticker. Vui lòng thử lại sau.`
        }, 30000);
        return true;
    }
}
