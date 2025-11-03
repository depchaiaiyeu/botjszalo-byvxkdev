import { createCanvas } from "canvas";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { sendMessageComplete, sendMessageWarning, sendMessageTag } from "../../chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service.js";
import { removeMention } from "../../../utils/format-util.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const activeChessGames = new Map();
const turnTimers = new Map();

const PIECES = {
    white: { king: '♔', queen: '♕', rook: '♖', bishop: '♗', knight: '♘', pawn: '♙' },
    black: { king: '♚', queen: '♛', rook: '♜', bishop: '♝', knight: '♞', pawn: '♟' }
};

const INITIAL_BOARD = [
    'r', 'n', 'b', 'q', 'k', 'b', 'n', 'r',
    'p', 'p', 'p', 'p', 'p', 'p', 'p', 'p',
    '.', '.', '.', '.', '.', '.', '.', '.',
    '.', '.', '.', '.', '.', '.', '.', '.',
    '.', '.', '.', '.', '.', '.', '.', '.',
    '.', '.', '.', '.', '.', '.', '.', '.',
    'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P',
    'R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'
];

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
        const game = activeChessGames.get(threadId);
        if (!game) return;
        
        if (isPlayerTurn) {
            const caption = `\n♟️ TRẬN ĐẤU KẾT THÚC\n\n⏰ ${game.playerName} bị loại vì không đi nước tiếp theo trong 60 giây\n🏆 BOT đã dành chiến thắng`;
            await sendMessageTag(api, message, { caption });
        } else {
            const caption = `\n♟️ TRẬN ĐẤU KẾT THÚC\n\n⏰ BOT thua vì không đi trong 60 giây\n🏆 ${game.playerName} đã dành chiến thắng`;
            await sendMessageTag(api, message, { caption });
        }
        
        activeChessGames.delete(threadId);
        clearTurnTimer(threadId);
    }, 60000);
    
    turnTimers.set(threadId, timer);
}

function posToNotation(pos) {
    const col = pos % 8;
    const row = Math.floor(pos / 8);
    return String.fromCharCode(97 + col) + (8 - row);
}

function notationToPos(notation) {
    if (!notation || notation.length < 2) return -1;
    const col = notation.charCodeAt(0) - 97;
    const row = 8 - parseInt(notation[1]);
    if (col < 0 || col > 7 || row < 0 || row > 7 || isNaN(row)) return -1;
    return row * 8 + col;
}

function getPieceEmoji(piece) {
    if (piece === '.') return '';
    const isWhite = piece === piece.toUpperCase();
    const color = isWhite ? 'white' : 'black';
    const type = {
        'K': 'king', 'Q': 'queen', 'R': 'rook', 
        'B': 'bishop', 'N': 'knight', 'P': 'pawn',
        'k': 'king', 'q': 'queen', 'r': 'rook',
        'b': 'bishop', 'n': 'knight', 'p': 'pawn'
    }[piece];
    return PIECES[color][type];
}

async function createChessBoard(board, moveCount = 0, playerColor = "white", playerName = "Player", lastMove = null, capturedPieces = { white: [], black: [] }) {
    const cellSize = 70;
    const padding = 50;
    const headerHeight = 80;
    const footerHeight = 60;
    const width = 8 * cellSize + padding * 2;
    const height = 8 * cellSize + padding * 2 + headerHeight + footerHeight;
    
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    
    ctx.fillStyle = "#2C2C2C";
    ctx.fillRect(0, 0, width, height);
    
    ctx.font = "bold 18px 'BeVietnamPro'";
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "left";
    ctx.fillText(`⚪ ${playerColor === 'white' ? playerName : 'BOT'}`, 20, 30);
    ctx.textAlign = "right";
    ctx.fillText(`⚫ ${playerColor === 'black' ? playerName : 'BOT'}`, width - 20, 30);
    
    ctx.font = "14px 'BeVietnamPro'";
    ctx.textAlign = "left";
    ctx.fillText(`Bị ăn: ${capturedPieces.white.map(p => getPieceEmoji(p)).join('')}`, 20, 55);
    ctx.textAlign = "right";
    ctx.fillText(`Bị ăn: ${capturedPieces.black.map(p => getPieceEmoji(p)).join('')}`, width - 20, 55);
    
    const boardTop = headerHeight;
    
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const isLight = (row + col) % 2 === 0;
            ctx.fillStyle = isLight ? "#F0D9B5" : "#B58863";
            
            const x = padding + col * cellSize;
            const y = boardTop + padding + row * cellSize;
            ctx.fillRect(x, y, cellSize, cellSize);
            
            if (lastMove && (lastMove.from === row * 8 + col || lastMove.to === row * 8 + col)) {
                ctx.fillStyle = "rgba(255, 255, 0, 0.5)";
                ctx.fillRect(x, y, cellSize, cellSize);
            }
        }
    }
    
    ctx.font = "bold 14px 'BeVietnamPro'";
    ctx.fillStyle = "#FFFFFF";
    for (let i = 0; i < 8; i++) {
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String.fromCharCode(97 + i), padding + i * cellSize + cellSize / 2, boardTop + padding + 8 * cellSize + 25);
        ctx.textAlign = "center";
        ctx.fillText((8 - i).toString(), padding - 25, boardTop + padding + i * cellSize + cellSize / 2);
    }
    
    ctx.font = "50px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let i = 0; i < 64; i++) {
        if (board[i] !== '.') {
            const row = Math.floor(i / 8);
            const col = i % 8;
            const x = padding + col * cellSize + cellSize / 2;
            const y = boardTop + padding + row * cellSize + cellSize / 2;
            ctx.fillText(getPieceEmoji(board[i]), x, y);
        }
    }
    
    ctx.font = "bold 16px 'BeVietnamPro'";
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "center";
    ctx.fillText(`Nước đi: ${moveCount}`, width / 2, height - 25);
    
    return canvas.toBuffer("image/png");
}

