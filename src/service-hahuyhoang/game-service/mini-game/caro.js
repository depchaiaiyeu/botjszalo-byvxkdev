import { createCanvas } from "canvas";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { createRequire } from "module";
import { sendMessageComplete, sendMessageWarning, sendMessageTag } from "../../chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service.js";
import { removeMention } from "../../../utils/format-util.js";

let activeCaroGames = new Map();
let turnTimers = new Map();

const TTL_LONG = 3600000;
const TTL_SHORT = 60000;

const GOMOKU_SIZE = 16;
const LAYOUT_BLACK = 1;
const LAYOUT_WHITE = 0;

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
            let caption = `⏱️ HẾT GIỜ..!\n\n👤 ${game.playerName} không đánh trong vòng 60 giây\n🏆 BOT đã dành chiến thắng ván cờ này!`;
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

const GOMOKU_AI = {
    findBestMove: function(game) {
        const { board, size, mode, botMark, playerMark } = game;
        const bot = botMark;
        const opp = playerMark;
        const WIN_COUNT = 5;
        const BOARD_SIZE = size;
        const SEARCH_DEPTH = 3;

        const AI_PLAYER = bot;
        const HUMAN_PLAYER = opp;

        const SCORES = {
            FIVE: 100000,
            LIVE_FOUR: 10000,
            DEAD_FOUR: 1000,
            LIVE_THREE: 1000,
            DEAD_THREE: 100,
            LIVE_TWO: 100,
            DEAD_TWO: 10,
            ONE: 1
        };

        const idx = (r, c) => r * size + c;
        const isValid = (r, c) => r >= 0 && r < size && c >= 0 && c < size;
        const isFull = (b) => !b.includes('.');

        function getEmpty(b) {
            let empty = [];
            for (let i = 0; i < b.length; i++) {
                if (b[i] === '.') empty.push(i);
            }
            return empty;
        }

        function checkWinner(b, s, player) {
            const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
            for (let r = 0; r < s; r++) {
                for (let c = 0; c < s; c++) {
                    if (b[idx(r, c)] !== player) continue;
                    for (const [dr, dc] of directions) {
                        let count = 1;
                        for (let step = 1; step < WIN_COUNT; step++) {
                            const newRow = r + dr * step;
                            const newCol = c + dc * step;
                            if (!isValid(newRow, newCol) || b[idx(newRow, newCol)] !== player) break;
                            count++;
                        }
                        if (count >= WIN_COUNT) return true;
                    }
                }
            }
            return false;
        }

        function getPatternScore(count, openEnds) {
            if (count >= 5) return SCORES.FIVE;
            if (count === 4) {
                if (openEnds === 2) return SCORES.LIVE_FOUR;
                if (openEnds === 1) return SCORES.DEAD_FOUR;
            }
            if (count === 3) {
                if (openEnds === 2) return SCORES.LIVE_THREE;
                if (openEnds === 1) return SCORES.DEAD_THREE;
            }
            if (count === 2) {
                if (openEnds === 2) return SCORES.LIVE_TWO;
                if (openEnds === 1) return SCORES.DEAD_TWO;
            }
            if (count === 1) return SCORES.ONE;
            return 0;
        }

        function evaluateLine(b, s, row, col, dx, dy, player) {
            let count = 0;
            let openEnds = 0;

            let r = row;
            let c = col;
            while (r >= 0 && r < s && c >= 0 && c < s && b[idx(r, c)] === player) {
                count++;
                r += dx;
                c += dy;
            }
            if (r >= 0 && r < s && c >= 0 && c < s && !b[idx(r, c)]) {
                openEnds++;
            }

            r = row - dx;
            c = col - dy;
            while (r >= 0 && r < s && c >= 0 && c < s && b[idx(r, c)] === player) {
                count++;
                r -= dx;
                c -= dy;
            }
            if (r >= 0 && r < s && c >= 0 && c < s && !b[idx(r, c)]) {
                openEnds++;
            }
            
            return getPatternScore(count, openEnds);
        }
        
        function evaluatePlayer(b, s, player) {
            let score = 0;
            const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
            const evaluated = new Set();

            for (let row = 0; row < s; row++) {
                for (let col = 0; col < s; col++) {
                    if (b[idx(row, col)] === player) {
                        for (const [dx, dy] of directions) {
                            const key = `${row},${col},${dx},${dy}`;
                            const revKey = `${row + dx * (WIN_COUNT - 1)},${col + dy * (WIN_COUNT - 1)},${-dx},${-dy}`;
                            if (!evaluated.has(key) && !evaluated.has(revKey)) {
                                score += evaluateLine(b, s, row, col, dx, dy, player);
                                evaluated.add(key);
                            }
                        }
                    }
                }
            }
            return score;
        }

        function evaluateBoard(b, s, aiPlayer, humanPlayer) {
            let score = 0;
            score += evaluatePlayer(b, s, aiPlayer);
            score -= evaluatePlayer(b, s, humanPlayer);
            return score;
        }

        function getCandidateMoves(b, s) {
            const candidates = new Set();
            const range = 2;

            if (getEmpty(b).length === s * s) {
                return [idx(Math.floor(s / 2), Math.floor(s / 2))];
            }

            for (let row = 0; row < s; row++) {
                for (let col = 0; col < s; col++) {
                    if (b[idx(row, col)] !== '.') {
                        for (let dr = -range; dr <= range; dr++) {
                            for (let dc = -range; dc <= range; dc++) {
                                const newRow = row + dr;
                                const newCol = col + dc;
                                if (isValid(newRow, newCol) && b[idx(newRow, newCol)] === '.') {
                                    candidates.add(idx(newRow, newCol));
                                }
                            }
                        }
                    }
                }
            }
            return Array.from(candidates);
        }

        function minimax(b, s, depth, alpha, beta, isMaximizing, botSym, oppSym) {
            const evalScore = evaluateBoard(b, s, botSym, oppSym);
            if (depth === 0 || Math.abs(evalScore) > SCORES.FIVE / 2) {
                return evalScore;
            }

            const candidates = getCandidateMoves(b, s);
            if (candidates.length === 0) return 0;

            if (isMaximizing) {
                let maxScore = -Infinity;
                for (const moveIndex of candidates) {
                    b[moveIndex] = botSym;
                    const score = minimax(b, s, depth - 1, alpha, beta, false, botSym, oppSym);
                    b[moveIndex] = '.';
                    maxScore = Math.max(maxScore, score);
                    alpha = Math.max(alpha, score);
                    if (beta <= alpha) break;
                }
                return maxScore;
            } else {
                let minScore = Infinity;
                for (const moveIndex of candidates) {
                    b[moveIndex] = oppSym;
                    const score = minimax(b, s, depth - 1, alpha, beta, true, botSym, oppSym);
                    b[moveIndex] = '.';
                    minScore = Math.min(minScore, score);
                    beta = Math.min(beta, score);
                    if (beta <= alpha) break;
                }
                return minScore;
            }
        }
        
        function findBlockMove(b, s, player, requiredCount) {
             const emptyMoves = getEmpty(b);
             for (const move of emptyMoves) {
                b[move] = player;
                const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
                for (let r = 0; r < s; r++) {
                    for (let c = 0; c < s; c++) {
                        if (b[idx(r, c)] !== player) continue;
                        for (const [dr, dc] of directions) {
                            let count = 1;
                            let openEnds = 0;
                            
                            for (let step = 1; step < WIN_COUNT; step++) {
                                const newRow = r + dr * step;
                                const newCol = c + dc * step;
                                if (!isValid(newRow, newCol) || b[idx(newRow, newCol)] !== player) {
                                    if(isValid(newRow, newCol) && b[idx(newRow, newCol)] === '.') openEnds++;
                                    break;
                                }
                                count++;
                            }
                            
                            let backRow = r - dr;
                            let backCol = c - dc;
                            if(isValid(backRow, backCol) && b[idx(backRow, backCol)] === '.') openEnds++;

                            if (count === requiredCount && openEnds === 2) {
                                b[move] = '.';
                                return move;
                            }
                        }
                    }
                }
                b[move] = '.';
             }
             return null;
        }

        const emptyMoves = getEmpty(board);
        if (emptyMoves.length === 0) return -1;
        if (emptyMoves.length === size * size) {
            return idx(Math.floor(size / 2), Math.floor(size / 2));
        }
        
        for (const move of emptyMoves) {
            board[move] = bot;
            if (checkWinner(board, size, bot)) {
                board[move] = '.';
                return move;
            }
            board[move] = '.';
        }

        for (const move of emptyMoves) {
            board[move] = opp;
            if (checkWinner(board, size, opp)) {
                board[move] = '.';
                return move;
            }
            board[move] = '.';
        }

        if (mode === 'de') {
            const block3 = findBlockMove(board, size, opp, 3);
            if(block3 !== null) return block3;
            
            const candidates = getCandidateMoves(board, size);
            return candidates[Math.floor(Math.random() * candidates.length)];
        }

        if (mode === 'kho') {
            let bestScore = -Infinity;
            let bestMove = null;
            const candidates = getCandidateMoves(board, size);

            for (const moveIndex of candidates) {
                board[moveIndex] = bot;
                const score = evaluateBoard(board, size, bot, opp);
                board[moveIndex] = '.';

                if (score > bestScore) {
                    bestScore = score;
                    bestMove = moveIndex;
                }
            }
            return bestMove !== null ? bestMove : emptyMoves[Math.floor(Math.random() * emptyMoves.length)];
        }

        if (mode === 'caothu') {
            let bestScore = -Infinity;
            let bestMove = null;
            const candidates = getCandidateMoves(board, size);

            for (const moveIndex of candidates) {
                board[moveIndex] = AI_PLAYER;
                const score = minimax(board, size, SEARCH_DEPTH - 1, -Infinity, Infinity, false, bot, opp);
                board[moveIndex] = '.';

                if (score > bestScore) {
                    bestScore = score;
                    bestMove = moveIndex;
                }
            }
            return bestMove !== null ? bestMove : emptyMoves[Math.floor(Math.random() * emptyMoves.length)];
        }

        return emptyMoves[Math.floor(Math.random() * emptyMoves.length)];
    }
};

