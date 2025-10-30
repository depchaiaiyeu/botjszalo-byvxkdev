import { createCanvas } from "canvas";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { sendMessageComplete, sendMessageWarning } from "../../chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service.js";
import { removeMention } from "../../../utils/format-util.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const activeCaroGames = new Map();
const turnTimers = new Map();

function clearTurnTimer(threadId) {
  const timer = turnTimers.get(threadId);
  if (timer) {
    clearTimeout(timer);
    turnTimers.delete(threadId);
  }
}

function startTurnTimer(api, message, threadId, isPlayerTurn) {
  clearTurnTimer(threadId);
  
  const timer = setTimeout(async () => {
    const game = activeCaroGames.get(threadId);
    if (!game) return;
    
    if (isPlayerTurn) {
      await sendMessageComplete(api, message, `🎮 TRẬN ĐẤU KẾT THÚC\n\n⏰ ${game.playerName} bị loại vì không đánh nước tiếp theo trong 60 giây\n🏆 Bot đã chiến thắng ván cờ này`);
    } else {
      await sendMessageComplete(api, message, `🎮 TRẬN ĐẤU KẾT THÚC\n\n⏰ Bot thua vì không đánh trong 60 giây\n🏆 ${game.playerName} đã chiến thắng ván cờ này`);
    }
    
    activeCaroGames.delete(threadId);
    clearTurnTimer(threadId);
  }, 60000);
  
  turnTimers.set(threadId, timer);
}

