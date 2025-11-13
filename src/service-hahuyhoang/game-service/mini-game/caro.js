import { createCanvas } from "canvas";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { sendMessageComplete, sendMessageWarning, sendMessageTag } from "../../chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service.js";
import { removeMention } from "../../../utils/format-util.js";

let activeCaroGames = new Map();
let turnTimers = new Map();

let wasmInterfaces = new Map();

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

        wasmInterfaces.delete(threadId);

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

function getMoveCoordinates(pos, size) {
    const r = Math.floor(pos / size);
    const c = pos % size;
    return { r, c };
}

function parseWasmOutput(output) {
    if (!output) return null;
    const parts = output.split(' ');
    if (parts[0] === 'AI' && parts.length === 3) {
        return {
            type: 'AI',
            r: parseInt(parts[1]),
            c: parseInt(parts[2])
        };
    } else if (parts[0] === 'WIN' && parts.length >= 11) {
         const line = [];
         for(let i = 1; i < 11; i += 2) {
             const r = parseInt(parts[i]);
             const c = parseInt(parts[i+1]);
             line.push(r * 16 + c);
         }
         return { type: 'WIN', winner: parts[0], line: line };
    }
    return { type: parts[0], data: parts.slice(1).join(' ') };
}

function getAIMoveWasm(threadId, playerPos = -1) {
    const { ksh_send_input_string, ksh_get_output_string } = wasmInterfaces.get(threadId);
    const game = activeCaroGames.get(threadId);
    
    if (playerPos !== -1) {
        const { r, c } = getMoveCoordinates(playerPos, game.size);
        ksh_send_input_string(`HM ${r} ${c}`);
    }

    let maxTries = 100;
    for (let i = 0; i < maxTries; i++) {
        const output = ksh_get_output_string();
        if (output.length > 0) {
            const result = parseWasmOutput(output);

            if (result.type === 'STT') {
            } else if (result.type === 'L') {
            } else if (result.type === 'WIN') {
                 game.winResult = { winner: game.playerMark, line: result.line };
                 return -1;
            } else if (result.type === 'AI') {
                const ai_r = result.r;
                const ai_c = result.c;
                return ai_r * game.size + ai_c;
            }
        }
    }
    
    console.error(`Lỗi: AI Wasm không phản hồi AI move sau ${maxTries} lần thử.`);
    return -1;
}

