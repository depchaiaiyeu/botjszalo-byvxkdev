import { createCanvas, loadImage } from 'canvas';
import fs from 'fs';
import path from 'path';
import { tempDir } from '../io-json.js';

export async function createStickerGridImage(stickers) {
    const cols = 5;
    const rows = Math.ceil(stickers.length / cols);
    const cellWidth = 150;
    const cellHeight = 180;
    const padding = 10;
    const canvasWidth = cols * cellWidth + padding * 2;
    const canvasHeight = rows * cellHeight + padding * 2;

    const canvas = createCanvas(canvasWidth, canvasHeight);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    for (let i = 0; i < stickers.length; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = col * cellWidth + padding;
        const y = row * cellHeight + padding;

        ctx.fillStyle = '#2a2a2a';
        ctx.fillRect(x, y, cellWidth - padding, cellHeight - padding);

        ctx.strokeStyle = '#3a3a3a';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, cellWidth - padding, cellHeight - padding);

        try {
            const img = await loadImage(stickers[i].preview || stickers[i].url);
            const imgSize = 120;
            const imgX = x + (cellWidth - padding - imgSize) / 2;
            const imgY = y + 10;
            ctx.drawImage(img, imgX, imgY, imgSize, imgSize);
        } catch (error) {
            console.error(`Lỗi load ảnh sticker ${i + 1}:`, error);
        }

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`ID: ${i + 1}`, x + (cellWidth - padding) / 2, y + cellHeight - padding - 15);
    }

    const outputPath = path.join(tempDir, `sticker_grid_${Date.now()}.png`);
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(outputPath, buffer);

    return outputPath;
}