async function createCaroBoard(board, size = 16, moveCount = 0, playerMark = "X", botMark = "O", playerName = "Player", lastBotMove = -1, currentTurn = "X") {
  const cellSize = 50;
  const padding = 40;
  const headerHeight = 110;
  const width = size * cellSize + padding * 2;
  const height = size * cellSize + padding * 2 + headerHeight;
  
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, width, height);
  
  ctx.font = "bold 16px 'BeVietnamPro'";
  ctx.textAlign = "left";
  
  if (playerMark === "X") {
    ctx.fillStyle = "#FF0000";
    ctx.fillText(`X: ${playerName}`, 20, 30);
    ctx.textAlign = "right";
    ctx.fillStyle = "#0000FF";
    ctx.fillText("O: BOT", width - 20, 30);
  } else {
    ctx.fillStyle = "#FF0000";
    ctx.fillText("X: BOT", 20, 30);
    ctx.textAlign = "right";
    ctx.fillStyle = "#0000FF";
    ctx.fillText(`O: ${playerName}`, width - 20, 30);
  }
  
  ctx.font = "bold 15px 'BeVietnamPro'";
  ctx.textAlign = "left";
  ctx.fillStyle = "#000000";
  
  const turnText = currentTurn === "X" ? "X" : "O";
  const turnName = currentTurn === playerMark ? playerName : "BOT";
  ctx.fillText(`Lượt: ${turnText} (${turnName})`, 20, 60);
  
  ctx.textAlign = "right";
  ctx.fillText(`Nước đi: ${moveCount}/256`, width - 20, 60);
  
  const boardTop = headerHeight;
  
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 2;
  
  for (let i = 0; i <= size; i++) {
    ctx.beginPath();
    ctx.moveTo(padding, boardTop + padding + i * cellSize);
    ctx.lineTo(padding + size * cellSize, boardTop + padding + i * cellSize);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(padding + i * cellSize, boardTop + padding);
    ctx.lineTo(padding + i * cellSize, boardTop + padding + size * cellSize);
    ctx.stroke();
  }
  
  for (let i = 0; i < board.length; i++) {
    const row = Math.floor(i / size);
    const col = i % size;
    const x = padding + col * cellSize + cellSize / 2;
    const y = boardTop + padding + row * cellSize + cellSize / 2;
    
    if (board[i] === ".") {
      ctx.font = "15px 'BeVietnamPro'";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#000000";
      ctx.fillText((i + 1).toString(), x, y);
    } else {
      ctx.font = "bold 30px 'BeVietnamPro'";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      
      if (board[i] === "X") {
        ctx.fillStyle = "#FF0000";
        ctx.fillText("X", x, y);
      } else if (board[i] === "O") {
        ctx.fillStyle = "#0000FF";
        ctx.fillText("O", x, y);
      }
      
      if (i === lastBotMove) {
        ctx.strokeStyle = "#FFD700";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(x, y, cellSize / 2.8, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }
  
  return canvas.toBuffer("image/png");
}

function countInDirection(board, pos, dr, dc, mark, size = 16) {
  let count = 0;
  let row = Math.floor(pos / size);
  let col = pos % size;
  
  row += dr;
  col += dc;
  
  while (row >= 0 && row < size && col >= 0 && col < size) {
    const idx = row * size + col;
    if (board[idx] === mark) {
      count++;
      row += dr;
      col += dc;
    } else {
      break;
    }
  }
  
  return count;
}

function getLineStats(board, pos, dr, dc, mark, size = 16) {
  let r = Math.floor(pos / size);
  let c = pos % size;

  let count = 1;
  let backwardOpen = false;
  let rb = r - dr;
  let cb = c - dc;
  while (rb >= 0 && rb < size && cb >= 0 && cb < size && board[rb * size + cb] === mark) {
    count++;
    rb -= dr;
    cb -= dc;
  }
  if (rb >= 0 && rb < size && cb >= 0 && cb < size && board[rb * size + cb] === ".") {
    backwardOpen = true;
  }

  let forwardOpen = false;
  let rf = r + dr;
  let cf = c + dc;
  while (rf >= 0 && rf < size && cf >= 0 && cf < size && board[rf * size + cf] === mark) {
    count++;
    rf += dr;
    cf += dc;
  }
  if (rf >= 0 && rf < size && cf >= 0 && cf < size && board[rf * size + cf] === ".") {
    forwardOpen = true;
  }

  let openEnds = 0;
  if (backwardOpen) openEnds++;
  if (forwardOpen) openEnds++;

  return { count, openEnds };
}

function analyzePosition(board, pos, mark, size = 16) {
  let wins = 0;
  let openFours = 0;
  let closedFours = 0;
  let openThrees = 0;
  let closedThrees = 0;
  let openTwos = 0;

  const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];

  for (const [dr, dc] of directions) {
    const { count, openEnds } = getLineStats(board, pos, dr, dc, mark, size);

    if (count >= 5) {
      wins++;
    } else if (count === 4) {
      if (openEnds === 2) openFours++;
      else if (openEnds === 1) closedFours++;
    } else if (count === 3) {
      if (openEnds === 2) openThrees++;
      else if (openEnds === 1) closedThrees++;
    } else if (count === 2) {
      if (openEnds === 2) openTwos++;
    }
  }

  if (wins > 0) return { score: 100000000 };

  if (openFours > 0 || closedFours > 1 || (closedFours > 0 && openThrees > 0)) {
    return { score: 10000000 };
  }
  if (openThrees > 1) {
    return { score: 5000000 };
  }

  let score = 0;
  score += closedFours * 100000;
  score += openThrees * 50000;
  score += closedThrees * 5000;
  score += openTwos * 1000;

  return { score };
}

function evaluateMove(board, pos, mark, oppMark, size = 16) {
  board[pos] = mark;
  const myAnalysis = analyzePosition(board, pos, mark, size);
  board[pos] = ".";

  board[pos] = oppMark;
  const oppAnalysis = analyzePosition(board, pos, oppMark, size);
  board[pos] = ".";

  let score = myAnalysis.score + oppAnalysis.score;

  const row = Math.floor(pos / size);
  const col = pos % size;
  const centerDist = Math.abs(row - 7.5) + Math.abs(col - 7.5);
  score += (15 - centerDist) * 10;

  let adjacentCount = 0;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const r = row + dr;
      const c = col + dc;
      if (r >= 0 && r < size && c >= 0 && c < size) {
        if (board[r * size + c] !== ".") {
          adjacentCount++;
        }
      }
    }
  }
  score += adjacentCount * 20;

  return score;
}

function checkWinAt(board, pos, mark, size = 16) {
  const directions = [[0,1], [1,0], [1,1], [1,-1]];
  
  for (const [dr, dc] of directions) {
    const forward = countInDirection(board, pos, dr, dc, mark, size);
    const backward = countInDirection(board, pos, -dr, -dc, mark, size);
    
    if (forward + backward + 1 >= 5) {
      return true;
    }
  }
  
  return false;
}

function checkWin(board, size = 16) {
  const directions = [[0,1], [1,0], [1,1], [1,-1]];
  
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const idx = row * size + col;
      const mark = board[idx];
      if (mark === ".") continue;
      
      for (const [dr, dc] of directions) {
        let count = 1;
        for (let step = 1; step < 5; step++) {
          const newRow = row + dr * step;
          const newCol = col + dc * step;
          if (newRow < 0 || newRow >= size || newCol < 0 || newCol >= size) break;
          const newIdx = newRow * size + newCol;
          if (board[newIdx] !== mark) break;
          count++;
        }
        if (count >= 5) return mark;
      }
    }
  }
  
  return null;
}

