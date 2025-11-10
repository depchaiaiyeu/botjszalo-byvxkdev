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
            const caption = `\n🎮 TRẬN ĐẤU KẾT THÚC\n\n⏰ ${game.playerName} bị loại vì không đánh nước tiếp theo trong 60 giây\n🏆 BOT đã dành chiến thắng ván cờ này`;
            await sendMessageTag(api, message, {
                caption
            });
        } else {
            const caption = `\n🎮 TRẬN ĐẤU KẾT THÚC\n\n⏰ BOT thua vì không đánh trong 60 giây\n🏆 ${game.playerName} đã dành chiến thắng ván cờ này`;
            await sendMessageTag(api, message, {
                caption
            });
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
const DIRECTIONS = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1]
];

const PATTERN_SCORES = {
    FIVE: 100000000,
    OPEN_FOUR: 50000000,
    CLOSED_FOUR: 100000,
    OPEN_THREE: 50000,
    CLOSED_THREE: 1000,
    OPEN_TWO: 500,
    CLOSED_TWO: 50,
    OPEN_ONE: 10,
    CLOSED_ONE: 1
};

const FORK_BONUS = {
    OPEN_FOUR_OPEN_THREE: 40000000,
    OPEN_FOUR_CLOSED_THREE: 30000000,
    DOUBLE_OPEN_THREE: 20000000
};

const DIAGONAL_BONUS_MULTIPLIER = 1.5;

const CENTER_MIN = 3;
const CENTER_MAX = 12;
const CENTER_BONUS = 50;

const ZOBRIST = {
    table: [],
    playerKeys: [],
    botKeys: [],
    initialized: false,

    init(size) {
        if (this.initialized) return;
        this.playerKeys = Array(size * size).fill(0).map(() => this.random64());
        this.botKeys = Array(size * size).fill(0).map(() => this.random64());
        this.initialized = true;
    },

    random64() {
        return BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER));
    },

    computeHash(board, size, playerMark, botMark) {
        let hash = 0n;
        for (let i = 0; i < size * size; i++) {
            if (board[i] === playerMark) {
                hash ^= this.playerKeys[i];
            } else if (board[i] === botMark) {
                hash ^= this.botKeys[i];
            }
        }
        return hash;
    }
};

const transpositionTable = new Map();
const TT_FLAG = { EXACT: 0, LOWER_BOUND: 1, UPPER_BOUND: 2 };

function evaluateLine(line, mark, oppMark) {
    let myPieces = 0;
    let oppPieces = 0;
    let emptyCells = 0;

    for (const cell of line) {
        if (cell === mark) myPieces++;
        else if (cell === oppMark) oppPieces++;
        else emptyCells++;
    }

    if (myPieces > 0 && oppPieces > 0) return 0;

    if (myPieces > 0) {
        const openEnds = (line[0] === EMPTY ? 1 : 0) + (line[line.length - 1] === EMPTY ? 1 : 0);
        switch (myPieces) {
            case 5: return PATTERN_SCORES.FIVE;
            case 4:
                return openEnds === 2 ? PATTERN_SCORES.OPEN_FOUR : PATTERN_SCORES.CLOSED_FOUR;
            case 3:
                return openEnds === 2 ? PATTERN_SCORES.OPEN_THREE : PATTERN_SCORES.CLOSED_THREE;
            case 2:
                return openEnds === 2 ? PATTERN_SCORES.OPEN_TWO : PATTERN_SCORES.CLOSED_TWO;
            case 1:
                return openEnds === 2 ? PATTERN_SCORES.OPEN_ONE : PATTERN_SCORES.CLOSED_ONE;
        }
    }
    else if (oppPieces > 0) {
        const openEnds = (line[0] === EMPTY ? 1 : 0) + (line[line.length - 1] === EMPTY ? 1 : 0);
        switch (oppPieces) {
            case 5: return PATTERN_SCORES.FIVE;
            case 4:
                return openEnds === 2 ? PATTERN_SCORES.OPEN_FOUR : PATTERN_SCORES.CLOSED_FOUR;
            case 3:
                return openEnds === 2 ? PATTERN_SCORES.OPEN_THREE : PATTERN_SCORES.CLOSED_THREE;
        }
    }
    return 0;
}

