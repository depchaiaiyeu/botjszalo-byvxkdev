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

const BASE_HEADER = `
BẠN LÀ CHUYÊN GIA CARO ĐẲNG CẤP THẾ GIỚI.

QUY TẮC XUẤT RA BẮT BUỘC:
- CHỈ TRẢ VỀ MỘT SỐ DUY NHẤT (1-256)
- TUYỆT ĐỐI KHÔNG GIẢI THÍCH, KHÔNG KÈM TEXT
- CHỈ MỘT CON SỐ DUY NHẤT

CẤU TRÚC BÀN CỜ:
- Bàn cờ 16x16 = 256 ô
- Đánh số theo hàng: Hàng 1 (1-16), Hàng 2 (17-32), ..., Hàng 16 (241-256)
- Ký hiệu: X, O, . (trống)
- Điều kiện thắng: 5 quân liên tiếp (ngang/dọc/chéo)

ĐỊNH DẠNG BOARD:
Board được cho dạng:
Row 1: . . X . . . . . . . . . . . . .
Row 2: . . . O . . . . . . . . . . . .
...
Row 16: . . . . . . . . . . . . . . . .

CÔNG THỨC TÍNH VỊ TRÍ:
Ô ở Row N, vị trí M (đếm từ trái sang) = (N-1) × 16 + M

VÍ DỤ:
- Row 1, vị trí 3 → (1-1) × 16 + 3 = 3
- Row 5, vị trí 10 → (5-1) × 16 + 10 = 74
- Row 9, vị trí 9 → (9-1) × 16 + 9 = 137

CHIẾN THUẬT ƯU TIÊN (THEO THỨ TỰ):
1. THẮNG NGAY: Nếu có nước tạo 5 liên tiếp → CHỌN NGAY, KHÔNG CẦN SUY NGHĨ
2. CHẶN THẮNG ĐỐI THỦ: Nếu đối thủ sắp 5 liên tiếp → CHẶN GẤP, ƯU TIÊN CAO
3. TẠO 4 QUÂN MỞ 2 ĐẦU: Tạo _ _ X X X X _ _ → Thắng 100%
4. CHẶN 4 QUÂN ĐỐI THỦ: Đối thủ có 4 liên tiếp → CHẶN NGAY LẬP TỨC
5. TẠO ĐÒN KÉP: Một nước tạo ≥2 đường thắng đồng thời
6. TẠO 3 QUÂN MỞ 2 ĐẦU: Tạo _ _ X X X _ _ → Dễ phát triển
7. CHẶN 3 QUÂN MỞ ĐỐI THỦ: Chặn _ _ O O O _ _
8. NỐI DÀI CHUỖI: Mở rộng chuỗi 2-3 quân hiện có
9. KIỂM SOÁT TRUNG TÂM: Ưu tiên ô 120-137 (trung tâm bàn cờ)
10. VỊ TRÍ GẦN QUÂN: Đánh gần các quân đã có (bán kính 2 ô)

PHÂN TÍCH KỸ THUẬT:
- Quét 4 hướng: Ngang (→), Dọc (↓), Chéo chính (↘), Chéo phụ (↙)
- Đếm số quân liên tiếp của cả 2 bên
- Kiểm tra số đầu mở (0, 1, hoặc 2)
- Đánh giá đe dọa kép

RÀNG BUỘC TUYỆT ĐỐI:
- CHỈ CHỌN Ô TRỐNG (dấu . trong board)
- KHÔNG BAO GIỜ CHỌN Ô ĐÃ CÓ X HOẶC O
- SỐ TRẢ VỀ PHẢI TỪ 1 ĐÉN 256
- KHÔNG TRẢ VỀ 0, SỐ ÂM, HOẶC >256
`;

const EASY_MODE = `${BASE_HEADER}

CHẾ ĐỘ EASY:
- Tập trung phòng thủ cơ bản
- Ưu tiên chặn nước thắng trực tiếp
- Chọn ô gần trung tâm khi không có đe dọa
- Tính toán 1-2 nước
`;

