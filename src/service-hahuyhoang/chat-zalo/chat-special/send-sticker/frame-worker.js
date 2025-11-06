import { workerData, parentPort } from 'worker_threads';
import sharp from 'sharp';
import path from 'path';

async function processFrames() {
    const { startFrame, endFrame, size, totalFrames, framesDir, imageBuffer, circleMask, circleBorder } = workerData;
    
    try {
        const expandedSize = Math.ceil(size * 1.5);
        const expandedBuffer = await sharp(imageBuffer)
            .extend({
                top: Math.floor((expandedSize - size) / 2),
                bottom: Math.ceil((expandedSize - size) / 2),
                left: Math.floor((expandedSize - size) / 2),
                right: Math.ceil((expandedSize - size) / 2),
                background: { r: 0, g: 0, b: 0, alpha: 0 }
            })
            .toBuffer();
        
        const centerOffset = Math.floor((expandedSize - size) / 2);
        
        for (let i = startFrame; i < endFrame; i++) {
            const frameFile = path.join(framesDir, `frame_${String(i).padStart(3, '0')}.png`);
            const angle = (i * 360) / totalFrames;
            
            await sharp(expandedBuffer)
                .rotate(angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
                .extract({
                    left: centerOffset,
                    top: centerOffset,
                    width: size,
                    height: size
                })
                .composite([
                    { input: circleMask, blend: 'dest-in' },
                    { input: circleBorder, blend: 'over' }
                ])
                .png({ compressionLevel: 6 })
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
