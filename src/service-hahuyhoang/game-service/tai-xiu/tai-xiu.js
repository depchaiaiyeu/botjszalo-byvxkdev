import fs from "fs/promises";
import path from "path";
import chalk from "chalk";
import { MultiMsgStyle, MessageStyle, MessageType } from "../../../api-zalo/index.js";
import { isAdmin } from "../../../index.js";
import {
  updatePlayerBalance,
  getPlayerBalance,
  setLoserGame,
  setLoserGameByUsername,
  getUsernameByIdZalo,
  updatePlayerBalanceByUsername,
} from "../../../database/player.js";
import {
  sendMessageFromSQL,
  sendMessageFromSQLImage,
  COLOR_RED,
  SIZE_18,
  sendMessageImageNotQuote,
  IS_BOLD,
} from "../../chat-zalo/chat-style/chat-style.js";
import { nameServer } from "../../../database/index.js";
import { createTaiXiuResultImage, createWaitingImage, clearImagePath, createSoiCauImage } from "../../../utils/canvas/index.js";
import schedule from "node-schedule";
import { normalizeSymbolName, parseGameAmount, formatCurrency, formatSeconds } from "../../../utils/format-util.js";
import { getGlobalPrefix } from "../../service.js";
import Big from "big.js";
import { checkBeforeJoinGame } from "../index.js";
import { gameState } from "../game-manager.js";

let currentSession = null;
let activeThreads = new Set();

const DEFAULT_INTERVAL = 60;
const MAX_INTERVAL = 3600;
const TIME_SEND_UPDATE = 10000;
const TTL_IMAGE = 10800000;

const WIN_PERCENT = 1000;

let gameJob;
let isEndingGame = false;

let forcedResult = null;

const MAX_HISTORY = 20;
let gameHistory = [];

let jackpot = new Big(1000000);

function saveGameData() {
  gameState.changes.taixiu = true;
}

function getRandomResult() {
  if (forcedResult) {
    const result = forcedResult;
    forcedResult = null;
    return result;
  }

  const dice1 = Math.floor(Math.random() * 6) + 1;
  const dice2 = Math.floor(Math.random() * 6) + 1;
  const dice3 = Math.floor(Math.random() * 6) + 1;
  const total = dice1 + dice2 + dice3;
  return {
    dice: [dice1, dice2, dice3],
    total,
    result: total > 10 ? "tai" : "xiu",
  };
}

export async function initializeGameTaiXiu(api) {
  if (!gameState.data.taixiu) gameState.data.taixiu = {};
  if (!gameState.data.taixiu.activeThreads) gameState.data.taixiu.activeThreads = [];
  if (!gameState.data.taixiu.history) gameState.data.taixiu.history = [];
  if (!gameState.data.taixiu.jackpot) gameState.data.taixiu.jackpot = "1000000";
  gameState.data.taixiu.jackpot = new Big(gameState.data.taixiu.jackpot);

  activeThreads = new Set(gameState.data.taixiu.activeThreads);

  gameHistory = gameState.data.taixiu.history || [];
  jackpot = new Big(gameState.data.taixiu.jackpot || "1000000");

  currentSession = {
    players: {},
    startTime: Date.now(),
    endTime: Date.now() + MAX_INTERVAL * 1000,
    interval: MAX_INTERVAL,
  };

  if (gameState.data.taixiu && gameState.data.taixiu.players) {
    currentSession.players = gameState.data.taixiu.players;

    if (Object.keys(currentSession.players).length > 0) {
      currentSession.interval = DEFAULT_INTERVAL;
      currentSession.endTime = Date.now() + DEFAULT_INTERVAL * 1000;
    }
  }

  gameJob = schedule.scheduleJob("* * * * * *", () => runGameLoop(api));
  console.log(chalk.magentaBright("Khởi động và nạp dữ liệu minigame tài xỉu hoàn tất"));
}

async function runGameLoop(api) {
  if (!currentSession || isEndingGame) return;

  try {
    const currentTime = Date.now();
    const remainingTime = Math.max(0, currentSession.endTime - currentTime);
    const remainingSeconds = Math.ceil(remainingTime / 1000);

    if (remainingSeconds === 0 && !isEndingGame) {
      isEndingGame = true;
      await endGame(api);
      isEndingGame = false;
    } else if (remainingSeconds % (TIME_SEND_UPDATE / 1000) === 0 && Object.keys(currentSession.players).length > 0) {
      await sendGameUpdate(api, remainingSeconds);
    }
  } catch (error) {
    console.error("Lỗi khi update tài xỉu:", error);
  }
}

