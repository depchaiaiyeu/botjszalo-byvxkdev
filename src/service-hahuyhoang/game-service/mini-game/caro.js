import { GoogleGenerativeAI } from "@google/generative-ai";
import { createCanvas, loadImage } from "canvas";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { sendMessageComplete, sendMessageWarning } from "../../chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service.js";
import { removeMention } from "../../../utils/format-util.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const genAI = new GoogleGenerativeAI("AIzaSyANli4dZGQGSF2UEjG9V-X0u8z56Zm8Qmc");

const activeCaroGames = new Map();
const turnTimers = new Map();

const SYSTEM_INSTRUCTION = `You are an expert Gomoku/Caro AI player.

GAME RULES:
- 16x16 board with positions numbered 1-256
- Win condition: 5 consecutive pieces (horizontal, vertical, or diagonal)
- You must output ONLY a single number (1-256) representing your move
- The number must correspond to an EMPTY position marked with "."

BOARD FORMAT:
You will receive the board in this format:
Position 1: X | Position 2: . | Position 3: O | ... | Position 16: .
Position 17: . | Position 18: X | ... | Position 32: .
...

Where:
- "X" represents one player's pieces
- "O" represents the other player's pieces  
- "." represents empty positions
- Each position is clearly numbered 1-256

STRATEGY PRIORITIES (in order):
1. WIN IMMEDIATELY: If you can make 5 in a row, choose that position
2. BLOCK OPPONENT WIN: If opponent can make 5 in a row next turn, block it
3. CREATE DOUBLE THREAT: Create two potential winning lines simultaneously
4. MAKE OPEN FOUR: Create 4 in a row with both ends open (e.g., . X X X X .)
5. BLOCK OPEN FOUR: Prevent opponent's open four
6. MAKE OPEN THREE: Create 3 in a row with both ends open (e.g., . X X X .)
7. BLOCK OPEN THREE: Prevent opponent's open three
8. EXTEND YOUR CHAINS: Extend existing 2-3 piece sequences
9. CONTROL CENTER: Prioritize central positions (113-144)
10. STAY CONNECTED: Place pieces near existing ones (within 2 squares)

ANALYSIS METHOD:
For each empty position, evaluate:
- Can this move create 5 in a row? → HIGHEST PRIORITY
- Can this move block opponent's 5? → SECOND HIGHEST
- How many directions does this strengthen?
- Does this create multiple threats?
- Is this near the center and existing pieces?

OUTPUT RULES:
- Output ONLY a number from 1 to 256
- NO explanations, NO text, NO reasoning
- The number must be a valid empty position
- Example valid outputs: "137" or "89" or "201"
- Invalid outputs: "Let me think..." or "Position 137" or "137 because..."`;

const DIFFICULTY_PROMPTS = {
  easy: "Play at EASY level: Focus on basic defense, block obvious winning moves, prefer center positions.",
  hard: "Play at HARD level: Balance offense and defense, create 3-4 piece chains, control key positions, think 3-4 moves ahead.",
  super: "Play at SUPER level: AGGRESSIVE STRATEGY - prioritize creating double threats and forcing sequences, think 5-7 moves ahead, create multiple simultaneous attacks."
};

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
  
  ctx.fillStyle = "#000000";
  ctx.font = "9px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const num = row * size + col + 1;
      const x = padding + col * cellSize + cellSize / 2;
      const y = boardTop + padding + row * cellSize + cellSize / 2;
      
      if (board[row * size + col] === ".") {
        ctx.fillText(num.toString(), x, y);
      }
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

