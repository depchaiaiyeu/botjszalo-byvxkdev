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
    
    const modeText = game.mode === "easy" ? "dễ" : game.mode === "hard" ? "khó" : "thách đấu";
    
    if (isPlayerTurn) {
      await api.sendMessage(
        {
          msg: `@${game.playerName}\n🎮 Trận Caro kết thúc!\n🤖 Độ khó: ${modeText}\n\n⏰ Hết giờ! ${game.playerName} không đánh trong 60 giây.\n🎉 Bot thắng!`,
          mentions: [{ pos: 1, uid: game.playerId, len: game.playerName.length }],
          attachments: [imagePath]
        },
        threadId,
        message.type
      );
    } else {
      await api.sendMessage(
        {
          msg: `@${game.playerName}\n🎮 Trận Caro kết thúc!\n🤖 Độ khó: ${modeText}\n\n⏰ Hết giờ! Bot không phản hồi trong 60 giây.\n🎉 ${game.playerName} thắng!`,
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

function createBoardString(board, size = 16) {
  let result = "";
  for (let row = 0; row < size; row++) {
    const rowContent = [];
    for (let col = 0; col < size; col++) {
      const idx = row * size + col;
      const cell = board[idx];
      rowContent.push(cell.padStart(3, " "));
    }
    result += rowContent.join(" ") + "\n";
  }
  return result;
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
  
  const modeDisplay = mode === "easy" ? "Easy" : mode === "hard" ? "Hard" : "Super";
  
  ctx.fillStyle = "#000000";
  ctx.font = "bold 16px Arial";
  ctx.textAlign = "center";
  ctx.fillText(`Caro - 16x16 - ${modeDisplay}`, width / 2, 20);
  
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

function getThreadStrength(board, pos, mark, size = 16) {
  const directions = [[0,1], [1,0], [1,1], [1,-1]];
  let maxCount = 0;
  let totalCount = 0;
  
  for (const [dr, dc] of directions) {
    const forward = countInDirection(board, pos, dr, dc, mark, size);
    const backward = countInDirection(board, pos, -dr, -dc, mark, size);
    const count = forward + backward + 1;
    
    maxCount = Math.max(maxCount, count);
    totalCount += count;
  }
  
  return { maxCount, totalCount };
}

function hasOpenEnd(board, pos, mark, dr, dc, size = 16) {
  const row = Math.floor(pos / size);
  const col = pos % size;
  
  const r1 = row + dr;
  const c1 = col + dc;
  const r2 = row - dr;
  const c2 = col - dc;
  
  let openEnds = 0;
  
  if (r1 >= 0 && r1 < size && c1 >= 0 && c1 < size) {
    if (board[r1 * size + c1] === ".") openEnds++;
  }
  
  if (r2 >= 0 && r2 < size && c2 >= 0 && c2 < size) {
    if (board[r2 * size + c2] === ".") openEnds++;
  }
  
  return openEnds;
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
      
      let hasNearQuans = false;
      for (let r = Math.max(0, row - 2); r <= Math.min(15, row + 2); r++) {
        for (let c = Math.max(0, col - 2); c <= Math.min(15, col + 2); c++) {
          if (board[r * size + c] !== ".") {
            hasNearQuans = true;
            break;
          }
        }
        if (hasNearQuans) break;
      }
      
      if (hasNearQuans) {
        const strength = getThreadStrength(board, i, botMark, size);
        moves.push({ pos: i, strength: strength.maxCount });
      }
    }
    
    if (moves.length > 0) {
      moves.sort((a, b) => b.strength - a.strength);
      return moves[0].pos;
    }
  } else if (mode === "hard") {
    for (let i = 0; i < 256; i++) {
      if (board[i] !== ".") continue;
      
      let score = 0;
      const directions = [[0,1], [1,0], [1,1], [1,-1]];
      
      for (const [dr, dc] of directions) {
        const forward = countInDirection(board, i, dr, dc, botMark, size);
        const backward = countInDirection(board, i, -dr, -dc, botMark, size);
        const count = forward + backward;
        
        if (count >= 3) {
          const opens = hasOpenEnd(board, i, botMark, dr, dc, size);
          if (opens === 2) score += 500;
          else if (opens === 1) score += 300;
          else score += 100;
        } else if (count === 2) {
          score += 50;
        }
      }
      
      for (const [dr, dc] of directions) {
        const forward = countInDirection(board, i, dr, dc, playerMark, size);
        const backward = countInDirection(board, i, -dr, -dc, playerMark, size);
        const count = forward + backward;
        
        if (count >= 3) {
          const opens = hasOpenEnd(board, i, playerMark, dr, dc, size);
          if (opens === 2) score += 400;
          else if (opens === 1) score += 200;
          else score += 80;
        } else if (count === 2) {
          score += 30;
        }
      }
      
      const row = Math.floor(i / size);
      const col = i % size;
      if (row >= 4 && row <= 11 && col >= 4 && col <= 11) {
        score += 20;
      }
      
      let nearQuans = false;
      for (let r = Math.max(0, row - 3); r <= Math.min(15, row + 3); r++) {
        for (let c = Math.max(0, col - 3); c <= Math.min(15, col + 3); c++) {
          if (board[r * size + c] !== ".") {
            nearQuans = true;
            break;
          }
        }
        if (nearQuans) break;
      }
      
      if (nearQuans) {
        score += 10;
      }
      
      if (score > 0) {
        moves.push({ pos: i, score });
      }
    }
    
    if (moves.length > 0) {
      moves.sort((a, b) => b.score - a.score);
      return moves[0].pos;
    }
  } else if (mode === "super") {
    const centerPositions = [];
    for (let i = 80; i <= 175; i++) {
      if ((i - 1) % 16 >= 4 && (i - 1) % 16 <= 11) {
        centerPositions.push(i - 1);
      }
    }
    
    for (let i = 0; i < 256; i++) {
      if (board[i] !== ".") continue;
      
      let score = 0;
      const directions = [[0,1], [1,0], [1,1], [1,-1]];
      
      for (const [dr, dc] of directions) {
        const forward = countInDirection(board, i, dr, dc, botMark, size);
        const backward = countInDirection(board, i, -dr, -dc, botMark, size);
        const count = forward + backward;
        
        if (count >= 3) {
          const opens = hasOpenEnd(board, i, botMark, dr, dc, size);
          if (opens === 2) score += 800;
          else if (opens === 1) score += 500;
          else score += 200;
        } else if (count === 2) {
          score += 80;
        } else if (count === 1) {
          score += 20;
        }
      }
      
      for (const [dr, dc] of directions) {
        const forward = countInDirection(board, i, dr, dc, playerMark, size);
        const backward = countInDirection(board, i, -dr, -dc, playerMark, size);
        const count = forward + backward;
        
        if (count >= 3) {
          const opens = hasOpenEnd(board, i, playerMark, dr, dc, size);
          if (opens === 2) score += 600;
          else if (opens === 1) score += 350;
          else score += 150;
        } else if (count === 2) {
          score += 50;
        }
      }
      
      const row = Math.floor(i / size);
      const col = i % size;
      if (centerPositions.includes(i)) {
        score += 100;
      }
      
      let nearQuans = 0;
      for (let r = Math.max(0, row - 2); r <= Math.min(15, row + 2); r++) {
        for (let c = Math.max(0, col - 2); c <= Math.min(15, col + 2); c++) {
          if (board[r * size + c] !== ".") {
            nearQuans++;
          }
        }
      }
      
      if (nearQuans > 0) {
        score += 50;
      }
      
      if (score > 0) {
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
      `🎮 Hướng dẫn chơi cờ Caro:\n\n` +
      `📌 ${prefix}caro [easy/hard/super] [x/o]\n` +
      `   - ${prefix}caro easy (random x hoặc o)\n` +
      `   - ${prefix}caro hard x (chọn x)\n` +
      `   - X luôn đi trước\n` +
      `   - Nhập số ô (1-256) để đánh\n` +
      `   - 5 quân liên tiếp thắng!\n` +
      `   - ⏰ Mỗi lượt có 60 giây\n\n` +
      `🎯 Độ khó:\n` +
      `   • easy: Dễ dàng - Chỉ phòng thủ\n` +
      `   • hard: Khó khăn - Cân bằng tấn công & phòng thủ\n` +
      `   • super: Thách đấu - Tấn công dồn dập\n\n` +
      `📌 ${prefix}caro leave - Rời khỏi trò chơi`
    );
    return;
  }
  
  if (args[1].toLowerCase() === "leave") {
    if (activeCaroGames.has(threadId)) {
      clearTurnTimer(threadId);
      activeCaroGames.delete(threadId);
      await sendMessageComplete(api, message, "🚫 Trò chơi Caro đã kết thúc.");
    } else {
      await sendMessageWarning(api, message, "Không có trò chơi Caro nào đang diễn ra.");
    }
    return;
  }
  
  const mode = args[1].toLowerCase();
  let playerMark = args.length > 2 ? args[2].toUpperCase() : (Math.random() > 0.5 ? "X" : "O");
  
  if (!["easy", "hard", "super"].includes(mode)) {
    await sendMessageWarning(api, message, "Chế độ không hợp lệ! Chọn: easy, hard, hoặc super");
    return;
  }
  
  if (!["X", "O"].includes(playerMark)) {
    await sendMessageWarning(api, message, "Quân cờ không hợp lệ! Chọn X hoặc O");
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
  
  const modeText = mode === "easy" ? "dễ" : mode === "hard" ? "khó" : "thách đấu";
  const turnMsg = playerMark === "X" 
    ? `\n👉 Đến Lượt Bạn\n\n🔢 Hãy chọn số từ 1-256 để đánh quân cờ.` 
    : "(Bot đi trước)";
  
  await api.sendMessage(
    {
      msg: `@${message.data.dName}\n🎮 Trận Caro bắt đầu! ${turnMsg}\n🤖 Độ khó: ${modeText}`,
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
    setTimeout(() => handleBotTurn(api, message), 1000);
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
    
    const modeText = game.mode === "easy" ? "dễ" : game.mode === "hard" ? "khó" : "thách đấu";
    
    await api.sendMessage(
      {
        msg: `@${game.playerName}\n🎮 Trận Caro hòa!\n🤖 Độ khó: ${modeText}\n\n🔗 Hòa do không còn nước đi(256/256).`,
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
  
  const modeText = game.mode === "easy" ? "dễ" : game.mode === "hard" ? "khó" : "thách đấu";
  
  if (winner) {
    await api.sendMessage(
      {
        msg: `@${game.playerName}\n🎮 Trận Caro kết thúc!\n🤖 Độ khó: ${modeText}\n\n🔢 Bot đánh ô số ${pos + 1}\n🎉 Bot thắng!`,
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
        msg: `@${game.playerName}\n🎮 Trận Caro tiếp diễn!\n🤖 Độ khó: ${modeText}\n\n🔢 Bot đánh ô số ${pos + 1}\n👉 Đến lượt bạn!`,
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
    await sendMessageWarning(api, message, "Số ô không hợp lệ! Chọn từ 1-256.");
    startTurnTimer(api, message, threadId, true);
    return;
  }
  
  if (game.board[pos] !== ".") {
    await sendMessageWarning(api, message, "Ô này đã có quân! Chọn ô trống.");
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
  
  const modeText = game.mode === "easy" ? "dễ" : game.mode === "hard" ? "khó" : "thách đấu";
  
  if (winner) {
    await api.sendMessage(
      {
        msg: `@${game.playerName}\n🎮 Trận Caro kết thúc!\n🤖 Độ khó: ${modeText}\n\n👤 Bạn đánh ô số ${pos + 1}\n🎉 ${game.playerName} thắng!`,
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
  
  await api.sendMessage(
    {
      msg: `@${game.playerName}\n🎮 Trận Caro đang diễn ra!\n🤖 Độ khó: ${modeText}\n\n👤 Bạn đánh ô số ${pos + 1}\n🧭 Bot đang suy nghĩ...`,
      mentions: [{ pos: 1, uid: game.playerId, len: game.playerName.length }],
      attachments: [imagePath]
    },
    threadId,
    message.type
  );
  
  try {
    await fs.unlink(imagePath);
  } catch (error) {}
  
  setTimeout(() => handleBotTurn(api, message), 1500);
}
