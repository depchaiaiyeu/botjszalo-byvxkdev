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

const WHITE_PIECES = { P: "♙", N: "♘", B: "♗", R: "♖", Q: "♕", K: "♔" };
const BLACK_PIECES = { p: "♟", n: "♞", b: "♝", r: "♜", q: "♛", k: "♚" };

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

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
        
        const winnerName = isPlayerTurn ? "BOT" : game.playerName;
        const loserName = isPlayerTurn ? game.playerName : "BOT";
        
        const caption = `\n♔ TRẬN ĐẤU KẾT THÚC\n\n⏰ ${loserName} bị xử thua vì hết 120 giây. \n🏆 ${winnerName} đã dành chiến thắng ván cờ này.`;
        await sendMessageTag(api, message, {
            caption
        });
        
        activeChessGames.delete(threadId);
        clearTurnTimer(threadId);
    }, 120000);
    
    turnTimers.set(threadId, timer);
}

function squareToIndex(square) {
    const file = square.charCodeAt(0) - 'a'.charCodeAt(0);
    const rank = 8 - parseInt(square[1], 10);
    if (file < 0 || file > 7 || rank < 0 || rank > 7) return -1;
    return rank * 8 + file;
}

function indexToSquare(index) {
    const rank = 8 - Math.floor(index / 8);
    const file = String.fromCharCode('a'.charCodeAt(0) + (index % 8));
    return file + rank;
}

function getBoardFromFEN(fen) {
    const parts = fen.split(" ");
    const boardString = parts[0];
    const board = Array(64).fill(null);
    let i = 0;
    for (const char of boardString) {
        if (char === '/') continue;
        if (/\d/.test(char)) {
            i += parseInt(char, 10);
        } else {
            board[i] = char;
            i++;
        }
    }
    return board;
}

function getFENFromBoard(board, turn, castling, enPassant, halfMove, fullMove) {
    let fen = "";
    for (let r = 0; r < 8; r++) {
        let emptyCount = 0;
        for (let c = 0; c < 8; c++) {
            const piece = board[r * 8 + c];
            if (piece === null) {
                emptyCount++;
            } else {
                if (emptyCount > 0) {
                    fen += emptyCount;
                    emptyCount = 0;
                }
                fen += piece;
            }
        }
        if (emptyCount > 0) {
            fen += emptyCount;
        }
        if (r < 7) fen += "/";
    }
    
    fen += ` ${turn} ${castling} ${enPassant} ${halfMove} ${fullMove}`;
    return fen;
}

async function createChessBoard(game) {
    const { board, currentTurn, playerColor, lastMove, winningLine } = game;
    const size = 8;
    const cellSize = 60;
    const padding = 20;
    const headerFooterHeight = 40;
    const width = size * cellSize + padding * 2;
    const height = size * cellSize + padding * 2 + headerFooterHeight * 2;
    
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
    ctx.fillStyle = "#F0D9B5";
    ctx.fillRect(0, 0, width, height);
    
    const boardTop = headerFooterHeight;
    
    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            const isLight = (r + c) % 2 === 0;
            ctx.fillStyle = isLight ? "#F0D9B5" : "#B58863";
            const x = padding + c * cellSize;
            const y = boardTop + padding + r * cellSize;
            ctx.fillRect(x, y, cellSize, cellSize);
            
            const index = r * size + c;

            if (lastMove && (index === lastMove.from || index === lastMove.to)) {
                ctx.fillStyle = "rgba(255, 255, 0, 0.4)"; 
                ctx.fillRect(x, y, cellSize, cellSize);
            }

            const piece = board[index];
            if (piece) {
                const emoji = piece in WHITE_PIECES ? WHITE_PIECES[piece] : BLACK_PIECES[piece];
                ctx.font = "bold 45px 'Noto Color Emoji', 'Segoe UI Emoji', 'Apple Color Emoji'";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(emoji, x + cellSize / 2, y + cellSize / 2 + 5);
            }
        }
    }
    
    ctx.fillStyle = "#000000";
    ctx.font = "bold 16px 'BeVietnamPro'";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (let i = 0; i < size; i++) {
        const file = String.fromCharCode('a'.charCodeAt(0) + i);
        const rank = 8 - i;

        ctx.fillText(file, padding + i * cellSize + cellSize / 2, height - padding / 2);
        ctx.fillText(file, padding + i * cellSize + cellSize / 2, padding / 2);

        ctx.fillText(rank.toString(), padding / 2, boardTop + padding + i * cellSize + cellSize / 2);
        ctx.fillText(rank.toString(), width - padding / 2, boardTop + padding + i * cellSize + cellSize / 2);
    }

    ctx.fillStyle = "#333333";
    ctx.font = "bold 20px 'BeVietnamPro'";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    const turnText = currentTurn === 'w' ? "Trắng (Đang đi)" : "Đen (Đang đi)";
    ctx.fillText(`Lượt đi: ${turnText.toUpperCase()}`, padding, 5);

    ctx.textAlign = "right";
    const playerMark = playerColor === 'w' ? "Trắng" : "Đen";
    ctx.fillText(`Người chơi: ${game.playerName} (${playerMark})`, width - padding, 5);
    
    return canvas.toBuffer("image/png");
}

