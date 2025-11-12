import { createCanvas } from "canvas";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { sendMessageComplete, sendMessageWarning, sendMessageTag } from "../../chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service.js";
import { removeMention } from "../../../utils/format-util.js";
import { GomokuSolution } from "@algorithm.ts/gomoku";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let activeCaroGames = new Map();
let turnTimers = new Map();

// Thời gian tồn tại của tin nhắn (TTL - Time To Live)
const TTL_LONG = 3600000; // 1 giờ
const TTL_SHORT = 60000; // 60 giây

function clearTurnTimer(threadId) {
    let timer = turnTimers.get(threadId);
    if (timer) {
        clearTimeout(timer);
        turnTimers.delete(threadId);
    }
}

/**
 * Bắt đầu đồng hồ đếm ngược 60 giây cho lượt đi.
 */
function startTurnTimer(api, message, threadId, isPlayerTurn) {
    clearTurnTimer(threadId);
    
    let timer = setTimeout(async () => {
        let game = activeCaroGames.get(threadId);
        if (!game) return;
        
        let winnerName = isPlayerTurn ? "BOT" : game.playerName;
        let loserName = isPlayerTurn ? game.playerName : "BOT";
        let caption = `⏱️ HẾT GIỜ..\n\n👤 ${loserName} không đánh trong vòng 60 giây\n🏆 ${winnerName} đã dành chiến thắng ván cờ này!`;
        
        await sendMessageTag(api, message, { caption }, TTL_LONG);
        
        activeCaroGames.delete(threadId);
        clearTurnTimer(threadId);
    }, 60000);
    
    turnTimers.set(threadId, timer);
}

/**
 * Vẽ bàn cờ và các quân cờ lên Canvas.
 */
