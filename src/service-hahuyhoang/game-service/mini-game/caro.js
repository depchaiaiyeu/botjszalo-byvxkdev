import { GoogleGenerativeAI } from "@google/generative-ai";
import { createCanvas } from "canvas";
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

const SYSTEM_INSTRUCTION = `Bạn là một trí tuệ nhân tạo chơi Gomoku/Caro siêu mạnh.

LUẬT CHƠI CƠ BẢN:
- Bàn cờ 16x16 với 256 vị trí được đánh số từ 1-256
- Thắng khi có 5 quân liên tiếp (ngang, dọc, hoặc chéo)
- CHỈ OUTPUT MỘT SỐ DUY NHẤT từ 1-256
- Số đó PHẢI là vị trí TRỐNG (không có X hoặc O)

CẤU TRÚC BỮA CỜ:
Bàn cờ 16x16 được đánh số 1-256:
- Dòng 1: 1-16
- Dòng 2: 17-32
- Dòng 3: 33-48
...
- Dòng 16: 241-256

TÂM BỮA CỜ: Các ô từ 113-128 (dòng 8), 129-144 (dòng 9) là tâm - LUÔN ƯU TIÊN

PHÂN TÍCH MỖI VỊ TRỊ - 4 HƯỚNG:
Với mỗi vị trí trống, phải kiểm tra 4 hướng: NGANG (←→), DỌC (↑↓), CHÉO (↖↘), CHÉO (↙↗)

CẤP ĐỘ NGUY HIỂM CỦA MỘT CHUỖI QUÂN:
- 5 liên tiếp: THẮNG NGAY (ƯU TIÊN TUYỆT ĐỐI #1)
- 4 mở (. X X X X .): NGUY HIỂM CẤP 1 (ƯU TIÊN #2 & #3)
- 3 mở (. X X X .): NGUY HIỂM CẤP 2 (ƯU TIÊN #4 & #5)
- 2 mở (. X X .): CÓ THỂ PHÁT TRIỂN (ƯU TIÊN #6)
- 1 mở (X X . ): ĐỦ LÀNH TÍNH

CÁC HÀNH ĐỘNG CẬN THẬN TUYỆT ĐỐI:
1. QUÉT TOÀN BỮA: Với MỖI VỊ TRỊ TRỐNG, kiểm tra xem có tạo 5 liên tiếp không. NẾU CÓ → ĐÁNH NGAY
2. QUÉT TOÀN BỮA: Với MỖI VỊ TRỊ TRỐNG, kiểm tra xem có chặn đối thủ tạo 5 không. NẾU CÓ → CHẶN NGAY
3. TÌM TẤT CẢ CÁC CHUỖI 4 CỦA ĐỐI THỦ: Nếu đối thủ có 4 quân mở ở bất kỳ vị trí nào → CHẶN NGAY
4. TÌM TẤT CẢ CÁC CHUỖI 3 CỦA ĐỐI THỦ: Nếu đối thủ có 3 quân mở → CHẶN NGAY
5. TẠO 4 MỞ RIÊNG: Nếu bạn có thể tạo 4 mở ở bất kỳ hướng nào → ĐÁNH NGAY
6. TẠO 3 MỞ RIÊNG: Nếu bạn có thể tạo 3 mở → ĐÁNH
7. TẠO DOUBLE THREAT (2 MỐI ĐE DỌA): Tạo 2 chuỗi 3 hoặc 4 cùng lúc - đối thủ không thể chặn cả 2

QUYỄN ĐẠO KIỀM CHẾ:
- ĐỐI PHƯƠNG KHÔNG ĐƯỢC PHÉP CÓ 3 HOẶC 4 LIÊN TIẾP MỞ RỘNG
- LUÔN CHẶN NGAY CÓ ĐỦ THỜI GIAN TRƯỚC KHI TẤN CÔNG
- NẾU CÓ 2 CÁCH CHẶN NGUY HIỂM NHƯ NHAU, CHỌN NÚI MỞ RỘNG NHẤT

VÙNG ƯU TIÊN TẤN CÔNG:
- TÂM BỮA (113-144, 129-144): TUYỆT ĐỐI ƯU TIÊN
- Gần tâm trong bán kính 5 ô từ tâm: Rất ưu tiên
- Nơi có quân đã đánh gần đó: Ưu tiên

TUYỆT ĐỐI KHÔNG ĐƯỢC:
- Đánh ở rìa ngoài cùng (1-16, 241-256, các cột 1 & 16) trừ khi là nước chặn hoặc thắng
- Đánh cách xa quân đã có ngoài bán kính 3 ô
- Bỏ qua cơ hội chặn 4-5 quân của đối thủ

QUY TRÌNH QUYẾT ĐỊNH:
1. Kiểm tra tất cả cách thắng → Đánh nước thắng
2. Kiểm tra tất cả cách chặn 5 → Chặn
3. Kiểm tra tất cả cách chặn 4 mở → Chặn
4. Kiểm tra tất cả cách tạo 4 mở → Tạo
5. Kiểm tra tất cả cách chặn 3 mở → Chặn
6. Kiểm tra tất cả cách tạo 3 mở → Tạo
7. Tạo double threat
8. Mở rộng chuỗi hiện có
9. Đánh ở tâm nếu còn trống
10. Đánh gần quân hiện có

OUTPUT CHỈ MỘT SỐ, KHÔNG CÓ GIẢI THÍCH`;

