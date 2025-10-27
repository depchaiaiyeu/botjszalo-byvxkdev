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
QUY TẮC XUẤT RA BẮT BUỘC:
- Chỉ trả về MỘT số nguyên duy nhất ứng với ô cần đánh (1..256).
- KHÔNG in giải thích, KHÔNG dấu chấm, KHÔNG ghi kèm ký tự nào khác.
- CHỈ TRẢ VỀ SỐ DUY NHẤT.

MÔ HÌNH BÀN CỜ & CHỈ SỐ:
- Bàn cờ kích thước 16x16 (256 ô). Ô được đánh số 1..256 theo hàng:
  • Hàng 1: 1..16
  • Hàng 2: 17..32
  • Hàng 16: 241..256
- Ký hiệu: X và O; '.' thể hiện ô trống.
- Bạn đánh với ký hiệu 'myMark'.
- Điều kiện thắng: có chuỗi liên tiếp 5 quân theo hàng, cột hoặc chéo.

RÀNG BUỘC HỢP LỆ:
- TUYỆT ĐỐI không chọn ô đã bị chiếm (khác '.').
- Phải kiểm tra kỹ trạng thái bàn cờ trước khi chọn.
- Không bao giờ trả về 0, số âm, hoặc số > 256.
- Không chọn ô đã có X hoặc O.

CHIẾN THUẬT THÔNG MINH:
1) KIỂM TRA THẮNG NGAY: Nếu có nước tạo 5 quân liên tiếp => CHỌN NGAY
2) CHẶN ĐỐI THỦ THẮNG: Nếu đối thủ sắp có 5 quân liên tiếp => CHẶN NGAY
3) TẠO 4 QUÂN LIÊN TIẾP: Tạo chuỗi 4 quân với 2 đầu mở (đòn chắc chắn thắng)
4) CHẶN 4 QUÂN ĐỐI THỦ: Nếu đối thủ có 4 quân liên tiếp => CHẶN GẤP
5) TẠO 3 QUÂN MỞ: Tạo chuỗi 3 quân với 2 đầu mở
6) CHẶN 3 QUÂN MỞ ĐỐI THỦ: Chặn các chuỗi 3 quân nguy hiểm
7) NỐI DÀI CHUỖI: Mở rộng các chuỗi hiện có theo hướng có lợi
8) KIỂM SOÁT TRUNG TÂM: Ưu tiên các ô gần trung tâm bàn cờ (ô 120-136)
9) TẠO GIAO ĐIỂM: Đặt quân tại vị trí giao nhau của nhiều hướng tiềm năng

PHÂN TÍCH CHI TIẾT:
- Quét toàn bộ bàn cờ theo 4 hướng: ngang, dọc, chéo chính, chéo phụ
- Đếm số quân liên tiếp của cả 2 bên trong mỗi chuỗi
- Đánh giá số đầu mở (0, 1, hoặc 2 đầu) của mỗi chuỗi
- Ưu tiên các nước tạo nhiều đe dọa đồng thời

VỊ TRÍ CHIẾN LƯỢC:
- Trung tâm (ô 120, 121, 136, 137): Giá trị cao nhất
- Vòng trong (khoảng cách 2-3 từ trung tâm): Giá trị cao
- Gần các quân đã có (bán kính 2-3 ô): Tạo liên kết
- Tránh góc và biên nếu không có lý do chiến thuật
`;

const EASY_MODE = `${BASE_HEADER}

CHẾ ĐỘ EASY:
- Ưu tiên phòng thủ và an toàn
- Tập trung chặn các nước thắng trực tiếp của đối thủ
- Tạo các chuỗi 2-3 quân đơn giản
- Chọn các ô gần trung tâm khi không có đe dọa rõ ràng
- Không cần tính toán quá sâu, chỉ xét 1-2 nước tiếp theo
`;

const HARD_MODE = `${BASE_HEADER}

CHẾ ĐỘ HARD:
- Cân bằng giữa tấn công và phòng thủ
- Ưu tiên tạo chuỗi 3-4 quân với nhiều đầu mở
- Phát hiện và phá các đòn kép của đối thủ
- Tạo nhiều hướng tấn công đồng thời
- Kiểm soát các vị trí then chốt trên bàn cờ
- Tính toán trước 2-3 nước tiếp theo
- Không chỉ phản ứng mà chủ động tạo thế
`;

const SUPER_MODE = `${BASE_HEADER}

