import { GoogleGenerativeAI } from "@google/generative-ai";
import { createCanvas, loadImage } from "canvas";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { sendMessageComplete, sendMessageWarning } from "../../service-hahuyhoang/chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service-hahuyhoang/service.js";
import { removeMention } from "../../utils/format-util.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const genAI = new GoogleGenerativeAI("AIzaSyANli4dZGQGSF2UEjG9V-X0u8z56Zm8Qmc");

const activeCaroGames = new Map();

const BASE_HEADER = `
QUY TẮC XUẤT RA BẮT BUỘC:
- Chỉ trả về MỘT số nguyên duy nhất ứng với ô cần đánh (1..256).
- KHÔNG in giải thích, KHÔNG dấu chấm, KHÔNG ghi kèm ký tự nào khác.

MÔ HÌNH BÀN CỜ & CHỈ SỐ:
- Bàn cờ kích thước 16x16 (256 ô). Ô được đánh số 1..256 theo hàng:
  • Hàng 1: 1..16
  • Hàng 2: 17..32
  • ...
- Ký hiệu: X và O; '.' thể hiện ô trống.
- Bạn đánh với ký hiệu 'myMark'.
- Điều kiện thắng: có chuỗi liên tiếp 5 quân theo hàng, cột hoặc chéo.

RÀNG BUỘC HỢP LỆ:
- TUYỆT ĐỐI không chọn ô đã bị chiếm (khác '.').
- Nếu không tìm thấy nước "rất tốt", vẫn phải trả về MỘT ô trống hợp lệ (1..256).
- Không bao giờ trả về 0, số âm, hoặc số > 256.

THỨ TỰ ƯU TIÊN:
1) Nếu ta có nước thắng ngay => CHỌN NGAY.
2) Nếu đối thủ có nước thắng ngay => CHẶN NGAY.
3) Tạo đòn kép (double-threat) => ƯU TIÊN.
4) Tạo chuỗi 4 quân liên tiếp với đầu mở.
5) Tạo chuỗi 3 quân liên tiếp với 2 đầu mở.
6) Chặn các đe dọa của đối thủ.
7) Mở rộng vị trí gần trung tâm và các quân đã có.
`;

const EASY_MODE = `${BASE_HEADER}
ĐIỀU CHỈNH CHO DỄ:
- Ưu tiên an toàn, tránh lỗi.
- Khi không rõ ràng: chọn gần trung tâm.
`;

const HARD_MODE = `${BASE_HEADER}
ĐIỀU CHỈNH CHO KHÓ:
- Ưu tiên tạo/duy trì đòn kép; phá đòn kép của đối thủ ngay khi có thể.
- Ưu tiên chuỗi mở 3/4 trên trục/chéo trung tâm.
- Không đi góc/biên nếu không gia tăng đe doạ hoặc ngăn đe doạ.
`;

const CHALLENGE_MODE = `${BASE_HEADER}
ĐIỀU CHỈNH CHO THÁCH ĐẤU (ưu tiên ép thắng):
- Nếu có chuỗi ép buộc => CHỌN.
- Tạo double-threat > mọi lựa chọn khác.
- Ưu tiên nối dài chuỗi theo hướng gia tăng số đầu mở.
- Phòng thủ: chọn ô làm GIẢM TỐI ĐA số win-in-one của đối thủ ở lượt kế.
`;

const PROMPTS = {
  dễ: EASY_MODE,
  khó: HARD_MODE,
  "thách đấu": CHALLENGE_MODE
};

