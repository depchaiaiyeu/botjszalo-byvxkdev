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
    
    const imageBuffer = await createCaroBoard(game.board, game.size, game.moveCount, game.playerMark, game.botMark, game.mode, game.playerName);
    const imagePath = path.resolve(process.cwd(), "assets", "temp", `caro_${threadId}_timeout.png`);
    await fs.writeFile(imagePath, imageBuffer);
    
    const modeText = game.mode === "easy" ? "Dễ" : game.mode === "hard" ? "Khó" : "Thách Đấu";
    
    if (isPlayerTurn) {
      await api.sendMessage(
        {
          msg: `@${game.playerName}\n━━━━━━━━━━━━━━━━━━━\n🎮 KẾT THÚC TRÒ CHƠI\n🤖 Độ khó: ${modeText}\n━━━━━━━━━━━━━━━━━━━\n\n⏰ ${game.playerName} đã bị loại do không đánh trong 60 giây\n🏆 Bot đã dành chiến thắng trong ván cờ này`,
          mentions: [{ pos: 1, uid: game.playerId, len: game.playerName.length }],
          attachments: [imagePath]
        },
        threadId,
        message.type
      );
    } else {
      await api.sendMessage(
        {
          msg: `@${game.playerName}\n━━━━━━━━━━━━━━━━━━━\n🎮 KẾT THÚC TRÒ CHƠI\n🤖 Độ khó: ${modeText}\n━━━━━━━━━━━━━━━━━━━\n\n⏰ Bot đã thua do không đánh trong 60 giây\n🏆 ${game.playerName} đã dành chiến thắng trong ván cờ này`,
          mentions: [{ pos: 1, uid: game.playerId, len: game.playerName.length }],
          attachments: [imagePath]
        },
        threadId,
        message.type
      );
    }
    
    try {
      await fs.unlink(imagePath);
    } catch (error) {}
    
    activeCaroGames.delete(threadId);
    clearTurnTimer(threadId);
  }, 60000);
  
  turnTimers.set(threadId, timer);
}

async function createCaroBoard(board, size = 16, moveCount = 0, playerMark = "X", botMark = "O", mode = "super", playerName = "Player") {
  const cellSize = 40;
  const padding = 30;
  const headerHeight = 80;
  const footerHeight = 30;
  const width = size * cellSize + padding * 2;
  const height = size * cellSize + padding * 2 + headerHeight + footerHeight;
  
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, width, height);
  
  const modeDisplay = mode === "easy" ? "Dễ" : mode === "hard" ? "Khó" : "Thách Đấu";
  
  ctx.fillStyle = "#000000";
  ctx.font = "bold 16px Arial";
  ctx.textAlign = "center";
  ctx.fillText(`Caro 16x16 - ${modeDisplay}`, width / 2, 20);
  
  ctx.font = "12px Arial";
  ctx.textAlign = "left";
  
  if (playerMark === "X") {
    ctx.fillStyle = "#FF0000";
    ctx.fillText(`X: ${playerName}`, 10, 45);
    ctx.textAlign = "right";
    ctx.fillStyle = "#0000FF";
    ctx.fillText(`O: BOT`, width - 10, 45);
  } else {
    ctx.fillStyle = "#FF0000";
    ctx.fillText(`X: BOT`, 10, 45);
    ctx.textAlign = "right";
    ctx.fillStyle = "#0000FF";
    ctx.fillText(`O: ${playerName}`, width - 10, 45);
  }
  
  const boardTop = headerHeight;
  
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 1;
  
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
  
  ctx.font = "10px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#999999";
  
  for (let i = 0; i < board.length; i++) {
    if (board[i] === ".") {
      const row = Math.floor(i / size);
      const col = i % size;
      const x = padding + col * cellSize + cellSize / 2;
      const y = boardTop + padding + row * cellSize + cellSize / 2;
      ctx.fillText((i + 1).toString(), x, y);
    }
  }
  
  for (let i = 0; i < board.length; i++) {
    if (board[i] !== ".") {
      const row = Math.floor(i / size);
      const col = i % size;
      const x = padding + col * cellSize + cellSize / 2;
      const y = boardTop + padding + row * cellSize + cellSize / 2;
      
      ctx.font = "bold 24px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      
      if (board[i] === "X") {
        ctx.fillStyle = "#FF0000";
        ctx.fillText("X", x, y);
      } else if (board[i] === "O") {
        ctx.fillStyle = "#0000FF";
        ctx.fillText("O", x, y);
      }
    }
  }
  
  ctx.fillStyle = "#000000";
  ctx.font = "12px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const footerY = boardTop + padding + size * cellSize + footerHeight / 2;
  ctx.fillText(`Nước đi: ${moveCount}/256`, width / 2, footerY);
  
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