async function endGame(api) {
  const result = getRandomResult();

  const newResult = {
    dice: result.dice,
    total: result.total,
    result: result.result,
    timestamp: Date.now(),
  };

  gameHistory.unshift(newResult);

  if (gameHistory.length > MAX_HISTORY) {
    gameHistory = gameHistory.slice(0, MAX_HISTORY);
  }

  const nameType = result.result === "tai" ? "Tài" : "Xỉu";

  let resultText = `${nameServer}\nKết quả: ${result.dice.join(" - ")}\nTổng: ${result.total} - ${nameType.toUpperCase()}\n\n`;
  let mentions = [];
  let mentionPos = resultText.length;

  let taiTotal = 0;
  let xiuTotal = 0;
  let totalLoss = new Big(0);

  const threadPlayers = {};

  let jackpotWinners = [];
  let totalJackpotBet = new Big(0);
  let totalJackpotPaid = new Big(0);

  if (Object.keys(currentSession.players).length > 0) {
    for (const [playerId, bet] of Object.entries(currentSession.players)) {
      const isWin = bet.betType === result.result;
      const playerChoice = bet.betType === "tai" ? "Tài" : "Xỉu";
      const isJackpot = checkJackpot(result.dice, bet.betType);
      const betAmount = new Big(bet.amount);
      const winAmount = isWin ? betAmount : betAmount.neg();

      if (isWin) {
        if (isJackpot) {
          jackpotWinners.push({
            playerId,
            bet: betAmount,
            ...bet,
          });
          totalJackpotBet = totalJackpotBet.plus(betAmount);
        }
        await updatePlayerBalanceByUsername(bet.username, betAmount.mul(2).toNumber(), isWin, winAmount.toNumber());
      } else {
        await setLoserGameByUsername(bet.username, betAmount.neg().toNumber());
        totalLoss = totalLoss.plus(betAmount);
        jackpot = jackpot.plus(betAmount.mul(0.6));
      }

      resultText += `@${bet.playerName}: [${playerChoice}] ${isWin ? "Thắng" : "Thua"} ${winAmount
        .abs()
        .toNumber()
        .toLocaleString("vi-VN")} VNĐ\n`;

      mentions.push({
        len: bet.playerName.length + 1,
        uid: playerId,
        pos: mentionPos,
      });

      mentionPos = resultText.length;

      if (bet.betType === "tai") {
        taiTotal += bet.amount;
      } else {
        xiuTotal += bet.amount;
      }

      if (!threadPlayers[bet.threadId]) {
        threadPlayers[bet.threadId] = [];
      }
      threadPlayers[bet.threadId].push(playerId);
    }

    if (jackpotWinners.length > 0) {
      let jackpotMessage = "\n🎉 NỔ HŨ 🎉\n";

      for (const winner of jackpotWinners) {
        let maxJackpotWin = winner.bet.mul(WIN_PERCENT);
        let jackpotShare = jackpot.div(jackpotWinners.length);

        jackpotShare = jackpotShare.gt(maxJackpotWin) ? maxJackpotWin : jackpotShare;

        totalJackpotPaid = totalJackpotPaid.plus(jackpotShare);

        await updatePlayerBalanceByUsername(winner.username, jackpotShare.toNumber(), true);

        jackpotMessage += `@${winner.playerName}: Nhận ${formatCurrency(jackpotShare)} VNĐ từ hũ\n`;
        mentions.push({
          len: winner.playerName.length + 1,
          uid: winner.playerId,
          pos: resultText.length + jackpotMessage.indexOf(`@${winner.playerName}`),
        });
      }

      jackpot = jackpot.minus(totalJackpotPaid);

      if (jackpot.lt(1000000)) {
        jackpot = new Big(1000000);
      }

      resultText += jackpotMessage;
    }
  } else {
    resultText += "Không có người chơi trong phiên này.\n";
  }

  resultText += `\nTiền hũ hiện tại: ${formatCurrency(jackpot)} VNĐ 💰`;

  gameState.data.taixiu.history = gameHistory;
  gameState.data.taixiu.jackpot = jackpot.toString();
  saveGameData();

  const style = MultiMsgStyle([MessageStyle(0, nameServer.length, COLOR_RED, SIZE_18, IS_BOLD)]);

  const resultImagePath = await createTaiXiuResultImage(
    result,
    taiTotal,
    xiuTotal,
    jackpotWinners.length > 0
      ? {
          isJackpot: true,
          jackpotAmount: totalJackpotPaid.toNumber(),
        }
      : null
  );

  for (const threadId of activeThreads) {
    if (threadPlayers[threadId] && threadPlayers[threadId].length > 0) {
      const threadMentions = mentions.filter((mention) => threadPlayers[threadId].includes(mention.uid));

      await api.sendMessage(
        {
          msg: resultText,
          mentions: threadMentions,
          style: style,
          attachments: [resultImagePath],
          isUseProphylactic: true,
          ttl: TTL_IMAGE,
        },
        threadId,
        MessageType.GroupMessage
      );
    }
  }

  await clearImagePath(resultImagePath);

  gameState.data.taixiu.players = {};
  saveGameData();

  currentSession = {
    players: {},
    startTime: Date.now(),
    endTime: Date.now() + MAX_INTERVAL * 1000,
    interval: MAX_INTERVAL,
  };

  if (gameJob) {
    gameJob.cancel();
  }
  gameJob = schedule.scheduleJob("* * * * * *", () => runGameLoop(api));
}

