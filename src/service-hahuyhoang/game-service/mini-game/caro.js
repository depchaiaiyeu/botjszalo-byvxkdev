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

function flatIndexToSquare(flatIndex, size = GOMOKU_SIZE) {
    const row = Math.floor(flatIndex / size);
    const col = flatIndex % size;
    return (row << 4) | col;
}

function squareToFlatIndex(square, size = GOMOKU_SIZE) {
    const row = square >> 4;
    const col = square & 0xf;
    return row * size + col;
}

function Pattern(type, template, rating) {
    this.type = type;
    this.rating = rating;

    var s = 0;
    var length = this.length = template.length;
    this.mask = (1 << (length << 1)) - 1;

    for (var i = length - 1; i >= 0; --i) {
        if (template.charAt(i) === 'x') {
            s = s | 1;
        }
        s = s << 2;
    }
    s = s >> 2;

    this.white = s;
    this.black = s << 1;

    var moves = [];
    var gains = [];
    var downs = [];
    var rifts = [];
    for (var i = 0; i < length; i++) {
        var ch = template.charAt(i);
        switch (ch) {
            case 'x':
                moves.push(i);
                break;
            case '-':
                gains.push(i);
                rifts.push(i);
                break;
            case '+':
                gains.push(i);
                downs.push(i);
                rifts.push(i);
                break;
            case '!':
                downs.push(i);
                rifts.push(i);
                break;
            default:
                rifts.push(i);
                break;
        }
    }

    this.moves = moves;
    this.move = moves[0];
    this.gains = gains;
    this.downs = downs;
    this.rifts = rifts;
}

Pattern.FIVE = 0;
Pattern.OPEN_FOUR = 3;
Pattern.FOUR = 4;
Pattern.OPEN_THREE = 7;
Pattern.THREE = 10;
Pattern.OPEN_TWO = 11;
Pattern.TWO = 14;
Pattern.ONE = 15;

Pattern.SOLVER_PATTERNS = [
    [
        new Pattern(Pattern.FIVE, "xxxxx", 100000000)
    ], [
        new Pattern(Pattern.OPEN_FOUR, "+xxxx+", 50000000),
        new Pattern(Pattern.FOUR, "xxxx+", 100000),
        new Pattern(Pattern.FOUR, "+xxxx", 100000),
        new Pattern(Pattern.FOUR, "xxx+x", 100000),
        new Pattern(Pattern.FOUR, "x+xxx", 100000),
        new Pattern(Pattern.FOUR, "xx+xx", 100000)
    ], [
        new Pattern(Pattern.OPEN_THREE, ".+xxx+.", 10000),
        new Pattern(Pattern.OPEN_THREE, "!xxx+!", 8000),
        new Pattern(Pattern.OPEN_THREE, "!+xxx!", 8000),
        new Pattern(Pattern.OPEN_THREE, "!xx+x!", 6000),
        new Pattern(Pattern.OPEN_THREE, "!x+xx!", 6000),
        new Pattern(Pattern.THREE, "xxx++", 1000),
        new Pattern(Pattern.THREE, "++xxx", 1000),
        new Pattern(Pattern.THREE, "+xxx+", 1000),
        new Pattern(Pattern.THREE, "x+xx+", 1000),
        new Pattern(Pattern.THREE, "+xx+x", 1000),
        new Pattern(Pattern.THREE, "xx+x+", 1000),
        new Pattern(Pattern.THREE, "+x+xx", 1000),
        new Pattern(Pattern.THREE, "xx++x", 1000),
        new Pattern(Pattern.THREE, "x++xx", 1000),
        new Pattern(Pattern.THREE, "x+x+x", 1000)
    ], [
        new Pattern(Pattern.OPEN_TWO, ".-+xx+-.", 100),
        new Pattern(Pattern.OPEN_TWO, ".+xx+-.", 100),
        new Pattern(Pattern.OPEN_TWO, ".-+xx+.", 100),
        new Pattern(Pattern.OPEN_TWO, ".+xx+.", 100),
        new Pattern(Pattern.OPEN_TWO, "!xx+-.", 100),
        new Pattern(Pattern.OPEN_TWO, ".-+xx!", 100),
        new Pattern(Pattern.OPEN_TWO, ".+x+x+.", 50),
        new Pattern(Pattern.OPEN_TWO, "!x+x+.", 50),
        new Pattern(Pattern.OPEN_TWO, ".+x+x!", 50),
        new Pattern(Pattern.OPEN_TWO, "!x++x!", 50),
        new Pattern(Pattern.TWO, "xx+--", 10),
        new Pattern(Pattern.TWO, "--+xx", 10),
        new Pattern(Pattern.TWO, "+xx+-", 10),
        new Pattern(Pattern.TWO, "-+xx+", 10),
    ], [
        new Pattern(Pattern.ONE, "..--x--..", 1)
    ]
];