async function createCaroBoard(board, size = 16, moveCount = 0, playerMark = "X", botMark = "O", playerName = "Player", lastBotMove = -1, currentTurn = "X", winningLine = [], mode = "Easy") {
    let cellSize = 50;
    let padding = 40;
    let headerHeight = 50;
    let footerHeight = 50;
    let width = size * cellSize + padding * 2;
    let height = size * cellSize + padding * 2 + headerHeight + footerHeight;
    
    let canvas = createCanvas(width, height);
    let ctx = canvas.getContext("2d");
    
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
    // Nền trắng
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, width, height);
    
    // Hiển thị thông tin người chơi và BOT
    ctx.font = "bold 20px 'BeVietnamPro'";
    
    // Quân X
    ctx.textAlign = "left";
    let xName = playerMark === "X" ? playerName : "BOT";
    ctx.fillStyle = "#FF0000";
    ctx.fillText(`X: ${xName}`, 20, 30);
    
    // Quân O
    ctx.textAlign = "right";
    let oName = playerMark === "O" ? playerName : "BOT";
    ctx.fillStyle = "#0000FF";
    ctx.fillText(`O: ${oName}`, width - 20, 30);
    
    let boardTop = headerHeight;
    
    // Vẽ lưới
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 2;
    
    for (let i = 0; i <= size; i++) {
        // Đường ngang
        ctx.beginPath();
        ctx.moveTo(padding, boardTop + padding + i * cellSize);
        ctx.lineTo(padding + size * cellSize, boardTop + padding + i * cellSize);
        ctx.stroke();
        
        // Đường dọc
        ctx.beginPath();
        ctx.moveTo(padding + i * cellSize, boardTop + padding);
        ctx.lineTo(padding + i * cellSize, boardTop + padding + size * cellSize);
        ctx.stroke();
    }
    
    let numberFont = "15px 'BeVietnamPro'";
    let markFont = "bold 30px 'BeVietnamPro'";
    let circleWidth = 4;
    let circleRadius = cellSize / 2.8;
    let winLineWidth = 6;
    
    // Vẽ quân cờ và số thứ tự ô
    for (let i = 0; i < board.length; i++) {
        let row = Math.floor(i / size);
        let col = i % size;
        let x = padding + col * cellSize + cellSize / 2;
        let y = boardTop + padding + row * cellSize + cellSize / 2;
        
        if (board[i] === ".") {
            // Ô trống, vẽ số thứ tự
            ctx.font = numberFont;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillStyle = "#000000";
            ctx.fillText((i + 1).toString(), x, y);
        } else {
            // Ô đã có quân cờ
            ctx.font = markFont;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            
            if (board[i] === "X") {
                ctx.fillStyle = "#FF0000";
                ctx.fillText("X", x, y);
            } else if (board[i] === "O") {
                ctx.fillStyle = "#0000FF";
                ctx.fillText("O", x, y);
            }
            
            // Đánh dấu nước đi gần nhất của BOT (vẽ vòng tròn)
            if (i === lastBotMove) {
                ctx.strokeStyle = "#CC8800";
                ctx.lineWidth = circleWidth;
                ctx.beginPath();
                ctx.arc(x, y, circleRadius, 0, Math.PI * 2);
                ctx.stroke();
            }
        }
    }
    
    // Vẽ đường thắng (nếu có)
    let winLength = 5;
    if (winningLine && winningLine.length >= winLength) {
        ctx.strokeStyle = "#00FF00";
        ctx.lineWidth = winLineWidth;
        
        let startPos = winningLine[0];
        let endPos = winningLine[winningLine.length - 1];

        let startRow = Math.floor(startPos / size);
        let startCol = startPos % size;
        let endRow = Math.floor(endPos / size);
        let endCol = endPos % size;
        
        // Tính toán tọa độ tâm của ô cờ
        let startX = padding + startCol * cellSize + cellSize / 2;
        let startY = boardTop + padding + startRow * cellSize + cellSize / 2;
        let endX = padding + endCol * cellSize + cellSize / 2;
        let endY = boardTop + padding + endRow * cellSize + cellSize / 2;

        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
    }
    
    // Hiển thị thông tin lượt đi
    ctx.font = "bold 15px 'BeVietnamPro'";
    ctx.textAlign = "center";
    ctx.fillStyle = "#000000";
    ctx.fillText(`Nước đi: ${moveCount}/${size * size}`, width / 2, height - 25);
    
    return canvas.toBuffer("image/png");
}

/**
 * Đếm số lượng quân liên tiếp trong một hướng.
 */
function countInDirection(board, pos, dr, dc, mark, size = 16) {
    let count = 0;
    let row = Math.floor(pos / size);
    let col = pos % size;
    
    row += dr;
    col += dc;
    
    while (row >= 0 && row < size && col >= 0 && col < size) {
        let idx = row * size + col;
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

/**
 * Kiểm tra chiến thắng (5 quân liên tiếp) trên toàn bộ bàn cờ.
 */
function checkWin(board, size = 16) {
    let directions = [[0,1], [1,0], [1,1], [1,-1]]; // Ngang, Dọc, Chéo xuôi, Chéo ngược
    let winLength = 5;
    
    for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
            let idx = row * size + col;
            let mark = board[idx];
            if (mark === ".") continue;
            
            for (let [dr, dc] of directions) {
                let count = 1;
                let line = [idx];
                for (let step = 1; step < winLength; step++) {
                    let newRow = row + dr * step;
                    let newCol = col + dc * step;
                    if (newRow < 0 || newRow >= size || newCol < 0 || newCol >= size) break;
                    let newIdx = newRow * size + newCol;
                    if (board[newIdx] !== mark) break;
                    line.push(newIdx);
                    count++;
                }
                if (count >= winLength) return { winner: mark, line };
            }
        }
    }
    
    return null;
}

/**
 * Điều chỉnh độ sâu tìm kiếm cho Minimax/Alpha-Beta Pruning.
 * Đã giới hạn tối đa là 4 theo yêu cầu để đảm bảo tốc độ phản hồi nhanh.
 */