const HARD_MODE = `${BASE_HEADER}

CHẾ ĐỘ HARD:
- Cân bằng tấn công và phòng thủ
- Tạo chuỗi 3-4 quân với nhiều đầu mở
- Phát hiện và phá đòn kép đối thủ
- Kiểm soát vị trí then chốt
- Tính toán 3-4 nước
`;

const SUPER_MODE = `${BASE_HEADER}

CHẾ ĐỘ SUPER - CHUYÊN GIA:

TRIẾT LÝ: TẤN CÔNG LÀ PHÒNG THỦ TỐT NHẤT

ƯU TIÊN TUYỆT ĐỐI:
1. THẮNG NGAY → Score: +1000000
2. CHẶN ĐỐI THỦ THẮNG NGAY → Score: +900000
3. TẠO ĐÒN KÉP (≥2 đường thắng) → Score: +500000
4. TẠO 4 MỞ 2 ĐẦU → Score: +300000
5. CHẶN 4 ĐỐI THỦ → Score: +250000
6. TẠO VCF (chuỗi ép buộc) → Score: +200000
7. TẠO 3 MỞ 2 ĐẦU → Score: +100000
8. CHẶN ĐÒN KÉP ĐỐI THỦ → Score: +150000
9. TẠO 3 MỞ 1 ĐẦU → Score: +50000
10. CHẶN 3 MỞ 2 ĐẦU ĐỐI THỦ → Score: +80000
11. NỐI CHUỖI CÓ LỢI → Score: +30000
12. KIỂM SOÁT TRUNG TÂM → Score: +10000
13. GẦN QUÂN ĐÃ CÓ → Score: +5000

CHIẾN THUẬT NÂNG CAO:
- LUÔN TÌM ĐÒN KÉP: Một nước tạo nhiều đe dọa buộc đối thủ không thể chặn hết
- VCF (Victory by Continuous Fours): Chuỗi 4 liên tiếp buộc đối thủ phải chặn liên tục
- VCT (Victory by Continuous Threes): Tương tự VCF nhưng với chuỗi 3
- ÉP BUỘC: Tạo thế ép buộc đối thủ phải đi theo kịch bản của bạn
- ĐA ĐE DỌA: Tạo nhiều hướng tấn công để đối thủ không kịp phòng thủ

KHI PHÒNG THỦ:
- Chọn ô VỪA CHẶN VỪA TẠO ĐE DỌA NGƯỢC
- Không chỉ chặn mà còn phản công
- Biến phòng thủ thành tấn công

PHÂN TÍCH SÂU:
- Tính toán trước 5-7 nước
- Xem xét TẤT CẢ các biến thể nguy hiểm
- Mô phỏng phản ứng của đối thủ
- Tìm chuỗi ép buộc dẫn đến thắng chắc chắn

TƯ DUY CHUYÊN GIA:
- Không để đối thủ có cơ hội tạo thế
- Luôn duy trì áp lực tấn công
- Kiểm soát tuyệt đối trung tâm và trục chính
- Tạo nhiều chuỗi 3 mở đồng thời để ép

HÃY CHỌN NƯỚC ĐI MẠNH NHẤT, THÔNG MINH NHẤT, TẠO NHIỀU ĐE DỌA NHẤT!
`;