function findCandidateMoves(board, size = 16, radius = 2) {
  const candidateMoves = new Set();
  const isEmptyBoard = board.every(cell => cell === ".");
  const centerMin = 6;
  const centerMax = 9;

  if (isEmptyBoard) {
    const randRow = Math.floor(Math.random() * (centerMax - centerMin + 1)) + centerMin;
    const randCol = Math.floor(Math.random() * (centerMax - centerMin + 1)) + centerMin;
    candidateMoves.add(randRow * size + randCol);
    return Array.from(candidateMoves);
  }

  for (let i = 0; i < size * size; i++) {
    if (board[i] !== ".") {
      const row = Math.floor(i / size);
      const col = i % size;
      for (let r = Math.max(0, row - radius); r <= Math.min(size - 1, row + radius); r++) {
        for (let c = Math.max(0, col - radius); c <= Math.min(size - 1, col + radius); c++) {
          const checkPos = r * size + c;
          if (board[checkPos] === ".") {
            candidateMoves.add(checkPos);
          }
        }
      }
    }
  }

  if (candidateMoves.size === 0) {
    for (let i = 0; i < size * size; i++) {
      if (board[i] === '.') candidateMoves.add(i);
    }
  }
  
  return Array.from(candidateMoves);
}

function minimax(board, depth, isMaximizingPlayer, alpha, beta, botMark, playerMark, size = 16) {
  const winner = checkWin(board, size);
  if (winner === botMark) return 100000000 + depth; 
  if (winner === playerMark) return -100000000 - depth;
  if (depth === 0) return 0;

  const searchRadius = depth > 2 ? 1 : 2;
  const candidates = findCandidateMoves(board, size, searchRadius);
  if (candidates.length === 0) return 0;

  if (isMaximizingPlayer) {
    let bestValue = -Infinity;
    for (const move of candidates) {
      board[move] = botMark;
      const moveScore = evaluateMove(board, move, botMark, playerMark, size);
      const value = moveScore + minimax(board, depth - 1, false, alpha, beta, botMark, playerMark, size);
      board[move] = ".";
      bestValue = Math.max(bestValue, value);
      alpha = Math.max(alpha, bestValue);
      if (beta <= alpha) break;
    }
    return bestValue;
  } else {
    let bestValue = Infinity;
    for (const move of candidates) {
      board[move] = playerMark;
      const moveScore = evaluateMove(board, move, playerMark, botMark, size);
      const value = -moveScore + minimax(board, depth - 1, true, alpha, beta, botMark, playerMark, size);
      board[move] = ".";
      bestValue = Math.min(bestValue, value);
      beta = Math.min(beta, bestValue);
      if (beta <= alpha) break;
    }
    return bestValue;
  }
}

function getAIMove(board, playerMark, mode, size = 16) {
  const botMark = playerMark === "X" ? "O" : "X";
  
  for (let i = 0; i < size * size; i++) {
    if (board[i] !== ".") continue;
    board[i] = botMark;
    if (checkWinAt(board, i, botMark, size)) {
      board[i] = ".";
      return i;
    }
    board[i] = ".";
  }
  
  for (let i = 0; i < size * size; i++) {
    if (board[i] !== ".") continue;
    board[i] = playerMark;
    if (checkWinAt(board, i, playerMark, size)) {
      board[i] = ".";
      return i;
    }
    board[i] = ".";
  }

  const DEPTHS = { easy: 1, hard: 2, super: 4 };
  const depth = DEPTHS[mode] || 2;
  
  const candidates = findCandidateMoves(board, size, 2);
  let bestScore = -Infinity;
  let bestMove = -1;

  if (mode === 'easy') {
     for (const move of candidates) {
        const score = evaluateMove(board, move, botMark, playerMark, size);
        if (score > bestScore) {
            bestScore = score;
            bestMove = move;
        }
     }
     return bestMove;
  }

  for (const move of candidates) {
    board[move] = botMark;
    const moveScore = evaluateMove(board, move, botMark, playerMark, size);
    const score = moveScore + minimax(board, depth, false, -Infinity, Infinity, botMark, playerMark, size);
    board[move] = ".";
    
    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }

  return bestMove;
}