function isBlocked(board, pos, dr, dc, mark, size = 16) {
  const row = Math.floor(pos / size);
  const col = pos % size;
  
  const oppMark = mark === "X" ? "O" : "X";
  
  let r = row - dr;
  let c = col - dc;
  if (r >= 0 && r < size && c >= 0 && c < size) {
    if (board[r * size + c] === oppMark) return true;
  } else {
    return true;
  }
  
  r = row + dr;
  c = col + dc;
  if (r >= 0 && r < size && c >= 0 && c < size) {
    if (board[r * size + c] === oppMark) return true;
  } else {
    return true;
  }
  
  return false;
}

function analyzePosition(board, pos, mark, size = 16) {
  const directions = [[0,1], [1,0], [1,1], [1,-1]];
  let maxStrength = 0;
  let openFours = 0;
  let closedFours = 0;
  let openThrees = 0;
  let closedThrees = 0;
  
  for (const [dr, dc] of directions) {
    const forward = countInDirection(board, pos, dr, dc, mark, size);
    const backward = countInDirection(board, pos, -dr, -dc, mark, size);
    const total = forward + backward + 1;
    
    maxStrength = Math.max(maxStrength, total);
    
    if (total === 4) {
      if (isBlocked(board, pos, dr, dc, mark, size)) {
        closedFours++;
      } else {
        openFours++;
      }
    } else if (total === 3) {
      if (isBlocked(board, pos, dr, dc, mark, size)) {
        closedThrees++;
      } else {
        openThrees++;
      }
    }
  }
  
  return { maxStrength, openFours, closedFours, openThrees, closedThrees };
}

