import { createCanvas } from "canvas";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { sendMessageComplete, sendMessageWarning, sendMessageTag } from "../../chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service.js";
import { removeMention } from "../../../utils/format-util.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let activeCaroGames = new Map();
let turnTimers = new Map();

const TTL_LONG = 3600000;
const TTL_SHORT = 60000;

function clearTurnTimer(threadId) {
    let timer = turnTimers.get(threadId);
    if (timer) {
        clearTimeout(timer);
        turnTimers.delete(threadId);
    }
}

function startTurnTimer(api, message, threadId, isPlayerTurn) {
    clearTurnTimer(threadId);
    let timer = setTimeout(async () => {
        let game = activeCaroGames.get(threadId);
        if (!game) return;
        if (isPlayerTurn) {
            let caption = `⏱️ HẾT GIỜ..!\n\n👤 ${game.playerName} không đánh trong vòng 60 giây\n🏆 BOT đã dành chiến thắng ván cờ này!"`;
            await sendMessageTag(api, message, { caption }, TTL_LONG);
        } else {
            let caption = `⏱️ HẾT GIỜ..!\n\n🤖 BOT không đánh trong vòng 60 giây\n🏆 ${game.playerName} đã dành chiến thắng ván cờ này!`;
            await sendMessageTag(api, message, { caption }, TTL_LONG);
        }
        activeCaroGames.delete(threadId);
        clearTurnTimer(threadId);
    }, 60000);
    turnTimers.set(threadId, timer);
}

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
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, width, height);
    const X_COLOR = "#E63946";
    const O_COLOR = "#0077B6";
    const NUMBER_COLOR = "#888888";
    const BLACK_COLOR = "#000000";
    ctx.font = "bold 24px 'BeVietnamPro'";
    ctx.textAlign = "left";
    if (playerMark === "X") {
        ctx.fillStyle = X_COLOR;
        ctx.fillText(`X: ${playerName}`, 20, 30);
    } else {
        ctx.fillStyle = X_COLOR;
        ctx.fillText("X: BOT", 20, 30);
    }
    ctx.textAlign = "right";
    if (playerMark === "O") {
        ctx.fillStyle = O_COLOR;
        ctx.fillText(`O: ${playerName}`, width - 20, 30);
    } else {
        ctx.fillStyle = O_COLOR;
        ctx.fillText("O: BOT", width - 20, 30);
    }
    let boardTop = headerHeight;
    ctx.strokeStyle = BLACK_COLOR;
    ctx.lineWidth = 2;
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
    let numberFont = "18px 'BeVietnamPro'";
    let markFont = "bold 36px 'BeVietnamPro'";
    let circleWidth = 4;
    let circleRadius = cellSize / 2.8;
    let winLineWidth = 6;
    for (let i = 0; i < board.length; i++) {
        let row = Math.floor(i / size);
        let col = i % size;
        let x = padding + col * cellSize + cellSize / 2;
        let y = boardTop + padding + row * cellSize + cellSize / 2;
        if (board[i] === ".") {
            ctx.font = numberFont;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillStyle = NUMBER_COLOR;
            ctx.fillText((i + 1).toString(), x, y);
        } else {
            ctx.font = markFont;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            if (board[i] === "X") {
                ctx.fillStyle = X_COLOR;
                ctx.fillText("X", x, y);
            } else if (board[i] === "O") {
                ctx.fillStyle = O_COLOR;
                ctx.fillText("O", x, y);
            }
            if (i === lastBotMove) {
                ctx.strokeStyle = "#CC8800";
                ctx.lineWidth = circleWidth;
                ctx.beginPath();
                ctx.arc(x, y, circleRadius, 0, Math.PI * 2);
                ctx.stroke();
            }
        }
    }
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
        let startX = padding + startCol * cellSize + cellSize / 2;
        let startY = boardTop + padding + startRow * cellSize + cellSize / 2;
        let endX = padding + endCol * cellSize + cellSize / 2;
        let endY = boardTop + padding + endRow * cellSize + cellSize / 2;
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
    }
    ctx.font = "bold 18px 'BeVietnamPro'";
    ctx.textAlign = "center";
    ctx.fillStyle = BLACK_COLOR;
    ctx.fillText(`Nước đi: ${moveCount}/${size * size}`, width / 2, height - 25);
    return canvas.toBuffer("image/png");
}