function getDifficulty(mode) {
    switch (mode) {
        // Dễ: Độ sâu 2 cho phản hồi tức thì
        case "easy": return 2;
        // Khó: Độ sâu 3
        case "hard": return 3;
        // Cao thủ: Độ sâu 4 (Mức tối đa được yêu cầu)
        case "master": return 4;
        default: return 2;
    }
}

/**
 * Chuyển đổi mảng 1D sang định dạng moves cần thiết cho GomokuSolution.
 */
function convertBoardToMoves(board1D, size = 16) {
    const moves = [];
    for (let i = 0; i < board1D.length; i++) {
        if (board1D[i] !== ".") {
            const row = Math.floor(i / size);
            const col = i % size;
            // 1: X, 2: O
            const player = board1D[i] === "X" ? 1 : 2;
            moves.push({ row, col, player });
        }
    }
    return moves;
}

/**
 * Tính toán nước đi của BOT sử dụng thuật toán Minimax (GomokuSolution).
 */
async function getAIMoveAlgo(board1D, playerMark, mode, size = 16) {
    const sol = new GomokuSolution({ MAX_ROW: size, MAX_COL: size, MAX_ADJACENT: 5 });
    const moves = convertBoardToMoves(board1D, size);
    
    // Khôi phục trạng thái bàn cờ
    for (const move of moves) {
        sol.forward(move.row, move.col, move.player);
    }
    
    const botPlayer = playerMark === "X" ? 2 : 1; // Quân 1 (X) hoặc 2 (O)
    const depth = getDifficulty(mode);
    
    // Cài đặt độ sâu tìm kiếm
    sol.depth = depth;
    
    // Tìm kiếm nước đi tốt nhất
    const [row, col] = sol.minimaxSearch(botPlayer);
    
    return row * size + col;
}

/**
 * Xử lý lượt đi của BOT.
 */
