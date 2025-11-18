const { workerData, parentPort } = require('worker_threads');
const youtubedl = require('youtube-dl-exec');

const { videoUrl, videoPath, format } = workerData;

(async () => {
  try {
    await youtubedl(videoUrl, {
      format: format,
      output: videoPath,
      noWarnings: true,
      noCallHome: true,
      noCheckCertificate: true,
      preferFreeFormats: true,
      youtubeSkipDashManifest: true,
      addHeader: ['referer:youtube.com', 'user-agent:googlebot']
    });
    parentPort.postMessage({ success: true, videoPath });
  } catch (error) {
    parentPort.postMessage({ success: false, error: error.message });
  }
})();
