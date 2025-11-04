import path from "path"
import https from "https"
import http from "http"
import { getGlobalPrefix } from "../../../service.js"
import { deleteFile, downloadFileFake } from "../../../../utils/util.js"
import { removeMention } from "../../../../utils/format-util.js"
import { MessageType } from "../../../../api-zalo/index.js"
import { tempDir } from "../../../../utils/io-json.js"
import { appContext } from "../../../../api-zalo/context.js"
import { sendMessageComplete, sendMessageWarning, sendMessageFailed } from "../../chat-style/chat-style.js"
import { execSync } from "child_process"
import { handleSpinDiskSticker } from "./create-webp.js"

function getRedirectUrl(url) {
  return new Promise((resolve) => {
    const protocol = url.startsWith("https") ? https : http
    protocol.get(url, { method: "HEAD" }, (res) => {
      if (res.headers.location) resolve(res.headers.location)
      else resolve(url)
    }).on("error", () => resolve(url))
  })
}

async function getVideoRedirectUrl(url) {
  try {
    const response = await getRedirectUrl(url)
    return response
  } catch (error) {
    console.error("Lỗi khi lấy redirect URL:", error)
    return url
  }
}

async function processStickerVideo(api, message, mediaUrl) {
  const threadId = message.threadId
  let videoPath = null
  let webpPath = null

  try {
    const redirectUrl = await getVideoRedirectUrl(mediaUrl)
    videoPath = path.join(tempDir, `sticker_video_${Date.now()}.mp4`)
    webpPath = path.join(tempDir, `sticker_webp_${Date.now()}.webp`)
    await downloadFileFake(redirectUrl, videoPath)
    execSync(`ffmpeg -y -i "${videoPath}" -c:v libwebp -q:v 80 "${webpPath}"`, { stdio: 'pipe' })
    const webpUpload = await api.uploadAttachment([webpPath], threadId, appContext.send2meId, MessageType.DirectMessage)
    const webpUrl = webpUpload?.[0]?.fileUrl
    if (!webpUrl) throw new Error("Upload video attachment thất bại")
    const staticUrl = webpUrl + "?creator=VXK-Service-BOT.webp"
    const animUrl = webpUrl + "?createdBy=VXK-Service-BOT.Webp"
    return { staticUrl, animUrl }
  } catch (error) {
    console.error("Lỗi khi xử lý sticker video:", error)
    throw error
  } finally {
    if (videoPath) await deleteFile(videoPath)
    if (webpPath) await deleteFile(webpPath)
  }
}

async function processStickerImage(api, message, mediaUrl) {
  const threadId = message.threadId
  let imagePath = null
  let convertedWebpPath = null

  try {
    let downloadUrl = mediaUrl
    let fileExt = "jpg"
    if (mediaUrl.endsWith(".jxl")) {
      downloadUrl = mediaUrl.replace("/jxl/", "/jpg/").replace(".jxl", ".jpg")
      fileExt = "jpg"
    } else {
      const urlObj = new URL(mediaUrl)
      const urlExt = path.extname(urlObj.pathname)
      if (urlExt) fileExt = urlExt.slice(1)
    }
    imagePath = path.join(tempDir, `sticker_image_${Date.now()}.${fileExt}`)
    convertedWebpPath = path.join(tempDir, `sticker_converted_${Date.now()}.webp`)
    await downloadFileFake(downloadUrl, imagePath)
    execSync(`ffmpeg -y -i "${imagePath}" -c:v libwebp -q:v 80 "${convertedWebpPath}"`, { stdio: 'pipe' })
    const webpUpload = await api.uploadAttachment([convertedWebpPath], threadId, appContext.send2meId, MessageType.DirectMessage)
    const webpUrl = webpUpload?.[0]?.fileUrl
    if (!webpUrl) throw new Error("Upload image attachment thất bại")
    return webpUrl
  } catch (error) {
    console.error("Lỗi khi xử lý sticker image:", error)
    throw error
  } finally {
    if (imagePath) await deleteFile(imagePath)
    if (convertedWebpPath) await deleteFile(convertedWebpPath)
  }
}