export async function handleCaroCommand(api, message) {
  const threadId = message.threadId;
  const content = removeMention(message);
  const prefix = getGlobalPrefix();
  const args = content.split(/\s+/);
  
  if (!content.includes(`${prefix}caro`)) return;
  
  if (args.length < 2) {
    await sendMessageComplete(api, message, 
      `🎮 HƯỚNG DẪN CHƠI CỜ CARO\n\n` +
      `📌 Cú pháp:\n` +
      `${prefix}caro [easy/hard/super] [x/o]\n\n` +
      `💡 Ví dụ:\n` +
      `${prefix}caro easy\n` +
      `${prefix}caro hard x\n` +
      `${prefix}caro super o\n\n` +
      `📋 Luật chơi:\n` +
      `Quân X đi trước\n` +
      `Nhập số ô (1-256) để đánh quân\n` +
      `5 quân liên tiếp sẽ giành chiến thắng\n` +
      `Mỗi lượt có 60 giây\n\n` +
      `🚪 ${prefix}caro leave - Rời khỏi trò chơi`
    );
    return;
  }
  
  if (args[1].toLowerCase() === "leave") {
    if (activeCaroGames.has(threadId)) {
      clearTurnTimer(threadId);
      activeCaroGames.delete(threadId);
      await sendMessageComplete(api, message, "Trò chơi Caro đã kết thúc do không còn người chơi");
    } else {
      await sendMessageWarning(api, message, "Không có trò chơi Caro nào đang diễn ra trong nhóm này", 60000);
    }
    return;
  }

  if (activeCaroGames.has(threadId)) {
    await sendMessageWarning(api, message, `Đã có 1 ván cờ đang diễn ra trong nhóm này.\nDùng ${prefix}caro leave để kết thúc ván cũ trước khi bắt đầu 1 ván mới.`, 60000);
    return;
  }
  
  const mode = args[1].toLowerCase();
  let playerMark = args.length > 2 ? args[2].toUpperCase() : (Math.random() > 0.5 ? "X" : "O");
  
  if (!["easy", "hard", "super"].includes(mode)) {
    await sendMessageWarning(api, message, "🎯 Vui lòng chọn đúng các mode sau đây để bắt đầu trò chơi:\n- easy: Dễ, dành cho newbie\n- hard: Khó, cân bằng giữa tấn công & phòng thủ\n- super: Thách đấu, dành cho cao thủ", 60000);
    return;
  }
  
  if (!["X", "O"].includes(playerMark)) {
    await sendMessageWarning(api, message, "Quân cờ để bắt đầu không hợp lệ, vui lòng chọn giữa X và O\nX đi trước ", 60000);
    return;
  }
  
  clearTurnTimer(threadId);
  
  const board = Array(256).fill(".");
  const size = 16;
  
  activeCaroGames.set(threadId, {
    board,
    playerMark,
    botMark: playerMark === "X" ? "O" : "X",
    currentTurn: "X",
    mode,
    playerId: message.data.uidFrom,
    playerName: message.data.dName,
    size,
    moveCount: 0,
    lastBotMove: -1,
    isProcessing: false
  });
  
  const imageBuffer = await createCaroBoard(board, size, 0, playerMark, playerMark === "X" ? "O" : "X", message.data.dName, -1, "X");
  const imagePath = path.resolve(process.cwd(), "assets", "temp", `caro_${threadId}.png`);
  await fs.writeFile(imagePath, imageBuffer);
  
  const turnMsg = playerMark === "X" 
    ? `\n🎯 Đến lượt bạn\n\n👉 Hãy chọn số từ 1-256 để đánh quân cờ` 
    : `\n🤖 Bot đi trước`;
  
  await api.sendMessage(
    {
      msg: `🌟 ${message.data.dName} 🌟\n\n🎮 BẮT ĐẦU TRÒ CHƠI${turnMsg}`,
      attachments: [imagePath],
      ttl: 60000
    },
    threadId,
    message.type
  );
  
  try {
    await fs.unlink(imagePath);
  } catch (error) {}
  
  if (playerMark === "O") {
    activeCaroGames.get(threadId).isProcessing = true;
    setTimeout(() => handleBotTurn(api, message), 800);
  } else {
    startTurnTimer(api, message, threadId, true);
  }
}

