import speedTest from 'speedtest-net';
import { sendMessageCompleteRequest, sendMessageTag } from '../chat-zalo/chat-style/chat-style.js';
import fs from 'fs';
import path from 'path';
import { createCanvas, loadImage } from "canvas";
import * as cv from "../../utils/canvas/index.js";
import { deleteFile, loadImageBuffer } from '../../utils/util.js';
import { formatDate } from '../../utils/format-util.js';

const TIME_TO_LIVE_MESSAGE = 600000;
const TEST_DURATION = 20000;

const linkLogoISP = {
	"VNPT": "https://i.postimg.cc/QNW1vP4x/Chat-GPT-Image-20-12-45-30-thg-6-2025.png",
	"FPT Telecom": "https://i.postimg.cc/QNW1vP4x/Chat-GPT-Image-20-12-45-30-thg-6-2025.png",
	"Viettel": "https://i.postimg.cc/QNW1vP4x/Chat-GPT-Image-20-12-45-30-thg-6-2025.png",
	"CMC Telecom": "https://i.postimg.cc/QNW1vP4x/Chat-GPT-Image-20-12-45-30-thg-6-2025.png",
	"Google Cloud": "https://i.postimg.cc/QNW1vP4x/Chat-GPT-Image-20-12-45-30-thg-6-2025.png"
}

const linkCoverIPS = {
	"VNPT": "https://i.postimg.cc/QNW1vP4x/Chat-GPT-Image-20-12-45-30-thg-6-2025.png",
	"FPT Telecom": "https://i.postimg.cc/QNW1vP4x/Chat-GPT-Image-20-12-45-30-thg-6-2025.png",
	"Viettel": "https://i.postimg.cc/QNW1vP4x/Chat-GPT-Image-20-12-45-30-thg-6-2025.png",
	"CMC Telecom": "https://i.postimg.cc/QNW1vP4x/Chat-GPT-Image-20-12-45-30-thg-6-2025.png",
	"Google Cloud": "https://i.postimg.cc/9MYVJ0wg/avt.jpg"
}

let isTestingSpeed = false;
let currentTester = {
	id: null,
	threadId: null,
	name: null
};
let otherThreadRequester = {};

/**
 * Đánh giá tốc độ mạng (MB/s)
 */
function evaluateSpeed(speed) {
	if (speed < 0.625) return "Rất chậm 🐌"; // 5 Mbps = 0.625 MB/s
	if (speed < 1.25) return "Chậm 😢";      // 10 Mbps = 1.25 MB/s
	if (speed < 3.75) return "Trung bình 🙂"; // 30 Mbps = 3.75 MB/s
	if (speed < 6.25) return "Khá tốt 👍";    // 50 Mbps = 6.25 MB/s
	if (speed < 12.5) return "Tốt 🚀";        // 100 Mbps = 12.5 MB/s
	return "Rất tốt 🏃‍♂️";
}

/**
 * Tạo card hiển thị kết quả speedtest
 */