async function handleBotTurn(api, message, playerPos = -1, initialTurn = false) {
    let threadId = message.threadId;
    let game = activeCaroGames.get(threadId);
    if (!game) return;

    await api.addReaction("FLASH", message);
    game.isProcessing = true;
    startTurnTimer(api, message, threadId, false);
    
    const pos = getAIMoveWasm(threadId, playerPos);
    
    clearTurnTimer(threadId);
    if (!activeCaroGames.has(threadId)) return;

    if (game.winResult && game.winResult.winner === game.playerMark) {
        const winningLine = game.winResult.line;
        let imageBuffer = await createCaroBoard(game.board, game.size, game.moveCount, game.playerMark, game.botMark, game.playerName, playerPos, game.botMark, winningLine, game.mode);
        let imagePath = path.resolve(process.cwd(), "assets", "temp", `caro_${threadId}.png`);
        await fs.writeFile(imagePath, imageBuffer);

        let caption = `👑 PLAYER WIN!\n\n👤 ${game.playerName} đánh ô số: ${playerPos + 1}\n🏆 Chúc mừng một chiến thắng xuất sắc!\n\n🌟 Bạn đã chơi rất hay trong ván cờ này.`;
        await sendMessageTag(api, message, { caption, imagePath }, TTL_LONG);
        activeCaroGames.delete(threadId);
        wasmInterfaces.delete(threadId);
        try { await fs.unlink(imagePath); } catch (error) { }
        return;
    }


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
        wasmInterfaces.delete(threadId);
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
        wasmInterfaces.delete(threadId);
        clearTurnTimer(threadId);
    } else if (game.moveCount === game.size * game.size) {
        let caption = `🏆 HÒA CỜ!\n\n🎮 BOT đánh ô số: ${pos + 1}\n📊 Nước đi: ${game.moveCount}/${game.size * size}\n\n💭 Trận đấu cân não đỉnh cao!\n🎯 Cả bạn và BOT đều chơi xuất sắc!`;
        await sendMessageTag(api, message, { caption, imagePath }, TTL_LONG);
        await api.addReaction("UNDO", message);
        await api.addReaction("OK", message);
        activeCaroGames.delete(threadId);
        wasmInterfaces.delete(threadId);
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
    let levelMap = { "normal": 2, "medium": 3, "hard": 4, "fuckme": 5 }; 
    
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
        await sendMessageWarning(api, message, "🚫 Quân cờ không hợp lệ!\n\Vui lòng chọn X hoặc O\n(Lưu ý: X luôn đi trước)", TTL_SHORT);
        return;
    }
    
    // --- KHỐI SỬA LỖI WASM ---
    try {
        // 1. Tính toán path của file hiện tại (caro.js) và thư mục 'brain'
        const currentFileUrl = import.meta.url;
        const currentDir = path.dirname(fileURLToPath(currentFileUrl));
        const wasmFilesPath = path.resolve(currentDir, 'brain');
        
        // 2. Thiết lập CJS Globals cho Wasm Wrapper (brain.js)
        // Việc này giải quyết lỗi "ReferenceError: __filename is not defined"
        global.__filename = fileURLToPath(currentFileUrl);
        global.__dirname = currentDir;
        
        // 3. Thiết lập Module toàn cục để Wasm Engine tìm thấy các file phụ
        global.Module = {
            locateFile: (path) => {
                // Đảm bảo Wasm Module tìm thấy brain.wasm và brain.worker.js
                if (path === 'brain.wasm' || path === 'brain.worker.js') {
                    return path.join(wasmFilesPath, path);
                }
                return path;
            },
            // Chỉ định đường dẫn của brain.js để Worker Threads có thể tải nó
            mainScriptUrlOrBlob: fileURLToPath(path.join(wasmFilesPath, 'brain.js')),
            print: () => {},
            printErr: console.error,
            noExitRuntime: true,
        };

        // 4. Import và khởi tạo Wasm Module
        await import("./brain/brain.js");

        const WasmModule = global.Module;
        
        const ksh_send_input_string = WasmModule.cwrap('ksh_send_input', null, ['string']);
        const ksh_get_output_string = WasmModule.cwrap('ksh_get_output', 'string', null);
        WasmModule._ksh_start();
        
        wasmInterfaces.set(threadId, { ksh_send_input_string, ksh_get_output_string });

        const level = levelMap[mode];
        const pf = (playerMark === "X" ? 1 : 0);
        ksh_send_input_string(`START 0 ${level} ${pf}`);
        
    } catch (e) {
        console.error("Lỗi khi tải hoặc khởi tạo WASM AI Engine:", e);
        // Xóa globals để không ảnh hưởng đến các lần chạy sau
        delete global.__filename;
        delete global.__dirname;
        await sendMessageWarning(api, message, `🚫 Lỗi hệ thống: Không thể khởi động AI Engine. Vui lòng kiểm tra file brain.js và Wasm. Chi tiết: ${e.message}`, TTL_SHORT);
        return;
    }
    // --- KẾT THÚC KHỐI SỬA LỖI WASM ---

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
        handleBotTurn(api, message, -1, true);
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
        wasmInterfaces.delete(threadId);
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
    
    if (winResult) {
        let imageBuffer = await createCaroBoard(game.board, game.size, game.moveCount, game.playerMark, game.botMark, game.playerName, game.lastBotMove, game.botMark, winningLine, game.mode);
        let imagePath = path.resolve(process.cwd(), "assets", "temp", `caro_${threadId}.png`);
        await fs.writeFile(imagePath, imageBuffer);

        let caption = `👑 PLAYER WIN!\n\n👤 ${game.playerName} đánh ô số: ${pos + 1}\n🏆 Chúc mừng một chiến thắng xuất sắc!\n\n🌟 Bạn đã chơi rất hay trong ván cờ này.`;
        await sendMessageTag(api, message, { caption, imagePath }, TTL_LONG);
        activeCaroGames.delete(threadId);
        wasmInterfaces.delete(threadId);
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
        wasmInterfaces.delete(threadId);
        clearTurnTimer(threadId);
        try { await fs.unlink(imagePath); } catch (error) { }
        return;
    }
    
    handleBotTurn(api, message, pos);
}
