import fs from "fs";
import path from "path";
import { createCanvas, loadImage } from "canvas";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getGlobalPrefix } from "../../service.js";
import { getActiveGames, checkHasActiveGame } from "./index.js";
import { sendMessageComplete, sendMessageWarning } from "../../chat-zalo/chat-style/chat-style.js";
import { deleteFile } from "../../../utils/util.js";

const genAI = new GoogleGenerativeAI("AIzaSyANli4dZGQGSF2UEjG9V-X0u8z56Zm8Qmc");
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

const BOARD_SIZE = 16;
const TOTAL_CELLS = BOARD_SIZE * BOARD_SIZE;
const WIN_LENGTH = 5;
const CELL_SIZE = 30;
const CANVAS_WIDTH = BOARD_SIZE * CELL_SIZE;
const CANVAS_HEIGHT = BOARD_SIZE * CELL_SIZE + 50;

const BASE_HEADER = `
QUY TẮC XUẤT RA BẮT BUỘC:
- Chỉ trả về MỘT số nguyên duy nhất ứng với ô cần đánh (1..S*S).
- KHÔNG in giải thích, KHÔNG dấu chấm, KHÔNG ghi kèm ký tự nào khác.

MÔ HÌNH BÀN CỜ & CHỈ SỐ:
- Bàn cờ kích thước SxS. Ô được đánh số 1..S*S theo hàng (row-major):
  • Hàng 1: 1..S
  • Hàng 2: S+1..2S
  • ...
- Ký hiệu: X và O; '.' thể hiện ô trống.
- Bạn đánh với ký hiệu 'myMark'.
- Điều kiện thắng: có chuỗi liên tiếp 'need' quân theo hàng, cột hoặc chéo.

RÀNG BUỘC HỢP LỆ:
- TUYỆT ĐỐI không chọn ô đã bị chiếm (khác '.').
- Nếu không tìm thấy nước “rất tốt”, vẫn phải trả về MỘT ô trống hợp lệ (1..S*S).
- Không bao giờ trả về 0, số âm, hoặc số > S*S.
`;

const PATTERN_CATALOG = `
TỪ ĐIỂN MẪU HÌNH & KHÁI NIỆM:
- Five (len=need): chuỗi thắng. Nếu tạo được ngay => CHỌN NGAY.
- Open four: chuỗi dài (need-1) với 2 đầu mở. Nếu tạo được => gần như thắng cưỡng bức.
- Closed four: chuỗi dài (need-1) với 1 đầu mở. Vẫn rất mạnh, buộc đối thủ phải chặn ngay.
- Open three: chuỗi (need-2) với 2 đầu mở. Tạo đe doạ kép “4 mở” trong một nước.
- Closed three: chuỗi (need-2) với 1 đầu mở. Giá trị thấp hơn “open three”.
- Open two / Closed two: đà phát triển, ưu tiên khi gần trung tâm/đường chiến lược.
- Broken four: dạng bị ngắt một ô nhưng có thể thành 4/5 sau một nước.
- Double-threat (đòn kép): một nước đi tạo ra ít nhất HAI đường thắng trong lượt tiếp theo.
- VCF / VCT: chuỗi ép buộc bằng việc tạo/ép đối thủ chặn các “4 mở/3 mở”, cuối cùng dẫn tới thắng.
`;

const POSITIONAL_RULES = `
NGUYÊN TẮC VỊ TRÍ & GIAI ĐOẠN VÁN:
- Mở ván: nếu trung tâm trống => ƯU TIÊN trung tâm. Sau đó là các ô ở “vành trung tâm” (Manhattan ≤ 2..3).
- Kiểm soát trục & chéo trung tâm: đặt quân dọc theo đường trung tâm để tối đa hoá số đường thắng giao nhau.
- Tránh mép/góc khi nước đi không mở chuỗi/đe doạ hữu ích.
- Ưu tiên “gần giao tranh”: chọn ô quanh các nhóm quân đang tương tác (bán kính 2..3 ô).
- Nối dài chuỗi hiện có theo hướng có nhiều đầu mở hơn.
`;

