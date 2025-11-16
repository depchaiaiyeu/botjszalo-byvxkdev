import axios from "axios";
import fs from "fs";
import path from "path";
import { getGlobalPrefix } from "../../../service.js";
import { checkExstentionFileRemote, deleteFile, downloadFile } from "../../../../utils/util.js";
import { MessageMention, MessageType } from "../../../../api-zalo/index.js";
import { tempDir } from "../../../../utils/io-json.js";
import { removeMention } from "../../../../utils/format-util.js";
import { getVideoMetadata } from "../../../../api-zalo/utils.js";
import { appContext } from "../../../../api-zalo/context.js";
import ffmpeg from 'fluent-ffmpeg';
import { LRUCache } from "lru-cache";
import { sendMessageComplete, sendMessageWarning } from "../../chat-style/chat-style.js";
import { createStickerGridImage } from "../../../../utils/canvas/sticker-grid-canvas.js";
import { setSelectionsMapData } from "../../../api-crawl/index.js";
import { getBotId } from "../../../../index.js";

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
            headers: { 'User-Agent': 'HHH_MYBOT/1.0 (Node.js)' },
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

async function processAndSendSticker(api, message, mediaSource) {
    const senderName = message.data.dName;
    const senderId = message.data.uidFrom;
    let pathSticker = path.join(tempDir, `sticker_${Date.now()}.temp`);
    let pathWebp = path.join(tempDir, `sticker_${Date.now()}.webp`);

    try {
        try {
            fs.accessSync(tempDir, fs.constants.W_OK);
        } catch (error) {
            throw new Error(`Không có quyền ghi vào thư mục ${tempDir}: ${error.message}`);
        }

        const mediaCheck = await isValidMediaUrl(mediaSource);
        if (!mediaCheck.isValid) {
            throw new Error(`URL media không hợp lệ: ${mediaSource}`);
        }

        const ext = await checkExstentionFileRemote(mediaSource);
        pathSticker = path.join(tempDir, `sticker_${Date.now()}.${ext}`);
        await downloadFile(mediaSource, pathSticker);

        const stats = fs.statSync(pathSticker);
        if (stats.size === 0) {
            throw new Error(`File tải về rỗng: ${pathSticker}`);
        }

        if (ext.toLowerCase() === 'webp') {
            pathWebp = pathSticker;
        } else {
            await convertToWebp(pathSticker, pathWebp);
        }

        if (!fs.existsSync(pathWebp) || fs.statSync(pathWebp).size === 0) {
            throw new Error(`File WebP đầu ra rỗng hoặc không tồn tại: ${pathWebp}`);
        }

        const linkUploadZalo = await api.uploadAttachment([pathWebp], appContext.send2meId, MessageType.DirectMessage);
        const stickerData = await getVideoMetadata(pathWebp);
        const finalUrl = (linkUploadZalo[0].fileUrl || linkUploadZalo[0].normalUrl || linkUploadZalo[0].url || linkUploadZalo[0].mediaUrl) + "?CreatedBy=HàHuyHoàng.BOT";

        const object = {
            caption: `${senderName}, Sticker của bạn đây!`,
        };
        await sendMessageComplete(api, message, object, 300000);

        await api.sendCustomSticker(
            message,
            finalUrl,
            finalUrl,
            stickerData.width,
            stickerData.height,
            3600000
        );

        return true;
    } catch (error) {
        console.error("Lỗi khi xử lý sticker:", error);
        throw error;
    } finally {
        if (pathSticker !== pathWebp) {
            await deleteFile(pathSticker);
        }
        await deleteFile(pathWebp);
    }
}

async function isValidMediaUrl(url) {
    try {
        const ext = await checkExstentionFileRemote(url);
        if (!ext) {
            return { isValid: false, isVideo: false };
        }
        if (ext === "mp4" || ext === "mov" || ext === "webm") {
            return { isValid: true, isVideo: true };
        } else if (ext === "png" || ext === "jpg" || ext === "jpeg" || ext === "gif" || ext === "webp") {
            return { isValid: true, isVideo: false };
        } else {
            return { isValid: false, isVideo: false };
        }
    } catch (error) {
        console.error("Lỗi khi kiểm tra URL:", error);
        return { isValid: false, isVideo: false };
    }
}