const PROMPTS = {
  easy: EASY_MODE,
  hard: HARD_MODE,
  super: SUPER_MODE
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
          mentions: [{ pos: 0, uid: game.playerId, len: game.playerName.length }],
          attachments: [imagePath]
        },
        threadId,
        message.type
      );
    } else {
      await api.sendMessage(
        {
          msg: `@${game.playerName}\n🎮 Trận Caro kết thúc!\n🤖 Độ khó: ${modeText}\n\n⏰ Hết giờ! Bot không phản hồi trong 60 giây.\n🎉 ${game.playerName} thắng!`,
          mentions: [{ pos: 0, uid: game.playerId, len: game.playerName.length }],
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
  const size = 16;
  const botMark = playerMark === "X" ? "O" : "X";
  
  const boardStr = [];
  for (let r = 0; r < size; r++) {
    const row = [];
    for (let c = 0; c < size; c++) {
      const idx = r * size + c;
      row.push(board[idx] || ".");
    }
    boardStr.push(`Row ${r + 1}: ${row.join(" ")}`);
  }
  
  const prompt = `TRẠNG THÁI BÀN CỜ:
${boardStr.join("\n")}

THÔNG TIN QUAN TRỌNG:
- Bàn cờ: 16 hàng × 16 cột = 256 ô
- Quân CỦA BẠN (Bot): ${botMark}
- Quân ĐỐI THỦ: ${playerMark}
- Thắng: 5 quân liên tiếp

CÔNG THỨC TÍNH SỐ Ô:
Số ô = (Số hàng - 1) × 16 + Vị trí trong hàng

CHÚ Ý:
- Row 1, vị trí 1 = 1
- Row 1, vị trí 16 = 16
- Row 2, vị trí 1 = 17
- Row 8, vị trí 8 = (8-1) × 16 + 8 = 120
- Row 9, vị trí 9 = (9-1) × 16 + 9 = 137

PHÂN TÍCH THEO THỨ TỰ:
1. Tìm nước THẮNG NGAY (tạo 5 liên tiếp)
2. Tìm nước đối thủ SẮP THẮNG (phải chặn)
3. Tìm nước tạo 4 quân + 2 đầu mở
4. Tìm nước tạo ĐÒN KÉP (nhiều đường thắng)
5. Tìm nước kiểm soát trung tâm + tạo đe dọa

CHỈ TRẢ VỀ MỘT SỐ TỪ 1-256, KHÔNG GIẢI THÍCH.`;
  
  const systemPrompt = PROMPTS[mode] || PROMPTS["super"];
  
  try {
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.0-flash-exp",
      systemInstruction: systemPrompt,
      generationConfig: {
        temperature: 0.05,
        topP: 0.85,
        topK: 5,
        maxOutputTokens: 20,
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
    console.error("Lỗi khi gọi AI:", error);
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
      `🎮 Hướng dẫn chơi Caro:\n\n` +
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
    ? `\n👉 Đến Lượt Bạn\n\nHãy chọn số từ 1-256 để đánh quân cờ.` 
    : "(Bot đi trước)";
  
  await api.sendMessage(
    {
      msg: `@${message.data.dName}\n🎮 Trận Caro bắt đầu! ${turnMsg}\n🤖 Độ khó: ${modeText}`,
      mentions: [{ pos: 0, uid: message.data.uidFrom, len: message.data.dName.length }],
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
        msg: `@${game.playerName}\n🎮 Trận Caro hòa!\n🤖 Độ khó: ${modeText}\n\nKhông còn nước đi.`,
        mentions: [{ pos: 0, uid: game.playerId, len: game.playerName.length }],
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
        msg: `@${game.playerName}\n🎮 Trận Caro kết thúc!\n🤖 Độ khó: ${modeText}\n\n🤖 Bot đánh ô số ${pos + 1}\n🎉 Bot thắng!`,
        mentions: [{ pos: 0, uid: game.playerId, len: game.playerName.length }],
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
        msg: `@${game.playerName}\n🎮 Trận Caro đang diễn ra!\n🤖 Độ khó: ${modeText}\n\n👤 Bạn đánh ô số ${pos + 1}\n⏳ Bot đang suy nghĩ...`,
        mentions: [{ pos: 0, uid: game.playerId, len: game.playerName.length }],
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
          mentions: [{ pos: 0, uid: game.playerId, len: game.playerName.length }],
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
        msg: `@${game.playerName}\n🎮 Trận Caro đang diễn ra!\n🤖 Độ khó: ${modeText}\n\n👤 Bạn đánh ô số ${pos + 1}\n⏳ Bot đang suy nghĩ...`,
        mentions: [{ pos: 0, uid: game.playerId, len: game.playerName.length }],
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