function evaluateMove(board, pos, mark, oppMark, size = 16) {
  let score = 0;
  
  const myAnalysis = analyzePosition(board, pos, mark, size);
  
  if (myAnalysis.maxStrength >= 4) {
    score += 10000;
  }
  
  if (myAnalysis.openFours > 0) {
    score += 5000 * myAnalysis.openFours;
  }
  
  if (myAnalysis.closedFours > 0) {
    score += 1000 * myAnalysis.closedFours;
  }
  
  if (myAnalysis.openThrees > 0) {
    score += 800 * myAnalysis.openThrees;
  }
  
  if (myAnalysis.openThrees >= 2) {
    score += 3000;
  }
  
  if (myAnalysis.closedThrees > 0) {
    score += 200 * myAnalysis.closedThrees;
  }
  
  const tempBoard = [...board];
  tempBoard[pos] = oppMark;
  const oppAnalysis = analyzePosition(tempBoard, pos, oppMark, size);
  
  if (oppAnalysis.maxStrength >= 4) {
    score += 9000;
  }
  
  if (oppAnalysis.openFours > 0) {
    score += 4500 * oppAnalysis.openFours;
  }
  
  if (oppAnalysis.closedFours > 0) {
    score += 900 * oppAnalysis.closedFours;
  }
  
  if (oppAnalysis.openThrees > 0) {
    score += 700 * oppAnalysis.openThrees;
  }
  
  if (oppAnalysis.openThrees >= 2) {
    score += 2800;
  }
  
  if (oppAnalysis.closedThrees > 0) {
    score += 180 * oppAnalysis.closedThrees;
  }
  
  const row = Math.floor(pos / size);
  const col = pos % size;
  const centerDist = Math.abs(row - 7.5) + Math.abs(col - 7.5);
  score += (15 - centerDist) * 5;
  
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
  score += adjacentCount * 10;
  
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

function getAIMove(board, playerMark, mode) {
  const botMark = playerMark === "X" ? "O" : "X";
  const size = 16;
  const moves = [];
  
  for (let i = 0; i < 256; i++) {
    if (board[i] !== ".") continue;
    
    const tempBoard = [...board];
    tempBoard[i] = botMark;
    
    if (checkWinAt(tempBoard, i, botMark, size)) {
      return i;
    }
  }
  
  for (let i = 0; i < 256; i++) {
    if (board[i] !== ".") continue;
    
    const tempBoard = [...board];
    tempBoard[i] = playerMark;
    
    if (checkWinAt(tempBoard, i, playerMark, size)) {
      return i;
    }
  }
  
  if (mode === "easy") {
    for (let i = 0; i < 256; i++) {
      if (board[i] !== ".") continue;
      
      const row = Math.floor(i / size);
      const col = i % size;
      
      let hasNearby = false;
      for (let r = Math.max(0, row - 2); r <= Math.min(15, row + 2); r++) {
        for (let c = Math.max(0, col - 2); c <= Math.min(15, col + 2); c++) {
          if (board[r * size + c] !== ".") {
            hasNearby = true;
            break;
          }
        }
        if (hasNearby) break;
      }
      
      if (hasNearby) {
        const score = evaluateMove(board, i, botMark, playerMark, size) * 0.5;
        moves.push({ pos: i, score });
      }
    }
    
    if (moves.length > 0) {
      moves.sort((a, b) => b.score - a.score);
      const topMoves = moves.slice(0, Math.min(5, moves.length));
      return topMoves[Math.floor(Math.random() * topMoves.length)].pos;
    }
  } else if (mode === "hard") {
    for (let i = 0; i < 256; i++) {
      if (board[i] !== ".") continue;
      
      const row = Math.floor(i / size);
      const col = i % size;
      
      let hasNearby = false;
      for (let r = Math.max(0, row - 2); r <= Math.min(15, row + 2); r++) {
        for (let c = Math.max(0, col - 2); c <= Math.min(15, col + 2); c++) {
          if (board[r * size + c] !== ".") {
            hasNearby = true;
            break;
          }
        }
        if (hasNearby) break;
      }
      
      if (hasNearby || moves.length === 0) {
        const score = evaluateMove(board, i, botMark, playerMark, size);
        moves.push({ pos: i, score });
      }
    }
    
    if (moves.length > 0) {
      moves.sort((a, b) => b.score - a.score);
      const topMoves = moves.slice(0, Math.min(3, moves.length));
      return topMoves[Math.floor(Math.random() * topMoves.length)].pos;
    }
  } else if (mode === "super") {
    for (let i = 0; i < 256; i++) {
      if (board[i] !== ".") continue;
      
      const row = Math.floor(i / size);
      const col = i % size;
      
      let hasNearby = false;
      for (let r = Math.max(0, row - 3); r <= Math.min(15, row + 3); r++) {
        for (let c = Math.max(0, col - 3); c <= Math.min(15, col + 3); c++) {
          if (board[r * size + c] !== ".") {
            hasNearby = true;
            break;
          }
        }
        if (hasNearby) break;
      }
      
      if (hasNearby || moves.length === 0) {
        const score = evaluateMove(board, i, botMark, playerMark, size);
        moves.push({ pos: i, score });
      }
    }
    
    if (moves.length > 0) {
      moves.sort((a, b) => b.score - a.score);
      return moves[0].pos;
    }
  }
  
  for (let i = 0; i < 256; i++) {
    if (board[i] === ".") return i;
  }
  
  return -1;
}

export async function handleCaroCommand(api, message) {
  const threadId = message.threadId;
  const content = removeMention(message);
  const prefix = getGlobalPrefix();
  const args = content.split(/\s+/);
  
  if (!content.includes(`${prefix}caro`)) return;
  
  if (args.length < 2) {
    await sendMessageComplete(api, message, 
      `━━━━━━━━━━━━━━━━━━━\n` +
      `🎮 HƯỚNG DẪN CHƠI CỜ CARO\n` +
      `━━━━━━━━━━━━━━━━━━━\n\n` +
      `📌 Cú pháp:\n` +
      `${prefix}caro [easy/hard/super] [x/o]\n\n` +
      `💡 Ví dụ:\n` +
      `• ${prefix}caro easy (random X hoặc O)\n` +
      `• ${prefix}caro hard x (chọn quân X)\n` +
      `• ${prefix}caro super o (chọn quân O)\n\n` +
      `📋 Luật chơi:\n` +
      `• Quân X đi trước\n` +
      `• Nhập số ô (1-256) để đánh quân\n` +
      `• 5 quân liên tiếp sẽ giành chiến thắng\n` +
      `• Mỗi lượt có 60 giây\n\n` +
      `⚡ Độ khó:\n` +
      `• Easy: Dễ - Phù hợp người mới\n` +
      `• Hard: Khó - Cân bằng tấn công & phòng thủ\n` +
      `• Super: Thách đấu - AI thông minh\n\n` +
      `🚪 ${prefix}caro leave - Rời khỏi trò chơi`
    );
    return;
  }
  
  if (args[1].toLowerCase() === "leave") {
    if (activeCaroGames.has(threadId)) {
      clearTurnTimer(threadId);
      activeCaroGames.delete(threadId);
      await sendMessageComplete(api, message, "🚫 Trò chơi Caro đã kết thúc do người chơi rời khỏi phòng.");
    } else {
      await sendMessageWarning(api, message, "⚠️ Không có trò chơi Caro nào đang diễn ra.");
    }
    return;
  }
  
  const mode = args[1].toLowerCase();
  let playerMark = args.length > 2 ? args[2].toUpperCase() : (Math.random() > 0.5 ? "X" : "O");
  
  if (!["easy", "hard", "super"].includes(mode)) {
    await sendMessageWarning(api, message, "⚠️ Chế độ không hợp lệ! Vui lòng chọn: easy, hard hoặc super");
    return;
  }
  
  if (!["X", "O"].includes(playerMark)) {
    await sendMessageWarning(api, message, "⚠️ Quân cờ không hợp lệ! Vui lòng chọn X hoặc O");
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
    moveCount: 0
  });
  
  const imageBuffer = await createCaroBoard(board, size, 0, playerMark, playerMark === "X" ? "O" : "X", mode, message.data.dName);
  const imagePath = path.resolve(process.cwd(), "assets", "temp", `caro_${threadId}.png`);
  await fs.writeFile(imagePath, imageBuffer);
  
  const modeText = mode === "easy" ? "Dễ" : mode === "hard" ? "Khó" : "Thách Đấu";
  const turnMsg = playerMark === "X" 
    ? `\n👉 Lượt của bạn\n\nHãy chọn số từ 1-256 để đánh quân cờ` 
    : `\n🤖 Bot đi trước`;
  
  await api.sendMessage(
    {
      msg: `@${message.data.dName}\n━━━━━━━━━━━━━━━━━━━\n🎮 BẮT ĐẦU TRÒ CHƠI\n🤖 Độ khó: ${modeText}\n━━━━━━━━━━━━━━━━━━━${turnMsg}`,
      mentions: [{ pos: 1, uid: message.data.uidFrom, len: message.data.dName.length }],
      attachments: [imagePath]
    },
    threadId,
    message.type
  );
  
  try {
    await fs.unlink(imagePath);
  } catch (error) {}
  
  if (playerMark === "O") {
    setTimeout(() => handleBotTurn(api, message), 800);
  } else {
    startTurnTimer(api, message, threadId, true);
  }
}