async function handleBotTurn(api, message, initialTurn = false) {
    let threadId = message.threadId;
    let game = activeCaroGames.get(threadId);
    
    if (!game) return;
    
    // Hiển thị phản ứng đang tính toán
    await api.addReaction("FLASH", message);
    
    game.isProcessing = true;
    startTurnTimer(api, message, threadId, false); // Bắt đầu đếm giờ cho BOT (dù BOT sẽ đánh nhanh)
    
    // Lấy nước đi của BOT
    let pos = await getAIMoveAlgo(game.board, game.playerMark, game.mode, game.size);
    
    clearTurnTimer(threadId);
    
    if (!activeCaroGames.has(threadId)) return; // Game đã bị hủy trong lúc BOT tính toán
    
    // Xử lý trường hợp hòa (không còn nước đi hợp lệ)
    if (pos < 0 || game.moveCount >= game.size * game.size) {
        let imageBuffer = await createCaroBoard(game.board, game.size, game.moveCount, game.playerMark, game.botMark, game.playerName, game.lastBotMove, game.currentTurn, [], game.mode);
        let imagePath = path.resolve(process.cwd(), "assets", "temp", `caro_${threadId}_draw.png`);
        await fs.writeFile(imagePath, imageBuffer);
        
        let caption = `🏆 HÒA CỜ!\n\n📊 Nước đi: ${game.moveCount}/${game.size * game.size}\n💭 Đôi khi hòa cũng là một kết quả tốt.\n\n🎯 Thử lại lần nữa để phân định thắng bại nhé!`;
        await sendMessageTag(api, message, { caption, imagePath }, TTL_LONG);
        
        await api.addReaction("UNDO", message);
        await api.addReaction("OK", message);
        
        try { await fs.unlink(imagePath); } catch (error) {}
        
        activeCaroGames.delete(threadId);
        return;
    }
    
    // Cập nhật trạng thái game
    game.board[pos] = game.botMark;
    game.currentTurn = game.playerMark;
    game.moveCount++;
    game.lastBotMove = pos;
    
    let winResult = checkWin(game.board, game.size);
    let winningLine = winResult ? winResult.line : [];
    
    let imageBuffer = await createCaroBoard(game.board, game.size, game.moveCount, game.playerMark, game.botMark, game.playerName, pos, game.playerMark, winningLine, game.mode);
    let imagePath = path.resolve(process.cwd(), "assets", "temp", `caro_${threadId}.png`);
    await fs.writeFile(imagePath, imageBuffer);
    
    let modeName = game.mode === "master" ? "cao thủ (Max Depth 4)" : game.mode === "hard" ? "khó" : "dễ";
    
    if (winResult) {
        // BOT thắng
        let caption = `🤖 BOT WIN!\n\n🎮 BOT đánh ô số: ${pos + 1}\n🏆 BOT ${modeName} đã dành chiến thắng xuất sắc\n\n👤 ${game.playerName} đã thua tâm phục khẩu phục\n💪 Hãy rút kinh nghiệm và thử lại lần sau nhé!`;
        await sendMessageTag(api, message, { caption, imagePath }, TTL_LONG);
        await api.addReaction("UNDO", message);
        await api.addReaction("OK", message);
        activeCaroGames.delete(threadId);
        clearTurnTimer(threadId);
    } else if (game.moveCount === game.size * game.size) {
        // Hòa cờ
        let caption = `🏆 HÒA CỜ!\n\n🎮 BOT đánh ô số: ${pos + 1}\n📊 Nước đi: ${game.moveCount}/${game.size * game.size}\n\n💭 Trận đấu cân não đỉnh cao!\n🎯 Cả bạn và BOT đều chơi xuất sắc!`;
        await sendMessageTag(api, message, { caption, imagePath }, TTL_LONG);
        await api.addReaction("UNDO", message);
        await api.addReaction("OK", message);
        activeCaroGames.delete(threadId);
        clearTurnTimer(threadId);
    } else {
        // Tiếp tục chơi, lượt người chơi
        let initialMessage = initialTurn ? `🎮 BẮT ĐẦU TRẬN ĐẤU - CHẾ ĐỘ ${game.mode.toUpperCase()}\n\n🤖 BOT đi trước (Quân X)` : "";
        
        let caption = `${initialMessage}\n🌟 BOT đánh ô số: ${pos + 1}\n\n🎯 Lượt của ${game.playerName} (Quân ${game.playerMark})\n\n👉 Gõ số ô (1-${game.size * game.size})\n⏱️ Thời gian: 60 giây\n\n💡 BOT đã tính toán xong trong tích tắc (Depth ${getDifficulty(game.mode)})! Giờ là lúc bạn thể hiện tài năng!`;
        await sendMessageTag(api, message, { caption, imagePath }, TTL_SHORT);
        await api.addReaction("UNDO", message);
        await api.addReaction("OK", message);
        game.isProcessing = false;
        startTurnTimer(api, message, threadId, true);
    }
    
    try { await fs.unlink(imagePath); } catch (error) {}
}

/**
 * Xử lý lệnh khởi tạo game Caro.
 */