function checkWin(board, size = 16) {
    const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
    const winLength = 5;
    for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
            const idx = row * size + col;
            const mark = board[idx];
            if (mark === ".") continue;
            for (const [dr, dc] of directions) {
                let count = 1;
                const line = [idx];
                for (let step = 1; step < winLength; step++) {
                    const newRow = row + dr * step;
                    const newCol = col + dc * step;
                    if (newRow < 0 || newRow >= size || newCol < 0 || newCol >= size) break;
                    const newIdx = newRow * size + newCol;
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

function countLine(board, row, col, dx, dy, mark, size) {
    let count = 0;
    let open = 0;
    let blocked = 0;
    
    for (let step = -4; step <= 4; step++) {
        if (step === 0) continue;
        let r = row + dx * step;
        let c = col + dy * step;
        if (r < 0 || r >= size || c < 0 || c >= size) {
            blocked++;
            break;
        }
        let idx = r * size + c;
        if (board[idx] === mark) count++;
        else if (board[idx] === '.') open++;
        else {
            blocked++;
            break;
        }
    }
    return { count, open, blocked };
}

function evaluateMove(board, pos, aiMark, oppMark, size) {
    let row = Math.floor(pos / size);
    let col = pos % size;
    let score = 0;
    
    const dirs = [[1,1], [1,-1], [1,0], [0,1]];
    
    for (let [dx, dy] of dirs) {
        let aiLine = countLine(board, row, col, dx, dy, aiMark, size);
        let oppLine = countLine(board, row, col, dx, dy, oppMark, size);
        
        if (aiLine.count >= 4) score += 100000;
        else if (aiLine.count === 3 && aiLine.open >= 2) score += 50000;
        else if (aiLine.count === 3 && aiLine.open === 1) score += 5000;
        else if (aiLine.count === 2 && aiLine.open >= 2) score += 500;
        else if (aiLine.count === 2) score += 50;
        
        if (oppLine.count >= 4) score += 90000;
        else if (oppLine.count === 3 && oppLine.open >= 2) score += 40000;
        else if (oppLine.count === 3) score += 4000;
        else if (oppLine.count === 2 && oppLine.open >= 2) score += 400;
        
        if (dx === 1 && (dy === 1 || dy === -1)) {
            score *= 1.3;
        }
    }
    
    let centerRow = Math.floor(size / 2);
    let centerCol = Math.floor(size / 2);
    let distToCenter = Math.abs(row - centerRow) + Math.abs(col - centerCol);
    score += Math.max(0, 50 - distToCenter * 2);
    
    return score;
}

function getCandidates(board, size) {
    let occupied = [];
    for (let i = 0; i < size * size; i++) {
        if (board[i] !== '.') occupied.push(i);
    }
    
    if (occupied.length === 0) {
        let center = Math.floor(size / 2);
        return [center * size + center];
    }
    
    let candidates = new Set();
    for (let pos of occupied) {
        let r = Math.floor(pos / size);
        let c = pos % size;
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                let nr = r + dr;
                let nc = c + dc;
                if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
                    let idx = nr * size + nc;
                    if (board[idx] === '.') candidates.add(idx);
                }
            }
        }
    }
    return Array.from(candidates);
}

function getAIMove(game) {
    const { board, botMark, playerMark, size } = game;
    let candidates = getCandidates(board, size);
    if (candidates.length === 0) return -1;
    
    let bestScore = -Infinity;
    let bestMove = candidates[0];
    
    for (let pos of candidates) {
        let score = evaluateMove(board, pos, botMark, playerMark, size);
        if (score > bestScore) {
            bestScore = score;
            bestMove = pos;
        }
    }
    
    return bestMove;
}

