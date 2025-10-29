import { isAdmin } from "../../../index.js";
import { sendMessageFromSQL } from "../../chat-zalo/chat-style/chat-style.js";
import { handleGuessNumberCommand, handleGuessNumberGame } from "./guessNumber.js";
import { handleWordChainCommand, handleWordChainMessage } from "./wordChain.js";
import { handleVuaTiengVietCommand, handleVuaTiengVietMessage } from "./vuaTiengViet.js";
import { handleFishingCommand, handleFishingMessage } from "./fishing.js";
import { handleCaroCommand, handleCaroMessage } from "./caro.js";
import { getGlobalPrefix } from "../../service.js";

export async function handleChatWithGame(api, message, isCallGame, groupSettings) {
  if (isCallGame) return;
  const threadId = message.threadId;
  const gameEnabled = groupSettings[threadId].activeGame;
  if (gameEnabled === false) return;
  
  let content = message.data.content;
  const senderId = message.data.uidFrom;
  
  if (typeof content === "string") {
    content = content.trim();
    await handleGuessNumberGame(api, message);
    await handleWordChainMessage(api, message);
    await handleVuaTiengVietMessage(api, message);
    await handleFishingMessage(api, message);
    await handleCaroMessage(api, message);
  }
}

export async function startGame(api, message, groupSettings, gameType, args, isAdminBox) {
  const senderId = message.data.uidFrom;
  const threadId = message.threadId;
  const prefix = getGlobalPrefix();
  const gameEnabled = groupSettings[threadId].activeGame;
  
  if (gameEnabled === false) {
    if (isAdmin(senderId, threadId)) {
      const text =
        `Trò chơi hiện tại Không được bật trong nhóm này.\n\n` +
        `Quản trị viên hãy dùng lệnh ${prefix}gameactive để bật tương tác game cho nhóm!`;
      const result = {
        success: false,
        message: text,
      };
      await sendMessageFromSQL(api, message, result, true, 30000);
    }
    return;
  }
  
  switch (gameType) {
    case "guessNumber":
      await handleGuessNumberCommand(api, message);
      break;
    case "wordChain":
      await handleWordChainCommand(api, message, args);
      break;
    case "vuaTiengViet":
      await handleVuaTiengVietCommand(api, message, threadId, args);
      break;
    case "cauca":
      await handleFishingCommand(api, message);
      break;
    case "caro":
      await handleCaroCommand(api, message);
      break;
  }
}
