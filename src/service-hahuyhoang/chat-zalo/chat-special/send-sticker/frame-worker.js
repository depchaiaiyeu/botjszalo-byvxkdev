import { workerData, parentPort } from 'worker_threads';
import sharp from 'sharp';
import path from 'path';

async function processFrames() {
    const { startFrame, endFrame, size, totalFrames, framesDir, imageBuffer, circleMask, circleBorder } = workerData;
    
    // Tính trước kích thước sau khi xoay (đường chéo hình vuông)
    const rotatedSize = Math.ceil(size * Math.sqrt(2));
    const offset = Math.floor((rotatedSize - size) / 2);
    
    try {
        for (let i = startFrame; i < endFrame; i++) {
            const frameFile = path.join(framesDir, `frame_${String(i).padStart(3, '0')}.png`);
            const angle = (i * 360) / totalFrames;
            
            await sharp(imageBuffer)
                .rotate(angle, { 
                    background: { r: 0, g: 0, b: 0, alpha: 0 }
                })
                .extract({
                    left: offset,
                    top: offset,
                    width: size,
                    height: size
                })
                .composite([
                    {
                        input: circleMask,
                        blend: 'dest-in'
                    },
                    {
                        input: circleBorder,
                        blend: 'over'
                    }
                ])
                .png() // Đảm bảo output là PNG
                .toFile(frameFile);
        }
        
        parentPort.postMessage('done');
    } catch (error) {
        throw error;
    }
}

processFrames().catch(error => {
    console.error('Worker error:', error);
    process.exit(1);
});