async function handleBotTurn(api, message, initialTurn = false) {
    let threadId = message.threadId;
    let game = activeCaroGames.get(threadId);
    if (!game) return;
    await api.addReaction("FLASH", message);
    game.isProcessing = true;
    startTurnTimer(api, message, threadId, false);
    let pos = getAIMove(game);
    clearTurnTimer(threadId);
    if (!activeCaroGames.has(threadId)) return;
    if (pos < 0 || game.moveCount >= game.size * game.size) {
        let imageBuffer = await createCaroBoard(game.board, game.size, game.moveCount, game.playerMark, game.botMark, game.playerName, game.lastBotMove, game.currentTurn, [], game.mode);
        let imagePath = path.resolve(process.cwd(), "assets", "temp", `caro_${threadId}_draw.png`);
        await fs.writeFile(imagePath, imageBuffer);
        let caption = `🏆 HÒA CỜ!\n\n📊 Nước đi: ${game.moveCount}/${game.size * game.size}\n💭 Đôi khi hòa cũng là một kết quả tốt.\n\n🎯 Thử lại lần nữa để phân định thắng bại nhé!`;
        await sendMessageTag(api, message, { caption, imagePath }, TTL_LONG);
        await api.addReaction("UNDO", message);
        await api.addReaction("OK", message);
        try { await fs.unlink(imagePath); } catch (error) { }
        activeCaroGames.delete(threadId);
        return;
    }
    game.board[pos] = game.botMark;
    game.currentTurn = game.playerMark;
    game.moveCount++;
    game.lastBotMove = pos;
    let winResult = checkWin(game.board, game.size);
    let winningLine = winResult ? winResult.line : [];
    let imageBuffer = await createCaroBoard(game.board, game.size, game.moveCount, game.playerMark, game.botMark, game.playerName, pos, game.playerMark, winningLine, game.mode);
    let imagePath = path.resolve(process.cwd(), "assets", "temp", `caro_${threadId}.png`);
    await fs.writeFile(imagePath, imageBuffer);
    let modeName = game.mode === "master" ? "cao thủ" : game.mode === "hard" ? "khó" : "dễ";
    if (winResult) {
        let caption = `🤖 BOT WIN!\n\n🎮 BOT đánh ô số: ${pos + 1}\n🏆 BOT ${modeName} đã dành chiến thắng xuất sắc\n\n👤 ${game.playerName} đã thua tâm phục khẩu phục\n💪 Hãy rút kinh nghiệm và thử lại lần sau nhé!`;
        await sendMessageTag(api, message, { caption, imagePath }, TTL_LONG);
        await api.addReaction("UNDO", message);
        await api.addReaction("OK", message);
        activeCaroGames.delete(threadId);
        clearTurnTimer(threadId);
    } else if (game.moveCount === game.size * game.size) {
        let caption = `🏆 HÒA CỜ!\n\n🎮 BOT đánh ô số: ${pos + 1}\n📊 Nước đi: ${game.moveCount}/${game.size * game.size}\n\n💭 Trận đấu cân não đỉnh cao!\n🎯 Cả bạn và BOT đều chơi xuất sắc!`;
        await sendMessageTag(api, message, { caption, imagePath }, TTL_LONG);
        await api.addReaction("UNDO", message);
        await api.addReaction("OK", message);
        activeCaroGames.delete(threadId);
        clearTurnTimer(threadId);
    } else {
        let initialMessage = initialTurn ? `🎮 BẮT ĐẦU TRẬN ĐẤU - CHẾ ĐỘ ${game.mode.toUpperCase()}\n\n🤖 BOT đi trước (Quân ${game.botMark})` : "";
        let caption = `${initialMessage}\n🌟 BOT đánh ô số: ${pos + 1}\n\n🎯 Lượt của ${game.playerName} (Quân ${game.playerMark})\n\n👉 Gõ số ô (1-${game.size * game.size})\n⏱️ Thời gian: 60 giây\n\n💡 Hãy suy nghĩ kỹ trước khi đánh!`;
        await sendMessageTag(api, message, { caption, imagePath }, TTL_SHORT);
        await api.addReaction("UNDO", message);
        await api.addReaction("OK", message);
        game.isProcessing = false;
        startTurnTimer(api, message, threadId, true);
    }
    try { await fs.unlink(imagePath); } catch (error) { }
}

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
            `• ${prefix}caro easy >> Dễ\n` +
            `• ${prefix}caro hard x >> Khó\n` +
            `• ${prefix}caro master >> Cao thủ\n\n` +
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
        await sendMessageWarning(api, message, `⚠️ Đang có trận đấu đang diễn ra!\nVui lòng hoàn thành trận này trước khi bắt đầu trận mới.`, TTL_SHORT);
        return;
    }
    let inputMode = args[1].toLowerCase();
    let mode = "";
    let size = 16;
    let playerMark = "";
    if (["easy", "hard", "master"].includes(inputMode)) {
        mode = inputMode;
        if (mode === "master") {
            playerMark = args.length > 2 ? args[2].toUpperCase() : "O";
        } else {
            playerMark = args.length > 2 ? args[2].toUpperCase() : (Math.random() > 0.5 ? "X" : "O");
        }
    } else {
        await sendMessageWarning(api, message, "🎯 Chế độ không hợp lệ!\n\nVui lòng chọn:\n• easy - Dễ\n• hard - Khó\n• master - Cao thủ", TTL_SHORT);
        return;
    }
    if (!["X", "O"].includes(playerMark)) {
        await sendMessageWarning(api, message, "🚫 Quân cờ không hợp lệ!\n\Vui lòng chọn X hoặc O\n(Lưu ý: X luôn đi trước)", TTL_SHORT);
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
        let imageBuffer = await createCaroBoard(board, size, 0, playerMark, playerMark === "X" ? "O" : "X", message.data.dName, -1, "X", [], mode);
        let imagePath = path.resolve(process.cwd(), "assets", "temp", `caro_${threadId}.png`);
        await fs.writeFile(imagePath, imageBuffer);
        let caption = `🎮 BẮT ĐẦU TRẬN ĐẤU - CHẾ ĐỘ ${mode.toUpperCase()}\n\n🎯 Lượt của ${message.data.dName} (Quân ${playerMark})\n\n👉 Gõ số ô (1-${size * size}) để đánh\n⏱️ Thời gian: 60 giây\n\n💡 Mẹo: Kiểm soát trung tâm là chìa khóa chiến thắng!`;
        await sendMessageTag(api, message, { caption, imagePath }, TTL_SHORT);
        startTurnTimer(api, message, threadId, true);
        try { await fs.unlink(imagePath); } catch (error) { }
    } else {
        activeCaroGames.get(threadId).isProcessing = true;
        handleBotTurn(api, message, true);
    }
}