export async function handleCaroCommand(api, message) {
    let threadId = message.threadId;
    let content = removeMention(message);
    let prefix = getGlobalPrefix();
    let args = content.split(/\s+/);
    
    if (!content.includes(`${prefix}caro`)) return;
    
    if (args.length < 2) {
        await sendMessageComplete(api, message, 
            `🎮 CỜ CARO - THỬ THÁCH TRÍ TUỆ\n\n` +
            `🌟 Cú pháp:\n` +
            `${prefix}caro [easy/hard/master] [x/o]\n\n` +
            `💡 Ví dụ:\n` +
            `• ${prefix}caro easy >> Dễ (Depth 2)\n` +
            `• ${prefix}caro hard x >> Khó (Depth 3)\n` +
            `• ${prefix}caro master >> Cao thủ (Depth 4 - Tối đa)\n\n` +
            `📜 Luật chơi:\n` +
            `• Bàn cờ 16x16, thắng khi ghép 5 quân liên tiếp\n` +
            `• Quân X luôn đi trước\n` +
            `• Gõ số ô (1-256) để đánh quân\n` +
            `• Gõ "lose" để đầu hàng\n` +
            `• ⏱️ Thời gian suy nghĩ: 60 giây/nước`
        );
        return;
    }
    
    if (activeCaroGames.has(threadId)) {
        await sendMessageWarning(api, message, `⚠️ Đang có trận đấu đang diễn ra!\nVui lòng gõ số để đánh hoặc gõ "lose" để đầu hàng.`, TTL_SHORT);
        return;
    }
    
    let inputMode = args[1].toLowerCase();
    let mode = "";
    let size = 16;
    let playerMark = "";
    
    if (["easy", "hard", "master"].includes(inputMode)) {
        mode = inputMode;
        // Nếu là master, ưu tiên cho người chơi đi sau (O) để tăng độ khó (nếu không chọn quân)
        if (mode === "master") {
            playerMark = args.length > 2 ? args[2].toUpperCase() : "O";
        } else {
            // Chế độ dễ/khó, chọn ngẫu nhiên nếu người chơi không chỉ định
            playerMark = args.length > 2 ? args[2].toUpperCase() : (Math.random() > 0.5 ? "X" : "O");
        }
    } else {
        await sendMessageWarning(api, message, "🎯 Chế độ không hợp lệ!\n\nVui lòng chọn:\n• easy - Dễ\n• hard - Khó\n• master - Cao thủ", TTL_SHORT);
        return;
    }
    
    if (!["X", "O"].includes(playerMark)) {
        await sendMessageWarning(api, message, "🚫 Quân cờ không hợp lệ!\n\nVui lòng chọn X hoặc O\n(Lưu ý: X luôn đi trước)", TTL_SHORT);
        return;
    }
    
    clearTurnTimer(threadId);
    
    let board = Array(size * size).fill(".");
    
    activeCaroGames.set(threadId, {
        board,
        playerMark,
        botMark: playerMark === "X" ? "O" : "X",
        currentTurn: "X",
        mode,
        playerId: message.data.uidFrom,
        playerName: message.data.dName,
        size,
        moveCount: 0,
        lastBotMove: -1,
        isProcessing: false
    });
    
    if (playerMark === "X") {
        // Người chơi đi trước
        let imageBuffer = await createCaroBoard(board, size, 0, playerMark, playerMark === "X" ? "O" : "X", message.data.dName, -1, "X", [], mode);
        let imagePath = path.resolve(process.cwd(), "assets", "temp", `caro_${threadId}.png`);
        await fs.writeFile(imagePath, imageBuffer);
        
        let caption = `🎮 BẮT ĐẦU TRẬN ĐẤU - CHẾ ĐỘ ${mode.toUpperCase()} (Depth ${getDifficulty(mode)})\n\n🎯 Lượt của ${message.data.dName} (Quân ${playerMark})\n\n👉 Gõ số ô (1-${size * size}) để đánh\n⏱️ Thời gian: 60 giây\n\n💡 Mẹo: Kiểm soát trung tâm là chìa khóa chiến thắng!`;
        await sendMessageTag(api, message, { caption, imagePath }, TTL_SHORT);
        startTurnTimer(api, message, threadId, true);
        
        try { await fs.unlink(imagePath); } catch (error) {}
    } else {
        // BOT đi trước
        activeCaroGames.get(threadId).isProcessing = true;
        handleBotTurn(api, message, true);
    }
}

/**
 * Xử lý nước đi của người chơi (gõ số ô hoặc lệnh "lose").
 */