function evaluateBoard(board, botMark, playerMark, size) {
    let myScore = 0;
    let oppScore = 0;
    let myOpenThrees = 0;
    let myOpenFours = 0;
    let oppOpenThrees = 0;
    let oppOpenFours = 0;

    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            const pos = r * size + c;

            if (r >= CENTER_MIN && r <= CENTER_MAX && c >= CENTER_MIN && c <= CENTER_MAX) {
                if (board[pos] === botMark) myScore += CENTER_BONUS;
                else if (board[pos] === playerMark) oppScore += CENTER_BONUS;
            }

            if (board[pos] === EMPTY) continue;

            const isMyMark = board[pos] === botMark;
            const mark = isMyMark ? botMark : playerMark;
            const oppMark = isMyMark ? playerMark : botMark;

            for (let i = 0; i < DIRECTIONS.length; i++) {
                const [dr, dc] = DIRECTIONS[i];
                let line = [mark];
                let openEnds = 0;
                let count = 1;

                let rB = r - dr;
                let cB = c - dc;
                if (rB >= 0 && rB < size && cB >= 0 && cB < size && board[rB * size + cB] === EMPTY) {
                    openEnds++;
                }

                for (let k = 1; k < 5; k++) {
                    let rF = r + dr * k;
                    let cF = c + dc * k;
                    if (rF < 0 || rF >= size || cF < 0 || cF >= size) break;
                    
                    const cell = board[rF * size + cF];
                    if (cell === mark) {
                        count++;
                        line.push(cell);
                    } else if (cell === EMPTY) {
                        openEnds++;
                        line.push(cell);
                        break;
                    } else {
                        break;
                    }
                }

                if (line.includes(oppMark)) continue; 

                const diagonalBonus = (i >= 2) ? DIAGONAL_BONUS_MULTIPLIER : 1.0;
                
                let lineScore = 0;
                if (count === 5) lineScore = PATTERN_SCORES.FIVE;
                else if (count === 4) {
                    if (openEnds === 2) {
                        lineScore = PATTERN_SCORES.OPEN_FOUR;
                        if(isMyMark) myOpenFours++; else oppOpenFours++;
                    } else if (openEnds === 1) {
                        lineScore = PATTERN_SCORES.CLOSED_FOUR;
                    }
                } else if (count === 3) {
                    if (openEnds === 2) {
                        lineScore = PATTERN_SCORES.OPEN_THREE;
                        if(isMyMark) myOpenThrees++; else oppOpenThrees++;
                    } else if (openEnds === 1) {
                        lineScore = PATTERN_SCORES.CLOSED_THREE;
                    }
                } else if (count === 2) {
                    if (openEnds === 2) lineScore = PATTERN_SCORES.OPEN_TWO;
                    else if (openEnds === 1) lineScore = PATTERN_SCORES.CLOSED_TWO;
                } else if (count === 1) {
                    if (openEnds === 2) lineScore = PATTERN_SCORES.OPEN_ONE;
                }

                if (isMyMark) myScore += lineScore * diagonalBonus;
                else oppScore += lineScore * diagonalBonus;
            }
        }
    }

    if (myOpenFours > 0 && myOpenThrees > 0) myScore += FORK_BONUS.OPEN_FOUR_OPEN_THREE;
    else if (myOpenThrees > 1) myScore += FORK_BONUS.DOUBLE_OPEN_THREE;

    if (oppOpenFours > 0 && oppOpenThrees > 0) oppScore += FORK_BONUS.OPEN_FOUR_OPEN_THREE;
    else if (oppOpenThrees > 1) oppScore += FORK_BONUS.DOUBLE_OPEN_THREE;

    return myScore - oppScore;
}

function quickHeuristic(board, move, myMark, oppMark, size) {
    let score = 0;
    const r = Math.floor(move / size);
    const c = move % size;

    if (r >= CENTER_MIN && r <= CENTER_MAX && c >= CENTER_MIN && c <= CENTER_MAX) {
        score += CENTER_BONUS * 2;
    }
    
    board[move] = myMark;
    const myAnalysis = analyzeMove(board, move, myMark, size);
    board[move] = EMPTY;

    board[move] = oppMark;
    const oppAnalysis = analyzeMove(board, move, oppMark, size);
    board[move] = EMPTY;
    
    if (myAnalysis.five) return PATTERN_SCORES.FIVE + 1000;
    if (oppAnalysis.five) return PATTERN_SCORES.FIVE;
    
    if (myAnalysis.openFour && myAnalysis.openThree) score += FORK_BONUS.OPEN_FOUR_OPEN_THREE;
    if (myAnalysis.openThree > 1) score += FORK_BONUS.DOUBLE_OPEN_THREE;
    
    if (oppAnalysis.openFour && oppAnalysis.openThree) score += FORK_BONUS.OPEN_FOUR_OPEN_THREE * 0.9;
    if (oppAnalysis.openThree > 1) score += FORK_BONUS.DOUBLE_OPEN_THREE * 0.9;

    score += myAnalysis.openFour * PATTERN_SCORES.OPEN_FOUR;
    score += myAnalysis.closedFour * PATTERN_SCORES.CLOSED_FOUR;
    score += myAnalysis.openThree * PATTERN_SCORES.OPEN_THREE;
    
    score += oppAnalysis.openFour * PATTERN_SCORES.OPEN_FOUR * 0.8;
    score += oppAnalysis.closedFour * PATTERN_SCORES.CLOSED_FOUR * 0.8;
    score += oppAnalysis.openThree * PATTERN_SCORES.OPEN_THREE * 0.8;

    return score;
}