async function sendGameUpdate(api, remainingSeconds) {
  let taiTotal = 0;
  let xiuTotal = 0;
  let playerInfo = "";
  let activeThreadsWithPlayers = new Set();

  for (const [playerId, player] of Object.entries(currentSession.players)) {
    const playerBet = new Big(player.amount);
    if (player.betType === "tai") {
      taiTotal = new Big(taiTotal).plus(playerBet).toNumber();
    } else {
      xiuTotal = new Big(xiuTotal).plus(playerBet).toNumber();
    }

    const betTypeText = player.betType === "tai" ? "Tài" : "Xỉu";
    playerInfo += `${player.playerName}: đặt ${betTypeText} ${playerBet.toNumber().toLocaleString("vi-VN")} VNĐ\n`;

    activeThreadsWithPlayers.add(player.threadId);
  }

  const result = {
    success: true,
    message:
      "[  Tài Xỉu  ]" +
      "\nThời gian còn lại: " +
      formatSeconds(remainingSeconds) +
      "\n💰 Tiền hũ: " +
      formatCurrency(jackpot) +
      " VNĐ" +
      "\n💎 Nổ hũ khi > Tài: Ra 3 số 6 - Xỉu: Ra 3 số 1" +
      "\nTổng số người chơi: " +
      Object.keys(currentSession.players).length +
      "\n\nThông tin đặt cược:\n" +
      (playerInfo === "" ? "Chưa có ai đặt cược" : playerInfo),
  };

  const waitingImagePath = await createWaitingImage(remainingSeconds, taiTotal, xiuTotal);

  let timelive = Math.ceil(remainingSeconds % 10) * 1000 - 1000;
  if (timelive <= 0) timelive = TIME_SEND_UPDATE;

  for (const threadId of activeThreadsWithPlayers) {
    if (activeThreads.has(threadId)) {
      await sendMessageImageNotQuote(api, result, threadId, waitingImagePath, timelive, true);
    }
  }

  await clearImagePath(waitingImagePath);
}

