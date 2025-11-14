import { createCanvas } from "canvas";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { createRequire } from "module";
import { sendMessageComplete, sendMessageWarning, sendMessageTag } from "../../chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service.js";
import { removeMention } from "../../../utils/format-util.js";
import puppeteer from "puppeteer";

let activeCaroGames = new Map();
let turnTimers = new Map();
let browser = null;

const TTL_LONG = 3600000;
const TTL_SHORT = 60000;

const BOARD_SIZE = 16;
const BLACK_PLAYER = 'black';
const WHITE_PLAYER = 'white';

async function initBrowser() {
    if (!browser) {
        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu'
            ]
        });
    }
    return browser;
}

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

function checkWinner(board, row, col, player) {
    const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];

    for (const [dx, dy] of directions) {
        const line = [[row, col]];
        
        for (let i = 1; i < 5; i++) {
            const newRow = row + dx * i;
            const newCol = col + dy * i;
            if (
                newRow < 0 || newRow >= BOARD_SIZE ||
                newCol < 0 || newCol >= BOARD_SIZE ||
                board[newRow][newCol] !== player
            ) {
                break;
            }
            line.push([newRow, newCol]);
        }

        for (let i = 1; i < 5; i++) {
            const newRow = row - dx * i;
            const newCol = col - dy * i;
            if (
                newRow < 0 || newRow >= BOARD_SIZE ||
                newCol < 0 || newCol >= BOARD_SIZE ||
                board[newRow][newCol] !== player
            ) {
                break;
            }
            line.push([newRow, newCol]);
        }

        if (line.length >= 5) {
            return line;
        }
    }

    return null;
}

