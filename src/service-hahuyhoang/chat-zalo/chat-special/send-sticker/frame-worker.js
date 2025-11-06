import { workerData, parentPort } from 'worker_threads';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

async function processFrames() {
  const { startFrame, endFrame, size, totalFrames, framesDir, imageBuffer, circleMask, circleBorder } = workerData;
  try {
    for (let i = startFrame; i < endFrame; i++) {
      const frameFile = path.join(framesDir, `frame_${String(i).padStart(3, '0')}.png`);
      const angle = (360 / totalFrames) * i;
      const frameBuffer = await sharp(imageBuffer)
        .rotate(angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .composite([
          { input: circleMask, blend: 'dest-in' },
          { input: circleBorder, blend: 'over' }
        ])
        .png()
        .toBuffer();

      await fs.promises.writeFile(frameFile, frameBuffer);
    }

    parentPort.postMessage('done');
  } catch (error) {
    console.error('Worker error:', error);
    process.exit(1);
  }
}

processFrames();