async function createCaroBoard(board, size = 16) {
  const cellSize = 40;
  const padding = 30;
  const width = size * cellSize + padding * 2;
  const height = size * cellSize + padding * 2;
  
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  
  ctx.fillStyle = "#f0d9b5";
  ctx.fillRect(0, 0, width, height);
  
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 1;
  
  for (let i = 0; i <= size; i++) {
    ctx.beginPath();
    ctx.moveTo(padding, padding + i * cellSize);
    ctx.lineTo(padding + size * cellSize, padding + i * cellSize);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(padding + i * cellSize, padding);
    ctx.lineTo(padding + i * cellSize, padding + size * cellSize);
    ctx.stroke();
  }
  
  ctx.fillStyle = "#666666";
  ctx.font = "10px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const num = row * size + col + 1;
      const x = padding + col * cellSize + cellSize / 2;
      const y = padding + row * cellSize + cellSize / 2;
      ctx.fillText(num.toString(), x, y);
    }
  }
  
  for (let i = 0; i < board.length; i++) {
    if (board[i] !== ".") {
      const row = Math.floor(i / size);
      const col = i % size;
      const x = padding + col * cellSize + cellSize / 2;
      const y = padding + row * cellSize + cellSize / 2;
      
      ctx.font = "bold 28px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      
      if (board[i] === "X") {
        ctx.fillStyle = "#ff0000";
        ctx.fillText("X", x, y);
      } else if (board[i] === "O") {
        ctx.fillStyle = "#0000ff";
        ctx.fillText("O", x, y);
      }
    }
  }
  
  return canvas.toBuffer("image/png");
}

async function getAIMove(board, playerMark, mode) {
  const size = 16;
  const need = 5;
  const botMark = playerMark === "X" ? "O" : "X";
  
  const boardStr = [];
  for (let r = 0; r < size; r++) {
    const row = [];
    for (let c = 0; c < size; c++) {
      const idx = r * size + c;
      row.push(board[idx] || ".");
    }
    boardStr.push(row.join(" "));
  }
  
  const prompt = `S = ${size}
need = ${need}
myMark = ${botMark}
Board ('.' là trống):
${boardStr.join("\n")}
Yêu cầu: chỉ trả về MỘT số hợp lệ (1..256) là ô TRỐNG tốt nhất cho '${botMark}'.`;
  
  const systemPrompt = PROMPTS[mode] || PROMPTS["khó"];
  
  try {
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.0-flash-exp",
      systemInstruction: systemPrompt
    });
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    const match = text.match(/\d+/);
    if (match) {
      const pos = parseInt(match[0], 10) - 1;
      if (pos >= 0 && pos < 256 && board[pos] === ".") {
        return pos;
      }
    }
  } catch (error) {
    console.error("Lỗi khi gọi AI:", error);
  }
  
  for (let i = 0; i < board.length; i++) {
    if (board[i] === ".") return i;
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
      `📌 ${prefix}caro [dễ/khó/thách đấu] [x/o]\n` +
      `   - Chọn độ khó và quân cờ của bạn\n` +
      `   - X luôn đi trước\n` +
      `   - Nhập số ô (1-256) để đánh\n` +
      `   - 5 quân liên tiếp thắng!\n\n` +
      `📌 ${prefix}caro leave - Rời khỏi trò chơi`
    );
    return;
  }
  
  if (args[1].toLowerCase() === "leave") {
    if (activeCaroGames.has(threadId)) {
      activeCaroGames.delete(threadId);
      await sendMessageComplete(api, message, "🚫 Trò chơi Caro đã kết thúc.");
    } else {
      await sendMessageWarning(api, message, "Không có trò chơi Caro nào đang diễn ra.");
    }
    return;
  }
  
  const mode = args[1].toLowerCase();
  const playerMark = args[2].toUpperCase();
  
  if (!["dễ", "khó", "thách đấu"].includes(mode)) {
    await sendMessageWarning(api, message, "Chế độ không hợp lệ! Chọn: dễ, khó, hoặc thách đấu");
    return;
  }
  
  if (!["X", "O"].includes(playerMark)) {
    await sendMessageWarning(api, message, "Quân cờ không hợp lệ! Chọn X hoặc O");
    return;
  }
  
  const board = Array(256).fill(".");
  const size = 16;
  
  activeCaroGames.set(threadId, {
    board,
    playerMark,
    botMark: playerMark === "X" ? "O" : "X",
    currentTurn: "X",
    mode,
    playerId: message.data.uidFrom,
    size
  });
  
  const imageBuffer = await createCaroBoard(board, size);
  const imagePath = path.resolve(process.cwd(), "assets", "temp", `caro_${threadId}.png`);
  await fs.writeFile(imagePath, imageBuffer);
  
  const turnMsg = playerMark === "X" 
    ? "Bạn đi trước! Nhập số ô (1-256) để đánh." 
    : "Bot đi trước...";
  
  await api.sendMessage(
    {
      msg: `🎮 Trò chơi Caro bắt đầu!\n\n` +
           `🎯 Chế độ: ${mode}\n` +
           `🔴 Bạn: ${playerMark}\n` +
           `🔵 Bot: ${playerMark === "X" ? "O" : "X"}\n\n` +
           `${turnMsg}`,
      attachments: [imagePath]
    },
    threadId,
    message.type
  );
  
  try {
    await fs.unlink(imagePath);
  } catch (error) {}
  
  if (playerMark === "O") {
    await handleBotTurn(api, message);
  }
}