async function createCaroBoard(board, size, moveCount, playerSymbol, botSymbol, playerName, lastBotMove, currentSymbol, winningLine = [], mode = "normal") {
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
    
    ctx.fillStyle = (playerSymbol === "X") ? X_COLOR : O_COLOR;
    ctx.fillText(`${playerSymbol}: ${playerName}`, 20, 30);
    
    ctx.textAlign = "right";
    ctx.fillStyle = (botSymbol === "X") ? X_COLOR : O_COLOR;
    ctx.fillText(`${botSymbol}: BOT`, width - 20, 30);
    
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
    
    const winningSet = new Set(winningLine.map(idx => `${Math.floor(idx / size)},${idx % size}`));

    for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
            const mark = board[row][col];
            const idx = row * size + col;
            let x = padding + col * cellSize + cellSize / 2;
            let y = boardTop + padding + row * cellSize + cellSize / 2;

            if (mark === null) {
                ctx.font = numberFont;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillStyle = NUMBER_COLOR;
                ctx.fillText((idx + 1).toString(), x, y);
            } else {
                let symbol;
                if (mark === BLACK_PLAYER) symbol = "X";
                else symbol = "O";

                ctx.font = markFont;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                
                if (symbol === "X") {
                    ctx.fillStyle = X_COLOR;
                    ctx.fillText("X", x, y);
                } else if (symbol === "O") {
                    ctx.fillStyle = O_COLOR;
                    ctx.fillText("O", x, y);
                }
                
                if (lastBotMove && row === lastBotMove.row && col === lastBotMove.col) {
                    ctx.strokeStyle = "#CC8800";
                    ctx.lineWidth = circleWidth;
                    ctx.beginPath();
                    ctx.arc(x, y, circleRadius, 0, Math.PI * 2);
                    ctx.stroke();
                }
            }
        }
    }

    if (winningLine && winningLine.length >= 5) {
        ctx.strokeStyle = "#00FF00";
        ctx.lineWidth = winLineWidth;
        
        let firstPos = winningLine[0];
        let lastPos = winningLine[winningLine.length - 1];
        
        let startRow = Math.floor(firstPos / size);
        let startCol = firstPos % size;
        let endRow = Math.floor(lastPos / size);
        let endCol = lastPos % size;

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

async function getBotMoveFromWebsite(game) {
    const br = await initBrowser();
    let page = null;
    
    try {
        let levelMap = {
            'de': 'easy',
            'kho': 'normal',
            'caothu': 'hard'
        };
        let level = levelMap[game.mode] || 'normal';
        
        let first = game.playerSymbol === 'X' ? 'human' : 'ai';
        
        let moves = [];
        for (let r = 0; r < game.size; r++) {
            for (let c = 0; c < game.size; c++) {
                if (game.board[r][c] !== null) {
                    moves.push(r * game.size + c + 1);
                }
            }
        }
        
        let url = `https://depchaiaiyeu.github.io/easycaro.github.io/?level=${level}&first=${first}&moves=${moves.join(',')}`;
        
        console.log(`Opening: ${url}`);
        
        page = await br.newPage();
        
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
        
        await page.goto(url, { 
            waitUntil: 'networkidle0',
            timeout: 30000 
        });
        
        await page.waitForSelector('#game-data-crawler', { timeout: 10000 });
        
        await page.waitForFunction(
            () => {
                const div = document.getElementById('game-data-crawler');
                return div && div.textContent.trim().length > 0;
            },
            { timeout: 5000 }
        );
        
        let gameData = await page.evaluate(() => {
            const div = document.getElementById('game-data-crawler');
            if (!div) return null;
            const text = div.textContent.trim();
            if (!text) return null;
            return JSON.parse(text);
        });
        
        if (!gameData || !gameData.moves || gameData.moves.length === 0) {
            throw new Error('No moves in game data');
        }
        
        let lastMoveCell = gameData.moves[gameData.moves.length - 1];
        let movePos = lastMoveCell - 1;
        let row = Math.floor(movePos / game.size);
        let col = movePos % game.size;
        
        await page.close();
        
        return { row, col };
        
    } catch (error) {
        console.error("Error fetching from website:", error);
        if (page) await page.close();
        throw error;
    }
}

async function handleBotTurn(api, message) {
    let threadId = message.threadId;
    let game = activeCaroGames.get(threadId);
    if (!game) return;
    
    if (game.currentTurn !== game.aiMark) return;

    await api.addReaction("FLASH", message);
    game.isProcessing = true;
    startTurnTimer(api, message, threadId, false);

    let move = null;

    try {
        move = await getBotMoveFromWebsite(game);
    } catch (error) {
        console.error("Lỗi crawl website:", error);
        clearTurnTimer(threadId);
        await sendMessageWarning(api, message, "🤖 Rất tiếc, AI đang gặp sự cố. Vui lòng thử lại sau.", TTL_SHORT);
        activeCaroGames.delete(threadId);
        return;
    }

    clearTurnTimer(threadId);
    if (!activeCaroGames.has(threadId)) return;

    if (!move || game.moveCount >= game.size * game.size) {
        let imageBuffer = await createCaroBoard(game.board, game.size, game.moveCount, game.playerSymbol, game.botSymbol, game.playerName, game.lastBotMove, game.currentTurn, [], game.mode);
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

    game.board[move.row][move.col] = game.aiMark;
    game.currentTurn = game.humanMark;
    game.moveCount++;
    game.lastBotMove = move;
    const botMovePos = move.row * game.size + move.col + 1;

    let winLine = checkWinner(game.board, move.row, move.col, game.aiMark);
    let winningLineCoords = winLine ? winLine.map(([r, c]) => r * game.size + c) : [];

    let imageBuffer = await createCaroBoard(game.board, game.size, game.moveCount, game.playerSymbol, game.botSymbol, game.playerName, move, game.playerSymbol, winningLineCoords, game.mode);
    let imagePath = path.resolve(process.cwd(), "assets", "temp", `caro_${threadId}.png`);
    await fs.writeFile(imagePath, imageBuffer);

    let modeName;
    if (game.mode === "caothu") modeName = "Cao Thủ";
    else if (game.mode === "kho") modeName = "Newbie";
    else modeName = "Luyện Tập";

    if (winLine) {
        let caption = `🤖 BOT WIN!\n\n🎮 BOT đánh ô số: ${botMovePos}\n🏆 BOT ${modeName} đã dành chiến thắng xuất sắc\n\n👤 ${game.playerName} đã thua tâm phục khẩu phục\n💪 Hãy rút kinh nghiệm và thử lại lần sau nhé!`;
        await sendMessageTag(api, message, { caption, imagePath }, TTL_LONG);
        await api.addReaction("UNDO", message);
        await api.addReaction("OK", message);
        activeCaroGames.delete(threadId);
        clearTurnTimer(threadId);
    } else if (game.moveCount === game.size * game.size) {
        let caption = `🏆 HÒA CỜ!\n\n🎮 BOT đánh ô số: ${botMovePos}\n📊 Nước đi: ${game.moveCount}/${game.size * game.size}\n\n💭 Trận đấu cân não đỉnh cao!\n🎯 Cả bạn và BOT đều chơi xuất sắc!`;
        await sendMessageTag(api, message, { caption, imagePath }, TTL_LONG);
        await api.addReaction("UNDO", message);
        await api.addReaction("OK", message);
        activeCaroGames.delete(threadId);
        clearTurnTimer(threadId);
    } else {
        let caption = `🌟 BOT đánh ô số: ${botMovePos}\n\n🎯 Lượt của ${game.playerName} (Quân ${game.playerSymbol})\n\n👉 Gõ số ô (1-${game.size * game.size})\n⏱️ Thời gian: 60 giây\n\n💡 Hãy suy nghĩ kỹ trước khi đánh!`;
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
            `${prefix}caro [de/kho/caothu] [x]\n\n` +
            `💡 Ví dụ:\n` +
            `• ${prefix}caro de >> Luyện tay (Bạn cầm O)\n` +
            `• ${prefix}caro kho >> Dành cho newbie (Bạn cầm O)\n` +
            `• ${prefix}caro caothu >> Cao thủ (Bạn cầm O)\n` +
            `• ${prefix}caro caothu x >> Bạn cầm X đi trước\n\n` +
            `📜 Luật chơi:\n` +
            `• Thêm 'x' vào cuối để cầm X đi trước\n` +
            `• Bàn cờ 16x16, thắng khi ghép 5 quân liên tiếp\n` +
            `• Gõ số ô (1-256) để đánh quân\n` +
            `• Gõ "lose" để đầu hàng\n` +
            `🧭 Thời gian: 60 giây/lượt`
        );
        return;
    }
    if (activeCaroGames.has(threadId)) {
        await sendMessageWarning(api, message, `⚠️ Đang có trận đấu đang diễn ra!\nVui lòng hoàn thành trận này trước khi bắt đầu trận mới.`, TTL_SHORT);
        return;
    }

    let inputMode = args[1].toLowerCase();
    let mode = "";
    let size = BOARD_SIZE;
    const allowedModes = ["de", "kho", "caothu"];

    if (allowedModes.includes(inputMode)) {
        mode = inputMode;
    } else {
        await sendMessageWarning(api, message, "🎯 Chế độ không hợp lệ!\n\nVui lòng chọn một trong các chế độ sau:\n• de\n• kho\n• caothu", TTL_SHORT);
        return;
    }

    let playerArg = args[2] ? args[2].toLowerCase() : '';
    let playerSymbol, botSymbol, humanMark, aiMark, currentTurn;

    if (playerArg === 'x') {
        playerSymbol = 'X';
        botSymbol = 'O';
        humanMark = BLACK_PLAYER; 
        aiMark = WHITE_PLAYER;
        currentTurn = humanMark; 
    } else {
        playerSymbol = 'O';
        botSymbol = 'X';
        humanMark = WHITE_PLAYER; 
        aiMark = BLACK_PLAYER;
        currentTurn = aiMark; 
    }

    clearTurnTimer(threadId);
    let board = Array(size).fill(null).map(() => Array(size).fill(null));
    
    activeCaroGames.set(threadId, {
        board,
        playerSymbol,
        botSymbol,
        humanMark,
        aiMark,
        currentTurn,
        mode,
        playerId: message.data.uidFrom,
        playerName: message.data.dName,
        size,
        moveCount: 0,
        lastBotMove: null,
        isProcessing: false,
        winResult: null
    });

    if (currentTurn === humanMark) {
        let imageBuffer = await createCaroBoard(board, size, 0, playerSymbol, botSymbol, message.data.dName, null, playerSymbol, [], mode);
        let imagePath = path.resolve(process.cwd(), "assets", "temp", `caro_${threadId}.png`);
        await fs.writeFile(imagePath, imageBuffer);
        let caption = `🎮 BẮT ĐẦU TRẬN ĐẤU - CHẾ ĐỘ ${mode.toUpperCase()}\n\n🎯 Lượt của ${message.data.dName} (Quân ${playerSymbol})\n\n👉 Gõ số ô (1-${size * size}) để đánh\n⏱️ Thời gian: 60 giây\n\n💡 Mẹo: Bạn đi trước, hãy kiểm soát trung tâm!`;
        await sendMessageTag(api, message, { caption, imagePath }, TTL_SHORT);
        startTurnTimer(api, message, threadId, true);
        try { await fs.unlink(imagePath); } catch (error) { }
    } else {
        handleBotTurn(api, message);
    }
}

export async function handleCaroMessage(api, message) {
    let threadId = message.threadId;
    let game = activeCaroGames.get(threadId);
    if (!game) return;
    if (game.isProcessing) return;
    if (message.data.uidFrom !== game.playerId) return;
    if (game.currentTurn !== game.humanMark) return;
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
    const row = Math.floor(pos / game.size);
    const col = pos % game.size;

    if (pos < 0 || pos >= game.size * game.size) {
        await sendMessageWarning(api, message, `🚫 Số ô không hợp lệ!\nVui lòng chọn từ 1 đến ${game.size * game.size}`, TTL_SHORT);
        startTurnTimer(api, message, threadId, true);
        return;
    }
    
    if (game.board[row][col] !== null) {
        await sendMessageWarning(api, message, "⚠️ Ô này đã có quân cờ rồi!\nHãy chọn một ô trống khác", TTL_SHORT);
        startTurnTimer(api, message, threadId, true);
        return;
    }
    
    game.isProcessing = true;
    game.board[row][col] = game.humanMark;
    game.moveCount++;

    let winLine = checkWinner(game.board, row, col, game.humanMark);
    let winningLineCoords = winLine ? winLine.map(([r, c]) => r * game.size + c) : [];

    if (winLine) {
        let imageBuffer = await createCaroBoard(game.board, game.size, game.moveCount, game.playerSymbol, game.botSymbol, game.playerName, game.lastBotMove, game.botSymbol, winningLineCoords, game.mode);
        let imagePath = path.resolve(process.cwd(), "assets", "temp", `caro_${threadId}.png`);
        await fs.writeFile(imagePath, imageBuffer);

        let caption = `👑 PLAYER WIN!\n\n👤 ${game.playerName} đánh ô số: ${pos + 1}\n🏆 Chúc mừng một chiến thắng xuất sắc!\n\n🌟 Bạn đã chơi rất hay trong ván cờ này.`;
        await sendMessageTag(api, message, { caption, imagePath }, TTL_LONG);
        activeCaroGames.delete(threadId);
        clearTurnTimer(threadId);
        try { await fs.unlink(imagePath); } catch (error) { }
        return;
    } else if (game.moveCount === game.size * game.size) {
        let imageBuffer = await createCaroBoard(game.board, game.size, game.moveCount, game.playerSymbol, game.botSymbol, game.playerName, game.lastBotMove, game.botSymbol, winningLineCoords, game.mode);
        let imagePath = path.resolve(process.cwd(), "assets", "temp", `caro_${threadId}.png`);
        await fs.writeFile(imagePath, imageBuffer);

        let caption = `🏆 HÒA CỜ!\n\n👤 Bạn đánh ô số: ${pos + 1}\n📊 Nước đi: ${game.moveCount}/${game.size * game.size}\n\n💭 Hòa do không còn nước đi.\n🎯 Cả bạn và BOT đều chơi rất xuất sắc!`;
        await sendMessageTag(api, message, { caption, imagePath }, TTL_LONG);
        activeCaroGames.delete(threadId);
        clearTurnTimer(threadId);
        try { await fs.unlink(imagePath); } catch (error) { }
        return;
    }

    game.currentTurn = game.aiMark;
    handleBotTurn(api, message);
}