CHẾ ĐỘ SUPER (CHUYÊN GIA):
- Tư duy tấn công mạnh mẽ, ép buộc đối thủ phải phòng thủ
- LUÔN ƯU TIÊN TẠO ĐÒN KÉP: Một nước tạo ra ≥2 đe dọa thắng
- Phát hiện sớm chuỗi ép buộc (VCF/VCT): tạo các đòn 4 liên tiếp buộc đối thủ phải chặn
- Khi đối thủ có đòn kép tiềm năng => VÔ HIỆU HÓA NGAY
- Kiểm soát tuyệt đối trung tâm và các trục chính
- Tạo nhiều chuỗi 3 quân mở đồng thời để ép đối thủ
- Phân tích sâu 4-5 nước, tính toán tất cả biến thể nguy hiểm
- Nếu có chuỗi ép buộc dẫn đến thắng => THỰC HIỆN NGAY
- Không để đối thủ có cơ hội tạo thế, luôn duy trì áp lực
- Ưu tiên cực cao cho các nước tạo ĐA ĐE DỌA (multiple threats)
- Khi phòng thủ: chọn ô vừa chặn vừa tạo đe dọa ngược lại

CÔNG THỨC ĐÁNH GIÁ ƯU TIÊN (SUPER):
1. Thắng ngay: +1000000
2. Chặn đối thủ thắng ngay: +100000
3. Tạo đòn kép (2+ đường thắng): +50000
4. Tạo 4 quân 2 đầu mở: +10000
5. Chặn 4 quân đối thủ: +8000
6. Tạo 3 quân 2 đầu mở: +3000
7. Tạo chuỗi ép buộc VCF: +5000
8. Chặn đòn kép đối thủ: +4000
9. Nối dài chuỗi có lợi: +1000
10. Kiểm soát trung tâm: +500