export async function handleCaroMessage(api, message) {
    let threadId = message.threadId;
    let game = activeCaroGames.get(threadId);
    
    if (!game) return;
    if (game.isProcessing) return;
    if (message.data.uidFrom !== game.playerId) return; // Chỉ người khởi tạo mới có thể chơi
    if (game.currentTurn !== game.playerMark) return; // Không phải lượt của người chơi
    
    let content = message.data.body.toLowerCase().trim();
    
    // Xử lý đầu hàng
    if (content === "lose") {
        clearTurnTimer(threadId);
        let caption = `🏳️ ĐẦU HÀNG!\n\n👤 ${game.playerName} đã đầu hàng.\n🏆 BOT đã dành chiến thắng ván cờ này!`;
        await sendMessageTag(api, message, { caption }, TTL_LONG);
        activeCaroGames.delete(threadId);
        return;
    }
    
    let pos = parseInt(content) - 1;
    
    // Kiểm tra tính hợp lệ của nước đi
    if (isNaN(pos) || pos < 0 || pos >= game.size * game.size || game.board[pos] !== ".") {
        await sendMessageWarning(api, message, `🚫 Nước đi không hợp lệ!\nVui lòng gõ số ô trống (1-${game.size * game.size}) hoặc gõ "lose" để đầu hàng.`, TTL_SHORT);
        // Không xóa timer vì đây là lỗi nhập
        return;
    }
    
    clearTurnTimer(threadId);
    game.isProcessing = true; // Bắt đầu xử lý lượt đi
    
    // Cập nhật trạng thái game
    game.board[pos] = game.playerMark;
    game.currentTurn = game.botMark;
    game.moveCount++;
    
    let winResult = checkWin(game.board, game.size);
    let winningLine = winResult ? winResult.line : [];
    
    let imageBuffer = await createCaroBoard(game.board, game.size, game.moveCount, game.playerMark, game.botMark, game.playerName, game.lastBotMove, game.botMark, winningLine, game.mode);
    let imagePath = path.resolve(process.cwd(), "assets", "temp", `caro_${threadId}_player.png`);
    await fs.writeFile(imagePath, imageBuffer);
    
    if (winResult) {
        // Người chơi thắng
        let caption = `🎉 CHÚC MỪNG!\n\n🎮 Bạn đánh ô số: ${pos + 1}\n🏆 ${game.playerName} đã dành chiến thắng! Thật là một cao thủ!`;
        await sendMessageTag(api, message, { caption, imagePath }, TTL_LONG);
        await api.addReaction("TROPHY", message);
        activeCaroGames.delete(threadId);
        clearTurnTimer(threadId);
        game.isProcessing = false;
    } else if (game.moveCount === game.size * game.size) {
        // Hòa cờ
        let caption = `🏆 HÒA CỜ!\n\n🎮 Bạn đánh ô số: ${pos + 1}\n📊 Nước đi: ${game.moveCount}/${game.size * game.size}\n\n💭 Trận đấu cân não đỉnh cao!\n🎯 Cả bạn và BOT đều chơi xuất sắc!`;
        await sendMessageTag(api, message, { caption, imagePath }, TTL_LONG);
        await api.addReaction("UNDO", message);
        await api.addReaction("OK", message);
        activeCaroGames.delete(threadId);
        clearTurnTimer(threadId);
        game.isProcessing = false;
    } else {
        // Lượt của BOT
        let caption = `🎯 Lượt của ${game.playerName} (Quân ${game.playerMark})\n\n🌟 Bạn đánh ô số: ${pos + 1}\n\n🤖 BOT đang suy nghĩ (Depth ${getDifficulty(game.mode)})...`;
        await sendMessageTag(api, message, { caption, imagePath }, TTL_SHORT);
        await api.addReaction("OK", message);
        
        try { await fs.unlink(imagePath); } catch (error) {}
        
        // Chuyển sang lượt BOT
        handleBotTurn(api, message);
    }
}