async function handleBotTurn(api, message) {
  const threadId = message.threadId;
  const game = activeCaroGames.get(threadId);
  
  if (!game) return;
  
  startTurnTimer(api, message, threadId, false);
  
  const pos = getAIMove(game.board, game.playerMark, game.mode);
  
  clearTurnTimer(threadId);
  
  if (!activeCaroGames.has(threadId)) return;
  
  if (pos < 0) {
    const imageBuffer = await createCaroBoard(game.board, game.size, game.moveCount, game.playerMark, game.botMark, game.mode, game.playerName);
    const imagePath = path.resolve(process.cwd(), "assets", "temp", `caro_${threadId}_draw.png`);
    await fs.writeFile(imagePath, imageBuffer);
    
    const modeText = game.mode === "easy" ? "Dễ" : game.mode === "hard" ? "Khó" : "Thách Đấu";
    
    await api.sendMessage(
      {
        msg: `@${game.playerName}\n━━━━━━━━━━━━━━━━━━━\n🎮 KẾT THÚC TRÒ CHƠI\n🤖 Độ khó: ${modeText}\n━━━━━━━━━━━━━━━━━━━\n\n🤝 Hòa cờ do không còn nước đi (256/256)`,
        mentions: [{ pos: 1, uid: game.playerId, len: game.playerName.length }],
        attachments: [imagePath]
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
  
  const winner = checkWin(game.board, game.size);
  
  const imageBuffer = await createCaroBoard(game.board, game.size, game.moveCount, game.playerMark, game.botMark, game.mode, game.playerName);
  const imagePath = path.resolve(process.cwd(), "assets", "temp", `caro_${threadId}.png`);
  await fs.writeFile(imagePath, imageBuffer);
  
  const modeText = game.mode === "easy" ? "Dễ" : game.mode === "hard" ? "Khó" : "Thách Đấu";
  
  if (winner) {
    await api.sendMessage(
      {
        msg: `@${game.playerName}\n━━━━━━━━━━━━━━━━━━━\n🎮 KẾT THÚC TRÒ CHƠI\n🤖 Độ khó: ${modeText}\n━━━━━━━━━━━━━━━━━━━\n\n🤖 Bot đánh ô số ${pos + 1}\n🏆 Bot đã dành chiến thắng với 5 quân liên tiếp`,
        mentions: [{ pos: 1, uid: game.playerId, len: game.playerName.length }],
        attachments: [imagePath]
      },
      threadId,
      message.type
    );
    activeCaroGames.delete(threadId);
    clearTurnTimer(threadId);
  } else {
    await api.sendMessage(
      {
        msg: `@${game.playerName}\n━━━━━━━━━━━━━━━━━━━\n🎮 TRÒ CHƠI TIẾP DIỄN\n🤖 Độ khó: ${modeText}\n━━━━━━━━━━━━━━━━━━━\n\n🤖 Bot đánh ô số ${pos + 1}\n👉 Đến lượt bạn\n\nChọn ô từ 1-256 để đánh quân cờ`,
        mentions: [{ pos: 1, uid: game.playerId, len: game.playerName.length }],
        attachments: [imagePath]
      },
      threadId,
      message.type
    );
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
  if (message.data.uidFrom !== game.playerId) return;
  if (game.currentTurn !== game.playerMark) return;
  
  const content = message.data.content || "";
  
  if (message.data.mentions && message.data.mentions.length > 0) return;
  
  if (!/^\d+$/.test(content.trim())) return;
  
  clearTurnTimer(threadId);
  
  const pos = parseInt(content.trim(), 10) - 1;
  
  if (pos < 0 || pos >= 256) {
    await sendMessageWarning(api, message, "Số ô không hợp lệ. Vui lòng chọn từ 1-256.");
    startTurnTimer(api, message, threadId, true);
    return;
  }
  
  if (game.board[pos] !== ".") {
    await sendMessageWarning(api, message, "Ô này đã được đạn! Vui lòng chọn một ô trống.");
    startTurnTimer(api, message, threadId, true);
    return;
  }
  
  game.board[pos] = game.playerMark;
  game.currentTurn = game.botMark;
  game.moveCount++;
  
  const winner = checkWin(game.board, game.size);
  
  const imageBuffer = await createCaroBoard(game.board, game.size, game.moveCount, game.playerMark, game.botMark, game.mode, game.playerName);
  const imagePath = path.resolve(process.cwd(), "assets", "temp", `caro_${threadId}.png`);
  await fs.writeFile(imagePath, imageBuffer);
  
  const modeText = game.mode === "easy" ? "Dễ" : game.mode === "hard" ? "Khó" : "Thách Đấu";
  
  if (winner) {
    await api.sendMessage(
      {
        msg: `@${game.playerName}\n━━━━━━━━━━━━━━━━━━━\n🎮 KẾT THÚC TRÒ CHƠI\n🤖 Độ khó: ${modeText}\n━━━━━━━━━━━━━━━━━━━\n\n👤 Bạn đánh ô số ${pos + 1}\n🏆 Chúc mừng ${game.playerName} đã dành chiến thắng trong ván cờ này.`,
        mentions: [{ pos: 1, uid: game.playerId, len: game.playerName.length }],
        attachments: [imagePath]
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
