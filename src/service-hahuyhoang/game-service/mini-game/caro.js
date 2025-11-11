import { createCanvas } from "canvas";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { sendMessageComplete, sendMessageWarning, sendMessageTag } from "../../chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service.js";
import { removeMention } from "../../../utils/format-util.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const activeCaroGames = new Map();
const turnTimers = new Map();

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
        
        if (isPlayerTurn) {
            const caption = `⏱️ HẾT GIỜ!\n\n👤 ${game.playerName} không đánh trong 60 giây\n🏆 BOT đã dành chiến thắng ván cờ này!"`;
            await sendMessageTag(api, message, { caption });
        } else {
            const caption = `⏱️ HẾT GIỜ!\n\n🤖 BOT không đánh trong 60 giây\n🏆 ${game.playerName} đã dành chiến thắng!`;
            await sendMessageTag(api, message, { caption });
        }
        
        activeCaroGames.delete(threadId);
        clearTurnTimer(threadId);
    }, 60000);
    
    turnTimers.set(threadId, timer);
}

async function createCaroBoard(board, size = 16, moveCount = 0, playerMark = "X", botMark = "O", playerName = "Player", lastBotMove = -1, currentTurn = "X", winningLine = [], mode = "Easy") {
    const cellSize = 50;
    const padding = 40;
    const headerHeight = 50;
    const footerHeight = 50;
    const width = size * cellSize + padding * 2;
    const height = size * cellSize + padding * 2 + headerHeight + footerHeight;
    
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, width, height);
    
    ctx.font = "bold 16px 'BeVietnamPro'";
    
    ctx.textAlign = "left";
    if (playerMark === "X") {
        ctx.fillStyle = "#FF0000";
        ctx.fillText(`X: ${playerName}`, 20, 30);
    } else {
        ctx.fillStyle = "#FF0000";
        ctx.fillText("X: BOT", 20, 30);
    }

    ctx.textAlign = "right";
    if (playerMark === "O") {
        ctx.fillStyle = "#0000FF";
        ctx.fillText(`O: ${playerName}`, width - 20, 30);
    } else {
        ctx.fillStyle = "#0000FF";
        ctx.fillText("O: BOT", width - 20, 30);
    }
    
    const boardTop = headerHeight;
    
    ctx.strokeStyle = "#000000";
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
    
    const numberFont = "15px 'BeVietnamPro'";
    const markFont = "bold 30px 'BeVietnamPro'";
    const circleWidth = 4;
    const circleRadius = cellSize / 2.8;
    const winLineWidth = 6;
    
    for (let i = 0; i < board.length; i++) {
        const row = Math.floor(i / size);
        const col = i % size;
        const x = padding + col * cellSize + cellSize / 2;
        const y = boardTop + padding + row * cellSize + cellSize / 2;
        
        if (board[i] === ".") {
            ctx.font = numberFont;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillStyle = "#000000";
            ctx.fillText((i + 1).toString(), x, y);
        } else {
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
            
            if (i === lastBotMove) {
                ctx.strokeStyle = "#CC8800";
                ctx.lineWidth = circleWidth;
                ctx.beginPath();
                ctx.arc(x, y, circleRadius, 0, Math.PI * 2);
                ctx.stroke();
            }
        }
    }
    
    const winLength = 5;
    if (winningLine && winningLine.length >= winLength) {
        ctx.strokeStyle = "#00FF00";
        ctx.lineWidth = winLineWidth;
        
        const startPos = winningLine[0];
        const endPos = winningLine[winningLine.length - 1];

        const startRow = Math.floor(startPos / size);
        const startCol = startPos % size;
        const endRow = Math.floor(endPos / size);
        const endCol = endPos % size;
        
        const startX = padding + startCol * cellSize + cellSize / 2;
        const startY = boardTop + padding + startRow * cellSize + cellSize / 2;
        const endX = padding + endCol * cellSize + cellSize / 2;
        const endY = boardTop + padding + endRow * cellSize + cellSize / 2;

        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
    }
    
    ctx.font = "bold 15px 'BeVietnamPro'";
    ctx.textAlign = "center";
    ctx.fillStyle = "#000000";
    ctx.fillText(`Nước đi: ${moveCount}/${size * size}`, width / 2, height - 25);
    
    return canvas.toBuffer("image/png");
}