async function handleBotTurn(api, message) {
  const threadId = message.threadId;
  const game = activeCaroGames.get(threadId);
  
  if (!game) return;
  
  const pos = await getAIMove(game.board, game.playerMark, game.mode);
  
  if (pos === -1) {
    await sendMessageComplete(api, message, "🎮 Hòa! Không còn nước đi.");
    activeCaroGames.delete(threadId);
    return;
  }
  
  game.board[pos] = game.botMark;
  game.currentTurn = game.playerMark;
  
  const winner = checkWin(game.board, game.size);
  
  const imageBuffer = await createCaroBoard(game.board, game.size);
  const imagePath = path.resolve(process.cwd(), "assets", "temp", `caro_${threadId}.png`);
  await fs.writeFile(imagePath, imageBuffer);
  
  if (winner) {
    await api.sendMessage(
      {
        msg: `🎉 Bot thắng!\n\n🔵 Bot đánh ô ${pos + 1}`,
        attachments: [imagePath]
      },
      threadId,
      message.type
    );
    activeCaroGames.delete(threadId);
  } else {
    await api.sendMessage(
      {
        msg: `🤖 Bot đánh ô ${pos + 1}\n\n👉 Đến lượt bạn!`,
        attachments: [imagePath]
      },
      threadId,
      message.type
    );
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
  const match = content.match(/^\d+$/);
  
  if (!match) return;
  
  const pos = parseInt(content, 10) - 1;
  
  if (pos < 0 || pos >= 256 || game.board[pos] !== ".") {
    await sendMessageWarning(api, message, "Ô không hợp lệ! Chọn ô trống (1-256).");
    return;
  }
  
  game.board[pos] = game.playerMark;
  game.currentTurn = game.botMark;
  
  const winner = checkWin(game.board, game.size);
  
  const imageBuffer = await createCaroBoard(game.board, game.size);
  const imagePath = path.resolve(process.cwd(), "assets", "temp", `caro_${threadId}.png`);
  await fs.writeFile(imagePath, imageBuffer);
  
  if (winner) {
    await api.sendMessage(
      {
        msg: `🎉 Bạn thắng!\n\n🔴 Bạn đánh ô ${pos + 1}`,
        attachments: [imagePath]
      },
      threadId,
      message.type
    );
    activeCaroGames.delete(threadId);
    try {
      await fs.unlink(imagePath);
    } catch (error) {}
    return;
  }
  
  await api.sendMessage(
    {
      msg: `🔴 Bạn đánh ô ${pos + 1}\n\n⏳ Bot đang suy nghĩ...`,
      attachments: [imagePath]
    },
    threadId,
    message.type
  );
  
  try {
    await fs.unlink(imagePath);
  } catch (error) {}
  
  await handleBotTurn(api, message);
}
