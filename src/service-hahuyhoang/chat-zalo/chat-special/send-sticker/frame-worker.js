import { workerData, parentPort } from 'worker_threads';
import sharp from 'sharp';
import path from 'path';

function easeInOutSine(x) {
    return -(Math.cos(Math.PI * x) - 1) / 2;
}

async function processFrames() {
    const { startFrame, endFrame, size, totalFrames, framesDir, imageBuffer, circleMask, circleBorder } = workerData;
    try {
        for (let i = startFrame; i < endFrame; i++) {
            const frameFile = path.join(framesDir, `frame_${String(i).padStart(3, '0')}.png`);
            
            const progress = i / totalFrames;
            const easedProgress = easeInOutSine(progress);
            const angle = easedProgress * 360;
            
            const radians = angle * Math.PI / 180;
            const rotatedSize = Math.ceil(
                Math.abs(size * Math.cos(radians)) + Math.abs(size * Math.sin(radians))
            );
            const offset = Math.floor((rotatedSize - size) / 2);
            
            await sharp(imageBuffer)
                .rotate(angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
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
                .png()
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