function parseInputMove(input, playerColor) {
    const parts = input.trim().toLowerCase().split(/\s+/);

    if (parts.length !== 2) return null;

    const [startSquare, endSquare] = parts;

    if (!/^[a-h][1-8]$/.test(startSquare) || !/^[a-h][1-8]$/.test(endSquare)) return null;
    
    const from = squareToIndex(startSquare);
    const to = squareToIndex(endSquare);

    if (from === -1 || to === -1 || from === to) return null;

    return { from, to, promotion: null };
}

function isWhite(piece) {
    return piece && piece === piece.toUpperCase();
}

function getPieceColor(piece) {
    if (!piece) return null;
    return isWhite(piece) ? 'w' : 'b';
}

function getKingPos(board, color) {
    const king = color === 'w' ? 'K' : 'k';
    return board.findIndex(p => p === king);
}

function isAttacked(board, targetPos, attackerColor, kingPos) {
    const targetColor = attackerColor === 'w' ? 'b' : 'w';
    const opponentPieces = attackerColor === 'w' ? Object.keys(BLACK_PIECES) : Object.keys(WHITE_PIECES).map(p => p.toLowerCase());

    const isTargetKing = targetPos === kingPos;

    for (let from = 0; from < 64; from++) {
        const piece = board[from];
        if (piece && getPieceColor(piece) === attackerColor) {
            const moves = generatePseudoLegalMoves(board, from, piece, attackerColor, targetColor);
            if (moves.some(move => move.to === targetPos)) {
                return true;
            }
        }
    }
    return false;
}

function isSquareAttacked(board, targetPos, attackerColor) {
    for (let from = 0; from < 64; from++) {
        const piece = board[from];
        if (piece && getPieceColor(piece) === attackerColor) {
            const moves = generatePseudoLegalMoves(board, from, piece, attackerColor, attackerColor === 'w' ? 'b' : 'w');
            if (moves.some(move => move.to === targetPos)) {
                return true;
            }
        }
    }
    return false;
}

function isMoveLegal(board, move, color) {
    const tempBoard = [...board];
    tempBoard[move.to] = tempBoard[move.from];
    tempBoard[move.from] = null;

    const kingPos = getKingPos(tempBoard, color);
    const attackerColor = color === 'w' ? 'b' : 'w';

    return !isSquareAttacked(tempBoard, kingPos, attackerColor);
}