function countInDirection(board, pos, dr, dc, mark, size = 16) {
    let count = 0;
    let row = Math.floor(pos / size);
    let col = pos % size;
    
    row += dr;
    col += dc;
    
    while (row >= 0 && row < size && col >= 0 && col < size) {
        const idx = row * size + col;
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

function checkWinAt(board, pos, mark, size = 16) {
    const directions = [[0,1], [1,0], [1,1], [1,-1]];
    const winLength = 5;
    
    for (const [dr, dc] of directions) {
        const forward = countInDirection(board, pos, dr, dc, mark, size);
        const backward = countInDirection(board, pos, -dr, -dc, mark, size);
        
        if (forward + backward + 1 >= winLength) {
            return true;
        }
    }
    
    return false;
}

function checkWin(board, size = 16) {
    const directions = [[0,1], [1,0], [1,1], [1,-1]];
    const winLength = 5;
    
    for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
            const idx = row * size + col;
            const mark = board[idx];
            if (mark === ".") continue;
            
            for (const [dr, dc] of directions) {
                let count = 1;
                let line = [idx];
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

const BOARD_SIZE = 16;
const EMPTY = ".";
const DIRECTIONS = [[0, 1], [1, 0], [1, 1], [1, -1]];

function analyzePattern(board, pos, mark, size) {
    const r = Math.floor(pos / size);
    const c = pos % size;
    let maxCount = 0;
    let openEnds = 0;
    let hasGap = false;

    for (const [dr, dc] of DIRECTIONS) {
        let count = 1;
        let opens = 0;
        let gap = 0;
        
        for (let i = 1; i <= 5; i++) {
            const nr = r + dr * i;
            const nc = c + dc * i;
            if (nr < 0 || nr >= size || nc < 0 || nc >= size) break;
            const cell = board[nr * size + nc];
            if (cell === mark) {
                count++;
            } else if (cell === EMPTY && gap === 0 && i < 5) {
                gap = 1;
            } else {
                if (cell === EMPTY) opens++;
                break;
            }
        }

        for (let i = 1; i <= 5; i++) {
            const nr = r - dr * i;
            const nc = c - dc * i;
            if (nr < 0 || nr >= size || nc < 0 || nc >= size) break;
            const cell = board[nr * size + nc];
            if (cell === mark) {
                count++;
            } else if (cell === EMPTY && gap === 0 && i < 5) {
                gap = 1;
            } else {
                if (cell === EMPTY) opens++;
                break;
            }
        }

        if (count > maxCount) {
            maxCount = count;
            openEnds = opens;
            hasGap = gap > 0;
        }
    }

    return { count: maxCount, openEnds, hasGap };
}

function getCandidateMoves(board, size, botMark, playerMark) {
    const candidates = new Set();
    const center = Math.floor(size / 2);
    const centerRange = 6;

    for (let i = 0; i < size * size; i++) {
        if (board[i] !== EMPTY) {
            const r = Math.floor(i / size);
            const c = i % size;
            
            for (let dr = -2; dr <= 2; dr++) {
                for (let dc = -2; dc <= 2; dc++) {
                    if (dr === 0 && dc === 0) continue;
                    const nr = r + dr;
                    const nc = c + dc;
                    if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
                        const idx = nr * size + nc;
                        if (board[idx] === EMPTY) {
                            candidates.add(idx);
                        }
                    }
                }
            }
        }
    }

    if (candidates.size === 0) {
        for (let r = center - centerRange; r <= center + centerRange; r++) {
            for (let c = center - centerRange; c <= center + centerRange; c++) {
                if (r >= 0 && r < size && c >= 0 && c < size) {
                    const idx = r * size + c;
                    if (board[idx] === EMPTY) {
                        candidates.add(idx);
                    }
                }
            }
        }
    }

    return Array.from(candidates);
}

function evaluateMove(board, pos, mark, oppMark, size) {
    const r = Math.floor(pos / size);
    const c = pos % size;
    const center = Math.floor(size / 2);
    let score = 0;

    const distToCenter = Math.abs(r - center) + Math.abs(c - center);
    score += Math.max(0, 10 - distToCenter);

    board[pos] = mark;
    const myPattern = analyzePattern(board, pos, mark, size);
    board[pos] = EMPTY;

    board[pos] = oppMark;
    const oppPattern = analyzePattern(board, pos, oppMark, size);
    board[pos] = EMPTY;

    if (myPattern.count >= 5) return 100000000;
    if (oppPattern.count >= 5) return 90000000;

    if (myPattern.count === 4 && myPattern.openEnds >= 1) score += 10000000;
    if (oppPattern.count === 4 && oppPattern.openEnds >= 1) score += 8000000;

    if (myPattern.count === 3 && myPattern.openEnds === 2) score += 500000;
    if (oppPattern.count === 3 && oppPattern.openEnds === 2) score += 400000;

    if (oppPattern.count === 3 && oppPattern.openEnds === 1) score += 50000;
    if (myPattern.count === 3 && myPattern.openEnds === 1) score += 30000;

    if (oppPattern.count === 2 && oppPattern.openEnds === 2) score += 5000;
    if (myPattern.count === 2 && myPattern.openEnds === 2) score += 3000;

    return score;
}

function getAIMove(board, playerMark, mode, size = 16) {
    const botMark = playerMark === "X" ? "O" : "X";
    
    for (let i = 0; i < size * size; i++) {
        if (board[i] !== EMPTY) continue;
        board[i] = botMark;
        if (checkWinAt(board, i, botMark, size)) {
            board[i] = EMPTY;
            return i;
        }
        board[i] = EMPTY;
    }
    
    for (let i = 0; i < size * size; i++) {
        if (board[i] !== EMPTY) continue;
        board[i] = playerMark;
        if (checkWinAt(board, i, playerMark, size)) {
            board[i] = EMPTY;
            return i;
        }
        board[i] = EMPTY;
    }

    const candidates = getCandidateMoves(board, size, botMark, playerMark);
    
    if (candidates.length === 0) {
        const center = Math.floor(size / 2);
        return center * size + center;
    }

    let bestMove = candidates[0];
    let bestScore = -Infinity;

    for (const move of candidates) {
        const score = evaluateMove(board, move, botMark, playerMark, size);
        if (score > bestScore) {
            bestScore = score;
            bestMove = move;
        }
    }

    return bestMove;
}

async function handleBotTurn(api, message, initialTurn = false) {
    const threadId = message.threadId;
    const game = activeCaroGames.get(threadId);
    
    if (!game) return;
    
    await api.addReaction("FLASH", message);

    game.isProcessing = true;
    startTurnTimer(api, message, threadId, false);
    
    const pos = getAIMove(game.board, game.playerMark, game.mode, game.size);
    
    clearTurnTimer(threadId);
    
    if (!activeCaroGames.has(threadId)) return;
    
    if (pos < 0 || game.moveCount >= game.size * game.size) {
        const imageBuffer = await createCaroBoard(game.board, game.size, game.moveCount, game.playerMark, game.botMark, game.playerName, game.lastBotMove, game.currentTurn, [], game.mode);
        const imagePath = path.resolve(process.cwd(), "assets", "temp", `caro_${threadId}_draw.png`);
        await fs.writeFile(imagePath, imageBuffer);
        
        const caption = `🤝 HÒA CỜ!\n\n📊 Nước đi: ${game.moveCount}/${game.size * game.size}\n💭 Đôi khi hòa cũng là một kết quả tốt!\n\n🎯 Thử lại lần nữa để phân định thắng bại nhé!`;
        await sendMessageTag(api, message, {
            caption,
            imagePath
        }, 86400000);
        
        await api.addReaction("UNDO", message);
        await api.addReaction("OK", message);
        
        try {
            await fs.unlink(imagePath);
        } catch (error) {}
        
        activeCaroGames.delete(threadId);
        return;
    }
    
    game.board[pos] = game.botMark;
    game.currentTurn = game.playerMark;
    game.moveCount++;
    game.lastBotMove = pos;
    
    const winResult = checkWin(game.board, game.size);
    
    const winningLine = winResult ? winResult.line : [];
    
    const imageBuffer = await createCaroBoard(game.board, game.size, game.moveCount, game.playerMark, game.botMark, game.playerName, pos, game.playerMark, winningLine, game.mode);
    const imagePath = path.resolve(process.cwd(), "assets", "temp", `caro_${threadId}.png`);
    await fs.writeFile(imagePath, imageBuffer);
    
    const modeName = game.mode === "master" ? "cao thủ" : game.mode === "hard" ? "khó" : "dễ";
    
    if (winResult) {
        const caption = `🤖 BOT WIN!\n\n🎮 Bot đánh ô số: ${pos + 1}\n🏆 Bot ${modeName} đã dành chiến thắng xuất sắc\n\n👤 ${game.playerName} đã thua tâm phục khẩu phục\n💪 Rút kinh nghiệm và thử lại lần sau nhé!`;
        await sendMessageTag(api, message, {
            caption,
            imagePath
        }, 86400000);
        await api.addReaction("UNDO", message);
        await api.addReaction("OK", message);
        activeCaroGames.delete(threadId);
        clearTurnTimer(threadId);
    } else if (game.moveCount === game.size * game.size) {
        const caption = `🤝 HÒA CỜ!\n\n🎮 Bot đánh ô số: ${pos + 1}\n📊 Nước đi: ${game.moveCount}/${game.size * game.size}\n\n💭 Trận đấu cân não đỉnh cao!\n🎯 Cả bạn và Bot đều chơi xuất sắc!`;
        await sendMessageTag(api, message, {
            caption,
            imagePath
        }, 86400000);
        await api.addReaction("UNDO", message);
        await api.addReaction("OK", message);
        activeCaroGames.delete(threadId);
        clearTurnTimer(threadId);
    } else {
        const initialMessage = initialTurn ? `🎮 BẮT ĐẦU TRẬN ĐẤU - CHẾ ĐỘ ${game.mode.toUpperCase()}\n\n🤖 Bot đi trước (Quân X)` : "";
        
        const caption = `${initialMessage}\n\n🤖 BOT đánh ô số: ${pos + 1}\n\n🎯 Lượt của ${game.playerName} (Quân ${game.playerMark})\n\n👉 Gõ số ô (1-${game.size * game.size})\n⏱️ Thời gian: 60 giây\n\n💡 Hãy suy nghĩ kỹ trước khi đánh!`;
        await sendMessageTag(api, message, {
            caption,
            imagePath
        }, 60000);
        await api.addReaction("UNDO", message);
        await api.addReaction("OK", message);
        game.isProcessing = false;
        startTurnTimer(api, message, threadId, true);
    }
    
    try {
        await fs.unlink(imagePath);
    } catch (error) {}
}

export async function handleCaroCommand(api, message) {
    const threadId = message.threadId;
    const content = removeMention(message);
    const prefix = getGlobalPrefix();
    const args = content.split(/\s+/);
    
    if (!content.includes(`${prefix}caro`)) return;
    
    if (args.length < 2) {
        await sendMessageComplete(api, message, 
            `🎮 CỜ CARO - THÁCH ĐẤU TRÍ TUỆ\n\n` +
            `📌 Cú pháp:\n` +
            `${prefix}caro [easy/hard/master] [x/o]\n\n` +
            `💡 Ví dụ:\n` +
            `• ${prefix}caro easy - Dễ, ngẫu nhiên X/O\n` +
            `• ${prefix}caro hard x - Khó, bạn chọn X\n` +
            `• ${prefix}caro master o - Siêu khó, bạn chọn O\n\n` +
            `📋 Luật chơi:\n` +
            `• Bàn cờ 16x16, thắng khi ghép 5 quân liên tiếp\n` +
            `• Quân X luôn đi trước\n` +
            `• Gõ số ô (1-256) để đánh quân\n` +
            `• Gõ "lose" để đầu hàng\n` +
            `• ⏱️ Thời gian suy nghĩ: 60 giây/nước`
        );
        return;
    }

    if (activeCaroGames.has(threadId)) {
        await sendMessageWarning(api, message, `⚠️ Đang có trận đấu đang diễn ra!\nVui lòng hoàn thành trận này trước khi bắt đầu trận mới.`, 60000);
        return;
    }
    
    const inputMode = args[1].toLowerCase();
    let mode = "";
    const size = 16;
    let playerMark = "";

    if (["easy", "hard", "master"].includes(inputMode)) {
        mode = inputMode;
        if (mode === "master") {
            playerMark = args.length > 2 ? args[2].toUpperCase() : "O";
        } else {
            playerMark = args.length > 2 ? args[2].toUpperCase() : (Math.random() > 0.5 ? "X" : "O");
        }
    } else {
        await sendMessageWarning(api, message, "🎯 Chế độ không hợp lệ!\n\nVui lòng chọn:\n• easy - Dễ\n• hard - Khó\n• master - Cao thủ", 60000);
        return;
    }
    
    if (!["X", "O"].includes(playerMark)) {
        await sendMessageWarning(api, message, "🚫 Quân cờ không hợp lệ!\n\nVui lòng chọn X hoặc O\n(Lưu ý: X luôn đi trước)", 60000);
        return;
    }
    
    clearTurnTimer(threadId);
    
    const board = Array(size * size).fill(".");
    
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
        const imageBuffer = await createCaroBoard(board, size, 0, playerMark, playerMark === "X" ? "O" : "X", message.data.dName, -1, "X", [], mode);
        const imagePath = path.resolve(process.cwd(), "assets", "temp", `caro_${threadId}.png`);
        await fs.writeFile(imagePath, imageBuffer);
        
        const caption = `🎮 BẮT ĐẦU TRẬN ĐẤU - CHẾ ĐỘ ${mode.toUpperCase()}\n\n🎯 Lượt của ${message.data.dName} (Quân ${playerMark})\n\n👉 Gõ số ô (1-${size * size}) để đánh\n⏱️ Thời gian: 60 giây\n\n💡 Mẹo: Kiểm soát trung tâm là chìa khóa chiến thắng!`;
        await sendMessageTag(api, message, {
            caption,
            imagePath
        }, 60000);
        startTurnTimer(api, message, threadId, true);
        
        try {
            await fs.unlink(imagePath);
        } catch (error) {}
    } else {
        const initialCaption = `🎮 BẮT ĐẦU TRẬN ĐẤU - CHẾ ĐỘ ${mode.toUpperCase()}\n\n🤖 Bot đi trước (Quân X)\n👉 Đang suy nghĩ...\n\n🎯 ${message.data.dName} chuẩn bị tinh thần nhé!`;
        await sendMessageTag(api, message, {
            caption: initialCaption
        });
        activeCaroGames.get(threadId).isProcessing = true;
        handleBotTurn(api, message, true);
    }
}

export async function handleCaroMessage(api, message) {
    const threadId = message.threadId;
    const game = activeCaroGames.get(threadId);
    
    if (!game) return;
    if (game.isProcessing) return;
    if (message.data.uidFrom !== game.playerId) return;
    if (game.currentTurn !== game.playerMark) return;
    
    const content = message.data.content || "";
    
    if (message.data.mentions && message.data.mentions.length > 0) return;
    
    if (content.trim().toLowerCase() === "lose") {
        clearTurnTimer(threadId);
        const caption = `🏳️ ĐẦU HÀNG!\n\n👤 ${game.playerName} đã chọn đầu hàng\n🏆 Bot chiến thắng\n\n🎯 Đừng bỏ cuộc những lần sau nhé!`;
        await sendMessageTag(api, message, {
            caption
        });
        activeCaroGames.delete(threadId);
        return;
    }
    
    if (!/^\d+$/.test(String(content).trim())) return;

    clearTurnTimer(threadId);
    
    const pos = parseInt(content.trim(), 10) - 1;
    
    if (pos < 0 || pos >= game.size * game.size) {
        await sendMessageWarning(api, message, `🚫 Số ô không hợp lệ!\nVui lòng chọn từ 1 đến ${game.size * game.size}`, 60000);
        startTurnTimer(api, message, threadId, true);
        return;
    }
    
    if (game.board[pos] !== ".") {
        await sendMessageWarning(api, message, "⚠️ Ô này đã có quân cờ rồi!\nHãy chọn một ô trống khác", 60000);
        startTurnTimer(api, message, threadId, true);
        return;
    }
    
    game.isProcessing = true;
    game.board[pos] = game.playerMark;
    game.currentTurn = game.botMark;
    game.moveCount++;
    
    const winResult = checkWin(game.board, game.size);
    
    const winningLine = winResult ? winResult.line : [];
    
    const imageBuffer = await createCaroBoard(game.board, game.size, game.moveCount, game.playerMark, game.botMark, game.playerName, game.lastBotMove, game.botMark, winningLine, game.mode);
    const imagePath = path.resolve(process.cwd(), "assets", "temp", `caro_${threadId}.png`);
    await fs.writeFile(imagePath, imageBuffer);
    
    if (winResult) {
        const caption = `👑 PLAYER WIN!\n\n👤 ${game.playerName} đánh ô số: ${pos + 1}\n🏆 Chúc mừng một chiến thắng xuất sắc!\n\n🌟 Bạn đã chơi rất hay trong ván cờ này.`;
        await sendMessageTag(api, message, {
            caption,
            imagePath
        }, 300000);
        activeCaroGames.delete(threadId);
        clearTurnTimer(threadId);
        try {
            await fs.unlink(imagePath);
        } catch (error) {}
        return;
    } else if (game.moveCount === game.size * game.size) {
        const caption = `🤝 HÒA CỜ!\n\n👤 Bạn đánh ô số: ${pos + 1}\n📊 Nước đi: ${game.moveCount}/${game.size * game.size}\n\n💭 Hòa do không còn nước đi.\n🎯 Cả bạn và bot đều chơi rất xuất sắc!`;
        await sendMessageTag(api, message, {
            caption,
            imagePath
        }, 86400000);
        activeCaroGames.delete(threadId);
        clearTurnTimer(threadId);
        try {
            await fs.unlink(imagePath);
        } catch (error) {}
        return;
    }
    
    try {
        await fs.unlink(imagePath);
    } catch (error) {}
    
    handleBotTurn(api, message);
}