function isWhitePiece(piece) {
    return piece === piece.toUpperCase() && piece !== '.';
}

function isBlackPiece(piece) {
    return piece === piece.toLowerCase() && piece !== '.';
}

function getValidMoves(board, pos, checkForCheck = true) {
    const piece = board[pos];
    if (piece === '.') return [];
    
    const isWhite = isWhitePiece(piece);
    const row = Math.floor(pos / 8);
    const col = pos % 8;
    const moves = [];
    
    const pieceType = piece.toLowerCase();
    
    if (pieceType === 'p') {
        const direction = isWhite ? -1 : 1;
        const startRow = isWhite ? 6 : 1;
        
        const forward = pos + direction * 8;
        if (forward >= 0 && forward < 64 && board[forward] === '.') {
            moves.push(forward);
            
            if (row === startRow) {
                const doubleForward = pos + direction * 16;
                if (board[doubleForward] === '.') {
                    moves.push(doubleForward);
                }
            }
        }
        
        for (const dc of [-1, 1]) {
            const capturePos = pos + direction * 8 + dc;
            const captureCol = col + dc;
            if (capturePos >= 0 && capturePos < 64 && captureCol >= 0 && captureCol < 8) {
                const target = board[capturePos];
                if (target !== '.' && isWhitePiece(target) !== isWhite) {
                    moves.push(capturePos);
                }
            }
        }
    }
    
    if (pieceType === 'n') {
        const knightMoves = [
            [-2, -1], [-2, 1], [-1, -2], [-1, 2],
            [1, -2], [1, 2], [2, -1], [2, 1]
        ];
        
        for (const [dr, dc] of knightMoves) {
            const newRow = row + dr;
            const newCol = col + dc;
            if (newRow >= 0 && newRow < 8 && newCol >= 0 && newCol < 8) {
                const newPos = newRow * 8 + newCol;
                const target = board[newPos];
                if (target === '.' || isWhitePiece(target) !== isWhite) {
                    moves.push(newPos);
                }
            }
        }
    }
    
    if (pieceType === 'b' || pieceType === 'q') {
        const directions = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
        for (const [dr, dc] of directions) {
            let newRow = row + dr;
            let newCol = col + dc;
            while (newRow >= 0 && newRow < 8 && newCol >= 0 && newCol < 8) {
                const newPos = newRow * 8 + newCol;
                const target = board[newPos];
                if (target === '.') {
                    moves.push(newPos);
                } else {
                    if (isWhitePiece(target) !== isWhite) {
                        moves.push(newPos);
                    }
                    break;
                }
                newRow += dr;
                newCol += dc;
            }
        }
    }
    
    if (pieceType === 'r' || pieceType === 'q') {
        const directions = [[0, 1], [0, -1], [1, 0], [-1, 0]];
        for (const [dr, dc] of directions) {
            let newRow = row + dr;
            let newCol = col + dc;
            while (newRow >= 0 && newRow < 8 && newCol >= 0 && newCol < 8) {
                const newPos = newRow * 8 + newCol;
                const target = board[newPos];
                if (target === '.') {
                    moves.push(newPos);
                } else {
                    if (isWhitePiece(target) !== isWhite) {
                        moves.push(newPos);
                    }
                    break;
                }
                newRow += dr;
                newCol += dc;
            }
        }
    }
    
    if (pieceType === 'k') {
        const kingMoves = [
            [-1, -1], [-1, 0], [-1, 1],
            [0, -1], [0, 1],
            [1, -1], [1, 0], [1, 1]
        ];
        
        for (const [dr, dc] of kingMoves) {
            const newRow = row + dr;
            const newCol = col + dc;
            if (newRow >= 0 && newRow < 8 && newCol >= 0 && newCol < 8) {
                const newPos = newRow * 8 + newCol;
                const target = board[newPos];
                if (target === '.' || isWhitePiece(target) !== isWhite) {
                    moves.push(newPos);
                }
            }
        }
    }
    
    if (!checkForCheck) return moves;
    
    return moves.filter(toPos => {
        const newBoard = [...board];
        newBoard[toPos] = newBoard[pos];
        newBoard[pos] = '.';
        return !isInCheck(newBoard, isWhite);
    });
}