export async function handleCaroMessage(api, message) {
    let threadId = message.threadId;
    let game = activeCaroGames.get(threadId);
    if (!game) return;
    if (game.isProcessing) return;
    if (message.data.uidFrom !== game.playerId) return;
    if (game.currentTurn !== game.playerMark) return;
    let content = String(message.data.content || "");
    if (message.data.mentions && message.data.mentions.length > 0) return;
    if (content.trim().toLowerCase() === "lose") {
        clearTurnTimer(threadId);
        let caption = `🏳️ ĐẦU HÀNG!\n\n👤 ${game.playerName} đã chọn đầu hàng\n🏆 BOT đã dành chiến thắng\n\n🎯 Đừng bỏ cuộc những lần sau nhé!`;
        await sendMessageTag(api, message, { caption }, TTL_LONG);
        activeCaroGames.delete(threadId);
        return;
    }
    if (!/^\d+$/.test(content.trim())) return;
    clearTurnTimer(threadId);
    let pos = parseInt(content.trim(), 10) - 1;
    if (pos < 0 || pos >= game.size * game.size) {
        await sendMessageWarning(api, message, `🚫 Số ô không hợp lệ!\nVui lòng chọn từ 1 đến ${game.size * game.size}`, TTL_SHORT);
        startTurnTimer(api, message, threadId, true);
        return;
    }
    if (game.board[pos] !== ".") {
        await sendMessageWarning(api, message, "⚠️ Ô này đã có quân cờ rồi!\nHãy chọn một ô trống khác", TTL_SHORT);
        startTurnTimer(api, message, threadId, true);
        return;
    }
    game.isProcessing = true;
    game.board[pos] = game.playerMark;
    game.currentTurn = game.botMark;
    game.moveCount++;
    let winResult = checkWin(game.board, game.size);
    let winningLine = winResult ? winResult.line : [];
    let imageBuffer = await createCaroBoard(game.board, game.size, game.moveCount, game.playerMark, game.botMark, game.playerName, game.lastBotMove, game.botMark, winningLine, game.mode);
    let imagePath = path.resolve(process.cwd(), "assets", "temp", `caro_${threadId}.png`);
    await fs.writeFile(imagePath, imageBuffer);
    if (winResult) {
        let caption = `👑 PLAYER WIN!\n\n👤 ${game.playerName} đánh ô số: ${pos + 1}\n🏆 Chúc mừng một chiến thắng xuất sắc!\n\n🌟 Bạn đã chơi rất hay trong ván cờ này.`;
        await sendMessageTag(api, message, { caption, imagePath }, TTL_LONG);
        activeCaroGames.delete(threadId);
        clearTurnTimer(threadId);
        try { await fs.unlink(imagePath); } catch (error) { }
        return;
    } else if (game.moveCount === game.size * game.size) {
        let caption = `🏆 HÒA CỜ!\n\n👤 Bạn đánh ô số: ${pos + 1}\n📊 Nước đi: ${game.moveCount}/${game.size * game.size}\n\n💭 Hòa do không còn nước đi.\n🎯 Cả bạn và BOT đều chơi rất xuất sắc!`;
        await sendMessageTag(api, message, { caption, imagePath }, TTL_LONG);
        activeCaroGames.delete(threadId);
        clearTurnTimer(threadId);
        try { await fs.unlink(imagePath); } catch (error) { }
        return;
    }
    try { await fs.unlink(imagePath); } catch (error) { }
    handleBotTurn(api, message);
}
