import ffmpeg from 'fluent-ffmpeg';
import path from "path";
import { tempDir } from "../../../../utils/io-json.js";
import { getVideoMetadata } from "../../../../api-zalo/utils.js";
import { checkExstentionFileRemote, deleteFile, downloadFileFake } from "../../../../utils/util.js";
import fs from 'fs';
import sharp from 'sharp';
import { sendMessageWarningRequest } from '../../chat-style/chat-style.js';
import { Worker } from 'worker_threads';
import os from 'os';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function deleteDirectory(dirPath) {
  try {
    await fs.promises.rm(dirPath, { recursive: true, force: true });
    console.log(`[Sticker] ✅ Xóa folder: ${dirPath}`);
  } catch (error) {
    console.error(`[Sticker] ⚠️ Lỗi xóa folder ${dirPath}:`, error.message);
  }
}

export async function createCircleWebp(api, message, imageUrl, idImage, rate = null) {
    const frameRate = rate || 30;
    const ext = await checkExstentionFileRemote(imageUrl);
    const downloadedImage = path.join(tempDir, `original_${idImage}.${ext}`);
    const framesDir = path.join(tempDir, `frames_${idImage}`);
    const outputWebp = path.join(tempDir, `circle_${idImage}.webp`);
    
    try {
        await downloadFileFake(imageUrl, downloadedImage);
        const size = 512;
        const borderWidth = 8;
        const totalFrames = 120;
        const numWorkers = Math.min(os.cpus().length, totalFrames);
        const framesPerWorker = Math.ceil(totalFrames / numWorkers);

        const resizedImageBuffer = await sharp(downloadedImage)
            .resize(size, size, {
                fit: 'cover',
                position: 'center'
            })
            .toBuffer();

        if (!fs.existsSync(framesDir)) {
            await fs.promises.mkdir(framesDir, { recursive: true });
        }

        const circleMask = Buffer.from(`
    <svg width="${size}" height="${size}">
        <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - borderWidth}" fill="white"/>
    </svg>
`);
        const circleBorder = Buffer.from(`
    <svg width="${size}" height="${size}">
        <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - borderWidth / 2}" fill="none" stroke="#90EE90" stroke-width="${borderWidth}"/>
    </svg>
`);

        const workers = [];
        const workerPath = path.join(__dirname, 'frame-worker.js');
        
        for (let i = 0; i < numWorkers; i++) {
            const startFrame = i * framesPerWorker;
            const endFrame = Math.min(startFrame + framesPerWorker, totalFrames);
            
            const worker = new Worker(workerPath, {
                workerData: {
                    startFrame,
                    endFrame,
                    size,
                    totalFrames,
                    framesDir,
                    imageBuffer: resizedImageBuffer,
                    circleMask,
                    circleBorder
                }
            });

            workers.push(new Promise((resolve, reject) => {
                worker.on('message', resolve);
                worker.on('error', reject);
                worker.on('exit', (code) => {
                    if (code !== 0) {
                        reject(new Error(`Worker stopped with exit code ${code}`));
                    }
                });
            }));
        }

        await Promise.all(workers);

        const framePattern = path.join(framesDir, 'frame_%03d.png');
        await convertToWebpMulti(framePattern, outputWebp, frameRate);

        const [linkUploadZalo, stickerData] = await Promise.all([
            api.uploadAttachment([outputWebp], message.threadId, message.type),
            getVideoMetadata(outputWebp)
        ]);

        const finalUrl = linkUploadZalo[0].fileUrl || linkUploadZalo[0].normalUrl;
        
        return {
            path: outputWebp,
            url: finalUrl,
            stickerData: stickerData
        };
    } catch (error) {
        console.error("[Sticker] ❌ Lỗi khi tạo Webp:", error);
        throw error;
    } finally {
        console.log(`[Sticker] 🧹 Dọn dẹp file tạm...`);
        
        try {
          await deleteFile(downloadedImage);
        } catch (err) {
          console.error(`[Sticker] ⚠️ Lỗi xóa file ${downloadedImage}:`, err.message);
        }
        
        try {
          await deleteDirectory(framesDir);
        } catch (err) {
          console.error(`[Sticker] ⚠️ Lỗi xóa folder ${framesDir}:`, err.message);
        }
        
        try {
          await deleteFile(outputWebp);
        } catch (err) {
          console.error(`[Sticker] ⚠️ Lỗi xóa file ${outputWebp}:`, err.message);
        }
    }
}