const CANDIDATE_WINDOW = `
CỬA SỔ ỨNG VIÊN (Candidate Moves):
- Chỉ xét các ô trống:
  • Gần quân trên bàn (bán kính 2..3) hoặc trong vành trung tâm (Manhattan ≤ 2..3).
  • Gần nước vừa đi (của ta hoặc đối thủ) để duy trì áp lực.
- Loại bỏ các ô biên/góc nếu không tăng đe doạ hoặc phòng thủ.
`;

const PRIORITIES = `
THỨ TỰ ƯU TIÊN (TẤN CÔNG > PHÒNG THỦ):
1) Nếu ta có nước thắng ngay => CHỌN NGAY.
2) Nếu đối thủ có nước thắng ngay => CHẶN NGAY.
3) Tạo đòn kép (double-threat) => ƯU TIÊN.
4) Tạo “open four”, kế đến “closed four”.
5) Tạo “open three” (để đẩy vào 4 mở) > chặn “open three” của đối thủ.
6) Nối dài chuỗi theo hướng tăng số đầu mở; ưu tiên gần trung tâm/trục/chéo trung tâm.
7) Nếu các lựa chọn tương đương: chọn ô gần trung tâm hơn.
`;

const DEFENSE_RULES = `
PHÒNG THỦ CHIẾN LƯỢC:
- Chặn ngay khi đối thủ có “win-in-one”.
- Nếu đối thủ có khả năng tạo đòn kép ở lượt tới, chọn nước làm GIẢM TỐI ĐA số “win-in-one” của họ ở lượt sau.
- Nếu bắt buộc chọn giữa nhiều nước phòng thủ tương đương, ưu tiên ô gần trung tâm/đường chiến lược.
`;

const OUTPUT_DISCIPLINE = `
KỶ LUẬT XUẤT RA (RẤT QUAN TRỌNG):
- Sau khi phân tích, chỉ in MỘT SỐ DUY NHẤT (1..S*S) của ô trống tốt nhất.
- KHÔNG giải thích, KHÔNG xuống dòng thêm, KHÔNG kèm văn bản.
`;

const EASY = `${BASE_HEADER}
${PATTERN_CATALOG}
${POSITIONAL_RULES}
${CANDIDATE_WINDOW}
${PRIORITIES}
${DEFENSE_RULES}
${OUTPUT_DISCIPLINE}

ĐIỀU CHỈNH CHO EASY:
- Ưu tiên an toàn, tránh lỗi.
- Khi không rõ ràng: chọn gần trung tâm.
`;

const HARD = `${BASE_HEADER}
${PATTERN_CATALOG}
${POSITIONAL_RULES}
${CANDIDATE_WINDOW}
${PRIORITIES}
${DEFENSE_RULES}
${OUTPUT_DISCIPLINE}

ĐIỀU CHỈNH CHO HARD:
- Ưu tiên tạo/duy trì đòn kép; phá đòn kép của đối thủ ngay khi có thể.
- Ưu tiên chuỗi mở 3/4 trên trục/chéo trung tâm.
- Không đi góc/biên nếu không gia tăng đe doạ hoặc ngăn đe doạ.
`;

const CHALLENGE = `${BASE_HEADER}
${PATTERN_CATALOG}
${POSITIONAL_RULES}
${CANDIDATE_WINDOW}
${PRIORITIES}
${DEFENSE_RULES}
${OUTPUT_DISCIPLINE}

ĐIỀU CHỈNH CHO CHALLENGE (ưu tiên ép thắng):
- Nếu có chuỗi ép buộc kiểu VCF/VCT ngắn => CHỌN.
- Tạo double-threat > mọi lựa chọn khác; nếu đối thủ có thể tạo đòn kép => vô hiệu hoá ngay.
- Ưu tiên nối dài chuỗi theo hướng gia tăng số đầu mở; giữ trung tâm mạnh.
- Phòng thủ: chọn ô làm GIẢM TỐI ĐA số win-in-one của đối thủ ở lượt kế.
- Phân giải hoà: ưu tiên ô gần trung tâm/trục/chéo trung tâm.
`;

const caroPrompts = {
  1: EASY,
  2: HARD,
  3: CHALLENGE,
};

function buildSystemPrompt(mode = 3) {
  return caroPrompts[mode] || caroPrompts[3];
}