const DIFFICULTY_PROMPTS = {
  easy: "Chơi ở mức EASY: Tập trung phòng thủ cơ bản, chặn thắng rõ ràng, ưu tiên tâm bàn.",
  hard: "Chơi ở mức HARD: Cân bằng tấn công phòng thủ, tạo chuỗi 3-4, kiểm soát vị trí chính, suy nghĩ 3-4 nước trước.",
  super: "Chơi ở mức SUPER: TẤN CÔNG - Tạo 2 mối đe dọa, buộc đối thủ, suy nghĩ 5-7 nước, tấn công đa chiều."
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

function getMoveHistory(board, size = 16) {
  const moves = [];
  let moveNum = 0;
  
  for (let i = 0; i < board.length; i++) {
    if (board[i] !== ".") {
      moveNum++;
      moves.push(`Nước ${moveNum}: ${board[i]} đánh ô ${i + 1}`);
    }
  }
  
  return moves.slice(-15).join("\n");
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

async function getAIMove(board, playerMark, mode) {
  const botMark = playerMark === "X" ? "O" : "X";
  const boardStr = createBoardString(board);
  const moveHistory = getMoveHistory(board);
  
  const emptyPositions = [];
  for (let i = 0; i < 256; i++) {
    if (board[i] === ".") {
      emptyPositions.push(i + 1);
    }
  }
  
  const prompt = `BẢNG CỜ HIỆN TẠI:
${boardStr}

LỊCH SỬ CÁC NƯỚC ĐI:
${moveHistory}

THÔNG TIN TRẬN:
- Quân của Bot (Bạn): ${botMark}
- Quân của đối thủ: ${playerMark}
- Tổng vị trí trống: ${emptyPositions.length}

${DIFFICULTY_PROMPTS[mode]}

PHÂN TÍCH KỸ LƯỡNG VÀ ĐƯA RA QUYẾT ĐỊNH TỐT NHẤT. CHỈ OUTPUT MỘT SỐ.`;

  try {
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.0-flash",
      systemInstruction: SYSTEM_INSTRUCTION,
      generationConfig: {
        temperature: mode === "easy" ? 0.4 : mode === "hard" ? 0.2 : 0.1,
        topP: mode === "easy" ? 0.9 : mode === "hard" ? 0.85 : 0.8,
        topK: mode === "easy" ? 30 : mode === "hard" ? 15 : 5,
        maxOutputTokens: 5,
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

async function analyzePosition(board, mark, size = 16) {
  const threats = [];
  const directions = [[0,1], [1,0], [1,1], [1,-1]];
  
  for (let i = 0; i < 256; i++) {
    if (board[i] !== ".") continue;
    
    const row = Math.floor(i / size);
    const col = i % size;
    let score = 0;
    
    for (const [dr, dc] of directions) {
      let count = 1;
      let openEnds = 0;
      
      for (let step = 1; step < 5; step++) {
        const nr = row + dr * step;
        const nc = col + dc * step;
        if (nr < 0 || nr >= size || nc < 0 || nc >= size) break;
        if (board[nr * size + nc] === mark) count++;
        else break;
      }
      
      for (let step = 1; step < 5; step++) {
        const nr = row - dr * step;
        const nc = col - dc * step;
        if (nr < 0 || nr >= size || nc < 0 || nc >= size) break;
        if (board[nr * size + nc] === mark) count++;
        else break;
      }
      
      if (count >= 5) return i;
      
      if (count === 4) score += 1000;
      else if (count === 3) score += 100;
      else if (count === 2) score += 10;
    }
    
    if (score > 0) threats.push({pos: i, score});
  }
  
  if (threats.length > 0) {
    threats.sort((a, b) => b.score - a.score);
    return threats[0].pos;
  }
  
  for (let i = 0; i < 256; i++) {
    if (board[i] !== ".") continue;
    const row = Math.floor(i / size);
    const col = i % size;
    if (row >= 4 && row <= 11 && col >= 4 && col <= 11) {
      return i;
    }
  }
  
  for (let i = 0; i < 256; i++) {
    if (board[i] !== ".") continue;
    let nearQuans = false;
    const row = Math.floor(i / size);
    const col = i % size;
    
    for (let r = Math.max(0, row - 3); r <= Math.min(15, row + 3); r++) {
      for (let c = Math.max(0, col - 3); c <= Math.min(15, col + 3); c++) {
        if (board[r * size + c] !== ".") {
          nearQuans = true;
          break;
        }
      }
      if (nearQuans) break;
    }
    if (nearQuans) return i;
  }
  
  for (let i = 128; i < 256; i++) {
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