export async function convertToWebpMulti(inputPath, outputPath, frameRate = 30) {
    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .inputOptions([
                '-framerate', String(frameRate)
            ])
            .outputOptions([
                '-c:v', 'libwebp',
                '-lossless', '1',
                '-compression_level', '6',
                '-q:v', '95',
                '-loop', '0',
                '-preset', 'picture',
                '-cpu-used', '5',
                '-deadline', 'realtime',
                '-threads', 'auto',
            ])
            .save(outputPath)
            .on('end', () => {
                resolve(true);
            })
            .on('error', (err) => {
                console.error('Lỗi khi chuyển đổi sang WebP:', err.message);
                reject(false);
            });
    });
}

export async function createImageWebp(api, message, imageUrl, idImage) {
    const ext = await checkExstentionFileRemote(imageUrl);
    const downloadedImage = path.join(tempDir, `original_${idImage}.${ext}`);
    const outputWebp = path.join(tempDir, `circle_${idImage}.webp`);
    try {
        await downloadFileFake(imageUrl, downloadedImage);
        
        const size = 512;
        const circleMask = Buffer.from(`
            <svg width="${size}" height="${size}">
                <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white"/>
            </svg>
        `);

        const imageBuffer = await fs.promises.readFile(downloadedImage);
        await sharp(imageBuffer)
            .resize(size, size, {
                fit: 'cover',
                position: 'center'
            })
            .composite([{
                input: circleMask,
                blend: 'dest-in'
            }])
            .toFile(outputWebp);

        const [linkUploadZalo, stickerData] = await Promise.all([
            api.uploadAttachment([outputWebp], message.threadId, message.type),
            getVideoMetadata(outputWebp)
        ]);

        const finalUrl = linkUploadZalo[0].fileUrl || linkUploadZalo[0].normalUrl;

        return {
            path: outputWebp,
            url: finalUrl,
            stickerData: stickerData
        };
    } catch (error) {
        console.error("Lỗi khi tạo Webp:", error);
        const object = {
            caption: `Đã xảy ra lỗi khi xử lý hình ảnh!`,
        };
        await sendMessageWarningRequest(api, message, object, 30000);
        return null;
    } finally {
        await deleteFile(downloadedImage);
        await deleteFile(outputWebp);
    }
}