async function handleBotTurn(api, message) {
  const threadId = message.threadId;
  const game = activeCaroGames.get(threadId);
  
  if (!game) return;
  
  game.isProcessing = true;
  startTurnTimer(api, message, threadId, false);
  
  const pos = getAIMove(game.board, game.playerMark, game.mode, game.size);
  
  clearTurnTimer(threadId);
  
  if (!activeCaroGames.has(threadId)) return;
  
  if (pos < 0) {
    const imageBuffer = await createCaroBoard(game.board, game.size, game.moveCount, game.playerMark, game.botMark, game.playerName, game.lastBotMove, game.currentTurn);
    const imagePath = path.resolve(process.cwd(), "assets", "temp", `caro_${threadId}_draw.png`);
    await fs.writeFile(imagePath, imageBuffer);
    
    await api.sendMessage(
      {
        msg: `🌟 ${game.playerName} 🌟\n\n🎮 TRẬN ĐẤU KẾT THÚC\n\n🤝 Hòa cờ vì không còn nước đi (256/256)`,
        attachments: [imagePath],
        ttl: 60000
      },
      threadId,
      message.type
    );
    
    try {
      await fs.unlink(imagePath);
    } catch (error) {}
    
    activeCaroGames.delete(threadId);
    return;
  }
  
  game.board[pos] = game.botMark;
  game.currentTurn = game.playerMark;
  game.moveCount++;
  game.lastBotMove = pos;
  
  const winner = checkWin(game.board, game.size);
  
  const imageBuffer = await createCaroBoard(game.board, game.size, game.moveCount, game.playerMark, game.botMark, game.playerName, pos, game.playerMark);
  const imagePath = path.resolve(process.cwd(), "assets", "temp", `caro_${threadId}.png`);
  await fs.writeFile(imagePath, imageBuffer);
  
  if (winner) {
    await api.sendMessage(
      {
        msg: `🌟 ${game.playerName} 🌟\n\n🎮 TRẬN ĐẤU KẾT THÚC\n\n🤖 Bot đánh ô số ${pos + 1}\n🏆 Bot đã chiến thắng với 5 quân liên tiếp`,
        attachments: [imagePath],
        ttl: 60000
      },
      threadId,
      message.type
    );
    activeCaroGames.delete(threadId);
    clearTurnTimer(threadId);
  } else {
    await api.sendMessage(
      {
        msg: `🌟 ${game.playerName} 🌟\n\n🎮 TRÒ CHƠI TIẾP DIỄN\n\n🤖 Bot đánh ô số ${pos + 1}\n🎯 Đến lượt bạn\n\n👉 Chọn ô từ 1-256 để đánh quân cờ\n🧭 Bạn có 60 giây để đánh`,
        attachments: [imagePath],
        ttl: 60000
      },
      threadId,
      message.type
    );
    game.isProcessing = false;
    startTurnTimer(api, message, threadId, true);
  }
  
  try {
    await fs.unlink(imagePath);
  } catch (error) {}
}

export async function handleCaroMessage(api, message) {
  const threadId = message.threadId;
  const game = activeCaroGames.get(threadId);
  
  if (!game) return;
  if (game.isProcessing) return;
  if (message.data.uidFrom !== game.playerId) return;
  if (game.currentTurn !== game.playerMark) return;
  
  const content = message.data.content || "";
  
  if (message.data.mentions && message.data.mentions.length > 0) return;
  
  if (!/^\d+$/.test(content.trim())) return;
  
  clearTurnTimer(threadId);
  
  const pos = parseInt(content.trim(), 10) - 1;
  
  if (pos < 0 || pos >= 256) {
    await sendMessageWarning(api, message, "Index không hợp lệ, vui lòng chọn từ 1-256", 60000);
    startTurnTimer(api, message, threadId, true);
    return;
  }
  
  if (game.board[pos] !== ".") {
    await sendMessageWarning(api, message, "Ô này đã được sử dụng, vui lòng chọn một ô trống", 60000);
    startTurnTimer(api, message, threadId, true);
    return;
  }
  
  game.isProcessing = true;
  game.board[pos] = game.playerMark;
  game.currentTurn = game.botMark;
  game.moveCount++;
  
  const winner = checkWin(game.board, game.size);
  
  const imageBuffer = await createCaroBoard(game.board, game.size, game.moveCount, game.playerMark, game.botMark, game.playerName, game.lastBotMove, game.botMark);
  const imagePath = path.resolve(process.cwd(), "assets", "temp", `caro_${threadId}.png`);
  await fs.writeFile(imagePath, imageBuffer);
  
  if (winner) {
    await api.sendMessage(
      {
        msg: `🌟 ${game.playerName} 🌟\n\n🎮 TRẬN ĐẤU KẾT THÚC\n\n👤 Bạn đánh ô số ${pos + 1}\n🏆 ${game.playerName} đã chiến thắng trong ván cờ này`,
        attachments: [imagePath],
        ttl: 60000
      },
      threadId,
      message.type
    );
    activeCaroGames.delete(threadId);
    clearTurnTimer(threadId);
    try {
      await fs.unlink(imagePath);
    } catch (error) {}
    return;
  }
  
  try {
    await fs.unlink(imagePath);
  } catch (error) {}
  
  setTimeout(() => handleBotTurn(api, message), 800);
}
