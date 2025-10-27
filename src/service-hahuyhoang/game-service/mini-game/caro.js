import fs from "fs";
import path from "path";
import { createCanvas, Canvas } from 'canvas';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getGlobalPrefix } from "../../service.js";
import { getActiveGames, checkHasActiveGame } from "./index.js";
import { sendMessageWarning } from "../../chat-zalo/chat-style/chat-style.js";

const genAI = new GoogleGenerativeAI("AIzaSyANli4dZGQGSF2UEjG9V-X0u8z56Zm8Qmc");
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

const S = 16;
const NEED = 5;
const BOARD_SIZE = S * S;
const CELL_SIZE = 50;
const CANVAS_WIDTH = S * CELL_SIZE;
const CANVAS_HEIGHT = S * CELL_SIZE;
const IMAGE_DIR = path.join("Data", "Caro", "images");
const PROMPTS = {
  1: `QUY TẮC XUẤT RA BẮT BUỘC:
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

NGUYÊN TẮC VỊ TRÍ & GIAI ĐOẠN VÁN:
- Mở ván: nếu trung tâm trống => ƯU TIÊN trung tâm. Sau đó là các ô ở “vành trung tâm” (Manhattan ≤ 2..3).
- Kiểm soát trục & chéo trung tâm: đặt quân dọc theo đường trung tâm để tối đa hoá số đường thắng giao nhau.
- Tránh mép/góc khi nước đi không mở chuỗi/đe doạ hữu ích.
- Ưu tiên “gần giao tranh”: chọn ô quanh các nhóm quân đang tương tác (bán kính 2..3 ô).
- Nối dài chuỗi hiện có theo hướng có nhiều đầu mở hơn.

CỬA SỐ ỨNG VIÊN (Candidate Moves):
- Chỉ xét các ô trống:
  • Gần quân trên bàn (bán kính 2..3) hoặc trong vành trung tâm (Manhattan ≤ 2..3).
  • Gần nước vừa đi (của ta hoặc đối thủ) để duy trì áp lực.
- Loại bỏ các ô biên/góc nếu không tăng đe doạ hoặc phòng thủ.

THỨ TỰ ƯU TIÊN (TẤN CÔNG > PHÒNG THỦ):
1) Nếu ta có nước thắng ngay => CHỌN NGAY.
2) Nếu đối thủ có nước thắng ngay => CHẶN NGAY.
3) Tạo đòn kép (double-threat) => ƯU TIÊN.
4) Tạo “open four”, kế đến “closed four”.
5) Tạo “open three” (để đẩy vào 4 mở) > chặn “open three” của đối thủ.
6) Nối dài chuỗi theo hướng tăng số đầu mở; ưu tiên gần trung tâm/trục/chéo trung tâm.
7) Nếu các lựa chọn tương đương: chọn ô gần trung tâm hơn.

PHÒNG THỦ CHIẾN LƯỢC:
- Chặn ngay khi đối thủ có “win-in-one”.
- Nếu đối thủ có khả năng tạo đòn kép ở lượt tới, chọn nước làm GIẢM TỐI ĐA số “win-in-one” của họ ở lượt sau.
- Nếu bắt buộc chọn giữa nhiều nước phòng thủ tương đương, ưu tiên ô gần trung tâm/đường chiến lược.

KỶ LUẬT XUẤT RA (RẤT QUAN TRỌNG):
- Sau khi phân tích, chỉ in MỘT SỐ DUY NHẤT (1..S*S) của ô trống tốt nhất.
- KHÔNG giải thích, KHÔNG xuống dòng thêm, KHÔNG kèm văn bản.

ĐIỀU CHỈNH CHO EASY:
- Ưu tiên an toàn, tránh lỗi.
- Khi không rõ ràng: chọn gần trung tâm.`,
  3: `QUY TẮC XUẤT RA BẮT BUỘC:
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

NGUYÊN TẮC VỊ TRÍ & GIAI ĐOẠN VÁN:
- Mở ván: nếu trung tâm trống => ƯU TIÊN trung tâm. Sau đó là các ô ở “vành trung tâm” (Manhattan ≤ 2..3).
- Kiểm soát trục & chéo trung tâm: đặt quân dọc theo đường trung tâm để tối đa hoá số đường thắng giao nhau.
- Tránh mép/góc khi nước đi không mở chuỗi/đe doạ hữu ích.
- Ưu tiên “gần giao tranh”: chọn ô quanh các nhóm quân đang tương tác (bán kính 2..3 ô).
- Nối dài chuỗi hiện có theo hướng có nhiều đầu mở hơn.

CỬA SỐ ỨNG VIÊN (Candidate Moves):
- Chỉ xét các ô trống:
  • Gần quân trên bàn (bán kính 2..3) hoặc trong vành trung tâm (Manhattan ≤ 2..3).
  • Gần nước vừa đi (của ta hoặc đối thủ) để duy trì áp lực.
- Loại bỏ các ô biên/góc nếu không tăng đe doạ hoặc phòng thủ.

THỨ TỰ ƯU TIÊN (TẤN CÔNG > PHÒNG THỦ):
1) Nếu ta có nước thắng ngay => CHỌN NGAY.
2) Nếu đối thủ có nước thắng ngay => CHẶN NGAY.
3) Tạo đòn kép (double-threat) => ƯU TIÊN.
4) Tạo “open four”, kế đến “closed four”.
5) Tạo “open three” (để đẩy vào 4 mở) > chặn “open three” của đối thủ.
6) Nối dài chuỗi theo hướng tăng số đầu mở; ưu tiên gần trung tâm/trục/chéo trung tâm.
7) Nếu các lựa chọn tương đương: chọn ô gần trung tâm hơn.

PHÒNG THỦ CHIẾN LƯỢC:
- Chặn ngay khi đối thủ có “win-in-one”.
- Nếu đối thủ có khả năng tạo đòn kép ở lượt tới, chọn nước làm GIẢM TỐI ĐA số “win-in-one” của họ ở lượt sau.
- Nếu bắt buộc chọn giữa nhiều nước phòng thủ tương đương, ưu tiên ô gần trung tâm/đường chiến lược.

KỶ LUẬT XUẤT RA (RẤT QUAN TRỌNG):
- Sau khi phân tích, chỉ in MỘT SỐ DUY NHẤT (1..S*S) của ô trống tốt nhất.
- KHÔNG giải thích, KHÔNG xuống dòng thêm, KHÔNG kèm văn bản.

ĐIỀU CHỈNH CHO HARD:
- Ưu tiên tạo/duy trì đòn kép; phá đòn kép của đối thủ ngay khi có thể.
- Ưu tiên chuỗi mở 3/4 trên trục/chéo trung tâm.
- Không đi góc/biên nếu không gia tăng đe doạ hoặc ngăn đe doạ.`,
  4: `QUY TẮC XUẤT RA BẮT BUỘC:
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

NGUYÊN TẮC VỊ TRÍ & GIAI ĐOẠN VÁN:
- Mở ván: nếu trung tâm trống => ƯU TIÊN trung tâm. Sau đó là các ô ở “vành trung tâm” (Manhattan ≤ 2..3).
- Kiểm soát trục & chéo trung tâm: đặt quân dọc theo đường trung tâm để tối đa hoá số đường thắng giao nhau.
- Tránh mép/góc khi nước đi không mở chuỗi/đe doạ hữu ích.
- Ưu tiên “gần giao tranh”: chọn ô quanh các nhóm quân đang tương tác (bán kính 2..3 ô).
- Nối dài chuỗi hiện có theo hướng có nhiều đầu mở hơn.

CỬA SỐ ỨNG VIÊN (Candidate Moves):
- Chỉ xét các ô trống:
  • Gần quân trên bàn (bán kính 2..3) hoặc trong vành trung tâm (Manhattan ≤ 2..3).
  • Gần nước vừa đi (của ta hoặc đối thủ) để duy trì áp lực.
- Loại bỏ các ô biên/góc nếu không tăng đe doạ hoặc phòng thủ.

THỨ TỰ ƯU TIÊN (TẤN CÔNG > PHÒNG THỦ):
1) Nếu ta có nước thắng ngay => CHỌN NGAY.
2) Nếu đối thủ có nước thắng ngay => CHẶN NGAY.
3) Tạo đòn kép (double-threat) => ƯU TIÊN.
4) Tạo “open four”, kế đến “closed four”.
5) Tạo “open three” (để đẩy vào 4 mở) > chặn “open three” của đối thủ.
6) Nối dài chuỗi theo hướng tăng số đầu mở; ưu tiên gần trung tâm/trục/chéo trung tâm.
7) Nếu các lựa chọn tương đương: chọn ô gần trung tâm hơn.

PHÒNG THỦ CHIẾN LƯỢC:
- Chặn ngay khi đối thủ có “win-in-one”.
- Nếu đối thủ có khả năng tạo đòn kép ở lượt tới, chọn nước làm GIẢM TỐI ĐA số “win-in-one” của họ ở lượt sau.
- Nếu bắt buộc chọn giữa nhiều nước phòng thủ tương đương, ưu tiên ô gần trung tâm/đường chiến lược.

KỶ LUẬT XUẤT RA (RẤT QUAN TRỌNG):
- Sau khi phân tích, chỉ in MỘT SỐ DUY NHẤT (1..S*S) của ô trống tốt nhất.
- KHÔNG giải thích, KHÔNG xuống dòng thêm, KHÔNG kèm văn bản.

ĐIỀU CHỈNH CHO SUPER HARD (ưu tiên ép thắng):
- Nếu có chuỗi ép buộc kiểu VCF/VCT ngắn => CHỌN.
- Tạo double-threat > mọi lựa chọn khác; nếu đối thủ có thể tạo đòn kép => vô hiệu hoá ngay.
- Ưu tiên nối dài chuỗi theo hướng gia tăng số đầu mở; giữ trung tâm mạnh.
- Phòng thủ: chọn ô làm GIẢM TỐI ĐA số win-in-one của đối thủ ở lượt kế.
- Phân giải hoà: ưu tiên ô gần trung tâm/trục/chéo trung tâm.`
};