function generatePseudoLegalMoves(board, from, piece, color, opponentColor) {
    const moves = [];
    const fromR = Math.floor(from / 8);
    const fromC = from % 8;
    const directions = [];
    const maxSteps = 8;
    
    const isPawn = piece.toLowerCase() === 'p';
    const isKnight = piece.toLowerCase() === 'n';
    const isKing = piece.toLowerCase() === 'k';

    if (isPawn) {
        const direction = color === 'w' ? -1 : 1; 
        const startRank = color === 'w' ? 6 : 1; 
        
        let to = from + direction * 8;
        if (board[to] === null) {
            moves.push({ from, to });
            if (fromR === startRank) {
                to = from + direction * 16;
                if (board[to] === null) moves.push({ from, to });
            }
        }

        const captures = [-1, 1]; 
        for (const c of captures) {
            to = from + direction * 8 + c;
            const toR = Math.floor(to / 8);
            const toC = to % 8;
            if (toR === fromR + direction && toC >= 0 && toC < 8 && getPieceColor(board[to]) === opponentColor) {
                moves.push({ from, to });
            }
        }

        const promotionRank = color === 'w' ? 0 : 7;
        for (const move of moves) {
            if (Math.floor(move.to / 8) === promotionRank) {
                for (const p of ['Q', 'R', 'B', 'N']) {
                    move.promotion = color === 'w' ? p : p.toLowerCase();
                }
            }
        }

        return moves;
    }
    
    if (piece.toLowerCase() === 'r' || piece.toLowerCase() === 'q') directions.push([0, 1], [0, -1], [1, 0], [-1, 0]);
    if (piece.toLowerCase() === 'b' || piece.toLowerCase() === 'q') directions.push([1, 1], [1, -1], [-1, 1], [-1, -1]);
    
    if (isKnight) {
        directions.push(
            [2, 1], [2, -1], [-2, 1], [-2, -1],
            [1, 2], [1, -2], [-1, 2], [-1, -2]
        );
        for (const [dr, dc] of directions) {
            const toR = fromR + dr;
            const toC = fromC + dc;
            if (toR >= 0 && toR < 8 && toC >= 0 && toC < 8) {
                const to = toR * 8 + toC;
                const targetPiece = board[to];
                if (targetPiece === null || getPieceColor(targetPiece) === opponentColor) {
                    moves.push({ from, to });
                }
            }
        }
        return moves;
    }

    if (isKing) {
        directions.push(
            [0, 1], [0, -1], [1, 0], [-1, 0],
            [1, 1], [1, -1], [-1, 1], [-1, -1]
        );
        for (const [dr, dc] of directions) {
            const toR = fromR + dr;
            const toC = fromC + dc;
            if (toR >= 0 && toR < 8 && toC >= 0 && toC < 8) {
                const to = toR * 8 + toC;
                const targetPiece = board[to];
                if (targetPiece === null || getPieceColor(targetPiece) === opponentColor) {
                    moves.push({ from, to });
                }
            }
        }
        return moves;
    }

    for (const [dr, dc] of directions) {
        for (let step = 1; step <= maxSteps; step++) {
            const toR = fromR + dr * step;
            const toC = fromC + dc * step;
            if (toR < 0 || toR >= 8 || toC < 0 || toC >= 8) break;
            
            const to = toR * 8 + toC;
            const targetPiece = board[to];

            if (targetPiece === null) {
                moves.push({ from, to });
            } else {
                if (getPieceColor(targetPiece) === opponentColor) {
                    moves.push({ from, to }); 
                }
                break;
            }
        }
    }
    
    return moves;
}

function getAllLegalMoves(board, color) {
    const legalMoves = [];
    const opponentColor = color === 'w' ? 'b' : 'w';

    for (let from = 0; from < 64; from++) {
        const piece = board[from];
        if (piece && getPieceColor(piece) === color) {
            const pseudoMoves = generatePseudoLegalMoves(board, from, piece, color, opponentColor);
            for (const move of pseudoMoves) {
                if (isMoveLegal(board, move, color)) {
                    legalMoves.push(move);
                }
            }
        }
    }
    return legalMoves;
}

function makeMove(board, move, turn) {
    const newBoard = [...board];
    const piece = newBoard[move.from];
    
    if (move.promotion) {
        newBoard[move.to] = move.promotion;
    } else {
        newBoard[move.to] = piece;
    }
    newBoard[move.from] = null;
    
    return newBoard;
}

function getMaterialScore(board) {
    let score = 0;
    const pieceValues = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 20000 };
    for (const piece of board) {
        if (piece) {
            const value = pieceValues[piece.toUpperCase()];
            score += isWhite(piece) ? value : -value;
        }
    }
    return score;
}

function evaluateBoard(board, botColor) {
    let score = getMaterialScore(board);
    if (botColor === 'b') score *= -1;
    return score;
}

