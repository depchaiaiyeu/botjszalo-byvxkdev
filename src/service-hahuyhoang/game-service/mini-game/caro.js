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

async function createCaroBoard(board, size = 16, moveCount = 0, playerMark = "X", botMark = "O", playerName = "Player", lastBotMove = -1, currentTurn = "X", winningLine = [], mode = "normal") {
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

const AI_ENGINE = {
    EMPTY: 0,
    BOT: 1,
    PLAYER: 2,
    BOARD_SIZE: 16,
    MAX_TIME: 2500,
    
    levelMap: {
        "normal": 4,
        "medium": 6,
        "hard": 8,
        "fuckme": 10
    },

    patternScores: {
        FIVE: 100000000,
        OPEN_FOUR: 10000000,
        FOUR: 500000,
        OPEN_THREE: 50000,
        BLOCKED_THREE: 5000,
        OPEN_TWO: 1000,
        BLOCKED_TWO: 100,
        ONE: 10
    },

    evaluatePattern: function(pattern, mark) {
        const own = pattern.filter(x => x === mark).length;
        const opp = pattern.filter(x => x !== mark && x !== this.EMPTY).length;
        const empty = pattern.filter(x => x === this.EMPTY).length;

        if (opp > 0 && own > 0) return 0;

        if (own === 5) return mark === this.BOT ? this.patternScores.FIVE : -this.patternScores.FIVE;
        
        if (own === 4) {
            if (empty === 1) return mark === this.BOT ? this.patternScores.OPEN_FOUR : -this.patternScores.OPEN_FOUR;
            return mark === this.BOT ? this.patternScores.FOUR : -this.patternScores.FOUR;
        }
        
        if (own === 3) {
            if (empty === 2) return mark === this.BOT ? this.patternScores.OPEN_THREE : -this.patternScores.OPEN_THREE;
            if (empty === 1) return mark === this.BOT ? this.patternScores.BLOCKED_THREE : -this.patternScores.BLOCKED_THREE;
        }
        
        if (own === 2) {
            if (empty === 3) return mark === this.BOT ? this.patternScores.OPEN_TWO : -this.patternScores.OPEN_TWO;
            if (empty === 2) return mark === this.BOT ? this.patternScores.BLOCKED_TWO : -this.patternScores.BLOCKED_TWO;
        }
        
        if (own === 1 && empty === 4) {
            return mark === this.BOT ? this.patternScores.ONE : -this.patternScores.ONE;
        }

        return 0;
    },

    evaluatePosition: function(board) {
        let score = 0;
        const size = this.BOARD_SIZE;
        const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];

        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                for (const [dr, dc] of directions) {
                    let pattern = [];
                    for (let i = 0; i < 5; i++) {
                        const nr = r + dr * i;
                        const nc = c + dc * i;
                        if (nr < 0 || nr >= size || nc < 0 || nc >= size) break;
                        pattern.push(board[nr][nc]);
                    }
                    if (pattern.length === 5) {
                        score += this.evaluatePattern(pattern, this.BOT);
                        score += this.evaluatePattern(pattern, this.PLAYER);
                    }
                }
            }
        }

        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                if (board[r][c] !== this.EMPTY) {
                    const centerDist = Math.abs(r - size/2) + Math.abs(c - size/2);
                    const centerBonus = (size - centerDist) * 2;
                    score += board[r][c] === this.BOT ? centerBonus : -centerBonus;
                }
            }
        }

        return score;
    },

    getCriticalMoves: function(board) {
        const size = this.BOARD_SIZE;
        const moves = [];
        const threats = new Map();
        const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];

        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                if (board[r][c] !== this.EMPTY) continue;

                let maxThreat = 0;
                
                for (const [dr, dc] of directions) {
                    for (let offset = -4; offset <= 0; offset++) {
                        let pattern = [];
                        let positions = [];
                        let valid = true;
                        
                        for (let i = 0; i < 5; i++) {
                            const nr = r + dr * (offset + i);
                            const nc = c + dc * (offset + i);
                            if (nr < 0 || nr >= size || nc < 0 || nc >= size) {
                                valid = false;
                                break;
                            }
                            pattern.push(board[nr][nc]);
                            positions.push(nr * size + nc);
                        }
                        
                        if (!valid) continue;

                        const botCount = pattern.filter(x => x === this.BOT).length;
                        const playerCount = pattern.filter(x => x === this.PLAYER).length;
                        const emptyCount = pattern.filter(x => x === this.EMPTY).length;

                        if (botCount >= 4 && playerCount === 0) {
                            maxThreat = Math.max(maxThreat, 100000);
                        } else if (playerCount >= 4 && botCount === 0) {
                            maxThreat = Math.max(maxThreat, 90000);
                        } else if (botCount === 3 && emptyCount === 2 && playerCount === 0) {
                            maxThreat = Math.max(maxThreat, 10000);
                        } else if (playerCount === 3 && emptyCount === 2 && botCount === 0) {
                            maxThreat = Math.max(maxThreat, 9000);
                        } else if (botCount === 3 && emptyCount === 1 && playerCount === 0) {
                            maxThreat = Math.max(maxThreat, 5000);
                        } else if (playerCount === 3 && emptyCount === 1 && botCount === 0) {
                            maxThreat = Math.max(maxThreat, 4500);
                        } else if (botCount === 2 && emptyCount === 3 && playerCount === 0) {
                            maxThreat = Math.max(maxThreat, 1000);
                        } else if (playerCount === 2 && emptyCount === 3 && botCount === 0) {
                            maxThreat = Math.max(maxThreat, 900);
                        }
                    }
                }

                if (maxThreat > 0) {
                    threats.set(r * size + c, maxThreat);
                }
            }
        }

        const sortedThreats = Array.from(threats.entries()).sort((a, b) => b[1] - a[1]);
        
        for (const [pos, threat] of sortedThreats.slice(0, 15)) {
            moves.push({ r: Math.floor(pos / size), c: pos % size, threat });
        }

        if (moves.length === 0) {
            for (let r = 0; r < size; r++) {
                for (let c = 0; c < size; c++) {
                    if (board[r][c] !== this.EMPTY) {
                        for (let dr = -2; dr <= 2; dr++) {
                            for (let dc = -2; dc <= 2; dc++) {
                                const nr = r + dr;
                                const nc = c + dc;
                                if (nr >= 0 && nr < size && nc >= 0 && nc < size && board[nr][nc] === this.EMPTY) {
                                    const pos = nr * size + nc;
                                    if (!threats.has(pos)) {
                                        moves.push({ r: nr, c: nc, threat: 0 });
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        if (moves.length === 0) {
            moves.push({ r: Math.floor(size / 2), c: Math.floor(size / 2), threat: 0 });
        }

        return moves;
    },

    alphaBeta: function(board, depth, alpha, beta, isMaximizing, startTime) {
        if (Date.now() - startTime > this.MAX_TIME) {
            return this.evaluatePosition(board);
        }

        const score = this.evaluatePosition(board);
        
        if (Math.abs(score) >= this.patternScores.FIVE || depth === 0) {
            return score;
        }

        const moves = this.getCriticalMoves(board);
        
        if (isMaximizing) {
            let maxEval = -Infinity;
            for (const move of moves) {
                board[move.r][move.c] = this.BOT;
                const eval_score = this.alphaBeta(board, depth - 1, alpha, beta, false, startTime);
                board[move.r][move.c] = this.EMPTY;
                
                maxEval = Math.max(maxEval, eval_score);
                alpha = Math.max(alpha, eval_score);
                
                if (beta <= alpha || Date.now() - startTime > this.MAX_TIME) break;
            }
            return maxEval;
        } else {
            let minEval = Infinity;
            for (const move of moves) {
                board[move.r][move.c] = this.PLAYER;
                const eval_score = this.alphaBeta(board, depth - 1, alpha, beta, true, startTime);
                board[move.r][move.c] = this.EMPTY;
                
                minEval = Math.min(minEval, eval_score);
                beta = Math.min(beta, eval_score);
                
                if (beta <= alpha || Date.now() - startTime > this.MAX_TIME) break;
            }
            return minEval;
        }
    },

    findBestMove: function(game) {
        const startTime = Date.now();
        const maxDepth = this.levelMap[game.mode] || 6;
        this.BOARD_SIZE = game.size;

        const board = Array(game.size).fill(0).map(() => Array(game.size).fill(this.EMPTY));
        for (let i = 0; i < game.board.length; i++) {
            const r = Math.floor(i / game.size);
            const c = i % game.size;
            if (game.board[i] === game.botMark) {
                board[r][c] = this.BOT;
            } else if (game.board[i] === game.playerMark) {
                board[r][c] = this.PLAYER;
            }
        }

        const moves = this.getCriticalMoves(board);
        let bestMove = null;
        let bestScore = -Infinity;

        for (let d = 2; d <= maxDepth; d += 2) {
            let currentBestMove = null;
            let currentBestScore = -Infinity;

            for (const move of moves) {
                board[move.r][move.c] = this.BOT;
                const score = this.alphaBeta(board, d - 1, -Infinity, Infinity, false, startTime);
                board[move.r][move.c] = this.EMPTY;

                if (score > currentBestScore) {
                    currentBestScore = score;
                    currentBestMove = move;
                }

                if (Date.now() - startTime > this.MAX_TIME) break;
            }

            if (currentBestMove) {
                bestMove = currentBestMove;
                bestScore = currentBestScore;
            }

            if (bestScore >= this.patternScores.FIVE || Date.now() - startTime > this.MAX_TIME) {
                break;
            }
        }

        if (!bestMove && moves.length > 0) {
            bestMove = moves[0];
        }

        return bestMove ? bestMove.r * game.size + bestMove.c : -1;
    }
};

async function handleBotTurn(api, message, initialTurn = false) {
    let threadId = message.threadId;
    let game = activeCaroGames.get(threadId);
    if (!game) return;

    await api.addReaction("FLASH", message);
    game.isProcessing = true;
    startTurnTimer(api, message, threadId, false);

    const pos = AI_ENGINE.findBestMove(game);

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
    if (game.mode === "fuckme") modeName = "cực khó";
    else if (game.mode === "hard") modeName = "khó";
    else if (game.mode === "medium") modeName = "trung bình";
    else modeName = "thường";

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
            `${prefix}caro [normal/medium/hard/fuckme] [x/o]\n\n` +
            `💡 Ví dụ:\n` +
            `• ${prefix}caro normal >> Chế độ Thường\n` +
            `• ${prefix}caro medium x >> Chế độ Trung bình, bạn cầm X\n` +
            `• ${prefix}caro hard o >> Chế độ Khó, bạn cầm O (mặc định)\n` +
            `• ${prefix}caro fuckme >> Chế độ Cực khó (mặc định bạn cầm O)\n\n` +
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
    const allowedModes = ["normal", "medium", "hard", "fuckme"];
    
    if (allowedModes.includes(inputMode)) {
        mode = inputMode;
        
        if (["hard", "fuckme"].includes(mode)) {
            playerMark = args.length > 2 ? args[2].toUpperCase() : "O";
        } else {
            playerMark = args.length > 2 ? args[2].toUpperCase() : (Math.random() > 0.5 ? "X" : "O");
        }
    } else {
        await sendMessageWarning(api, message, "🎯 Chế độ không hợp lệ!\n\nVui lòng chọn một trong các chế độ sau:\n• normal\n• medium\n• hard\n• fuckme", TTL_SHORT);
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