const MODE_MAP = { 'dễ': 1, 'khó': 3, 'thách đấu': 4 };

function ensureImageDir() {
  if (!fs.existsSync(IMAGE_DIR)) fs.mkdirSync(IMAGE_DIR, { recursive: true });
}

function generateBoardImage(board, imagePath) {
  ensureImageDir();
  const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1;
  for (let i = 0; i <= S; i++) {
    ctx.beginPath();
    ctx.moveTo(i * CELL_SIZE, 0);
    ctx.lineTo(i * CELL_SIZE, CANVAS_HEIGHT);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * CELL_SIZE);
    ctx.lineTo(CANVAS_WIDTH, i * CELL_SIZE);
    ctx.stroke();
  }
  for (let r = 0; r < S; r++) {
    for (let c = 0; c < S; c++) {
      const idx = r * S + c + 1;
      const x = c * CELL_SIZE + CELL_SIZE / 2;
      const y = r * CELL_SIZE + CELL_SIZE / 2;
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 12px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(idx.toString(), x, y);
      const boardIdx = r * S + c;
      const mark = board[boardIdx];
      if (mark === 'X') {
        ctx.fillStyle = '#FF0000';
        ctx.beginPath();
        ctx.arc(x, y, 20, 0, 2 * Math.PI);
        ctx.fill();
      } else if (mark === 'O') {
        ctx.strokeStyle = '#0000FF';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, 20, 0, 2 * Math.PI);
        ctx.stroke();
      }
    }
  }
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(imagePath, buffer);
}