function isInCheck(board, isWhite) {
    let kingPos = -1;
    const kingPiece = isWhite ? 'K' : 'k';
    
    for (let i = 0; i < 64; i++) {
        if (board[i] === kingPiece) {
            kingPos = i;
            break;
        }
    }
    
    if (kingPos === -1) return false;
    
    for (let i = 0; i < 64; i++) {
        const piece = board[i];
        if (piece === '.') continue;
        if (isWhitePiece(piece) === isWhite) continue;
        
        const moves = getValidMoves(board, i, false);
        if (moves.includes(kingPos)) return true;
    }
    
    return false;
}

function hasValidMoves(board, isWhite) {
    for (let i = 0; i < 64; i++) {
        const piece = board[i];
        if (piece === '.' || isWhitePiece(piece) !== isWhite) continue;
        
        const moves = getValidMoves(board, i, true);
        if (moves.length > 0) return true;
    }
    return false;
}

function evaluateBoard(board) {
    const pieceValues = {
        'p': 100, 'n': 320, 'b': 330, 'r': 500, 'q': 900, 'k': 20000,
        'P': 100, 'N': 320, 'B': 330, 'R': 500, 'Q': 900, 'K': 20000
    };
    
    let score = 0;
    for (let i = 0; i < 64; i++) {
        const piece = board[i];
        if (piece === '.') continue;
        
        const value = pieceValues[piece.toLowerCase()];
        if (isWhitePiece(piece)) {
            score -= value;
        } else {
            score += value;
        }
    }
    
    return score;
}

function minimax(board, depth, alpha, beta, isMaximizing) {
    if (depth === 0) {
        return evaluateBoard(board);
    }
    
    const isWhiteTurn = !isMaximizing;
    
    if (!hasValidMoves(board, isWhiteTurn)) {
        if (isInCheck(board, isWhiteTurn)) {
            return isMaximizing ? -100000 : 100000;
        }
        return 0;
    }
    
    if (isMaximizing) {
        let maxEval = -Infinity;
        for (let i = 0; i < 64; i++) {
            const piece = board[i];
            if (piece === '.' || isWhitePiece(piece)) continue;
            
            const moves = getValidMoves(board, i, true);
            for (const move of moves) {
                const newBoard = [...board];
                newBoard[move] = newBoard[i];
                newBoard[i] = '.';
                
                const eval_ = minimax(newBoard, depth - 1, alpha, beta, false);
                maxEval = Math.max(maxEval, eval_);
                alpha = Math.max(alpha, eval_);
                if (beta <= alpha) break;
            }
            if (beta <= alpha) break;
        }
        return maxEval;
    } else {
        let minEval = Infinity;
        for (let i = 0; i < 64; i++) {
            const piece = board[i];
            if (piece === '.' || isBlackPiece(piece)) continue;
            
            const moves = getValidMoves(board, i, true);
            for (const move of moves) {
                const newBoard = [...board];
                newBoard[move] = newBoard[i];
                newBoard[i] = '.';
                
                const eval_ = minimax(newBoard, depth - 1, alpha, beta, true);
                minEval = Math.min(minEval, eval_);
                beta = Math.min(beta, eval_);
                if (beta <= alpha) break;
            }
            if (beta <= alpha) break;
        }
        return minEval;
    }
}

