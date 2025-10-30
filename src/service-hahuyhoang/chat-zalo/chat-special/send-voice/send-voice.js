import gtts from "gtts";
import fs from "fs";
import path from "path";
import { getGlobalPrefix } from "../../../service.js";
import { extractAudioFromVideo, uploadAudioFile } from "./process-audio.js";
import { sendMessageCompleteRequest, sendMessageFromSQL, sendMessageImageNotQuote, sendMessageStateQuote } from "../../chat-style/chat-style.js";
import { checkExstentionFileRemote, deleteFile, downloadFile, execAsync } from "../../../../utils/util.js";
import { tempDir } from "../../../../utils/io-json.js";
import { removeMention } from "../../../../utils/format-util.js";
import { createMusicCard } from "../../../../utils/canvas/music-canvas.js";
import { getUserInfoData } from "../../../info-service/user-info.js";

async function textToSpeechAAC(text, api, message, lang = "vi") {
  return new Promise((resolve, reject) => {
    try {
      const tts = new gtts(text, lang);
      const fileName = `voice_${Date.now()}.aac`;
      const filePath = path.join(tempDir, fileName);

      tts.save(filePath, async (err) => {
        if (err) {
          reject(err);
          return;
        }
        try {
          const voiceUrl = await uploadAudioFile(filePath, api, message);
          resolve(voiceUrl);
        } catch (error) {
          reject(error);
        } finally {
          await deleteFile(filePath);
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}

function detectLanguage(text) {
  const patterns = {
    vi: /[àáạảãâầấấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i,
    zh: /[\u4E00-\u9FFF]/,
    ja: /[\u3040-\u309F\u30A0-\u30FF]/,
    ko: /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/,
  };

  const counts = {
    vi: (text.match(patterns.vi) || []).length,
    zh: (text.match(patterns.zh) || []).length,
    ja: (text.match(patterns.ja) || []).length,
    ko: (text.match(patterns.ko) || []).length,
  };

  const maxLang = Object.entries(counts).reduce(
    (max, [lang, count]) => {
      return count > max.count ? { lang, count } : max;
    },
    { lang: "vi", count: 0 }
  );

  if (maxLang.count === 0 && /^[\x00-\x7F]*$/.test(text)) {
    return "vi";
  }

  return maxLang.count > 0 ? maxLang.lang : "vi";
}

function splitByLanguage(text) {
  const words = text.split(" ");
  const parts = [];
  let currentPart = {
    text: words[0],
    lang: detectLanguage(words[0]),
  };

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const lang = detectLanguage(word);

    if (lang === currentPart.lang) {
      currentPart.text += " " + word;
    } else {
      parts.push(currentPart);
      currentPart = {
        text: word,
        lang: lang,
      };
    }
  }
  parts.push(currentPart);
  return parts;
}

async function concatenateAudios(audioPaths) {
  const outputPath = path.join(tempDir, `combined_${Date.now()}.aac`);

  const ffmpegCommand = [
    "ffmpeg",
    "-y",
    ...audioPaths.map((path) => ["-i", path]).flat(),
    "-filter_complex",
    `concat=n=${audioPaths.length}:v=0:a=1[out]`,
    "-map",
    "[out]",
    "-c:a",
    "aac",
    "-q:a",
    "2",
    outputPath,
  ].join(" ");

  await execAsync(ffmpegCommand);
  return outputPath;
}

async function multilingualTextToSpeechAAC(text, api, message) {
  let finalAudioPath = null;
  const audioFiles = [];
  try {
    const parts = splitByLanguage(text);

    for (const part of parts) {
      const fileName = `voice_${Date.now()}_${part.lang}.aac`;
      const filePath = path.join(tempDir, fileName);

      const tts = new gtts(part.text, part.lang);
      await new Promise((resolve, reject) => {
        tts.save(filePath, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      audioFiles.push(filePath);
    }

    finalAudioPath = await concatenateAudios(audioFiles);
    const voiceUrl = await uploadAudioFile(finalAudioPath, api, message);

    return voiceUrl;
  } catch (error) {
    console.error("Lỗi khi xử lý audio đa ngôn ngữ:", error);
    throw error;
  } finally {
    audioFiles.forEach(async (file) => {
      await deleteFile(file);
    });
    await deleteFile(finalAudioPath);
  }
}

export async function handleVoiceCommand(api, message, command) {
  try {
    const prefix = getGlobalPrefix();
    const content = removeMention(message);
    const text = content.slice(prefix.length + command.length).trim();

    if (!text) {
      await api.sendMessage(
        {
          msg: `Vui lòng nhập nội dung cần chuyển thành giọng nói.\nVí dụ:\n${prefix}${command} Xin chào, tôi khỏe.`,
          quote: message,
          ttl: 600000,
        },
        message.threadId,
        message.type
      );
      return;
    }

    const wordLimit = 100;
    const wordCount = text.split(/\s+/).length;
    if (wordCount > wordLimit) {
      await api.sendMessage(
        {
          msg: `Giới hạn tối đa là ${wordLimit} từ. Bạn đã nhập ${wordCount} từ.`,
          quote: message,
          ttl: 600000,
        },
        message.threadId,
        message.type
      );
      return;
    }

    const voiceUrl = await multilingualTextToSpeechAAC(text, api, message);

    if (!voiceUrl) {
      throw new Error("Không thể tạo file âm thanh");
    }

    await api.sendVoice(message, voiceUrl, 600000);

  } catch (error) {
    console.error("Lỗi xử lý voice command:", error.message);
    await api.sendMessage(
      {
        msg: "Đã xảy ra lỗi khi chuyển văn bản thành giọng nói. Vui lòng thử lại sau.",
        quote: message,
        ttl: 600000,
      },
      message.threadId,
      message.type
    );
  }
}

export async function handleStoryCommand(api, message) {
  try {
    const storyFilePath = path.join(__dirname, "z_truyencuoi.txt");
    const stories = fs
      .readFileSync(storyFilePath, "utf8")
      .split("\n")
      .filter((line) => line.trim());

    let randomStory = stories[Math.floor(Math.random() * stories.length)];

    if (!randomStory) {
      throw new Error("Không tìm thấy truyện cười");
    }

    randomStory = randomStory.replaceAll("\\n", "\n");
    const voiceUrl = await textToSpeechAAC(randomStory, api, message);

    if (!voiceUrl) {
      throw new Error("Không thể tạo file âm thanh");
    }

    await Promise.all([
      api.sendVoice(message, voiceUrl, 600000),
      api.sendMessage(
        {
          msg: randomStory,
          quote: message,
          ttl: 600000,
        },
        message.threadId,
        message.type
      ),
    ]);
  } catch (error) {
    console.error("Lỗi khi xử lý lệnh story:", error);
    await api.sendMessage(
      {
        msg: "Đã xảy ra lỗi khi đọc truyện cười. Vui lòng thử lại sau.",
        quote: message,
        ttl: 600000,
      },
      message.threadId,
      message.type
    );
  }
}

export async function handleTarrotCommand(api, message) {
  try {
    const tarotFilePath = path.join(__dirname, "z_tarot.txt");
    const tarots = fs
      .readFileSync(tarotFilePath, "utf8")
      .split("\n")
      .filter((line) => line.trim());

    let randomTarot = tarots[Math.floor(Math.random() * tarots.length)];

    if (!randomTarot) {
      throw new Error("Không tìm thấy Tarot");
    }

    const tarotText = randomTarot
      .replaceAll("\\n", "\n")
      .replaceAll("♠", "Bích")
      .replaceAll("♥", "Cơ")
      .replaceAll("♣", "Chuồn")
      .replaceAll("♦", "Rô");
    const voiceUrl = await textToSpeechAAC(tarotText, api, message);

    await Promise.all([
      api.sendMessage(
        { msg: randomTarot, quote: message, ttl: 600000 },
        message.threadId,
        message.type
      ),
      api.sendVoice(message, voiceUrl, 600000),
    ]);
  } catch (error) {
    console.error("Lỗi khi xử lý lệnh Tarot:", error);
    await api.sendMessage(
      {
        msg: "Đã xảy ra lỗi khi đọc Tarot. Vui lòng thử lại sau.",
        quote: message,
        ttl: 600000,
      },
      message.threadId,
      message.type
    );
  }
}

export async function sendVoiceMusic(api, message, object, ttl) {
  let thumbnailPath = path.resolve(tempDir, `${Date.now()}.jpg`);
  let imagePath = null;
  try {
    if (message?.data?.uidFrom) {
      let senderId = message.data.uidFrom;
      const userInfo = await getUserInfoData(api, senderId);
      object.userAvatar = userInfo.avatar;
    }
  } catch (error) {
    console.error("Lỗi khi lấy thông tin người dùng:", error);
  }

  try {
    const voiceUrl = object.voiceUrl;
    if (object.imageUrl) {
      await downloadFile(object.imageUrl, thumbnailPath);
      try {
        object.thumbnailPath = thumbnailPath;
        imagePath = await createMusicCard(object);
      } catch (error) {
        console.error("Lỗi khi tạo music card:", error);
        imagePath = null;
      }
    }

    await sendMessageCompleteRequest(api, message, object, 180000);
    if (imagePath) {
      await api.sendMessage(
        {
          msg: ``,
          attachments: [imagePath],
          ttl: ttl,
        },
        message.threadId,
        message.type
      );
    }

    await api.sendVoice(message, voiceUrl, ttl);
  } catch (error) {
    console.error("Lỗi khi gửi voice music:", error);
  } finally {
    await deleteFile(thumbnailPath);
    if (imagePath && imagePath !== thumbnailPath) await deleteFile(imagePath);
  }
}

export async function sendVoiceMusicNotQuote(api, message, object, ttl) {
  let thumbnailPath = path.resolve(tempDir, `${Date.now()}.jpg`);
  let imagePath = null;
  try {
    const voiceUrl = object.voiceUrl;
    if (object.imageUrl) {
      await downloadFile(object.imageUrl, thumbnailPath);
      try {
        object.thumbnailPath = thumbnailPath;
        imagePath = await createMusicCard(object);
      } catch (error) {
        console.error("Lỗi khi tạo music card:", error);
        imagePath = null;
      }
    }

    const result = {
      message: object.caption,
      success: true,
    };

    await sendMessageImageNotQuote(api, result, message.threadId, imagePath, ttl, false);

    await api.sendVoice(message, voiceUrl, ttl);
  } catch (error) {
    console.error("Lỗi khi gửi voice music:", error);
  } finally {
    await deleteFile(thumbnailPath);
    if (imagePath && imagePath !== thumbnailPath) await deleteFile(imagePath);
  }
}

export async function sendImageNPH(api, message, object, ttl) {
  try {
    await sendMessageCompleteRequest(api, message, object, 180000);
    const imageUrl = object.imageUrl;
    if (imageUrl) {
      await api.sendImage(imageUrl, message, object.caption || "", ttl || 5000000);
    }
  } catch (error) {
    console.error("Lỗi khi gửi ảnh:", error.message);
  }
}

export async function sendVideoNPH(api, message, object, ttl) {
  try {
    try {
      if (message?.data?.uidFrom) {
        let senderId = message.data.uidFrom;
        const userInfo = await getUserInfoData(api, senderId);
        object.userAvatar = userInfo.avatar;
      }
    } catch (error) {
      console.error("Lỗi khi lấy thông tin người dùng:", error);
    }
    await sendMessageCompleteRequest(api, message, object, 180000);
    const videoUrl = object.videoUrl;
    if (videoUrl) {
      await api.sendVideo({
        videoUrl,
        threadId: message.threadId,
        threadType: message.type,
        message: {
          text: object.caption || "",
          mentions: [
            {
              uid: message.data?.uidFrom || "",
              pos: 0,
              len: (message.data?.dName || "").length,
            },
          ],
        },
        ttl: ttl,
      });
    }
  } catch (error) {
    console.error("Lỗi khi gửi video NPH:", error);
  }
}

export async function sendGifNPH(api, message, object, ttl) {
  try {
    try {
      if (message?.data?.uidFrom) {
        let senderId = message.data.uidFrom;
        const userInfo = await getUserInfoData(api, senderId);
        object.userAvatar = userInfo.avatar;
      }
    } catch (error) {
      console.error("Lỗi khi lấy thông tin người dùng:", error);
    }
    await sendMessageCompleteRequest(api, message, object, 180000);
    const gifUrl = object.gifUrl;
    if (gifUrl) {
      try {
        await api.sendGif(gifUrl, message, "NPH", ttl || 0);
      } catch (error) {
        console.error(`Lỗi trong quá trình xử lý: ${error.message}`);
        await api.sendMessage(
          {
            msg: "Đã xảy ra lỗi khi gửi GIF. Vui lòng thử lại sau.",
            quote: message,
          },
          message.threadId,
          message.type
        );
      }
    }
  } catch (error) {
    console.error("Lỗi khi gửi GIF NPH:", error);
  }
}

export async function handleGetVoiceCommand(api, message, aliasCommand) {
  const quote = message.data.quote;
  const prefix = getGlobalPrefix();

  if (!quote) {
    await sendMessageStateQuote(api, message, `Vui lòng reply một video hoặc voice`, false, 30000);
    return;
  }

  const cliMsgType = quote.cliMsgType;

  if (cliMsgType === 31) {
    const attachData = quote.attach ? JSON.parse(quote.attach) : null;
    if (attachData?.href) {
      await api.sendVoice(message, attachData.href, 1800000);
    } else {
      await sendMessageFromSQL(
        api,
        message,
        {
          success: false,
          message: `Không tìm thấy link voice`,
        },
        false,
        30000
      );
    }
    return;
  }

  if (cliMsgType === 44) {
    try {
      const attachData = quote.attach ? JSON.parse(quote.attach) : null;
      if (!attachData?.href) {
        await sendMessageFromSQL(
          api,
          message,
          {
            success: false,
            message: `Không tìm thấy link video`,
          },
          false,
          30000
        );
        return;
      }

      const voiceUrl = await extractAudioFromVideo(attachData.href, api, message);
      await sendVoiceMusic(api, message, { voiceUrl, caption: "Voice Của Cậu đây !!!" }, 1800000);
    } catch (error) {
      console.error("Lỗi khi tách âm thanh:", error);
      await sendMessageFromSQL(
        api,
        message,
        {
          success: false,
          message: `Đã xảy ra lỗi khi get voice, vui lòng thử lại với link khác.`,
        },
        false,
        30000
      );
    }
    return;
  }

  await sendMessageFromSQL(
    api,
    message,
    {
      success: false,
      message: `Chỉ hỗ trợ get voice cho video hoặc voice`,
    },
    false,
    30000
  );
}