function Figure(number, offset, hand, pattern) {
    this.number = number;
    this.offset = offset;
    this.hand = hand;
    this.pattern = pattern;
}

Figure.Comparator = function (hand) {
    return function (f1, f2) {
        var type1 = f1.hand === hand ? f1.pattern.type : (f1.pattern.type + 2);
        var type2 = f2.hand === hand ? f2.pattern.type : (f2.pattern.type + 2);
        return type1 - type2;
    };
};

Figure.prototype.moves = function (cols) {
    var r = [];
    cols = cols || this.pattern.moves;
    for (var i = 0; i < cols.length; i++) {
        r.push(Line.posSquare(this.number, this.offset + cols[i]));
    }
    return r;
};

Figure.prototype.gains = function () {
    return this.moves(this.pattern.gains);
};

Figure.prototype.downs = function () {
    return this.moves(this.pattern.downs);
};

Figure.prototype.onSameLine = function (square) {
    return Line.onSameLine(this.number, square);
};

function Line(number, blen, wlen, stroke, inverse) {
    this.number = number;
    this.blen = blen || 0;
    this.wlen = wlen || 0;
    this.stroke = stroke || 0;
    this.inverse = inverse || 0;

    if (typeof stroke === 'undefined' && typeof inverse === 'undefined' &&
        typeof blen !== 'undefined' && typeof wlen !== 'undefined') {
        var offset = blen;
        var hand = wlen;
        if (hand === LAYOUT_BLACK) {
            this.blen = 1;
            this.wlen = 0;
        } else {
            this.blen = 0;
            this.wlen = 1;
        }
        var shift = offset << 1;
        this.stroke = 1 << (shift + hand);
        var right = (Line.lineLength(number) - 1) << 1;
        this.inverse = 1 << (right - shift + hand);
    }
}

Line.LEFT_RIGTH = 0;
Line.TOP_DOWN = 1;
Line.LTOP_RDOWN = 2;
Line.RTOP_LDOWN = 3;

Line.lineNumber = function (direction, square) {
    var row = square >> 4;
    var col = square & 0xf;
    switch (direction) {
        case Line.LEFT_RIGTH:
            return (direction << 5) | row;
        case Line.TOP_DOWN:
            return (direction << 5) | col;
        case Line.LTOP_RDOWN:
            return (direction << 5) | (col - row + 15);
        case Line.RTOP_LDOWN:
            return (direction << 5) | (col + row);
        default:
            return 0;
    }
};

Line.onSameLine = function (number, square) {
    return number === Line.lineNumber(number >> 5, square);
};

Line.lineLength = function (number) {
    var direction = number >> 5;
    if (direction === Line.LEFT_RIGTH || direction === Line.TOP_DOWN) {
        return GOMOKU_SIZE;
    } else {
        var i = number & 0x1f;
        return i > 15 ? 31 - i : i + 1;
    }
};