async function placeBet(api, message, threadId, senderId, betType, amount, groupSettings) {
  if (!groupSettings || !groupSettings[threadId] || !groupSettings[threadId].activeGame || !groupSettings[threadId].activeGame.taixiu) {
    await sendMessageFromSQL(
      api,
      message,
      {
        success: false,
        message: "Trò chơi Tài Xỉu không được kích hoạt trong nhóm này.",
      },
      true,
      30000
    );
    return;
  }

  const username = await getUsernameByIdZalo(senderId);
  if (!username) {
    await sendMessageFromSQL(
      api,
      message,
      {
        success: false,
        message: "Bạn cần đăng nhập để tham gia trò chơi.",
      },
      true,
      30000
    );
    return;
  }

  if (!currentSession) {
    const result = {
      success: false,
      message: "Trò chơi Tài Xỉu chưa bắt đầu.",
    };
    await sendMessageFromSQL(api, message, result, true, 30000);
    return;
  }

  if (currentSession.players[senderId]) {
    const result = {
      success: false,
      message: "Bạn đã đặt cược cho phiên này rồi.",
    };
    await sendMessageFromSQL(api, message, result, true, 30000);
    return;
  }

  const balanceResult = await getPlayerBalance(senderId);
  if (!balanceResult.success) {
    const result = {
      success: false,
      message: "Không thể lấy thông tin số dư. Vui lòng thử lại sau\nNếu chưa đăng ký, chat game để xem hớng dẫn.",
    };
    await sendMessageFromSQL(api, message, result, true, 30000);
    return;
  }

  let betAmount;
  try {
    const parsedAmount = parseGameAmount(amount, balanceResult.balance);
    if (parsedAmount === "allin") {
      betAmount = new Big(balanceResult.balance);
    } else {
      betAmount = parsedAmount;
    }

    if (betAmount.lt(1000)) {
      const result = {
        success: false,
        message: "Số tiền cược tối thiểu là 1,000 VNĐ",
      };
      await sendMessageFromSQL(api, message, result, true, 30000);
      return;
    }
  } catch (error) {
    const result = {
      success: false,
      message: error.message,
    };
    await sendMessageFromSQL(api, message, result, true, 30000);
    return;
  }

  if (betAmount.gt(balanceResult.balance)) {
    const result = {
      success: false,
      message: `Số dư không đủ. Bạn chỉ có ${formatCurrency(new Big(balanceResult.balance))} VNĐ`,
    };
    await sendMessageFromSQL(api, message, result, true, 30000);
    return;
  }

  const playerName = message.data.dName || senderId;

  await updatePlayerBalanceByUsername(username, betAmount.neg());
  currentSession.players[senderId] = {
    betType,
    amount: betAmount.toNumber(),
    playerName,
    threadId,
    username,
  };

  if (!gameState.data.taixiu.players) gameState.data.taixiu.players = {};
  gameState.data.taixiu.players[senderId] = {
    betType,
    amount: betAmount.toNumber(),
    playerName,
    threadId,
    username,
  };
  saveGameData();
  const nameType = betType === "tai" ? "Tài" : "Xỉu";

  const result = {
    success: true,
    message: `${playerName} đã đặt cược ${betAmount.toNumber().toLocaleString("vi-VN")} VNĐ cho cửa ${nameType}.`,
  };

  await sendMessageFromSQL(api, message, result, true, 30000);

  if (Object.keys(currentSession.players).length === 1) {
    currentSession.interval = DEFAULT_INTERVAL;
    currentSession.endTime = Date.now() + DEFAULT_INTERVAL * 1000;
  }
}

async function toggleThreadParticipation(api, message, threadId, isStart, groupSettings) {
  if (!groupSettings[threadId]) groupSettings[threadId] = {};
  if (!groupSettings[threadId].activeGame) groupSettings[threadId].activeGame = {};

  const currentStatus = groupSettings[threadId].activeGame.taixiu;

  if (isStart) {
    if (!currentStatus) {
      groupSettings[threadId].activeGame.taixiu = true;
      activeThreads.add(threadId);
      gameState.data.taixiu.activeThreads = Array.from(activeThreads);
      saveGameData();
      await sendMessageFromSQL(api, message, {
        success: true,
        message: "Trò chơi Tài Xỉu đã được kích hoạt trong nhóm này.",
      });
    } else {
      await sendMessageFromSQL(api, message, {
        success: false,
        message: "Trò chơi Tài Xỉu đã được kích hoạt trước đó trong nhóm này.",
      });
    }
  } else {
    if (currentStatus) {
      groupSettings[threadId].activeGame.taixiu = false;
      activeThreads.delete(threadId);
      gameState.data.taixiu.activeThreads = Array.from(activeThreads);
      saveGameData();
      await sendMessageFromSQL(api, message, {
        success: true,
        message: "Trò chơi Tài Xỉu đã bị vô hiệu hóa trong nhóm này.",
      });
    } else {
      await sendMessageFromSQL(api, message, {
        success: false,
        message: "Trò chơi Tài Xỉu chưa được kích hoạt trong nhóm này.",
      });
    }
  }
}

export function setForcedResult(result) {
  if (result !== "tai" && result !== "xiu") {
    throw new Error("Kết quả không hợp lệ. Chỉ chấp nhận 'tai' hoặc 'xiu'.");
  }

  let dice;
  if (result === "tai") {
    dice = [Math.floor(Math.random() * 3) + 4, Math.floor(Math.random() * 3) + 4, Math.floor(Math.random() * 3) + 4];
  } else {
    dice = [Math.floor(Math.random() * 3) + 1, Math.floor(Math.random() * 3) + 1, Math.floor(Math.random() * 3) + 1];
  }

  const total = dice.reduce((sum, value) => sum + value, 0);

  forcedResult = {
    dice,
    total,
    result,
  };

  return forcedResult;
}

