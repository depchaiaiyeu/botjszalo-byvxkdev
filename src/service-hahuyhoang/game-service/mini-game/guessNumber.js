import { getGlobalPrefix } from "../../service.js";
import { sendMessageComplete, sendMessageWarning } from "../../chat-zalo/chat-style/chat-style.js";

const gameTargetNumbers = new Map();
const gamePlayers = new Map();
const gameSettings = new Map();
const playerTimeouts = new Map();
const processedGuesses = new Map();

export async function handleGuessNumberCommand(api, message) {
  const threadId = message.threadId;
  const args = message.data.content.split(" ");
  const prefix = getGlobalPrefix();
  const senderId = message.data.uidFrom;

  if (args[0]?.toLowerCase() === `${prefix}doanso` && !args[1]) {
    await sendMessageComplete(api, message, `Hướng dẫn game đoán số. 🎲\n${prefix}doanso join -> Tham gia trò chơi đoán số với Bot (phạm vi mặc định 1-20).\n${prefix}doanso join [số_lớn_nhất] -> Tham gia trò chơi với phạm vi tùy chỉnh.\n${prefix}doanso leave -> Rời khỏi trò chơi đoán số.`);
    return;
  }

  if (args[1]?.toLowerCase() === "leave") {
    if (gameTargetNumbers.has(threadId)) {
      const players = gamePlayers.get(threadId);
      if (players && players.has(senderId)) {
        players.delete(senderId);
        
        const timeoutKey = `${threadId}-${senderId}`;
        if (playerTimeouts.has(timeoutKey)) {
          clearTimeout(playerTimeouts.get(timeoutKey));
          playerTimeouts.delete(timeoutKey);
        }
        
        if (players.size === 0) {
          cleanupGame(threadId);
          await sendMessageComplete(api, message, "🚫 Trò chơi đoán số đã được hủy bỏ do không còn người chơi.");
        } else {
          await sendMessageComplete(api, message, "🚫 Bạn đã rời khỏi trò chơi đoán số.");
        }
      } else {
        await sendMessageWarning(api, message, "🚫 Bạn chưa tham gia trò chơi đoán số nào trong nhóm này.");
      }
    } else {
      await sendMessageWarning(api, message, "🚫 Không có trò chơi đoán số nào đang diễn ra để rời khỏi.");
    }
    return;
  }

  if (args[1]?.toLowerCase() === "join") {
    let range = 20;
    if (args.length > 2) {
      const customRange = parseInt(args[2]);
      if (!isNaN(customRange) && customRange >= 2) {
        range = customRange;
      } else {
        await sendMessageWarning(api, message, "🚫 Số lớn nhất phải là một số nguyên lớn hơn hoặc bằng 2. Sử dụng phạm vi mặc định 1-20.");
      }
    }

    const isActive = gameTargetNumbers.has(threadId);
    const players = gamePlayers.get(threadId);

    if (isActive) {
      if (players && players.has(senderId)) {
        await sendMessageWarning(api, message, "🚫 Bạn đã tham gia trò chơi đoán số rồi.");
      } else {
        if (players) {
          players.set(senderId, { attempts: 0, lastGuess: null });
          startPlayerTimeout(api, message, threadId, senderId);
          await sendMessageComplete(api, message, "✅ Bạn đã tham gia trò chơi đoán số.");
        }
      }
      return;
    }

    const targetNumber = Math.floor(Math.random() * range) + 1;
    const maxAttemptsPerPlayer = 5;

    gameTargetNumbers.set(threadId, targetNumber);
    gamePlayers.set(threadId, new Map([[senderId, { attempts: 0, lastGuess: null }]]));
    gameSettings.set(threadId, { range, maxAttemptsPerPlayer });

    startPlayerTimeout(api, message, threadId, senderId);

    await sendMessageComplete(api, message, `🎮 Trò chơi đoán số bắt đầu! Hãy đoán một số từ 1 đến ${range}. Bạn có tối đa ${maxAttemptsPerPlayer} lượt đoán sai.\nThời gian mỗi lượt: 30 giây.`);
    return;
  }
}

