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
    
    ctx.font = "bold 20px 'BeVietnamPro'";
    
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
    
    let boardTop = headerHeight;
    
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
    
    let numberFont = "15px 'BeVietnamPro'";
    let markFont = "bold 30px 'BeVietnamPro'";
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

function checkWinAt(board, pos, mark, size = 16) {
    let directions = [[0,1], [1,0], [1,1], [1,-1]];
    let winLength = 5;
    
    for (let [dr, dc] of directions) {
        let forward = countInDirection(board, pos, dr, dc, mark, size);
        let backward = countInDirection(board, pos, -dr, -dc, mark, size);
        
        if (forward + backward + 1 >= winLength) {
            return true;
        }
    }
    
    return false;
}

function checkWin(board, size = 16) {
    let directions = [[0,1], [1,0], [1,1], [1,-1]];
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

const DIRECTIONS = [[0, 1], [1, 0], [1, 1], [1, -1]];

function analyzePattern(board, pos, mark, size) {
    let r = Math.floor(pos / size);
    let c = pos % size;
    let patterns = [];
    
    for (let [dr, dc] of DIRECTIONS) {
        let count = 1;
        let leftOpen = false;
        let rightOpen = false;
        let leftPos = null;
        let rightPos = null;
        
        for (let i = 1; i <= 4; i++) {
            let nr = r + dr * i;
            let nc = c + dc * i;
            if (nr < 0 || nr >= size || nc < 0 || nc >= size) break;
            let idx = nr * size + nc;
            if (board[idx] === mark) {
                count++;
            } else if (board[idx] === ".") {
                rightOpen = true;
                rightPos = idx;
                break;
            } else {
                break;
            }
        }
        
        for (let i = 1; i <= 4; i++) {
            let nr = r - dr * i;
            let nc = c - dc * i;
            if (nr < 0 || nr >= size || nc < 0 || nc >= size) break;
            let idx = nr * size + nc;
            if (board[idx] === mark) {
                count++;
            } else if (board[idx] === ".") {
                leftOpen = true;
                leftPos = idx;
                break;
            } else {
                break;
            }
        }
        
        patterns.push({
            count,
            leftOpen,
            rightOpen,
            leftPos,
            rightPos,
            direction: [dr, dc]
        });
    }
    
    return patterns;
}

function findWinningMove(board, mark, size) {
    for (let i = 0; i < size * size; i++) {
        if (board[i] === ".") {
            board[i] = mark;
            if (checkWinAt(board, i, mark, size)) {
                board[i] = ".";
                return i;
            }
            board[i] = ".";
        }
    }
    return -1;
}

function findBlockingMove(board, mark, oppMark, size) {
    let threats = [];
    
    for (let i = 0; i < size * size; i++) {
        if (board[i] !== ".") continue;
        
        let patterns = analyzePattern(board, i, oppMark, size);
        
        for (let pattern of patterns) {
            if (pattern.count >= 3 && (pattern.leftOpen || pattern.rightOpen)) {
                let isBlocked = false;
                
                if (pattern.leftOpen && pattern.leftPos !== null) {
                    let leftR = Math.floor(pattern.leftPos / size);
                    let leftC = pattern.leftPos % size;
                    let checkR = leftR - pattern.direction[0];
                    let checkC = leftC - pattern.direction[1];
                    if (checkR >= 0 && checkR < size && checkC >= 0 && checkC < size) {
                        let checkIdx = checkR * size + checkC;
                        if (board[checkIdx] === mark) {
                            isBlocked = true;
                        }
                    }
                }
                
                if (pattern.rightOpen && pattern.rightPos !== null) {
                    let rightR = Math.floor(pattern.rightPos / size);
                    let rightC = pattern.rightPos % size;
                    let checkR = rightR + pattern.direction[0];
                    let checkC = rightC + pattern.direction[1];
                    if (checkR >= 0 && checkR < size && checkC >= 0 && checkC < size) {
                        let checkIdx = checkR * size + checkC;
                        if (board[checkIdx] === mark) {
                            isBlocked = true;
                        }
                    }
                }
                
                if (!isBlocked) {
                    let priority = pattern.count === 4 ? 1000 : pattern.count === 3 ? 100 : 10;
                    if (pattern.leftOpen && pattern.rightOpen) priority *= 2;
                    
                    if (pattern.leftOpen && pattern.leftPos !== null) {
                        threats.push({ pos: pattern.leftPos, priority });
                    }
                    if (pattern.rightOpen && pattern.rightPos !== null) {
                        threats.push({ pos: pattern.rightPos, priority });
                    }
                }
            }
        }
    }
    
    if (threats.length > 0) {
        threats.sort((a, b) => b.priority - a.priority);
        return threats[0].pos;
    }
    
    return -1;
}

function findDoubleThreatMove(board, mark, size) {
    for (let i = 0; i < size * size; i++) {
        if (board[i] !== ".") continue;
        
        board[i] = mark;
        let patterns = analyzePattern(board, i, mark, size);
        board[i] = ".";
        
        let openThrees = 0;
        let openFours = 0;
        
        for (let pattern of patterns) {
            if (pattern.count >= 3 && pattern.leftOpen && pattern.rightOpen) {
                if (pattern.count === 4) openFours++;
                else if (pattern.count === 3) openThrees++;
            }
        }
        
        if (openFours >= 1 || openThrees >= 2) {
            return i;
        }
    }
    
    return -1;
}

function findSplitAttackMove(board, mark, size) {
    for (let i = 0; i < size * size; i++) {
        if (board[i] !== ".") continue;
        
        let r = Math.floor(i / size);
        let c = i % size;
        
        for (let [dr, dc] of DIRECTIONS) {
            let positions = [];
            for (let step = -4; step <= 4; step++) {
                if (step === 0) continue;
                let nr = r + dr * step;
                let nc = c + dc * step;
                if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
                    let idx = nr * size + nc;
                    positions.push({ idx, step, val: board[idx] });
                }
            }
            
            let myCount = positions.filter(p => p.val === mark).length;
            let emptyCount = positions.filter(p => p.val === ".").length;
            
            if (myCount >= 2 && emptyCount >= 3) {
                let hasGoodGap = false;
                for (let p of positions) {
                    if (p.val === mark) {
                        let gapLeft = positions.find(x => x.step === p.step - 1);
                        let gapRight = positions.find(x => x.step === p.step + 1);
                        if ((gapLeft && gapLeft.val === ".") || (gapRight && gapRight.val === ".")) {
                            hasGoodGap = true;
                            break;
                        }
                    }
                }
                if (hasGoodGap) return i;
            }
        }
    }
    
    return -1;
}