async function suggestMove({ board, size, need, myMark, mode = 3 }) {
  const render = () => {
    const out = [];
    for (let r = 0; r < size; r++) {
      const row = [];
      for (let c = 0; c < size; c++) {
        const idx = r * size + c;
        row.push(board[idx] || ".");
      }
      out.push(row.join(" "));
    }
    return out.join("\n");
  };
  const system = buildSystemPrompt(mode);
  const prompt = [
    `S = ${size}`,
    `need = ${need}`,
    `myMark = ${myMark}`,
    "Board ('.' là trống):",
    render(),
    "Yêu cầu: chỉ trả về MỘT số hợp lệ (1..S*S) là ô TRỐNG tốt nhất cho 'myMark'."
  ].join("\n");

  const result = await model.generateContent([system, prompt]);
  const reply = await result.response.text();
  const match = String(reply || "").match(/\d+/);
  if (!match) return -1;
  const pos = parseInt(match[0], 10) - 1;
  return Number.isInteger(pos) && pos >= 0 && pos < size * size && board[pos] === '.' ? pos : -1;
}

function createBoardImage(board, imagePath) {
  const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#f0d9b5";
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  ctx.strokeStyle = "#8b4513";
  ctx.lineWidth = 1;
  for (let i = 0; i <= BOARD_SIZE; i++) {
    ctx.beginPath();
    ctx.moveTo(i * CELL_SIZE, 0);
    ctx.lineTo(i * CELL_SIZE, BOARD_SIZE * CELL_SIZE);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * CELL_SIZE);
    ctx.lineTo(BOARD_SIZE * CELL_SIZE, i * CELL_SIZE);
    ctx.stroke();
  }

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const idx = r * BOARD_SIZE + c + 1;
      const x = c * CELL_SIZE + CELL_SIZE / 2;
      const y = r * CELL_SIZE + CELL_SIZE / 2;
      ctx.fillStyle = "#000";
      ctx.font = "12px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(idx.toString(), x, y);

      const cell = board[r * BOARD_SIZE + c];
      if (cell === 'X') {
        ctx.strokeStyle = "#ff0000";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x - 10, y - 10);
        ctx.lineTo(x + 10, y + 10);
        ctx.moveTo(x + 10, y - 10);
        ctx.lineTo(x - 10, y + 10);
        ctx.stroke();
      } else if (cell === 'O') {
        ctx.strokeStyle = "#0000ff";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, 10, 0, 2 * Math.PI);
        ctx.stroke();
      }
    }
  }

  ctx.fillStyle = "#000";
  ctx.font = "bold 16px Arial";
  ctx.textAlign = "left";
  ctx.fillText("Nhập số ô để đánh (1-256):", 10, CANVAS_HEIGHT - 30);

  const buffer = canvas.toBuffer("image/png");
  fs.writeFileSync(imagePath, buffer);
}

function checkWin(board, mark) {
  const directions = [
    [0, 1], [1, 0], [1, 1], [1, -1]
  ];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r * BOARD_SIZE + c] !== mark) continue;
      for (const [dr, dc] of directions) {
        let count = 1;
        for (let k = 1; k < WIN_LENGTH; k++) {
          const nr = r + dr * k;
          const nc = c + dc * k;
          if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE || board[nr * BOARD_SIZE + nc] !== mark) break;
          count++;
        }
        if (count >= WIN_LENGTH) return true;
      }
    }
  }
  return false;
}

const gameDataMap = new Map();