function getAIMove(game) {
    const { board, currentTurn, playerColor } = game;
    const botColor = currentTurn;
    const opponentColor = playerColor;
    const legalMoves = getAllLegalMoves(board, botColor);

    if (legalMoves.length === 0) return null;

    let bestMove = legalMoves[0];
    let bestScore = -Infinity;

    for (const move of legalMoves) {
        const newBoard = makeMove(board, move, botColor);
        
        const legalOpponentMoves = getAllLegalMoves(newBoard, opponentColor);
        const kingPos = getKingPos(newBoard, opponentColor);
        const isInCheck = isSquareAttacked(newBoard, kingPos, botColor);
        
        let score;

        if (legalOpponentMoves.length === 0) {
            score = isInCheck ? 100000 : 0; // Checkmate or Stalemate
        } else {
            score = evaluateBoard(newBoard, botColor);
        }

        if (score > bestScore) {
            bestScore = score;
            bestMove = move;
        }
    }
    
    if (bestScore === -Infinity) { 
        return legalMoves[Math.floor(Math.random() * legalMoves.length)];
    }

    return bestMove;
}

function isGameOver(board, color) {
    const legalMoves = getAllLegalMoves(board, color);
    if (legalMoves.length === 0) {
        const kingPos = getKingPos(board, color);
        const attackerColor = color === 'w' ? 'b' : 'w';
        const isInCheck = isSquareAttacked(board, kingPos, attackerColor);
        
        return { gameOver: true, result: isInCheck ? 'CHECKMATE' : 'STALEMATE' };
    }
    return { gameOver: false };
}