async function createCaroBoard(board, size = GOMOKU_SIZE, moveCount = 0, playerMark = "X", botMark = "O", playerName = "Player", lastBotMove = -1, currentTurn = "X", winningLine = [], mode = "normal") {
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

function checkWin(board, size = GOMOKU_SIZE) {
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

async function handleBotTurn(api, message, initialTurn = false) {
    let threadId = message.threadId;
    let game = activeCaroGames.get(threadId);
    if (!game) return;

    await api.addReaction("FLASH", message);
    game.isProcessing = true;
    startTurnTimer(api, message, threadId, false);

    const pos = GOMOKU_AI.findBestMove(game);

    clearTurnTimer(threadId);
    if (!activeCaroGames.has(threadId)) return;

    if (pos < 0 || game.moveCount >= game.size * game.size) {
        let imageBuffer = await createCaroBoard(game.board, game.size, game.moveCount, game.playerMark, game.botMark, game.playerName, game.lastBotMove, game.currentTurn, [], game.mode);
        let imagePath = path.resolve(process.cwd(), "assets", "temp", `caro_${threadId}_draw.png`);
        await fs.writeFile(imagePath, imageBuffer);
        let caption = `🏆 HÒA CỜ!\n\n📊 Nước đi: ${game.moveCount}/${game.size * game.size}\n💭 Đôi khi hòa cũng là một kết quả tốt.\n\n🎯 Thử lại lần nữa để phân định thắng bại nhé!`;
        await sendMessageTag(api, message, { caption }, TTL_LONG);
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

    let modeName;
    if (game.mode === "caothu") modeName = "Cao Thủ";
    else if (game.mode === "kho") modeName = "Khó";
    else modeName = "Dễ";

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
            `${prefix}caro [de/kho/caothu] [x/o]\n\n` +
            `💡 Ví dụ:\n` +
            `• ${prefix}caro de >> Chế độ Dễ (BOT đánh ngẫu nhiên)\n` +
            `• ${prefix}caro kho x >> Chế độ Khó, bạn cầm X\n` +
            `• ${prefix}caro caothu o >> Chế độ Cao Thủ, bạn cầm O (mặc định)\n\n` +
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
    let size = GOMOKU_SIZE;
    let playerMark = "";
    const allowedModes = ["de", "kho", "caothu"];

    if (allowedModes.includes(inputMode)) {
        mode = inputMode;

        if (["caothu"].includes(mode)) {
            playerMark = args.length > 2 ? args[2].toUpperCase() : "O";
        } else {
            playerMark = args.length > 2 ? args[2].toUpperCase() : (Math.random() > 0.5 ? "X" : "O");
        }
    } else {
        await sendMessageWarning(api, message, "🎯 Chế độ không hợp lệ!\n\nVui lòng chọn một trong các chế độ sau:\n• de\n• kho\n• caothu", TTL_SHORT);
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
        isProcessing: false,
        winResult: null
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
    game.moveCount++;

    let winResult = checkWin(game.board, game.size);
    let winningLine = winResult ? winResult.line : [];

    if (winResult) {
        let imageBuffer = await createCaroBoard(game.board, game.size, game.moveCount, game.playerMark, game.botMark, game.playerName, game.lastBotMove, game.botMark, winningLine, game.mode);
        let imagePath = path.resolve(process.cwd(), "assets", "temp", `caro_${threadId}.png`);
        await fs.writeFile(imagePath, imageBuffer);

        let caption = `👑 PLAYER WIN!\n\n👤 ${game.playerName} đánh ô số: ${pos + 1}\n🏆 Chúc mừng một chiến thắng xuất sắc!\n\n🌟 Bạn đã chơi rất hay trong ván cờ này.`;
        await sendMessageTag(api, message, { caption, imagePath }, TTL_LONG);
        activeCaroGames.delete(threadId);
        clearTurnTimer(threadId);
        try { await fs.unlink(imagePath); } catch (error) { }
        return;
    } else if (game.moveCount === game.size * game.size) {
        let imageBuffer = await createCaroBoard(game.board, game.size, game.moveCount, game.playerMark, game.botMark, game.playerName, game.lastBotMove, game.botMark, winningLine, game.mode);
        let imagePath = path.resolve(process.cwd(), "assets", "temp", `caro_${threadId}.png`);
        await fs.writeFile(imagePath, imageBuffer);

        let caption = `🏆 HÒA CỜ!\n\n👤 Bạn đánh ô số: ${pos + 1}\n📊 Nước đi: ${game.moveCount}/${game.size * game.size}\n\n💭 Hòa do không còn nước đi.\n🎯 Cả bạn và BOT đều chơi rất xuất sắc!`;
        await sendMessageTag(api, message, { caption, imagePath }, TTL_LONG);
        activeCaroGames.delete(threadId);
        clearTurnTimer(threadId);
        try { await fs.unlink(imagePath); } catch (error) { }
        return;
    }

    game.currentTurn = game.botMark;
    handleBotTurn(api, message);
}