async function getAIMove(board, playerMark, mode) {
  const botMark = playerMark === "X" ? "O" : "X";
  
  const boardParts = [];
  for (let i = 0; i < 256; i++) {
    boardParts.push(`Position ${i + 1}: ${board[i]}`);
  }
  
  const boardStr = boardParts.join(" | ");
  
  const chunkSize = 16;
  const visualBoard = [];
  for (let i = 0; i < 16; i++) {
    const rowStart = i * 16;
    const rowEnd = rowStart + 16;
    const rowData = boardParts.slice(rowStart, rowEnd).join(" | ");
    visualBoard.push(`Row ${i + 1}: ${rowData}`);
  }
  
  const emptyPositions = [];
  for (let i = 0; i < 256; i++) {
    if (board[i] === ".") {
      emptyPositions.push(i + 1);
    }
  }
  
  const prompt = `CURRENT BOARD STATE:
${visualBoard.join("\n")}

GAME INFORMATION:
- YOUR pieces (Bot): ${botMark}
- OPPONENT pieces: ${playerMark}
- Empty positions available: ${emptyPositions.slice(0, 30).join(", ")}${emptyPositions.length > 30 ? "..." : ""}

DIFFICULTY: ${DIFFICULTY_PROMPTS[mode]}

CRITICAL REMINDERS:
1. Analyze the board for immediate winning moves (5 in a row)
2. Check if opponent can win next turn and BLOCK it
3. Look for positions that create multiple threats
4. Consider positions that extend your existing chains
5. Output ONLY a number (1-256), nothing else

YOUR MOVE (single number only):`;

  try {
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.0-flash-exp",
      systemInstruction: SYSTEM_INSTRUCTION,
      generationConfig: {
        temperature: mode === "easy" ? 0.3 : mode === "hard" ? 0.15 : 0.05,
        topP: mode === "easy" ? 0.9 : mode === "hard" ? 0.85 : 0.8,
        topK: mode === "easy" ? 20 : mode === "hard" ? 10 : 5,
        maxOutputTokens: 10,
      }
    });
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text().trim();
    
    const match = text.match(/\b(\d+)\b/);
    if (match) {
      const pos = parseInt(match[1], 10) - 1;
      if (pos >= 0 && pos < 256 && board[pos] === ".") {
        return pos;
      }
    }
  } catch (error) {
    console.error("AI Error:", error);
  }
  
  const emptySpots = [];
  for (let i = 0; i < board.length; i++) {
    if (board[i] === ".") emptySpots.push(i);
  }
  
  if (emptySpots.length > 0) {
    const center = 128;
    emptySpots.sort((a, b) => {
      const distA = Math.abs(a - center);
      const distB = Math.abs(b - center);
      return distA - distB;
    });
    return emptySpots[0];
  }
  
  return -1;
}

function checkWin(board, size = 16, need = 5) {
  const directions = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1]
  ];
  
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const idx = row * size + col;
      const mark = board[idx];
      if (mark === ".") continue;
      
      for (const [dr, dc] of directions) {
        let count = 1;
        for (let step = 1; step < need; step++) {
          const newRow = row + dr * step;
          const newCol = col + dc * step;
          if (newRow < 0 || newRow >= size || newCol < 0 || newCol >= size) break;
          const newIdx = newRow * size + newCol;
          if (board[newIdx] !== mark) break;
          count++;
        }
        if (count >= need) return mark;
      }
    }
  }
  
  return null;
}

export async function handleCaroCommand(api, message) {
  const threadId = message.threadId;
  const content = removeMention(message);
  const prefix = getGlobalPrefix();
  const args = content.split(/\s+/);
  
  if (!content.includes(`${prefix}caro`)) return;
  
  if (args.length < 3) {
    await sendMessageComplete(api, message, 
      `🎮 Hướng dẫn chơi cờ Caro:\n\n` +
      `📌 ${prefix}caro [easy/hard/super] [x/o]\n` +
      `   - Chọn độ khó và quân cờ của bạn\n` +
      `   - X luôn đi trước\n` +
      `   - Nhập số ô (1-256) để đánh\n` +
      `   - 5 quân liên tiếp thắng!\n` +
      `   - ⏰ Mỗi lượt có 60 giây\n\n` +
      `🎯 Độ khó:\n` +
      `   • easy: Dễ dàng\n` +
      `   • hard: Khó khăn\n` +
      `   • super: Thách đấu\n\n` +
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
  const playerMark = args[2].toUpperCase();
  
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
  
  const pos = await getAIMove(game.board, game.playerMark, game.mode);
  
  clearTurnTimer(threadId);
  
  if (!activeCaroGames.has(threadId)) return;
  
  if (pos === -1) {
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