export async function handleChessCommand(api, message) {
    const threadId = message.threadId;
    const content = removeMention(message).trim();
    const prefix = getGlobalPrefix();
    const args = content.split(/\s+/);
    
    if (!content.startsWith(`${prefix}chess`)) return;
    
    if (args.length < 2 || args[1].toLowerCase() !== "start") {
        await sendMessageComplete(api, message, 
            `♔ HƯỚNG DẪN CHƠI CỜ VUA (CHESS)\n\n` +
            `📌 Cú pháp:\n` +
            `${prefix}chess start [first/last]\n\n` +
            `💡 Ví dụ:\n` +
            `${prefix}chess start first (Đi quân Trắng, đi trước)\n` +
            `${prefix}chess start last (Đi quân Đen, BOT đi trước)\n\n` +
            `📋 Cách nhập nước đi:\n` +
            `Nhập ô bắt đầu và ô kết thúc cách nhau một dấu cách (Ví dụ: e2 e4, Nf1 g3 -> d1 e3).\n` +
            `🧭 Thời gian: 120 giây mỗi lượt.`
        );
        return;
    }

    if (activeChessGames.has(threadId)) {
        await sendMessageWarning(api, message, `Đã có 1 ván cờ đang diễn ra trong nhóm này. Vui lòng kết thúc ván cũ hoặc dùng lệnh 'lose' để bỏ cuộc.`, 60000);
        return;
    }
    
    const startMode = args.length > 2 ? args[2].toLowerCase() : "first";
    let playerColor;
    let currentTurn;

    if (startMode === "first") {
        playerColor = 'w';
        currentTurn = 'w';
    } else if (startMode === "last") {
        playerColor = 'b';
        currentTurn = 'w'; 
    } else {
        await sendMessageWarning(api, message, "🎯 Chế độ bắt đầu không hợp lệ. Vui lòng chọn 'first' (Đi Trắng) hoặc 'last' (Đi Đen).", 60000);
        return;
    }
    
    clearTurnTimer(threadId);
    
    const initialBoard = getBoardFromFEN(STARTING_FEN);
    
    const game = {
        board: initialBoard,
        playerColor,
        botColor: playerColor === 'w' ? 'b' : 'w',
        currentTurn,
        playerId: message.data.uidFrom,
        playerName: message.data.dName,
        isProcessing: false,
        fenParts: STARTING_FEN.split(" ")
    };
    activeChessGames.set(threadId, game);
    
    const imageBuffer = await createChessBoard(game);
    const imagePath = path.resolve(process.cwd(), "assets", "temp", `chess_${threadId}.png`);
    await fs.writeFile(imagePath, imageBuffer);
    
    const playerMark = playerColor === 'w' ? "Trắng (W)" : "Đen (B)";
    let caption = `\n♔ BẮT ĐẦU TRÒ CHƠI CỜ VUA\n\n🎯 ${message.data.dName} (Quân ${playerMark}).\n\n👉 Nhập ô bắt đầu và ô kết thúc (Ví dụ: e2 e4)\n\n🧭 Thời gian: 120 giây`;

    if (currentTurn === playerColor) {
        await sendMessageTag(api, message, {
            caption: `${caption}\n\nĐến lượt ${message.data.dName} (${playerMark}) đi trước.`,
            imagePath
        }, 120000);
        startTurnTimer(api, message, threadId, true);
    } else {
        await sendMessageTag(api, message, {
            caption: `${caption}\n\n🤖 BOT đi trước (Trắng - W).`,
            imagePath
        });
        game.isProcessing = true;
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
    
    const move = getAIMove(game);
    
    clearTurnTimer(threadId);
    
    if (!activeChessGames.has(threadId)) return;
    
    await api.addReaction("UNDO", message);
    await api.addReaction("OK", message);

    if (move === null) {
        const gameOverStatus = isGameOver(game.board, game.botColor);
        if (gameOverStatus.result === 'CHECKMATE') {
            const kingPos = getKingPos(game.botColor === 'w' ? 'b' : 'w');
            const imageBuffer = await createChessBoard(game);
            const imagePath = path.resolve(process.cwd(), "assets", "temp", `chess_${threadId}_checkmate.png`);
            await fs.writeFile(imagePath, imageBuffer);
            
            const caption = `\n♔ TRÒ CHƠI KẾT THÚC\n\n🏆 ${game.playerName} đã chiếu bí (Checkmate) BOT. CHÚC MỪNG!`;
            await sendMessageTag(api, message, { caption, imagePath }, 86400000);
            activeChessGames.delete(threadId);
        } else { // Stalemate
            const imageBuffer = await createChessBoard(game);
            const imagePath = path.resolve(process.cwd(), "assets", "temp", `chess_${threadId}_draw.png`);
            await fs.writeFile(imagePath, imageBuffer);
            
            const caption = `\n♔ TRÒ CHƠI KẾT THÚC\n\n🤝 Hòa cờ do thế cờ bí (Stalemate).`;
            await sendMessageTag(api, message, { caption, imagePath }, 86400000);
            activeChessGames.delete(threadId);
        }
        
        try { await fs.unlink(imagePath); } catch (error) {}
        return;
    }
    
    const movedPiece = game.board[move.from];
    game.board = makeMove(game.board, move, game.currentTurn);
    game.currentTurn = game.currentTurn === 'w' ? 'b' : 'w';
    game.lastMove = move;
    
    const gameOverStatus = isGameOver(game.board, game.currentTurn);
    const kingPos = getKingPos(game.board, game.currentTurn);
    const isInCheck = isSquareAttacked(game.board, kingPos, game.botColor);
    
    const imageBuffer = await createChessBoard(game);
    const imagePath = path.resolve(process.cwd(), "assets", "temp", `chess_${threadId}.png`);
    await fs.writeFile(imagePath, imageBuffer);
    
    const fromSquare = indexToSquare(move.from);
    const toSquare = indexToSquare(move.to);
    
    let caption = `\n🤖 BOT đi: ${fromSquare} ${toSquare}`;
    
    if (gameOverStatus.gameOver) {
        if (gameOverStatus.result === 'CHECKMATE') {
            caption += `\n\n🏆 BOT đã chiếu bí (Checkmate) ${game.playerName}. BOT WIN!`;
        } else {
            caption += `\n\n🤝 Hòa cờ do thế cờ bí (Stalemate).`;
        }
        await sendMessageTag(api, message, { caption, imagePath }, 86400000);
        activeChessGames.delete(threadId);
        clearTurnTimer(threadId);
    } else {
        const playerTurnColor = game.currentTurn === 'w' ? "Trắng (W)" : "Đen (B)";
        caption += `\n\n🎯 Đến lượt ${game.playerName} (Quân ${playerTurnColor})\n\n👉 Nhập ô bắt đầu và ô kết thúc (Ví dụ: e7 e5)`;
        if (isInCheck) caption += `\n\n⚠️ Vua đang bị Chiếu (Check)!`;
        caption += `\n\n🧭 Thời gian: 120 giây`;
        
        await sendMessageTag(api, message, { caption, imagePath }, 120000);
        game.isProcessing = false;
        startTurnTimer(api, message, threadId, true);
    }
    
    try { await fs.unlink(imagePath); } catch (error) {}
}

export async function handleChessMessage(api, message) {
    const threadId = message.threadId;
    const game = activeChessGames.get(threadId);
    
    if (!game) return;
    if (game.isProcessing) return;
    if (message.data.uidFrom !== game.playerId) return;
    if (game.currentTurn !== game.playerColor) return;
    
    const content = message.data.content || "";
    if (message.data.mentions && message.data.mentions.length > 0) return;
    
    if (content.trim().toLowerCase() === "lose") {
        clearTurnTimer(threadId);
        const caption = `♔ TRẬN ĐẤU KẾT THÚC\n\n👤 Người chơi ${game.playerName} đã nhận thua.\n🏆 BOT đã dành chiến thắng ván cờ này.`;
        await sendMessageTag(api, message, { caption });
        activeChessGames.delete(threadId);
        return;
    }
    
    clearTurnTimer(threadId);
    
    const move = parseInputMove(content, game.playerColor);
    
    if (!move) {
        await sendMessageWarning(api, message, `Cú pháp không hợp lệ. Vui lòng nhập [ô bắt đầu] [ô kết thúc] (Ví dụ: e2 e4)`, 60000);
        startTurnTimer(api, message, threadId, true);
        return;
    }

    const piece = game.board[move.from];

    if (piece === null || getPieceColor(piece) !== game.playerColor) {
        await sendMessageWarning(api, message, `Ô ${indexToSquare(move.from)} không có quân cờ của bạn hoặc ô trống.`, 60000);
        startTurnTimer(api, message, threadId, true);
        return;
    }

    const legalMoves = getAllLegalMoves(game.board, game.playerColor);
    const isLegal = legalMoves.some(m => m.from === move.from && m.to === move.to);

    if (!isLegal) {
        await sendMessageWarning(api, message, `Nước đi ${indexToSquare(move.from)} ${indexToSquare(move.to)} không hợp lệ hoặc làm Vua bị Chiếu.`, 60000);
        startTurnTimer(api, message, threadId, true);
        return;
    }
    
    game.isProcessing = true;
    
    const actualMove = legalMoves.find(m => m.from === move.from && m.to === move.to);
    game.board = makeMove(game.board, actualMove, game.currentTurn);
    game.currentTurn = game.botColor;
    game.lastMove = actualMove;
    
    const gameOverStatus = isGameOver(game.board, game.playerColor);
    const botTurnColor = game.currentTurn === 'w' ? "Trắng (W)" : "Đen (B)";
    
    const imageBuffer = await createChessBoard(game);
    const imagePath = path.resolve(process.cwd(), "assets", "temp", `chess_${threadId}.png`);
    await fs.writeFile(imagePath, imageBuffer);
    
    const fromSquare = indexToSquare(move.from);
    const toSquare = indexToSquare(move.to);
    let caption = `\n👤 Bạn đi: ${fromSquare} ${toSquare}`;
    
    if (gameOverStatus.gameOver) {
        if (gameOverStatus.result === 'CHECKMATE') {
            caption += `\n\n🏆 ${game.playerName} đã chiếu bí (Checkmate) BOT. CHÚC MỪNG!`;
        } else {
            caption += `\n\n🤝 Hòa cờ do thế cờ bí (Stalemate).`;
        }
        await sendMessageTag(api, message, { caption, imagePath }, 86400000);
        activeChessGames.delete(threadId);
        clearTurnTimer(threadId);
    } else {
        caption += `\n\n🤖 Đến lượt BOT (${botTurnColor})\n\n🧭 Đang tính toán nước đi...`;
        await sendMessageTag(api, message, { caption, imagePath });
        try { await fs.unlink(imagePath); } catch (error) {}
        
        handleBotTurn(api, message);
    }
}