export async function createSpeedTestImage(result) {
	const width = 1000;
	const height = 430;
	const canvas = createCanvas(width, height);
	const ctx = canvas.getContext("2d");

	try {
		const ispName = result.isp;
		if (linkCoverIPS[ispName]) {
			const coverBuffer = await loadImageBuffer(linkCoverIPS[ispName]);
			const cover = await loadImage(coverBuffer);

			const scale = Math.max(
				width / cover.width,
				height / cover.height
			);

			const coverWidth = cover.width * scale;
			const coverHeight = cover.height * scale;

			ctx.drawImage(
				cover,
				(width - coverWidth) / 2,
				(height - coverHeight) / 2,
				coverWidth,
				coverHeight
			);

			ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
			ctx.fillRect(0, 0, width, height);
		} else {
			const backgroundGradient = ctx.createLinearGradient(0, 0, 0, height);
			backgroundGradient.addColorStop(0, "#3B82F6");
			backgroundGradient.addColorStop(1, "#111827");
			ctx.fillStyle = '#000000';
			ctx.fillRect(0, 0, width, height);
		}
	} catch (error) {
		console.error("Lỗi khi vẽ background:", error);
		const backgroundGradient = ctx.createLinearGradient(0, 0, 0, height);
		backgroundGradient.addColorStop(0, "#3B82F6");
		backgroundGradient.addColorStop(1, "#111827");
		ctx.fillStyle = '#000000';
		ctx.fillRect(0, 0, width, height);
	}

	let xLogo = 170;
	let widthLogo = 180;
	let heightLogo = 180;
	let yLogo = 100;

	const borderWidth = 10;
	const gradient = ctx.createLinearGradient(
		xLogo - widthLogo / 2 - borderWidth,
		yLogo - borderWidth,
		xLogo + widthLogo / 2 + borderWidth,
		yLogo + heightLogo + borderWidth
	);

	const rainbowColors = [
		"#FF0000", "#FF7F00", "#FFFF00", "#00FF00",
		"#0000FF", "#4B0082", "#9400D3"
	];
	const shuffledColors = [...rainbowColors].sort(() => Math.random() - 0.5);
	shuffledColors.forEach((color, index) => {
		gradient.addColorStop(index / (shuffledColors.length - 1), color);
	});

	ctx.save();
	ctx.beginPath();
	ctx.arc(
		xLogo,
		yLogo + heightLogo / 2,
		widthLogo / 2 + borderWidth,
		0,
		Math.PI * 2,
		true
	);
	ctx.fillStyle = gradient;
	ctx.fill();

	ctx.beginPath();
	ctx.arc(
		xLogo,
		yLogo + heightLogo / 2,
		widthLogo / 2,
		0,
		Math.PI * 2,
		true
	);
	ctx.fillStyle = "#FFFFFF";
	ctx.fill();

	ctx.restore();

	try {
		const ispName = result.isp;
		if (linkLogoISP[ispName]) {
			const imageBuffer = await loadImageBuffer(linkLogoISP[ispName]);
			const image = await loadImage(imageBuffer);

			ctx.save();
			ctx.beginPath();
			ctx.arc(
				xLogo,
				yLogo + heightLogo / 2,
				widthLogo / 2,
				0,
				Math.PI * 2,
				true
			);
			ctx.clip();

			const scale = Math.min(
				(widthLogo * 0.8) / image.width,
				(heightLogo * 0.8) / image.height
			);

			const logoWidth = image.width * scale;
			const logoHeight = image.height * scale;

			ctx.drawImage(
				image,
				xLogo - logoWidth / 2,
				yLogo + heightLogo / 2 - logoHeight / 2,
				logoWidth,
				logoHeight
			);
			ctx.restore();
		}
	} catch (error) {
		console.error("Lỗi khi vẽ logo ISP:", error);
	}

	const [nameLine1, nameLine2] = cv.hanldeNameUser(result.isp);
	ctx.font = "bold 32px Tahoma";
	ctx.fillStyle = "#FFFFFF";
	ctx.textAlign = "center";
	const nameY = yLogo + heightLogo + 54
	if (nameLine2) {
		ctx.font = "bold 24px Tahoma";
		ctx.fillText(nameLine1, xLogo, nameY);
		ctx.font = "bold 24px Tahoma";
		ctx.fillText(nameLine2, xLogo, nameY + 28);
	} else {
		ctx.fillText(nameLine1, xLogo, nameY);
	}

	let y1 = 60;
	ctx.textAlign = "center";
	ctx.font = "bold 48px BeVietnamPro";
	ctx.fillStyle = cv.getRandomGradient(ctx, width);
	ctx.fillText("Kết Quả SpeedTest", width / 2, y1);

	const infoStartX = xLogo + widthLogo / 2 + 86;
	let y = y1 + 60;

	const downloadSpeed = (result.download.bandwidth / 1000000).toFixed(2);
	const uploadSpeed = (result.upload.bandwidth / 1000000).toFixed(2);
	const ping = Math.round(result.ping.latency);

	const fields = [
		{ label: "📥 Download", value: `${downloadSpeed} MB/s (${evaluateSpeed(downloadSpeed)})` },
		{ label: "📤 Upload", value: `${uploadSpeed} MB/s (${evaluateSpeed(uploadSpeed)})` },
		{ label: "🏓 Ping", value: `${ping}ms ${result.packetLoss ? `| ${result.packetLoss} Package Loss` : ""}` },
		{ label: "🌍 Server", value: `${result.server.location} (${result.server.country})` },
		{ label: "🖥️ VPN", value: `${result.interface.isVpn ? "Mạng thuộc VPN" : "Mạng Không thuộc VPN"}` },
		{ label: "🕰️ Thời gian", value: `${formatDate(new Date(result.timestamp))}` },
	];

	ctx.textAlign = "left";
	ctx.font = "bold 28px BeVietnamPro";
	for (const field of fields) {
		ctx.fillStyle = cv.getRandomGradient(ctx, width);
		const labelText = field.label + ":";
		const labelWidth = ctx.measureText(labelText).width;
		ctx.fillText(labelText, infoStartX, y);
		ctx.fillStyle = "#FFFFFF";
		ctx.fillText(" " + field.value, infoStartX + labelWidth, y);
		y += 52;
	}

	const filePath = path.resolve(`./assets/temp/speedtest_${Date.now()}.png`);
	const out = fs.createWriteStream(filePath);
	const stream = canvas.createPNGStream();
	stream.pipe(out);
	return new Promise((resolve, reject) => {
		out.on("finish", () => resolve(filePath));
		out.on("error", reject);
	});
}