function getCandidateMoves(board, size, mark) {
    let candidates = new Set();
    
    for (let i = 0; i < size * size; i++) {
        if (board[i] !== ".") {
            let r = Math.floor(i / size);
            let c = i % size;
            
            for (let dr = -2; dr <= 2; dr++) {
                for (let dc = -2; dc <= 2; dc++) {
                    if (dr === 0 && dc === 0) continue;
                    let nr = r + dr;
                    let nc = c + dc;
                    if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
                        let idx = nr * size + nc;
                        if (board[idx] === ".") {
                            candidates.add(idx);
                        }
                    }
                }
            }
        }
    }
    
    if (candidates.size === 0) {
        let center = Math.floor(size / 2);
        candidates.add(center * size + center);
    }
    
    return Array.from(candidates);
}

function evaluatePosition(board, pos, mark, oppMark, size) {
    let score = 0;
    let r = Math.floor(pos / size);
    let c = pos % size;
    let center = Math.floor(size / 2);
    
    let distToCenter = Math.abs(r - center) + Math.abs(c - center);
    score += Math.max(0, 15 - distToCenter);
    
    board[pos] = mark;
    let myPatterns = analyzePattern(board, pos, mark, size);
    board[pos] = ".";
    
    for (let p of myPatterns) {
        if (p.count >= 4) score += 5000;
        else if (p.count === 3 && p.leftOpen && p.rightOpen) score += 500;
        else if (p.count === 3) score += 100;
        else if (p.count === 2 && p.leftOpen && p.rightOpen) score += 50;
    }
    
    board[pos] = oppMark;
    let oppPatterns = analyzePattern(board, pos, oppMark, size);
    board[pos] = ".";
    
    for (let p of oppPatterns) {
        if (p.count >= 4) score += 4000;
        else if (p.count === 3 && p.leftOpen && p.rightOpen) score += 400;
        else if (p.count === 3) score += 80;
    }
    
    return score;
}