function analyzeMove(board, pos, mark, size) {
    let five = 0, openFour = 0, closedFour = 0, openThree = 0;
    const r = Math.floor(pos / size);
    const c = pos % size;

    for (const [dr, dc] of DIRECTIONS) {
        let count = 1;
        let openEnds = 0;

        for (let i = 1; i < 5; i++) {
            const rF = r + dr * i, cF = c + dc * i;
            if (rF < 0 || rF >= size || cF < 0 || cF >= size || board[rF * size + cF] !== mark) {
                if (rF >= 0 && rF < size && cF >= 0 && cF < size && board[rF * size + cF] === EMPTY) openEnds++;
                break;
            }
            count++;
        }

        for (let i = 1; i < 5; i++) {
            const rB = r - dr * i, cB = c - dc * i;
            if (rB < 0 || rB >= size || cB < 0 || cB >= size || board[rB * size + cB] !== mark) {
                if (rB >= 0 && rB < size && cB >= 0 && cB < size && board[rB * size + cB] === EMPTY) openEnds++;
                break;
            }
            count++;
        }

        if (count >= 5) five++;
        else if (count === 4) {
            if (openEnds === 2) openFour++;
            else if (openEnds === 1) closedFour++;
        } else if (count === 3) {
            if (openEnds === 2) openThree++;
        }
    }
    return { five, openFour, closedFour, openThree };
}

function generateCandidateMoves(board, size, moveCount, botMark, playerMark) {
    if (moveCount === 0) {
        return [Math.floor(size / 2) * size + Math.floor(size / 2)];
    }

    const candidateSet = new Set();
    const neighborRadius = 2;

    for (let i = 0; i < size * size; i++) {
        if (board[i] !== EMPTY) {
            const r = Math.floor(i / size);
            const c = i % size;
            for (let dr = -neighborRadius; dr <= neighborRadius; dr++) {
                for (let dc = -neighborRadius; dc <= neighborRadius; dc++) {
                    if (dr === 0 && dc === 0) continue;
                    const nr = r + dr;
                    const nc = c + dc;
                    if (nr >= 0 && nr < size && nc >= 0 && nc < size && board[nr * size + nc] === EMPTY) {
                        candidateSet.add(nr * size + nc);
                    }
                }
            }
        }
    }

    if (moveCount < 10) {
        for (let r = CENTER_MIN; r <= CENTER_MAX; r++) {
            for (let c = CENTER_MIN; c <= CENTER_MAX; c++) {
                if (board[r * size + c] === EMPTY) {
                    candidateSet.add(r * size + c);
                }
            }
        }
    }

    const scoredMoves = [];
    for (const move of candidateSet) {
        const score = quickHeuristic(board, move, botMark, playerMark, size);
        scoredMoves.push({ move, score });
    }

    scoredMoves.sort((a, b) => b.score - a.score);

    const MAX_CANDIDATES = 15;
    return scoredMoves.slice(0, MAX_CANDIDATES).map(m => m.move);
}