function checkWin(board, mark) {
  for (let r = 0; r < S; r++) {
    for (let c = 0; c < S; c++) {
      if (board[r * S + c] !== mark) continue;
      const directions = [[0,1],[1,0],[1,1],[1,-1]];
      for (const [dr, dc] of directions) {
        let count = 1;
        for (let k = 1; k < NEED; k++) {
          const nr = r + dr * k;
          const nc = c + dc * k;
          if (nr < 0 || nr >= S || nc < 0 || nc >= S || board[nr * S + nc] !== mark) break;
          count++;
        }
        if (count >= NEED) return true;
      }
    }
  }
  return false;
}

async function getBotMove(board, myMark, mode) {
  const renderBoard = () => {
    const out = [];
    for (let r = 0; r < S; r++) {
      const row = [];
      for (let c = 0; c < S; c++) {
        row.push(board[r * S + c] || '.');
      }
      out.push(row.join(' '));
    }
    return out.join('\n');
  };
  const prompt = `S = ${S}\nneed = ${NEED}\nmyMark = ${myMark}\nBoard ('.' là trống):\n${renderBoard()}\nYêu cầu: chỉ trả về MỘT số hợp lệ (1..S*S) là ô TRỐNG tốt nhất cho 'myMark'.`;
  const systemPrompt = PROMPTS[mode];
  const result = await model.generateContent([{ role: 'user', parts: [{ text: prompt }] }], { systemInstruction: systemPrompt });
  const response = await result.response;
  const text = response.text();
  const match = text.match(/\d+/);
  if (!match) return -1;
  const pos = parseInt(match[0], 10) - 1;
  return Number.isInteger(pos) && pos >= 0 && pos < BOARD_SIZE && board[pos] === '.' ? pos : -1;
}