function getBotMove(board, isWhite) {
    let bestMove = null;
    let bestValue = isWhite ? Infinity : -Infinity;
    const depth = 3;
    
    for (let i = 0; i < 64; i++) {
        const piece = board[i];
        if (piece === '.' || isWhitePiece(piece) !== !isWhite) continue;
        
        const moves = getValidMoves(board, i, true);
        for (const move of moves) {
            const newBoard = [...board];
            newBoard[move] = newBoard[i];
            newBoard[i] = '.';
            
            const value = minimax(newBoard, depth - 1, -Infinity, Infinity, isWhite);
            
            if ((isWhite && value < bestValue) || (!isWhite && value > bestValue)) {
                bestValue = value;
                bestMove = { from: i, to: move };
            }
        }
    }
    
    return bestMove;
}

export async function handleChessCommand(api, message) {
    const threadId = message.threadId;
    const content = removeMention(message);
    const prefix = getGlobalPrefix();
    const args = content.split(/\s+/);
    
    if (!content.includes(`${prefix}chess`)) return;
    
    if (args.length < 2) {
        await sendMessageComplete(api, message, 
            `♟️ HƯỚNG DẪN CHƠI CỜ VUA\n\n` +
            `📌 Cú pháp:\n` +
            `${prefix}chess [start/bat-dau] [first/last]\n\n` +
            `💡 Ví dụ:\n` +
            `${prefix}chess start first → Bạn chơi quân trắng, đi trước\n` +
            `${prefix}chess start last → Bạn chơi quân đen, bot đi trước\n\n` +
            `📋 Cách chơi:\n` +
            `- Cách 1: Nhập tên quân và ô đích\n` +
            `  VD: "ma g3", "tuong e5"\n` +
            `- Cách 2: Nhập vị trí xuất phát và ô đích\n` +
            `  VD: "g1 f3", "e2 e4"\n\n` +
            `🎯 Tên quân:\n` +
            `- Vua / King (K)\n` +
            `- Hau / Queen (Q)\n` +
            `- Xe / Rook (R)\n` +
            `- Tuong / Bishop (B)\n` +
            `- Ma / Knight (N)\n` +
            `- Tot / Pawn (P)\n\n` +
            `⚠️ Lưu ý:\n` +
            `- Gõ "lose" để đầu hàng\n` +
            `🧭 Thời gian: 60 giây/nước`
        );
        return;
    }

    if (activeChessGames.has(threadId)) {
        await sendMessageWarning(api, message, `Đã có 1 ván cờ đang diễn ra trong nhóm này.`, 60000);
        return;
    }
    
    const command = args[1].toLowerCase();
    if (!['start', 'bat-dau'].includes(command)) {
        await sendMessageWarning(api, message, "Lệnh không hợp lệ. Sử dụng: chess start first/last", 60000);
        return;
    }
    
    const position = args.length > 2 ? args[2].toLowerCase() : 'first';
    const playerColor = position === 'first' ? 'white' : 'black';
    
    clearTurnTimer(threadId);
    
    const board = [...INITIAL_BOARD];
    
    activeChessGames.set(threadId, {
        board,
        playerColor,
        currentTurn: 'white',
        playerId: message.data.uidFrom,
        playerName: message.data.dName,
        moveCount: 0,
        lastMove: null,
        isProcessing: false,
        capturedPieces: { white: [], black: [] }
    });
    
    const imageBuffer = await createChessBoard(board, 0, playerColor, message.data.dName, null, { white: [], black: [] });
    const imagePath = path.resolve(process.cwd(), "assets", "temp", `chess_${threadId}.png`);
    await fs.writeFile(imagePath, imageBuffer);
    
    if (playerColor === 'white') {
        const caption = `\n♟️ BẮT ĐẦU TRÒ CHƠI CỜ VUA\n\n🎯 Đến lượt ${message.data.dName} (⚪ Trắng)\n\n👉 Nhập nước đi (VD: e2 e4, ma g3)\n\n🧭 Thời gian: 60 giây`;
        await sendMessageTag(api, message, {
            caption,
            imagePath
        }, 60000);
        startTurnTimer(api, message, threadId, true);
    } else {
        const caption = `\n♟️ BẮT ĐẦU TRÒ CHƠI CỜ VUA\n\n🤖 Bot đi trước (⚪ Trắng)\n\n🎯 Đến lượt ${message.data.dName} (⚫ Đen)`;
        await sendMessageTag(api, message, {
            caption,
            imagePath
        });
        activeChessGames.get(threadId).isProcessing = true;
        handleBotTurn(api, message);
    }
    
    try {
        await fs.unlink(imagePath);
    } catch (error) {}
}