export async function handleStkmemeCommand(api, message, aliasCommand = 'stkmeme') {
    const threadId = message.threadId;
    const threadType = message.type ?? MessageType.DirectMessage;
    const senderId = message.data.uidFrom;
    const senderName = message.data.dName || "Người dùng";
    const prefix = getGlobalPrefix();
    const content = message.data.content ? message.data.content.trim() : '';
    const commandContent = content.replace(`${prefix}${aliasCommand}`, "").trim();
    const rawArgs = commandContent.split(/\s+/);
    const input = rawArgs.filter(a => !/^(-d|--debug|-debug)$/i.test(a)).join(" ").trim();

    let imagePath = null;

    if (!commandContent || !input) {
        const object = {
            caption: `Vui lòng nhập từ khóa tìm kiếm sticker!\nVí dụ: ${prefix}${aliasCommand} [nội dung]`,
        };
        await sendMessageWarning(api, message, object, 30000);
        return 0;
    }

    const query = input;
    const object = {
        caption: `${senderName}, Đang tìm sticker cho từ khóa "${query}", chờ chút nhé!`,
    };
    await sendMessageWarning(api, message, object, 6000);

    try {
        const validResults = await searchTenorSticker(query, 10);

        if (!validResults || validResults.length === 0) {
            const object = {
                caption: `${senderName}, Không tìm thấy GIF nào trên Tenor với từ khóa "${query}"! Hãy thử từ khóa khác như "funny" hoặc "cat".`,
            };
            await sendMessageWarning(api, message, object, 30000);
            return 0;
        }

        const stickers = validResults.map(gif => {
            const media = gif.media_formats;
            return {
                url: media.webp?.url || media.gif?.url || media.mediumgif?.url || media.nanogif?.url || media.mp4?.url || null,
                preview: media.tinygif?.url || media.nanogif?.url || media.gif?.url
            };
        }).filter(s => s.url);

        if (stickers.length === 0) {
            const object = {
                caption: `${senderName}, Không tìm thấy sticker hợp lệ nào cho từ khóa "${query}"! Hãy thử từ khóa khác.`,
            };
            await sendMessageWarning(api, message, object, 30000);
            return 0;
        }

        imagePath = await createStickerGridImage(stickers);

        const object = {
            caption: `Đây là danh sách sticker cho "${query}":\nHãy trả lời tin nhắn này với số index của sticker bạn muốn!`,
            imagePath: imagePath,
        };

        const stickerListMessage = await sendMessageComplete(api, message, object, TIME_TO_SELECT);

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
        const object = {
            caption: errorMessage,
        };
        await sendMessageWarning(api, message, object, 30000);
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
            const object = {
                caption: `Lựa chọn không hợp lệ. Vui lòng chọn một số từ danh sách.`,
            };
            await sendMessageWarning(api, message, object, 30000);
            return true;
        }

        const { collection } = stickerSelectionsMap.get(quotedMsgId);
        if (selectedIndex < 0 || selectedIndex >= collection.length) {
            const object = {
                caption: `Số bạn chọn không nằm trong danh sách. Vui lòng chọn lại.`,
            };
            await sendMessageWarning(api, message, object, 30000);
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

        await processAndSendSticker(api, message, selectedSticker.url);
        return true;

    } catch (error) {
        console.error("Error handling sticker reply:", error);
        const object = {
            caption: `${senderName}, Đã xảy ra lỗi khi xử lý sticker. Vui lòng thử lại sau.`,
        };
        await sendMessageWarning(api, message, object, 30000);
        return true;
    }
}

export async function convertToWebp(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
        try {
            if (!fs.existsSync(inputPath)) {
                throw new Error(`File đầu vào không tồn tại: ${inputPath}`);
            }
            const stats = fs.statSync(inputPath);
            if (stats.size === 0) {
                throw new Error(`File đầu vào rỗng: ${inputPath}`);
            }

            const ext = path.extname(inputPath).toLowerCase();
            if (ext === '.webp') {
                fs.copyFileSync(inputPath, outputPath);
                if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
                    throw new Error(`Sao chép file WebP thất bại: ${outputPath}`);
                }
                resolve(true);
                return;
            }

            let options = [
                '-c:v', 'libvpx-vp9',
                '-lossless', '0',
                '-compression_level', '6',
                '-q:v', '60',
                '-loop', '0',
                '-preset', 'default',
                '-cpu-used', '4',
                '-deadline', 'realtime',
                '-threads', 'auto',
                '-an',
                '-vsync', '0'
            ];

            if (ext === '.mp4' || ext === '.mov' || ext === '.webm') {
                options = options.concat(['-vf', 'fps=10,scale=512:-2:flags=fast_bilinear']);
            } else if (ext === '.gif') {
                options = options.concat(['-vf', 'scale=512:-2:flags=fast_bilinear']);
            } else if (ext === '.png' || ext === '.jpg' || ext === '.jpeg') {
                options = options.concat(['-vf', 'scale=512:-2:flags=fast_bilinear']);
            } else {
                throw new Error(`Định dạng file không được hỗ trợ: ${ext}`);
            }

            ffmpeg(inputPath)
                .outputOptions(options)
                .toFormat('webp')
                .on('start', commandLine => {
                    console.log(`FFmpeg command: ${commandLine}`);
                })
                .on('end', () => {
                    console.log(`Chuyển đổi WebP thành công: ${outputPath}`);
                    if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
                        throw new Error(`File WebP đầu ra rỗng hoặc không tồn tại: ${outputPath}`);
                    }
                    resolve(true);
                })
                .on('error', (err) => {
                    console.error(`Lỗi FFmpeg: ${err.message}`);
                    reject(new Error(`Lỗi khi chuyển đổi sang WebP: ${err.message}`));
                })
                .save(outputPath);
        } catch (error) {
            console.error(`Lỗi khi xử lý file đầu vào: ${error.message}`);
            reject(error);
        }
    });
}