Line.lineOffset = function (direction, square) {
    var col = square & 0xf;
    var row = square >> 4;
    switch (direction) {
        case Line.LEFT_RIGTH:
            return col;
        case Line.TOP_DOWN:
            return row;
        case Line.LTOP_RDOWN:
            var number = Line.lineNumber(direction, square) & 0x1f;
            return Math.min(row, col) - Math.max(0, number - 15);
        case Line.RTOP_LDOWN:
            var number = Line.lineNumber(direction, square) & 0x1f;
            return Math.min(row, 15 - col);
        default:
            return 0;
    }
};

Line.posSquare = function (number, offset) {
    var direction = number >> 5;
    var n = number & 0x1f;
    switch (direction) {
        case Line.LEFT_RIGTH:
            return (n << 4) | offset;
        case Line.TOP_DOWN:
            return (offset << 4) | n;
        case Line.LTOP_RDOWN:
            if (n <= 15) {
                var row = offset + 15 - n;
                var col = offset;
                return (row << 4) | col;
            } else {
                var row = offset;
                var col = offset + n - 15;
                return (row << 4) | col;
            }
        case Line.RTOP_LDOWN:
            if (n <= 15) {
                var row = offset;
                var col = n - offset;
                return (row << 4) | col;
            } else {
                var row = n - 15 + offset;
                var col = 15 - offset;
                return (row << 4) | col;
            }
        default:
            return 0;
    }
};

Line.prototype.putStone = function (offset, hand) {
    var shift = offset << 1;
    var str = (this.stroke & (~(3 << shift))) | (1 << (shift + hand));
    var right = (Line.lineLength(this.number) - 1) << 1;
    var inv = (this.inverse & (~(3 << (right - shift)))) | (1 << (right - shift + hand));
    return hand === LAYOUT_BLACK
        ? new Line(this.number, this.blen + 1, this.wlen, str, inv)
        : new Line(this.number, this.blen, this.wlen + 1, str, inv);
};

Line.prototype.getStone = function (offset) {
    var shift = offset << 1;
    if ((this.stroke & (1 << shift)) > 0) {
        return LAYOUT_WHITE;
    }
    if ((this.stroke & (1 << (shift + 1))) > 0) {
        return LAYOUT_BLACK;
    }
    return -1;
};

Line.prototype.findFigures = function (figures, type) {
    type = type || Pattern.ONE;
    var len = Line.lineLength(this.number);
    var stroke = this.stroke;
    var bl = this.blen;
    var wl = this.wlen;
    var probe = stroke;
    var move = 0;
    while (probe > 0) {

        if ((probe & 2) > 0) {
            Pattern.SOLVER_PATTERNS.forEach(function (patterns) {
                patterns.some(function (pattern) {
                    var offset = move - pattern.move;
                    if (pattern.type <= type
                        && bl >= pattern.moves.length
                        && offset >= 0 && offset + pattern.length <= len
                        && (offset > 0 ? (stroke >> ((offset - 1) << 1)) & 2 : 0) === 0
                        && ((stroke >> ((offset + pattern.length) << 1)) & 2) === 0
                        && ((stroke >> (offset << 1)) & pattern.mask) === pattern.black) {
                        figures.push(new Figure(this.number, offset, LAYOUT_BLACK, pattern));
                        return true;
                    }
                }, this);
            }, this);
            bl--;
        }

        if ((probe & 1) > 0) {
            Pattern.SOLVER_PATTERNS.forEach(function (patterns) {
                patterns.some(function (pattern) {
                    var offset = move - pattern.move;
                    if (pattern.type <= type
                        && wl >= pattern.moves.length
                        && offset >= 0 && offset + pattern.length <= len
                        && (offset > 0 ? (stroke >> ((offset - 1) << 1)) & 1 : 0) === 0
                        && ((stroke >> ((offset + pattern.length) << 1)) & 1) === 0
                        && ((stroke >> (offset << 1)) & pattern.mask) === pattern.white) {
                        figures.push(new Figure(this.number, offset, LAYOUT_WHITE, pattern));
                        return true;
                    }
                }, this);
            }, this);
            wl--;
        }

        probe >>= 2;
        move++;
    }
};