export async function handleGuessNumberGame(api, message) {
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;

  if (!gameTargetNumbers.has(threadId)) return;

  const targetNumber = gameTargetNumbers.get(threadId);
  const players = gamePlayers.get(threadId);
  const settings = gameSettings.get(threadId);

  if (!players || !settings || targetNumber === undefined) return;

  if (!players.has(senderId)) return;

  const guessedNumber = parseInt(message.data.content);

  if (isNaN(guessedNumber) || guessedNumber < 1 || guessedNumber > settings.range) return;

  const playerData = players.get(senderId);
  
  const guessKey = `${threadId}-${senderId}-${guessedNumber}`;
  const now = Date.now();
  
  if (processedGuesses.has(guessKey)) {
    const lastTime = processedGuesses.get(guessKey);
    if (now - lastTime < 2000) {
      return;
    }
  }
  
  processedGuesses.set(guessKey, now);
  
  setTimeout(() => {
    processedGuesses.delete(guessKey);
  }, 3000);

  const timeoutKey = `${threadId}-${senderId}`;
  if (playerTimeouts.has(timeoutKey)) {
    clearTimeout(playerTimeouts.get(timeoutKey));
    playerTimeouts.delete(timeoutKey);
  }

  const currentAttempts = playerData.attempts;

  if (guessedNumber === targetNumber) {
    await handleCorrectGuess(api, message, threadId, targetNumber, senderId, currentAttempts);
    return;
  }

  playerData.attempts = currentAttempts + 1;
  playerData.lastGuess = guessedNumber;
  
  const newAttempts = playerData.attempts;
  const remainingAttempts = settings.maxAttemptsPerPlayer - newAttempts;

  if (newAttempts >= settings.maxAttemptsPerPlayer) {
    await handlePlayerEliminated(api, message, threadId, targetNumber, senderId);
    
    const remainingPlayers = gamePlayers.get(threadId);
    if (remainingPlayers && remainingPlayers.size === 0) {
      await handleGameOver(api, message, threadId, targetNumber, true);
    }
  } else {
    if (guessedNumber < targetNumber) {
      await sendMessageWarning(api, message, `🚫 Số bạn đoán nhỏ hơn. Hãy thử lại! (Bạn còn ${remainingAttempts} lượt sai)`);
    } else {
      await sendMessageWarning(api, message, `🚫 Số bạn đoán lớn hơn. Hãy thử lại! (Bạn còn ${remainingAttempts} lượt sai)`);
    }

    startPlayerTimeout(api, message, threadId, senderId);
  }
}

function startPlayerTimeout(api, message, threadId, senderId) {
  const timeoutKey = `${threadId}-${senderId}`;
  
  if (playerTimeouts.has(timeoutKey)) {
    clearTimeout(playerTimeouts.get(timeoutKey));
  }

  const timeout = setTimeout(async () => {
    const players = gamePlayers.get(threadId);
    const targetNumber = gameTargetNumbers.get(threadId);
    
    if (players && players.has(senderId) && targetNumber !== undefined) {
      await sendMessageComplete(api, message, `🧭 ${message.data.dName} đã hết thời gian chờ (60s). Bạn đã bị loại khỏi trò chơi.`);
      
      players.delete(senderId);
      playerTimeouts.delete(timeoutKey);
      
      if (players.size === 0) {
        await handleGameOver(api, message, threadId, targetNumber, true);
      }
    }
  }, 60000);

  playerTimeouts.set(timeoutKey, timeout);
}

async function handleCorrectGuess(api, message, threadId, targetNumber, senderId, attempts) {
  await sendMessageComplete(api, message, `🎉 Chúc mừng ${message.data.dName}! Bạn đã đoán đúng số ${targetNumber} sau ${attempts + 1} lần thử.`);
  cleanupGame(threadId);
}

async function handlePlayerEliminated(api, message, threadId, targetNumber, senderId) {
  const timeoutKey = `${threadId}-${senderId}`;
  if (playerTimeouts.has(timeoutKey)) {
    clearTimeout(playerTimeouts.get(timeoutKey));
    playerTimeouts.delete(timeoutKey);
  }

  await sendMessageComplete(api, message, `🚫 ${message.data.dName} đã thua! Bạn đã hết lượt đoán sai. Số cần đoán là ${targetNumber}.`);
  
  const players = gamePlayers.get(threadId);
  if (players) {
    players.delete(senderId);
  }
}

async function handleGameOver(api, message, threadId, targetNumber, allPlayersEliminated = false) {
  if (allPlayersEliminated) {
    await sendMessageComplete(api, message, `🏁 Trò chơi kết thúc! Không còn người chơi nào. Số cần đoán là ${targetNumber}.`);
  } else {
    await sendMessageComplete(api, message, `🏁 Trò chơi kết thúc! Số cần đoán là ${targetNumber}.`);
  }
  cleanupGame(threadId);
}

function cleanupGame(threadId) {
  const players = gamePlayers.get(threadId);
  if (players) {
    for (const [playerId] of players) {
      const timeoutKey = `${threadId}-${playerId}`;
      if (playerTimeouts.has(timeoutKey)) {
        clearTimeout(playerTimeouts.get(timeoutKey));
        playerTimeouts.delete(timeoutKey);
      }
    }
  }

  gameTargetNumbers.delete(threadId);
  gamePlayers.delete(threadId);
  gameSettings.delete(threadId);
}