export async function handleStickerCommand(api, message) {
  const quote = message.data?.quote
  const senderName = message.data.dName
  const prefix = getGlobalPrefix()
  const msgContent = removeMention(message)
  const isSpinDisk = msgContent.includes("spindisk")

  if (!quote) {
    const cmdType = isSpinDisk ? "sticker spindisk" : "sticker"
    await sendMessageWarning(api, message, `${senderName}, Hãy reply vào tin nhắn chứa ảnh hoặc video cần tạo sticker và dùng lại lệnh ${prefix}${cmdType}.`, true)
    return
  }

  const cliMsgType = message.data?.quote?.cliMsgType
  const validTypes = isSpinDisk ? [32, 49] : [44, 32, 49]
  
  if (!validTypes.includes(cliMsgType)) {
    const typeMsg = isSpinDisk 
      ? "Vui lòng reply vào tin nhắn có ảnh để tạo sticker spindisk!"
      : "Vui lòng reply vào tin nhắn có ảnh, video hoặc GIF để tạo sticker!"
    await sendMessageWarning(api, message, `${senderName}, ${typeMsg}`, true)
    return
  }

  const attach = quote.attach
  if (!attach) {
    await sendMessageWarning(api, message, `${senderName}, Không có đính kèm nào trong nội dung reply của bạn.`, true)
    return
  }

  try {
    let attachData
    try {
      attachData = typeof attach === 'string' ? JSON.parse(attach) : attach
    } catch {
      attachData = attach
    }

    const mediaUrl = attachData.hdUrl || attachData.href
    if (!mediaUrl) {
      await sendMessageWarning(api, message, `${senderName}, Không tìm thấy URL trong đính kèm của tin nhắn bạn đã reply.`, true)
      return
    }

    const decodedUrl = decodeURIComponent(mediaUrl.replace(/\\\//g, "/"))

    if (isSpinDisk) {
      const idImage = Date.now()
      await sendMessageWarning(api, message, `Đang tạo sticker spindisk cho ${senderName}, vui lòng chờ một chút!`, true)
      const result = await handleSpinDiskSticker(api, message, decodedUrl, idImage)

      if (result) {
        const staticUrl = result.url + "?creator=VXK-Service-BOT.webp"
        const animUrl = result.url + "?createdBy=VXK-Service-BOT.Webp"
        await api.sendCustomSticker(message, staticUrl, animUrl, 512, 512)
        await sendMessageComplete(api, message, `Sticker spindisk của bạn đây!`, true)
      } else {
        await sendMessageFailed(api, message, `${senderName}, Tạo sticker spindisk thất bại!`, true)
      }
    } else {
      const params = attachData.params || {}
      const duration = params.duration || 0
      if (cliMsgType === 44 && duration > 5000) {
        await sendMessageWarning(api, message, `${senderName}, Sticker video chỉ được phép dài tối đa 5 giây!`, true)
        return
      }

      const width = params.width || 512
      const height = params.height || 512
      await sendMessageWarning(api, message, `Đang tạo sticker cho ${senderName}, vui lòng chờ một chút!`, true)

      let staticUrl, animUrl
      if (cliMsgType === 44) {
        const result = await processStickerVideo(api, message, decodedUrl)
        staticUrl = result.staticUrl
        animUrl = result.animUrl
      } else {
        const webpUrl = await processStickerImage(api, message, decodedUrl)
        staticUrl = webpUrl + "?creator=VXK-Service-BOT.webp"
        animUrl = webpUrl + "?createdBy=VXK-Service-BOT.Webp"
      }

      await api.sendCustomSticker(message, staticUrl, animUrl, width, height)
      await sendMessageComplete(api, message, `Sticker của bạn đây!`, true)
    }
  } catch (error) {
    console.error("Lỗi khi xử lý lệnh sticker:", error)
    await sendMessageFailed(api, message, `${senderName}, Lỗi khi xử lý lệnh sticker: ${error.message}`, true)
  }
}