Line.Comparator = function (line1, line2) {
    return line1.number < line2.number ? -1 : line1.number > line2.number ? 1
        : line1.stroke < line2.stroke ? -1 : line1.stroke > line2.stroke ? 1 : 0;
};

function Layout(lines, hand, figures, type, count) {

    if (typeof lines === 'object' && Array.isArray(lines) && !lines.length) {
        this.type = type || Pattern.ONE;
        this.count = 0;
        this.lines = [];
        this.figures = [];
        this.hand = LAYOUT_BLACK;
        return;
    }

    if (typeof lines === 'object' && Array.isArray(lines) && typeof figures === 'object') {
        this.lines = lines;
        this.hand = hand;
        this.figures = figures;
        this.type = type;
        this.count = count;
    } else if (typeof lines === 'object' && Array.isArray(lines)) {
        var moves = lines;
        this.type = hand || Pattern.ONE;

        if (moves && moves.length > 0) {
            this.count = moves.length;
            var h = LAYOUT_BLACK;
            var ls = [];
            moves.forEach(function (move) {
                Layout.putStone(ls, move, h);
                h = h === LAYOUT_BLACK ? LAYOUT_WHITE : LAYOUT_BLACK;
            }, this);
            ls.sort(Line.Comparator);
            this.lines = ls;
            this.hand = h;
            var fs = [];
            this.lines.forEach(function (line) {
                line.findFigures(fs, this.type);
            }, this);
            fs.sort(Figure.Comparator(this.hand));
            this.figures = fs;
        } else {
            this.count = 0;
            this.lines = [];
            this.figures = [];
            this.hand = LAYOUT_BLACK;
        }
    } else {
        this.type = type || Pattern.ONE;
        this.count = 0;
        this.lines = [];
        this.figures = [];
        this.hand = LAYOUT_BLACK;
    }
}

Layout.putStone = function (lines, square, hand) {
    for (var direction = 0; direction < 4; direction++) {
        var number = Line.lineNumber(direction, square);
        var offset = Line.lineOffset(direction, square);
        var i = 0;
        var found = false;
        while (i < lines.length) {
            var line = lines[i];
            if (line.number === number) {
                lines[i] = line.putStone(offset, hand);
                found = true;
                break;
            }
            i++;
        }
        if (!found) {
            lines.push(new Line(number, offset, hand));
        }
    }
};

Layout.prototype.makeMove = function (square) {
    var fs = [];
    this.figures.forEach(function (figure) {
        if (!figure.onSameLine(square)) {
            fs.push(figure);
        }
    }, this);
    var ls = this.addStone(square);
    var h = this.hand === LAYOUT_BLACK ? LAYOUT_WHITE : LAYOUT_BLACK;
    ls.forEach(function (line) {
        if (Line.onSameLine(line.number, square)) {
            line.findFigures(fs, this.type);
        }
    }, this);
    fs.sort(Figure.Comparator(h));
    return new Layout(ls, h, fs, this.type, this.count + 1);
};

Layout.prototype.addStone = function (square) {
    var ls = this.lines.slice(0);
    Layout.putStone(ls, square, this.hand);
    ls.sort(Line.Comparator);
    return ls;
};

Layout.prototype.top = function () {
    if (this.figures.length > 0) {
        return this.figures[0];
    } else {
        return null;
    }
};

Layout.prototype.rate = function () {
    var rating = 0;
    this.figures.forEach(function (figure) {
        if (figure.hand === this.hand) {
            rating = rating + figure.pattern.rating;
        } else {
            rating = rating - figure.pattern.rating;
        }
    }, this);
    return rating;
};

Layout.prototype.gains = function (type) {
    var r = [];
    this.figures.forEach(function (figure) {
        if (figure.hand === this.hand && figure.pattern.type <= type) {
            figure.gains().forEach(function (square) {
                if (r.indexOf(square) === -1)
                    r.push(square);
            });
        }
    }, this);
    return r;
};