async function handleBotTurn(api, message) {
    const threadId = message.threadId;
    const game = activeChessGames.get(threadId);
    
    if (!game) return;
    
    await api.addReaction("FLASH", message);

    game.isProcessing = true;
    startTurnTimer(api, message, threadId, false);
    
    const isWhite = game.currentTurn === 'white';
    const move = getBotMove(game.board, isWhite);
    
    clearTurnTimer(threadId);
    
    if (!activeChessGames.has(threadId)) return;
    
    await api.addReaction("UNDO", message);
    await api.addReaction("OK", message);

    if (!move) {
        const imageBuffer = await createChessBoard(game.board, game.moveCount, game.playerColor, game.playerName, game.lastMove, game.capturedPieces);
        const imagePath = path.resolve(process.cwd(), "assets", "temp", `chess_${threadId}_end.png`);
        await fs.writeFile(imagePath, imageBuffer);
        
        const inCheck = isInCheck(game.board, isWhite);
        const caption = inCheck ? 
            `\n♟️ TRÒ CHƠI KẾT THÚC\n\n🏆 ${game.playerName} chiến thắng (chiếu hết)` :
            `\n♟️ TRÒ CHƠI KẾT THÚC\n\n🤝 Hòa cờ (bế tắc)`;
        
        await sendMessageTag(api, message, { caption, imagePath }, 86400000);
        
        try {
            await fs.unlink(imagePath);
        } catch (error) {}
        
        activeChessGames.delete(threadId);
        return;
    }
    
    const capturedPiece = game.board[move.to];
    if (capturedPiece !== '.') {
        if (isWhitePiece(capturedPiece)) {
            game.capturedPieces.white.push(capturedPiece);
        } else {
            game.capturedPieces.black.push(capturedPiece);
        }
    }
    
    game.board[move.to] = game.board[move.from];
    game.board[move.from] = '.';
    game.currentTurn = game.currentTurn === 'white' ? 'black' : 'white';
    game.moveCount++;
    game.lastMove = move;
    
    const imageBuffer = await createChessBoard(game.board, game.moveCount, game.playerColor, game.playerName, move, game.capturedPieces);
    const imagePath = path.resolve(process.cwd(), "assets", "temp", `chess_${threadId}.png`);
    await fs.writeFile(imagePath, imageBuffer);
    
    const playerIsWhite = game.playerColor === 'white';
    if (!hasValidMoves(game.board, playerIsWhite)) {
        const inCheck = isInCheck(game.board, playerIsWhite);
        const caption = inCheck ?
            `\n♟️ Bot: ${posToNotation(move.from)} → ${posToNotation(move.to)}\n\n🏆 Bot chiến thắng (chiếu hết)` :
            `\n♟️ Bot: ${posToNotation(move.from)} → ${posToNotation(move.to)}\n\n🤝 Hòa cờ (bế tắc)`;
        
        await sendMessageTag(api, message, { caption, imagePath }, 86400000);
        activeChessGames.delete(threadId);
        clearTurnTimer(threadId);
    } else {
        const checkStatus = isInCheck(game.board, playerIsWhite) ? ' ♔ CHIẾU!' : '';
        const caption = `\n♟️ Bot: ${posToNotation(move.from)} → ${posToNotation(move.to)}${checkStatus}\n\n🎯 Đến lượt ${game.playerName}\n\n👉 Nhập nước đi (VD: e7 e5)\n\n🧭 Thời gian: 60 giây`;
        await sendMessageTag(api, message, { caption, imagePath }, 60000);
        game.isProcessing = false;
        startTurnTimer(api, message, threadId, true);
    }
    
    try {
        await fs.unlink(imagePath);
    } catch (error) {}
}