TUYỆT ĐỐI GHI NHỚ:
- CHỈ TRẢ VỀ MỘT SỐ DUY NHẤT (1-256)
- KHÔNG GIẢI THÍCH, KHÔNG KÈM TEXT
- SỐ ĐÓ PHẢI LÀ Ô TRỐNG (dấu '.' trong board)
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
    
    const imageBuffer = await createCaroBoard(game.board, game.size);
    const imagePath = path.resolve(process.cwd(), "assets", "temp", `caro_${threadId}_timeout.png`);
    await fs.writeFile(imagePath, imageBuffer);
    
    if (isPlayerTurn) {
      await api.sendMessage(
        {
          msg: `⏰ Hết giờ!\n\n` +
               `${game.playerName} không đánh trong 60 giây.\n\n` +
               `🎉 Bot thắng!\n\n` +
               `👉 Bot không phải là thuốc, không có tác dụng thay thế thuốc chữa bệnh.`,
          attachments: [imagePath]
        },
        threadId,
        message.type
      );
    } else {
      await api.sendMessage(
        {
          msg: `⏰ Hết giờ!\n\n` +
               `Bot không phản hồi trong 60 giây.\n\n` +
               `🎉 ${game.playerName} thắng!\n\n` +
               `👉 Bot không phải là thuốc, không có tác dụng thay thế thuốc chữa bệnh.`,
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

async function createCaroBoard(board, size = 16) {
  const cellSize = 50;
  const padding = 40;
  const width = size * cellSize + padding * 2;
  const height = size * cellSize + padding * 2;
  
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  
  ctx.fillStyle = "#f0d9b5";
  ctx.fillRect(0, 0, width, height);
  
  ctx.strokeStyle = "#8b7355";
  ctx.lineWidth = 1.5;
  
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
  
  ctx.fillStyle = "#5d4e37";
  ctx.font = "bold 11px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const num = row * size + col + 1;
      const x = padding + col * cellSize + cellSize / 2;
      const y = padding + row * cellSize + cellSize / 2;
      
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
      const y = padding + row * cellSize + cellSize / 2;
      
      ctx.font = "bold 36px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      
      if (board[i] === "X") {
        ctx.fillStyle = "#dc143c";
        ctx.shadowColor = "rgba(220, 20, 60, 0.5)";
        ctx.shadowBlur = 8;
        ctx.fillText("X", x, y);
        ctx.shadowBlur = 0;
      } else if (board[i] === "O") {
        ctx.fillStyle = "#1e90ff";
        ctx.shadowColor = "rgba(30, 144, 255, 0.5)";
        ctx.shadowBlur = 8;
        ctx.fillText("O", x, y);
        ctx.shadowBlur = 0;
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

NHIỆM VỤ: Phân tích kỹ bàn cờ và trả về MỘT SỐ DUY NHẤT (1..256) là ô TRỐNG tốt nhất cho '${botMark}'.
QUAN TRỌNG: CHỈ TRẢ VỀ SỐ, KHÔNG GIẢI THÍCH.`;
  
  const systemPrompt = PROMPTS[mode] || PROMPTS["hard"];
  
  try {
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.0-flash-exp",
      systemInstruction: systemPrompt,
      generationConfig: {
        temperature: 0.7,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 50,
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
      `   • super: Chuyên gia\n\n` +
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
    size
  });
  
  const imageBuffer = await createCaroBoard(board, size);
  const imagePath = path.resolve(process.cwd(), "assets", "temp", `caro_${threadId}.png`);
  await fs.writeFile(imagePath, imageBuffer);
  
  const modeText = mode === "easy" ? "Dễ" : mode === "hard" ? "Khó" : "Chuyên gia";
  const turnMsg = playerMark === "X" 
    ? `👤 Đến lượt: ${message.data.dName}\n\n👉 Nhập số ô (1-256) để đánh.\n⏰ Bạn có 60 giây!` 
    : "🤖 Bot đi trước...";
  
  await api.sendMessage(
    {
      msg: `🎮 Trò chơi Caro bắt đầu!\n\n` +
           `🎯 Chế độ: ${modeText}\n` +
           `🔴 Bạn: ${playerMark}\n` +
           `🔵 Bot: ${playerMark === "X" ? "O" : "X"}\n\n` +
           `${turnMsg}\n\n` +
           `👉 Bot không phải là thuốc, không có tác dụng thay thế thuốc chữa bệnh.`,
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
    const imageBuffer = await createCaroBoard(game.board, game.size);
    const imagePath = path.resolve(process.cwd(), "assets", "temp", `caro_${threadId}_draw.png`);
    await fs.writeFile(imagePath, imageBuffer);
    
    await api.sendMessage(
      {
        msg: `🎮 Hòa! Không còn nước đi.\n\n` +
             `👉 Bot không phải là thuốc, không có tác dụng thay thế thuốc chữa bệnh.`,
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
  
  const winner = checkWin(game.board, game.size);
  
  const imageBuffer = await createCaroBoard(game.board, game.size);
  const imagePath = path.resolve(process.cwd(), "assets", "temp", `caro_${threadId}.png`);
  await fs.writeFile(imagePath, imageBuffer);
  
  if (winner) {
    await api.sendMessage(
      {
        msg: `🎉 Bot thắng!\n\n` +
             `🤖 Bot đánh ${game.botMark}, ô: ${pos + 1}\n\n` +
             `👉 Bot không phải là thuốc, không có tác dụng thay thế thuốc chữa bệnh.`,
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
        msg: `🤖 Bot đánh ${game.botMark}, ô: ${pos + 1}\n\n` +
             `👤 Đến lượt: ${game.playerName}\n` +
             `⏰ Bạn có 60 giây!\n\n` +
             `👉 Bot không phải là thuốc, không có tác dụng thay thế thuốc chữa bệnh.`,
        attachments: [imagePath],
        ttl: 60000
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
  
  const winner = checkWin(game.board, game.size);
  
  const imageBuffer = await createCaroBoard(game.board, game.size);
  const imagePath = path.resolve(process.cwd(), "assets", "temp", `caro_${threadId}.png`);
  await fs.writeFile(imagePath, imageBuffer);
  
  if (winner) {
    await api.sendMessage(
      {
        msg: `🎉 ${game.playerName} thắng!\n\n` +
             `👤 Bạn đánh ${game.playerMark}, ô: ${pos + 1}\n\n` +
             `👉 Bot không phải là thuốc, không có tác dụng thay thế thuốc chữa bệnh.`,
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
  
  await api.sendMessage(
    {
      msg: `👤 ${game.playerName} đánh ${game.playerMark}, ô: ${pos + 1}\n\n` +
           `⏳ Bot đang suy nghĩ...\n\n` +
           `👉 Bot không phải là thuốc, không có tác dụng thay thế thuốc chữa bệnh.`,
      attachments: [imagePath],
      ttl: 60000
    },
    threadId,
    message.type
  );
  
  try {
    await fs.unlink(imagePath);
  } catch (error) {}
  
  setTimeout(() => handleBotTurn(api, message), 1500);
}
