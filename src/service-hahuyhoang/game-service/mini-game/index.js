import { isAdmin } from "../../../index.js";
import { sendMessageFromSQL } from "../../chat-zalo/chat-style/chat-style.js";
import { handleGuessNumberCommand, handleGuessNumberGame } from "./guessNumber.js";
import { handleWordChainCommand, handleWordChainMessage } from "./wordChain.js";
import { handleVuaTiengVietCommand, handleVuaTiengVietMessage } from "./vuaTiengViet.js";
import { handleFishingCommand, handleFishingMessage } from "./fishing.js";
import { handleCaroCommand, handleCaroMessage } from "./caro.js";
import { handleChessCommand, handleChessMessage } from "./chess.js";

export async function handleChatWithGame(api, message, isCallGame, groupSettings, groupAdmins) {
  if (isCallGame) return;
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  const gameEnabled = groupSettings[threadId]?.activeGame ?? false;
  const admin = isAdmin(senderId, threadId, groupAdmins);

  if (!admin && gameEnabled === false) return;

  const content = message.data.content;
  if (typeof content === "string") {
    await handleGuessNumberGame(api, message);
    await handleWordChainMessage(api, message);
    await handleVuaTiengVietMessage(api, message);
    await handleFishingMessage(api, message);
    await handleCaroMessage(api, message);
    await handleChessMessage(api, message);
  }
}

export async function startGame(api, message, groupSettings, gameType, args, groupAdmins) {
  const senderId = message.data.uidFrom;
  const threadId = message.threadId;
  const gameEnabled = groupSettings[threadId]?.activeGame ?? false;
  const admin = isAdmin(senderId, threadId, groupAdmins);

  if (!admin && gameEnabled === false) return;

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
    case "chess":
      await handleChessCommand(api, message);
      break;
  }
}