export async function convertToWebp(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .outputOptions([
                '-vf', 'scale=512:-2:flags=fast_bilinear',
                '-c:v', 'libwebp',
                '-lossless', '0',
                '-compression_level', '6',
                '-q:v', '60',
                '-loop', '0',
                '-preset', 'default',
                '-cpu-used', '4',
                '-deadline', 'realtime',
                '-threads', 'auto',
                '-an',
                '-vsync', '0'
            ])
            .save(outputPath)
            .on('end', () => {
                resolve(true);
            })
            .on('error', (err) => {
                console.error('Lỗi khi chuyển đổi sang WebP:', err.message);
                reject(false);
            });
    });
}
export async function convertStickerToSticker(api, message, stickerUrl, idSticker) {
    const ext = await checkExstentionFileRemote(stickerUrl);
    if (ext.toLowerCase() !== 'webp') {
        console.error("Đầu vào phải là file WebP");
        const object = {
            caption: `Hình ảnh đầu vào phải là định dạng WebP!`,
        };
        await sendMessageWarningRequest(api, message, object, 30000);
        return null;
    }

    const downloadedSticker = path.join(tempDir, `original_sticker_${idSticker}.webp`);
    const outputWebp = path.join(tempDir, `new_sticker_${idSticker}.webp`);

    try {
        // Tải sticker WebP về
        await downloadFileFake(stickerUrl, downloadedSticker);

        // Kích thước chuẩn cho sticker
        const size = 512;

        // Tạo mask hình tròn
        const circleMask = Buffer.from(`
            <svg width="${size}" height="${size}">
                <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white"/>
            </svg>
        `);

        // Xử lý sticker: thay đổi kích thước và áp dụng mask hình tròn
        const imageBuffer = await fs.promises.readFile(downloadedSticker);
        await sharp(imageBuffer)
            .resize(size, size, {
                fit: 'cover',
                position: 'center'
            })
            .composite([{
                input: circleMask,
                blend: 'dest-in'
            }])
            .toFile(outputWebp);

        // Upload sticker mới lên Zalo
        const [linkUploadZalo, stickerData] = await Promise.all([
            api.uploadAttachment([outputWebp], message.threadId, message.type),
            getVideoMetadata(outputWebp)
        ]);

        const finalUrl = linkUploadZalo[0].fileUrl || linkUploadZalo[0].normalUrl;

        return {
            path: outputWebp,
            url: finalUrl,
            stickerData: stickerData
        };
    } catch (error) {
        console.error("Lỗi khi chuyển đổi sticker:", error);
        const object = {
            caption: `Đã xảy ra lỗi khi xử lý sticker!`,
        };
        await sendMessageWarningRequest(api, message, object, 30000);
        return null;
    } finally {
        // Xóa các file tạm
        await deleteFile(downloadedSticker);
        await deleteFile(outputWebp);
    }
}
export async function createAnimatedSticker(api, message, mediaUrl, idSticker) {
  const ext = await checkExstentionFileRemote(mediaUrl);
  const downloadedMedia = path.join(tempDir, `original_${idSticker}.${ext}`);
  const framesDir = path.join(tempDir, `frames_${idSticker}`);
  const outputWebp = path.join(tempDir, `animated_sticker_${idSticker}.webp`);
  
  try {
    console.log(`Đang xử lý sticker động từ: ${mediaUrl}`);
    await downloadFileFake(mediaUrl, downloadedMedia);
    const stats = await fs.promises.stat(downloadedMedia);
    if (!stats.size) {
      throw new Error(`Tệp media tải xuống rỗng hoặc không hợp lệ: ${downloadedMedia}`);
    }
    console.log(`Đã tải media về: ${downloadedMedia}, kích thước: ${stats.size} bytes`);

    // Kiểm tra metadata
    const metadata = await new Promise((resolve, reject) => {
      ffmpeg.ffprobe(downloadedMedia, (err, metadata) => {
        if (err) reject(new Error(`Không thể đọc metadata của tệp: ${err.message}`));
        else resolve(metadata);
      });
    });
    const videoStream = metadata.streams.find(stream => stream.codec_type === 'video');
    if (!videoStream) {
      throw new Error(`Tệp media không chứa luồng video: ${downloadedMedia}`);
    }
    console.log(`Định dạng media: ${metadata.format.format_name}, độ dài: ${metadata.format.duration || 'N/A'} giây, codec: ${videoStream.codec_name}`);

    const size = 512;
    if (!fs.existsSync(framesDir)) {
      await fs.promises.mkdir(framesDir, { recursive: true });
      await fs.promises.access(framesDir, fs.constants.W_OK);
      console.log(`Thư mục khung hình có quyền ghi: ${framesDir}`);
    }

    const circleMask = Buffer.from(`
      <svg width="${size}" height="${size}">
        <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white"/>
      </svg>
    `);

    console.log("Đang trích xuất khung hình...");
    await new Promise((resolve, reject) => {
      ffmpeg(downloadedMedia)
        .inputOptions(['-c:v', 'libx264'])
        .outputOptions([
          '-vf', `scale=${size}:-2:flags=fast_bilinear`,
          '-vsync', '0',
          '-f', 'image2',
          '-frames:v', '50' // Giới hạn 50 khung hình để thử nghiệm
        ])
        .save(path.join(framesDir, 'frame_%03d.png'))
        .on('end', () => {
          console.log("Trích xuất khung hình hoàn tất");
          resolve();
        })
        .on('error', (err) => {
          console.error("Lỗi trích xuất khung hình:", err.message);
          reject(new Error(`Trích xuất khung hình thất bại: ${err.message}`));
        });
    });

    const frameFiles = await fs.promises.readdir(framesDir);
    if (frameFiles.length === 0) {
      throw new Error(`Không có khung hình nào được trích xuất từ tệp media: ${downloadedMedia}`);
    }
    console.log(`Đã trích xuất ${frameFiles.length} khung hình vào ${framesDir}`);

    console.log("Đang áp dụng mask tròn cho các khung hình...");
    for (const frame of frameFiles) {
      const framePath = path.join(framesDir, frame);
      const outputFrame = path.join(framesDir, `masked_${frame}`);
      await sharp(framePath)
        .composite([{ input: circleMask, blend: 'dest-in' }])
        .toFile(outputFrame);
      await fs.promises.rename(outputFrame, framePath);
      console.log(`Đã áp dụng mask cho khung hình: ${framePath}`);
    }

    console.log("Đang chuyển đổi sang WebP...");
    const framePattern = path.join(framesDir, 'frame_%03d.png');
    await convertToWebpMulti(framePattern, outputWebp);

    const [linkUploadZalo, stickerData] = await Promise.all([
      api.uploadAttachment([outputWebp], message.threadId, message.type),
      getVideoMetadata(outputWebp)
    ]);

    const finalUrl = linkUploadZalo[0].fileUrl || linkUploadZalo[0].normalUrl;
    console.log(`Sticker động được tạo tại: ${finalUrl}`);

    return {
      path: outputWebp,
      url: finalUrl,
      stickerData: stickerData
    };
  } catch (error) {
    console.error("Lỗi khi tạo sticker động:", error);
    const object = {
      caption: `Đã xảy ra lỗi khi xử lý sticker động: ${error.message}`,
    };
    await sendMessageWarningRequest(api, message, object, 30000);
    return null;
  } finally {
    await deleteFile(downloadedMedia);
    await fs.promises.rm(framesDir, { recursive: true, force: true });
    await deleteFile(outputWebp);
  }
}