const turnTimersMap = new Map();

function startTurnTimer(api, message, threadId, playerId, timeout) {
  const timerKey = `${threadId}_${playerId}`;
  if (turnTimersMap.has(timerKey)) {
    clearTimeout(turnTimersMap.get(timerKey));
  }
  const timer = setTimeout(async () => {
    const gameData = getActiveGames().get(threadId);
    if (!gameData || gameData.type !== 'caro' || gameData.game.currentPlayer !== playerId) return;
    const attachments = gameData.game.imagePath ? [fs.createReadStream(gameData.game.imagePath)] : [];
    await api.sendMessage({ msg: '⏰ Hết thời gian! Bạn thua vì không đánh trong thời gian quy định.', attachments }, threadId, message.type);
    endGame(threadId, 'bot_win', api, threadId, message.type);
  }, timeout);
  turnTimersMap.set(timerKey, timer);
}

function clearTurnTimer(threadId, playerId) {
  const timerKey = `${threadId}_${playerId}`;
  if (turnTimersMap.has(timerKey)) {
    clearTimeout(turnTimersMap.get(timerKey));
    turnTimersMap.delete(timerKey);
  }
}

function endGame(threadId, winner, api, tId, mType) {
  const gameData = getActiveGames().get(threadId);
  if (!gameData || gameData.type !== 'caro') return;
  getActiveGames().delete(threadId);
  const imagePath = gameData.game.imagePath;
  if (imagePath && fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
  for (const [key] of turnTimersMap) {
    if (key.startsWith(threadId)) {
      const parts = key.split('_');
      clearTurnTimer(parts[0], parts[1]);
    }
  }
  const msg = winner === 'player' ? '🎉 Bạn thắng!' : '🤖 Bot thắng!';
  api.sendMessage({ msg }, tId, mType);
}

export async function handleCaroCommand(api, message) {
  const threadId = message.threadId;
  const content = message.data.content || '';
  const args = content.split(' ');
  const prefix = getGlobalPrefix();
  const command = args[0].toLowerCase().replace(prefix, '');
  if (command !== 'caro') return;

  if (args.length < 3) {
    await api.sendMessage({ msg: `🎮 Hướng dẫn game cờ Caro (16x16, thắng 5 liên tiếp):\n${prefix}caro [dễ|khó|thách đấu] [x|o]` }, threadId, message.type);
    return;
  }

  const modeStr = args[1].toLowerCase();
  const markStr = args[2].toLowerCase();
  const mode = MODE_MAP[modeStr];
  const myMark = markStr === 'x' ? 'X' : 'O';
  if (!mode || (myMark !== 'X' && myMark !== 'O')) {
    await sendMessageWarning(api, message, 'Mode không hợp lệ! Chọn: dễ, khó, thách đấu. Mark: x hoặc o.');
    return;
  }

  if (await checkHasActiveGame(api, message, threadId)) return;

  const opponentMark = myMark === 'X' ? 'O' : 'X';
  const board = new Array(BOARD_SIZE).fill('.');
  const imagePath = path.join(IMAGE_DIR, `${Date.now()}_caro.png`);
  generateBoardImage(board, imagePath);

  getActiveGames().set(threadId, {
    type: 'caro',
    game: {
      board,
      myMark,
      opponentMark,
      currentPlayer: myMark,
      mode,
      imagePath,
      started: false
    }
  });

  const firstPlayer = myMark === 'X' ? 'Bạn (X đi trước)' : 'Bot (X đi trước)';
  const turnMsg = myMark === 'X' ? `Đến lượt bạn đánh ô số (1-256). Thời gian: 60s.\nVí dụ: 121` : 'Bot sẽ đánh trước.';
  const startMsg = `🎮 Game Caro ${modeStr} bắt đầu! Bạn đánh ${myMark}.\n${firstPlayer}\n\n${turnMsg}`;
  const attachments = [fs.createReadStream(imagePath)];
  await api.sendMessage({ msg: startMsg, attachments }, threadId, message.type);

  if (myMark !== 'X') {
    await botTurn(api, message, threadId);
  } else {
    startTurnTimer(api, message, threadId, message.data.uidFrom, 60000);
  }
}

async function botTurn(api, message, threadId) {
  const gameData = getActiveGames().get(threadId);
  if (!gameData || gameData.type !== 'caro') return;
  const game = gameData.game;
  if (game.currentPlayer !== game.opponentMark) return;
  clearTurnTimer(threadId, message.data.uidFrom);
  game.started = true;
  const pos = await getBotMove(game.board, game.opponentMark, game.mode);
  if (pos === -1) {
    const attachments = [fs.createReadStream(game.imagePath)];
    await api.sendMessage({ msg: '🎉 Bạn thắng!', attachments }, threadId, message.type);
    endGame(threadId, 'player', api, threadId, message.type);
    return;
  }
  game.board[pos] = game.opponentMark;
  generateBoardImage(game.board, game.imagePath);
  if (checkWin(game.board, game.opponentMark)) {
    const attachments = [fs.createReadStream(game.imagePath)];
    await api.sendMessage({ msg: '🤖 Bot thắng!', attachments }, threadId, message.type);
    endGame(threadId, 'bot_win', api, threadId, message.type);
    return;
  }
  game.currentPlayer = game.myMark;
  const attachments = [fs.createReadStream(game.imagePath)];
  await api.sendMessage({ msg: 'Đến lượt bạn đánh ô số (1-256). Thời gian: 60s.', attachments }, threadId, message.type);
  startTurnTimer(api, message, threadId, message.data.uidFrom, 60000);
}

export async function handleCaroMessage(api, message) {
  const threadId = message.threadId;
  const activeGames = getActiveGames();
  if (!activeGames.has(threadId)) return;
  const gameData = activeGames.get(threadId);
  if (gameData.type !== 'caro') return;
  const game = gameData.game;
  const senderId = message.data.uidFrom;
  const content = message.data.content || '';
  const prefix = getGlobalPrefix();
  if (content.startsWith(prefix)) return;
  if (game.currentPlayer !== game.myMark) return;
  const numStr = content.trim();
  const pos = parseInt(numStr, 10) - 1;
  if (isNaN(pos) || pos < 0 || pos >= BOARD_SIZE || game.board[pos] !== '.') {
    await sendMessageWarning(api, message, 'Ô không hợp lệ hoặc đã chiếm! Chọn số 1-256 trống.');
    return;
  }
  clearTurnTimer(threadId, senderId);
  game.board[pos] = game.myMark;
  generateBoardImage(game.board, game.imagePath);
  if (checkWin(game.board, game.myMark)) {
    const attachments = [fs.createReadStream(game.imagePath)];
    await api.sendMessage({ msg: '🎉 Bạn thắng!', attachments }, threadId, message.type);
    endGame(threadId, 'player', api, threadId, message.type);
    return;
  }
  game.currentPlayer = game.opponentMark;
  const attachments = [fs.createReadStream(game.imagePath)];
  await api.sendMessage({ msg: 'Bot đang suy nghĩ...', attachments }, threadId, message.type);
  setTimeout(() => botTurn(api, message, threadId), 1000);
}