export async function handleChessMessage(api, message) {
    const threadId = message.threadId;
    const game = activeChessGames.get(threadId);
    
    if (!game) return;
    if (game.isProcessing) return;
    if (message.data.uidFrom !== game.playerId) return;
    
    const isPlayerWhite = game.playerColor === 'white';
    const isWhiteTurn = game.currentTurn === 'white';
    if (isPlayerWhite !== isWhiteTurn) return;
    
    const content = (message.data.content || "").trim().toLowerCase();
    
    if (message.data.mentions && message.data.mentions.length > 0) return;
    
    if (content === "lose") {
        clearTurnTimer(threadId);
        const caption = `♟️ TRẬN ĐẤU KẾT THÚC\n\n👤 ${game.playerName} đã đầu hàng\n🏆 BOT đã dành chiến thắng`;
        await sendMessageTag(api, message, { caption });
        activeChessGames.delete(threadId);
        return;
    }

    clearTurnTimer(threadId);
    
    const parts = content.split(/\s+/).filter(p => p);
    if (parts.length < 2) {
        await sendMessageWarning(api, message, `Cú pháp không hợp lệ. VD: "e2 e4" hoặc "ma g3"`, 60000);
        startTurnTimer(api, message, threadId, true);
        return;
    }
    
    const pieceMap = {
        'vua': 'k', 'king': 'k',
        'hau': 'q', 'queen': 'q',
        'xe': 'r', 'rook': 'r',
        'tuong': 'b', 'bishop': 'b',
        'ma': 'n', 'knight': 'n',
        'tot': 'p', 'pawn': 'p'
    };
    
    let targetPos = -1;
    let fromPos = -1;
    
    if (parts.length === 2) {
        targetPos = notationToPos(parts[1]);
    } else if (parts.length >= 3) {
        fromPos = notationToPos(parts[1]);
        targetPos = notationToPos(parts[2]);
    }
    
    if (targetPos === -1) {
        await sendMessageWarning(api, message, `Ô đích không hợp lệ. VD: a1, e5, h8`, 60000);
        startTurnTimer(api, message, threadId, true);
        return;
    }
    
    const searchPiece = isPlayerWhite ? pieceType.toUpperCase() : pieceType.toLowerCase();
    const possibleMoves = [];
    
    for (let i = 0; i < 64; i++) {
        if (game.board[i] === searchPiece) {
            const moves = getValidMoves(game.board, i, true);
            if (moves.includes(targetPos)) {
                if (fromPos !== -1) {
                    if (i === fromPos) {
                        possibleMoves.push(i);
                    }
                } else {
                    possibleMoves.push(i);
                }
            }
        }
    }
    
    if (possibleMoves.length === 0) {
        await sendMessageWarning(api, message, `Nước đi không hợp lệ. Không có ${parts[0]} nào có thể đến ${parts[parts.length - 1]}`, 60000);
        startTurnTimer(api, message, threadId, true);
        return;
    }
    
    if (possibleMoves.length > 1) {
        const positions = possibleMoves.map(p => posToNotation(p)).join(', ');
        await sendMessageWarning(api, message, `Có nhiều ${parts[0]} có thể đến ${parts[parts.length - 1]}. Vui lòng chỉ rõ: "${parts[0]} [vị trí xuất phát] ${parts[parts.length - 1]}"\nVị trí có thể: ${positions}`, 60000);
        startTurnTimer(api, message, threadId, true);
        return;
    }
    
    game.isProcessing = true;
    
    const selectedFrom = possibleMoves[0];
    
    const capturedPiece = game.board[targetPos];
    if (capturedPiece !== '.') {
        if (isWhitePiece(capturedPiece)) {
            game.capturedPieces.white.push(capturedPiece);
        } else {
            game.capturedPieces.black.push(capturedPiece);
        }
    }
    
    game.board[targetPos] = game.board[selectedFrom];
    game.board[selectedFrom] = '.';
    game.currentTurn = game.currentTurn === 'white' ? 'black' : 'white';
    game.moveCount++;
    game.lastMove = { from: selectedFrom, to: targetPos };
    
    const imageBuffer = await createChessBoard(game.board, game.moveCount, game.playerColor, game.playerName, game.lastMove, game.capturedPieces);
    const imagePath = path.resolve(process.cwd(), "assets", "temp", `chess_${threadId}.png`);
    await fs.writeFile(imagePath, imageBuffer);
    
    const botIsWhite = game.playerColor === 'black';
    if (!hasValidMoves(game.board, botIsWhite)) {
        const inCheck = isInCheck(game.board, botIsWhite);
        const caption = inCheck ?
            `\n♟️ Bạn: ${posToNotation(selectedFrom)} → ${posToNotation(targetPos)}\n\n🏆 ${game.playerName} chiến thắng (chiếu hết)` :
            `\n♟️ Bạn: ${posToNotation(selectedFrom)} → ${posToNotation(targetPos)}\n\n🤝 Hòa cờ (bế tắc)`;
        
        await sendMessageTag(api, message, { caption, imagePath }, 300000);
        activeChessGames.delete(threadId);
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
