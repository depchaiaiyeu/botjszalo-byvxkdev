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

LUẬT CHƠI:
- Bàn cờ 16x16 với 256 vị trí được đánh số từ 1-256
- Thắng khi có 5 quân liên tiếp (ngang, dọc, chéo)
- CHỈ OUTPUT MỘT SỐ DUY NHẤT từ 1-256
- Số đó PHẢI là vị trí TRỐNG (không có X hoặc O)

ĐỌC BẢNG CỜ:
Bàn cờ được hiển thị dưới dạng 16 dòng, mỗi dòng 16 ô.
- Nếu ô có X hoặc O, hiển thị ký tự đó
- Nếu ô trống, hiển thị số từ 1-256
- Các số được sắp xếp từ trái sang phải, từ trên xuống dưới

VÍ DỤ:
  1    2    3    4    5    6    7    8    9   10   11   12   13   14   15   16
 17   18   19   20   21   22   23   24   25   26   27   28   29   30   31   32
 33   34   35   36   37   38   39   40   41   42   43   44   45   46   47   48
 49   50   51   52   53   54   55   56   57   58   59   60   61   62   63   64
 65   66   67   68   69   70   71   72   73   74   75   76   77   78   79   80
 81   82   83   84   85   86   87   88   89   90   91   92   93   94   95   96
 97   98   99  100  101  102  103  104  105  106  107  108  109  110  111  112
113  114  115  116  117  118  119  120  121  122  123  124  125  126  127  128
129  130  131  132  133  134  135  136  137  138  139  140  141  142  143  144
145  146  147  148  149  150  151  152  153  154  155  156  157  158  159  160
161  162  163  164  165  166  167  168  169  170  171  172  173  174  175  176
177  178  179  180  181  182  183  184  185  186  187  188  189  190  191  192
193  194  195  196  197  198  199  200  201  202  203  204  205  206  207  208
209  210  211  212  213  214  215  216  217  218  219  220  221  222  223  224
225  226  227  228  229  230  231  232  233  234  235  236  237  238  239  240
241  242  243  244  245  246  247  248  249  250  251  252  253  254  255  256

Khi người chơi đánh vị trí nào, số đó sẽ được thay bằng X hoặc O tương ứng.

CHIẾN LƯỢC ƯU TIÊN:
1. THẮNG NGAY: Nếu có thể tạo 5 liên tiếp, đánh vị trí đó
2. CHẶN THẮNG: Nếu đối thủ có thể thắng ở lượt sau, chặn ngay
3. TẠO HAI MỐI ĐE DỌA: Tạo 2 đường thắng tiềm năng
4. TẠO 4 MỞ: Tạo 4 liên tiếp với cả 2 đầu trống
5. CHẶN 4 MỞ: Chặn 4 mở của đối thủ
6. TẠO 3 MỞ: Tạo 3 liên tiếp với cả 2 đầu trống
7. CHẶN 3 MỞ: Chặn 3 mở của đối thủ
8. MỞ RỘNG CHUỖI: Kéo dài chuỗi 2-3 quân
9. KIỂM SOÁT TÂM: Ưu tiên vị trí 113-144
10. GẦN NHAU: Đặt gần quân đã có

PHÂN TÍCH CHI TIẾT MỖI VỊ TRỊ TRỐNG VÀ ĐƯA RA QUYẾT ĐỊNH TỐT NHẤT.

OUTPUT RULES:
- CHỈ OUTPUT MỘT SỐ
- KHÔNG có text, KHÔNG có giải thích
- Ví dụ: "121" hoặc "89"`;

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