function getAIMove(board, playerMark, mode, size = 16) {
    let botMark = playerMark === "X" ? "O" : "X";
    
    let winMove = findWinningMove(board, botMark, size);
    if (winMove !== -1) return winMove;
    
    let blockMove = findBlockingMove(board, botMark, playerMark, size);
    if (blockMove !== -1) return blockMove;
    
    let doubleThreat = findDoubleThreatMove(board, botMark, size);
    if (doubleThreat !== -1) return doubleThreat;
    
    let splitAttack = findSplitAttackMove(board, botMark, size);
    if (splitAttack !== -1) return splitAttack;
    
    let candidates = getCandidateMoves(board, size, botMark);
    
    let bestMove = candidates[0];
    let bestScore = -Infinity;
    
    for (let move of candidates) {
        let score = evaluatePosition(board, move, botMark, playerMark, size);
        if (score > bestScore) {
            bestScore = score;
            bestMove = move;
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
    
    let pos = getAIMove(game.board, game.playerMark, game.mode, game.size);
    
    clearTurnTimer(threadId);
    
    if (!activeCaroGames.has(threadId)) return;
    
    if (pos < 0 || game.moveCount >= game.size * game.size) {
        let imageBuffer = await createCaroBoard(game.board, game.size, game.moveCount, game.playerMark, game.botMark, game.playerName, game.lastBotMove, game.currentTurn, [], game.mode);
        let imagePath = path.resolve(process.cwd(), "assets", "temp", `caro_${threadId}_draw.png`);
        await fs.writeFile(imagePath, imageBuffer);
        
        let caption = `🏆 HÒA CỜ!\n\n📊 Nước đi: ${game.moveCount}/${game.size * game.size}\n💭 Đôi khi hòa cũng là một kết quả tốt.\n\n🎯 Thử lại lần nữa để phân định thắng bại nhé!`;
        await sendMessageTag(api, message, {
            caption,
            imagePath
        }, TTL_LONG);
        
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
    
    let winResult = checkWin(game.board, game.size);
    
    let winningLine = winResult ? winResult.line : [];
    
    let imageBuffer = await createCaroBoard(game.board, game.size, game.moveCount, game.playerMark, game.botMark, game.playerName, pos, game.playerMark, winningLine, game.mode);
    let imagePath = path.resolve(process.cwd(), "assets", "temp", `caro_${threadId}.png`);
    await fs.writeFile(imagePath, imageBuffer);
    
    let modeName = game.mode === "master" ? "cao thủ" : game.mode === "hard" ? "khó" : "dễ";
    
    if (winResult) {
        let caption = `🤖 BOT WIN!\n\n🎮 BOT đánh ô số: ${pos + 1}\n🏆 BOT ${modeName} đã dành chiến thắng xuất sắc\n\n👤 ${game.playerName} đã thua tâm phục khẩu phục\n💪 Hãy rút kinh nghiệm và thử lại lần sau nhé!`;
        await sendMessageTag(api, message, {
            caption,
            imagePath
        }, TTL_LONG);
        await api.addReaction("UNDO", message);
        await api.addReaction("OK", message);
        activeCaroGames.delete(threadId);
        clearTurnTimer(threadId);
    } else if (game.moveCount === game.size * game.size) {
        let caption = `🏆 HÒA CỜ!\n\n🎮 BOT đánh ô số: ${pos + 1}\n📊 Nước đi: ${game.moveCount}/${game.size * game.size}\n\n💭 Trận đấu cân não đỉnh cao!\n🎯 Cả bạn và BOT đều chơi xuất sắc!`;
        await sendMessageTag(api, message, {
            caption,
            imagePath
        }, TTL_LONG);
        await api.addReaction("UNDO", message);
        await api.addReaction("OK", message);
        activeCaroGames.delete(threadId);
        clearTurnTimer(threadId);
    } else {
        let initialMessage = initialTurn ? `🎮 BẮT ĐẦU TRẬN ĐẤU - CHẾ ĐỘ ${game.mode.toUpperCase()}\n\n🤖 BOT đi trước (Quân X)` : "";
        
        let caption = `${initialMessage}\n🌟 BOT đánh ô số: ${pos + 1}\n\n🎯 Lượt của ${game.playerName} (Quân ${game.playerMark})\n\n👉 Gõ số ô (1-${game.size * game.size})\n⏱️ Thời gian: 60 giây\n\n💡 Hãy suy nghĩ kỹ trước khi đánh!`;
        await sendMessageTag(api, message, {
            caption,
            imagePath
        }, TTL_SHORT);
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
        let imageBuffer = await createCaroBoard(board, size, 0, playerMark, playerMark === "X" ? "O" : "X", message.data.dName, -1, "X", [], mode);
        let imagePath = path.resolve(process.cwd(), "assets", "temp", `caro_${threadId}.png`);
        await fs.writeFile(imagePath, imageBuffer);
        
        let caption = `🎮 BẮT ĐẦU TRẬN ĐẤU - CHẾ ĐỘ ${mode.toUpperCase()}\n\n🎯 Lượt của ${message.data.dName} (Quân ${playerMark})\n\n👉 Gõ số ô (1-${size * size}) để đánh\n⏱️ Thời gian: 60 giây\n\n💡 Mẹo: Kiểm soát trung tâm là chìa khóa chiến thắng!`;
        await sendMessageTag(api, message, {
            caption,
            imagePath
        }, TTL_SHORT);
        startTurnTimer(api, message, threadId, true);
        
        try {
            await fs.unlink(imagePath);
        } catch (error) {}
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
    
    let content = message.data.content || "";
    
    if (message.data.mentions && message.data.mentions.length > 0) return;
    
    if (content.trim().toLowerCase() === "lose") {
        clearTurnTimer(threadId);
        let caption = `🏳️ ĐẦU HÀNG!\n\n👤 ${game.playerName} đã chọn đầu hàng\n🏆 BOT đã dành chiến thắng\n\n🎯 Đừng bỏ cuộc những lần sau nhé!`;
        await sendMessageTag(api, message, {
            caption
        }, TTL_LONG);
        activeCaroGames.delete(threadId);
        return;
    }
    
    if (!/^\d+$/.test(String(content).trim())) return;

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
        await sendMessageTag(api, message, {
            caption,
            imagePath
        }, TTL_LONG);
        activeCaroGames.delete(threadId);
        clearTurnTimer(threadId);
        try {
            await fs.unlink(imagePath);
        } catch (error) {}
        return;
    } else if (game.moveCount === game.size * game.size) {
        let caption = `🏆 HÒA CỜ!\n\n👤 Bạn đánh ô số: ${pos + 1}\n📊 Nước đi: ${game.moveCount}/${game.size * game.size}\n\n💭 Hòa do không còn nước đi.\n🎯 Cả bạn và BOT đều chơi rất xuất sắc!`;
        await sendMessageTag(api, message, {
            caption,
            imagePath
        }, TTL_LONG);
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