async function handleSoiCau(api, message, threadId) {
  if (gameHistory.length === 0) {
    if (gameState.data.taixiu.history && gameState.data.taixiu.history.length > 0) {
      gameHistory = gameState.data.taixiu.history;
    } else {
      await sendMessageFromSQL(api, message, {
        success: false,
        message: "Chưa có dữ liệu lịch sử để soi cầu.",
      });
      return;
    }
  }

  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  const imagePath = await createSoiCauImage(gameHistory);
  await sendMessageImageNotQuote(
    api,
    {
      success: true,
      message: `${senderName}: Thống kê kết quả ` + gameHistory.length + ` phiên gần nhất!`,
      mentions: [{ pos: 0, uid: senderId, len: senderName.length }],
    },
    threadId,
    imagePath,
    TTL_IMAGE,
    true
  );
  await clearImagePath(imagePath);
}

export async function handleTaiXiuCommand(api, message, groupSettings) {
  if (!(await checkBeforeJoinGame(api, message, groupSettings, true))) return;

  const senderId = message.data.uidFrom;
  const threadId = message.threadId;

  const content = message.data.content.trim().toLowerCase();
  const commandParts = content.split(" ");
  const prefix = getGlobalPrefix();

  if (commandParts[1] === "kq") {
    if (isAdmin(senderId)) {
      const result = commandParts[2] === "tai" ? "tai" : commandParts[2] === "xiu" ? "xiu" : null;
      if (result) {
        try {
          const detailedResult = setForcedResult(result);
          const detailedMessage = `Đã set kết quả tài xỉu cho phiên tiếp theo:
Kết quả: ${detailedResult.result === "tai" ? "Tài" : "Xỉu"}
Xúc xắc: ${detailedResult.dice.join(" - ")}
Tổng điểm: ${detailedResult.total}`;
          await api.sendMessage({ msg: detailedMessage }, threadId, MessageType.DirectMessage);
        } catch (error) {
          console.error("Lỗi khi set kết quả tài xỉu:", error.message);
          await api.sendMessage({ msg: `Có lỗi xảy ra khi set kết quả: ${error.message}` }, threadId, MessageType.DirectMessage);
        }
      } else {
        await api.sendMessage(
          { msg: "Lệnh không hợp lệ. Sử dụng '!tx kq tai' hoặc '!tx kq xiu'.", ttl: 30000 },
          threadId,
          MessageType.DirectMessage
        );
      }
    }
    return;
  }

  if (commandParts[1] === "soicau") {
    await handleSoiCau(api, message, threadId);
    return;
  }

  if (commandParts[1] === "start" || commandParts[1] === "close") {
    if (!isAdmin(senderId, threadId)) {
      const result = {
        success: false,
        message: "Bạn không có quyền sử dụng lệnh này.",
      };
      await sendMessageFromSQL(api, message, result, true, 30000);
      return;
    }

    await toggleThreadParticipation(api, message, threadId, content.endsWith("start"), groupSettings);
    return;
  }

  const betRegex = new RegExp(`^${prefix}(tx|taixiu)\\s*(tài|xỉu|tai|xiu)\\s*(.+)$`, "i");
  const betMatch = normalizeSymbolName(content).match(betRegex);

  if (betMatch) {
    const betType = normalizeSymbolName(betMatch[2]);
    const amount = betMatch[3].trim();

    await placeBet(api, message, threadId, senderId, betType, amount, groupSettings);
  } else {
    const result = {
      success: false,
      message:
        "Lệnh không hợp lệ. Sử dụng lệnh sau để tham gia trò chơi:\n" +
        "!tx [tài/xỉu] [số tiền/all/phần trăm/đơn vị]\n" +
        "hoặc !taixiu [tài/xỉu] [số tiền/all/phần trăm/đơn vị]\n" +
        "Ví dụ:\n" +
        "!tx tài 1000000|50k|1.5m|1b\n" +
        "!taixiu xỉu 50%|all|",
    };
    await sendMessageFromSQL(api, message, result, true, 30000);
  }
}

export function getJackpot() {
  return jackpot;
}

function checkJackpot(dice, betType) {
  if (dice[0] === dice[1] && dice[1] === dice[2]) {
    if (dice[0] === 1 && betType === "xiu") {
      return true;
    }
    if (dice[0] === 6 && betType === "tai") {
      return true;
    }
  }
  return false;
}