/**
 * Xử lý lệnh kiểm tra tốc độ mạng
 */
export async function handleSpeedTestCommand(api, message) {
	const senderId = message.data.uidFrom;
	const senderName = message.data.dName;
	const threadId = message.threadId;

	if (isTestingSpeed) {
		await sendMessageCompleteRequest(api, message, {
			caption: `Hiện tại bot đang thực hiện kiểm tra tốc độ mạng theo yêu cầu của ${currentTester.name}. Vui lòng đợi kết quả.`,
		}, 30000);
		if (threadId !== currentTester.threadId && !otherThreadRequester[threadId]) {
			otherThreadRequester[threadId] = {
				name: senderName,
				id: senderId,
				type: message.type
			};
		}
		return;
	}

	let imagePath = null;

	try {
		isTestingSpeed = true;
		currentTester = {
			id: senderId,
			name: senderName,
			threadId: threadId
		};

		await sendMessageCompleteRequest(api, message, {
			caption: `Vui lòng đợi bot kiểm tra tốc độ mạng...`,
		}, TEST_DURATION);

		const result = await speedTest({
			acceptLicense: true,
			acceptGdpr: true
		});

		imagePath = await createSpeedTestImage(result);

		await sendMessageTag(api, message, {
			caption: `Đây là kết quả kiểm tra tốc độ mạng của bot!`,
			imagePath
		}, TIME_TO_LIVE_MESSAGE);

		for (const threadId in otherThreadRequester) {
			if (threadId !== currentTester.threadId) {
				await sendMessageTag(api, {
					threadId,
					type: otherThreadRequester[threadId].type,
					data: {
						uidFrom: otherThreadRequester[threadId].id,
						dName: otherThreadRequester[threadId].name
					}
				}, {
					caption: `Đây là kết quả kiểm tra tốc độ mạng của bot!`,
					imagePath
				}, TIME_TO_LIVE_MESSAGE);
			}
		}

	} catch (error) {
		console.error('Lỗi khi test tốc độ mạng:', error);

		await sendMessageCompleteRequest(api, message, {
			caption: `Đã xảy ra lỗi khi kiểm tra tốc độ mạng. Vui lòng thử lại sau.`
		}, 30000);
	} finally {
		isTestingSpeed = false;
		currentTester = {
			id: null,
			name: null,
			threadId: null
		};
		otherThreadRequester = {};
		deleteFile(imagePath);
	}
}