Layout.prototype.downs = function (type) {
    var r = [];
    this.figures.forEach(function (figure) {
        if (figure.hand !== this.hand && figure.pattern.type <= type) {
            figure.downs().forEach(function (square) {
                if (r.indexOf(square) === -1)
                    r.push(square);
            });
        }
    }, this);
    return r;
};

Layout.prototype.getStone = function (square) {
    var r = -1;
    if (this.lines.length > 0) {
        var number = square >> 4;
        var i = 0;
        var line = this.lines[0];
        while (line && line.number < 0x20) {
            if (line.number === number) {
                var offset = square & 0xf;
                return line.getStone(offset);
            }
            i++;
            line = this.lines[i];
        }
    }
    return r;
};

const GOMOKU_AI = {
    findBestMove: function(game) {
        const botHand = game.botMark === "X" ? LAYOUT_BLACK : LAYOUT_WHITE;
        const playerHand = game.playerMark === "X" ? LAYOUT_BLACK : LAYOUT_WHITE;
        
        const moves = [];
        for (let i = 0; i < game.board.length; i++) {
            if (game.board[i] !== '.') {
                const hand = game.board[i] === 'X' ? LAYOUT_BLACK : LAYOUT_WHITE;
                moves.push(flatIndexToSquare(i, game.size));
            }
        }

        if (moves.length === 0) {
            return squareToFlatIndex(flatIndexToSquare(Math.floor(GOMOKU_SIZE / 2) * GOMOKU_SIZE + Math.floor(GOMOKU_SIZE / 2)));
        }

        const layout = new Layout(moves);

        const winPatternType = Pattern.FIVE;
        const criticalPatternType = Pattern.OPEN_FOUR;
        const highPriorityPatternType = Pattern.OPEN_THREE;

        let candidateSquares = new Set();
        let immediateWin = false;
        let immediateDefense = false;

        layout.gains(winPatternType).forEach(sq => { candidateSquares.add(sq); immediateWin = true; });
        if (immediateWin) {
            let winMove = candidateSquares.values().next().value;
            return squareToFlatIndex(winMove, game.size);
        }

        layout.downs(winPatternType).forEach(sq => { candidateSquares.add(sq); immediateDefense = true; });

        if (immediateDefense) {
            layout.downs(criticalPatternType).forEach(sq => candidateSquares.add(sq));
        }

        if (candidateSquares.size === 0) {
            layout.gains(highPriorityPatternType).forEach(sq => candidateSquares.add(sq));
            layout.downs(highPriorityPatternType).forEach(sq => candidateSquares.add(sq));
        }

        if (candidateSquares.size === 0) {
             for (let i = 0; i < GOMOKU_SIZE * GOMOKU_SIZE; i++) {
                if (game.board[i] === '.') {
                    candidateSquares.add(flatIndexToSquare(i, game.size));
                }
            }
        }

        let bestScore = -Infinity;
        let bestMoveFlatIndex = -1;
        
        const sortedCandidates = Array.from(candidateSquares).sort((a, b) => {
            let rA = layout.getStone(a);
            let rB = layout.getStone(b);
            if (rA !== -1 || rB !== -1) return 0;
            return Math.abs((a >> 4) - 7.5) + Math.abs((a & 0xf) - 7.5) - (Math.abs((b >> 4) - 7.5) + Math.abs((b & 0xf) - 7.5));
        });

        for (const square of sortedCandidates) {
            if (layout.getStone(square) !== -1) continue;
            
            const simulatedLayout = layout.makeMove(square);
            const score = simulatedLayout.rate();
            
            if (score > bestScore) {
                bestScore = score;
                bestMoveFlatIndex = squareToFlatIndex(square, game.size);
            }

            const topFigure = simulatedLayout.top();
            if (topFigure && topFigure.pattern.type === Pattern.FIVE && topFigure.hand === botHand) {
                return squareToFlatIndex(square, game.size);
            }
        }

        return bestMoveFlatIndex;
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
    let size = GOMOKU_SIZE;
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