function alphaBetaSearch(board, depth, isMaximizingPlayer, alpha, beta, botMark, playerMark, size, moveCount, currentHash) {
    
    const alphaOrig = alpha;
    const ttEntry = transpositionTable.get(currentHash);
    if (ttEntry && ttEntry.depth >= depth) {
        if (ttEntry.flag === TT_FLAG.EXACT) {
            return ttEntry.score;
        } else if (ttEntry.flag === TT_FLAG.LOWER_BOUND) {
            alpha = Math.max(alpha, ttEntry.score);
        } else if (ttEntry.flag === TT_FLAG.UPPER_BOUND) {
            beta = Math.min(beta, ttEntry.score);
        }
        if (alpha >= beta) {
            return ttEntry.score;
        }
    }

    const boardScore = evaluateBoard(board, botMark, playerMark, size);
    
    if (Math.abs(boardScore) >= PATTERN_SCORES.FIVE) {
        return boardScore;
    }
    
    if (depth === 0) {
        return boardScore;
    }

    const moves = generateCandidateMoves(board, size, moveCount, 
        isMaximizingPlayer ? botMark : playerMark, 
        isMaximizingPlayer ? playerMark : botMark
    );

    if (moves.length === 0) {
        return 0;
    }

    let bestValue;

    if (isMaximizingPlayer) {
        bestValue = -Infinity;
        for (const move of moves) {
            board[move] = botMark;
            const newHash = currentHash ^ ZOBRIST.botKeys[move];
            const value = alphaBetaSearch(board, depth - 1, false, alpha, beta, botMark, playerMark, size, moveCount + 1, newHash);
            board[move] = EMPTY;

            bestValue = Math.max(bestValue, value);
            alpha = Math.max(alpha, bestValue);
            if (alpha >= beta) {
                break;
            }
        }
    } else {
        bestValue = Infinity;
        for (const move of moves) {
            board[move] = playerMark;
            const newHash = currentHash ^ ZOBRIST.playerKeys[move];
            const value = alphaBetaSearch(board, depth - 1, true, alpha, beta, botMark, playerMark, size, moveCount + 1, newHash);
            board[move] = EMPTY;

            bestValue = Math.min(bestValue, value);
            beta = Math.min(beta, bestValue);
            if (alpha >= beta) {
                break;
            }
        }
    }

    let flag;
    if (bestValue <= alphaOrig) {
        flag = TT_FLAG.UPPER_BOUND;
    } else if (bestValue >= beta) {
        flag = TT_FLAG.LOWER_BOUND;
    } else {
        flag = TT_FLAG.EXACT;
    }
    transpositionTable.set(currentHash, { score: bestValue, depth, flag });

    return bestValue;
}

function getBestMove(board, playerMark, botMark, mode, size, moveCount) {
    if (!ZOBRIST.initialized) {
        ZOBRIST.init(size);
    }
    transpositionTable.clear(); 
    
    const currentHash = ZOBRIST.computeHash(board, size, playerMark, botMark);

    const DEPTHS = { easy: 2, hard: 4, master: 6 };
    const MAX_DEPTH = DEPTHS[mode] || 2;

    let bestMove = -1;
    let orderedMoves = [];

    for (let currentDepth = 2; currentDepth <= MAX_DEPTH; currentDepth += 2) {
        let alpha = -Infinity;
        let beta = Infinity;
        let currentBestScore = -Infinity;
        let currentBestMove = -1;

        let candidates;
        if (orderedMoves.length > 0) {
            candidates = orderedMoves;
        } else {
            candidates = generateCandidateMoves(board, size, moveCount, botMark, playerMark);
        }
        
        if (candidates.length === 0) return -1;
        
        currentBestMove = candidates[0];
        let newOrderedMoves = [];

        for (const move of candidates) {
            board[move] = botMark;
            const newHash = currentHash ^ ZOBRIST.botKeys[move];
            const score = alphaBetaSearch(board, currentDepth - 1, false, alpha, beta, botMark, playerMark, size, moveCount + 1, newHash);
            board[move] = EMPTY;

            newOrderedMoves.push({ move, score });

            if (score > currentBestScore) {
                currentBestScore = score;
                currentBestMove = move;
            }
            alpha = Math.max(alpha, currentBestScore);
        }

        bestMove = currentBestMove;
        orderedMoves = newOrderedMoves.sort((a, b) => b.score - a.score).map(m => m.move);

        if (currentBestScore >= PATTERN_SCORES.FIVE) {
            break;
        }
    }

    return bestMove;
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

    const moveCount = board.filter(cell => cell !== EMPTY).length;
    return getBestMove(board, playerMark, botMark, mode, size, moveCount);
}