export async function handleCaroCommand(api, message) {
  const threadId = message.threadId;
  const content = message.data.content || "";
  const args = content.split(" ");
  const prefix = getGlobalPrefix();

  if (args[0]?.toLowerCase() === `${prefix}caro` && !args[1]) {
    await sendMessageComplete(api, message, `🎮 Hướng dẫn game cờ caro:\n🔗 ${prefix}caro thách đấu x/o: Tham gia trò chơi caro với Bot (X đi trước).\n🔖 ${prefix}caro leave: Rời khỏi trò chơi caro.`);
    return;
  }

  if (args[1]?.toLowerCase() === "leave") {
    if (gameDataMap.has(threadId)) {
      gameDataMap.delete(threadId);
      await sendMessageComplete(api, message, "Bạn đã rời khỏi trò chơi caro.");
    } else {
      await sendMessageWarning(api, message, "Không có trò chơi caro nào đang diễn ra.");
    }
    return;
  }

  if (args[1]?.toLowerCase() === "thách đấu") {
    if (gameDataMap.has(threadId)) {
      await sendMessageWarning(api, message, "Đã có trò chơi caro đang diễn ra trong nhóm này.");
      return;
    }

    const playerMark = args[2]?.toLowerCase();
    if (!['x', 'o'].includes(playerMark)) {
      await sendMessageWarning(api, message, "Vui lòng chọn 'x' hoặc 'o'!");
      return;
    }

    const board = new Array(TOTAL_CELLS).fill('.');
    const isPlayerFirst = playerMark === 'x';
    const playerTurn = isPlayerFirst;

    gameDataMap.set(threadId, {
      board,
      playerMark: playerMark.toUpperCase(),
      botMark: playerMark === 'X' ? 'O' : 'X',
      currentPlayer: playerTurn ? 'player' : 'bot',
      mode: 3,
      imagePath: path.join(__dirname, `caro_${threadId}_${Date.now()}.png`)
    });

    createBoardImage(board, gameDataMap.get(threadId).imagePath);
    const caption = playerTurn ? "🎮 Trò chơi caro bắt đầu! Bạn đi trước (X). Nhập số ô (1-256):" : "🎮 Trò chơi caro bắt đầu! Bot đi trước (O).";
    await api.sendMessage({
      msg: caption,
      attachments: [fs.createReadStream(gameDataMap.get(threadId).imagePath)]
    }, threadId, message.type);

    if (!playerTurn) {
      await botTurn(api, message, threadId);
    }
  }
}

async function botTurn(api, message, threadId) {
  const gameData = gameDataMap.get(threadId);
  if (!gameData) return;

  gameData.currentPlayer = 'bot';
  const pos = await suggestMove({
    board: gameData.board,
    size: BOARD_SIZE,
    need: WIN_LENGTH,
    myMark: gameData.botMark,
    mode: gameData.mode
  });

  if (pos === -1) {
    await sendMessageWarning(api, message, "Bot không thể đi. Bạn thắng!");
    endGame(threadId, 'player');
    return;
  }

  gameData.board[pos] = gameData.botMark;
  createBoardImage(gameData.board, gameData.imagePath);

  if (checkWin(gameData.board, gameData.botMark)) {
    await api.sendMessage({
      msg: "🤖 Bot thắng!",
      attachments: [fs.createReadStream(gameData.imagePath)]
    }, threadId, message.type);
    endGame(threadId, 'bot');
    return;
  }

  gameData.currentPlayer = 'player';
  await api.sendMessage({
    msg: "Lượt bạn (X/O). Nhập số ô (1-256):",
    attachments: [fs.createReadStream(gameData.imagePath)]
  }, threadId, message.type);
}

export async function handleCaroMessage(api, message) {
  const threadId = message.threadId;
  const content = message.data.content || "";
  const prefix = getGlobalPrefix();
  const senderId = message.data.uidFrom;

  if (!gameDataMap.has(threadId) || content.startsWith(prefix) || gameDataMap.get(threadId).currentPlayer !== 'player') return;

  const pos = parseInt(content.trim()) - 1;
  if (isNaN(pos) || pos < 0 || pos >= TOTAL_CELLS || gameDataMap.get(threadId).board[pos] !== '.') {
    await sendMessageWarning(api, message, "Ô không hợp lệ hoặc đã bị chiếm! Nhập số khác (1-256).");
    return;
  }

  const gameData = gameDataMap.get(threadId);
  gameData.board[pos] = gameData.playerMark;
  createBoardImage(gameData.board, gameData.imagePath);

  if (checkWin(gameData.board, gameData.playerMark)) {
    await api.sendMessage({
      msg: "🎉 Bạn thắng!",
      attachments: [fs.createReadStream(gameData.imagePath)]
    }, threadId, message.type);
    endGame(threadId, 'player');
    return;
  }

  await botTurn(api, message, threadId);
}

function endGame(threadId, winner) {
  const gameData = gameDataMap.get(threadId);
  if (gameData && gameData.imagePath) {
    deleteFile(gameData.imagePath);
  }
  gameDataMap.delete(threadId);
}