export async function handleCaroCommand(api, message) {
    const threadId = message.threadId;
    const content = removeMention(message);
    const prefix = getGlobalPrefix();
    const args = content.split(/\s+/);
    
    if (!content.includes(`${prefix}caro`)) return;
    
    if (args.length < 2) {
        await sendMessageComplete(api, message, 
            `🎮 HƯỚNG DẪN CHƠI CỜ CARO\n\n` +
            `📌 Cú pháp:\n` +
            `${prefix}caro [easy/hard/master] [x/o]\n\n` +
            `💡 Ví dụ:\n` +
            `${prefix}caro easy\n` +
            `${prefix}caro hard x\n` +
            `${prefix}caro master o\n\n` +
            `📋 Luật chơi:\n` +
            `Cờ 16x16 (thắng 5)\n` +
            `Quân X đi trước\n` +
            `Nhập số ô (1-256) để đánh quân\n` +
            `Chế độ Master: Bot mặc định đi trước (X) trừ khi bạn chọn X.\n` +
            `🧭 Thời gian: 60 giây`
        );
        return;
    }

    if (activeCaroGames.has(threadId)) {
        await sendMessageWarning(api, message, `Đã có 1 ván cờ đang diễn ra trong nhóm này.`, 60000);
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
        await sendMessageWarning(api, message, "🎯 Vui lòng chọn đúng chế độ:\n- easy: Dễ\n- hard: Khó\n- master: Thách đấu", 60000);
        return;
    }
    
    if (!["X", "O"].includes(playerMark)) {
        await sendMessageWarning(api, message, "Quân cờ để bắt đầu không hợp lệ, vui lòng chọn giữa X và O\nX đi trước ", 60000);
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
    
    const imageBuffer = await createCaroBoard(board, size, 0, playerMark, playerMark === "X" ? "O" : "X", message.data.dName, -1, "X", [], mode);
    const imagePath = path.resolve(process.cwd(), "assets", "temp", `caro_${threadId}.png`);
    await fs.writeFile(imagePath, imageBuffer);
    
    if (playerMark === "X") {
        const caption = `\n🎮 BẮT ĐẦU TRÒ CHƠI (${mode.toUpperCase()})\n\n🎯 Đến lượt ${message.data.dName} (Quân ${playerMark})\n\n👉 Nhập số ô (1-${size * size}) để đánh\n\n🧭 Thời gian: 60 giây`;
        await sendMessageTag(api, message, {
            caption,
            imagePath
        }, 60000);
        startTurnTimer(api, message, threadId, true);
    } else {
        const caption = `\n🎮 BẮT ĐẦU TRÒ CHƠI (${mode.toUpperCase()})\n\n🤖 Bot đi trước (Quân X)\n\n🎯 Đến lượt ${message.data.dName}`;
        await sendMessageTag(api, message, {
            caption,
            imagePath
        });
        activeCaroGames.get(threadId).isProcessing = true;
        handleBotTurn(api, message);
    }
    
    try {
        await fs.unlink(imagePath);
    } catch (error) {}
}

async function handleBotTurn(api, message) {
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
        
        const caption = `\n🎮 TRÒ CHƠI KẾT THÚC\n\n🤝 Hòa cờ do không còn nước đi (${game.moveCount}/${game.size * game.size})`;
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
    
    if (winResult) {
        const winLength = 5;
        const caption = `\n🎮 Bot đánh ô: ${pos + 1}\n\n🏆 Bot đã dành chiến thắng với ${winLength} quân liên tiếp`;
        await sendMessageTag(api, message, {
            caption,
            imagePath
        }, 86400000);
        await api.addReaction("UNDO", message);
        await api.addReaction("OK", message);
        activeCaroGames.delete(threadId);
        clearTurnTimer(threadId);
    } else if (game.moveCount === game.size * game.size) {
        const caption = `\n🎮 Bot đánh ô: ${pos + 1}\n\n🤝 Hòa cờ do không còn nước đi (${game.moveCount}/${game.size * game.size})`;
        await sendMessageTag(api, message, {
            caption,
            imagePath
        }, 86400000);
        await api.addReaction("UNDO", message);
        await api.addReaction("OK", message);
        activeCaroGames.delete(threadId);
        clearTurnTimer(threadId);
    } else {
        const caption = `\n🎮 Bot đánh ô: ${pos + 1}\n\n🎯 Đến lượt ${game.playerName} (Quân ${game.playerMark})\n\n👉 Nhập số ô (1-${game.size * game.size}) để đánh\n\n🧭 Thời gian: 60 giây`;
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
        const caption = `🎮 TRẬN ĐẤU KẾT THÚC\n\n👤 Người chơi ${game.playerName} đã nhận thua\n🏆 BOT đã dành chiến thắng ván cờ này`;
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
        await sendMessageWarning(api, message, `Index không hợp lệ, vui lòng chọn từ 1-${game.size * game.size}`, 60000);
        startTurnTimer(api, message, threadId, true);
        return;
    }
    
    if (game.board[pos] !== ".") {
        await sendMessageWarning(api, message, "Ô này đã được sử dụng, vui lòng chọn một ô trống", 60000);
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
        const caption = `\n🎮 Bạn đánh ô: ${pos + 1}\n\n🏆 ${game.playerName} đã chiến thắng trong ván cờ này`;
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
        const caption = `\n🎮 Bạn đánh ô: ${pos + 1}\n\n🤝 Hòa cờ do không còn nước đi (${game.moveCount}/${game.size * game.size})`;
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
