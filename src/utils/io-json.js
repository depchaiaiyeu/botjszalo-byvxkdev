import fs from "fs"
import path from "path"
import chalk from "chalk"
import { mkdir } from "fs/promises"
import { getBotInfo } from "./env.js"
import { getTimeToString, getTimeNow } from "./format-util.js"

let botInfo = await getBotInfo()
let isFallback = false

if (!botInfo) {
  isFallback = true
  botInfo = {
    adminFilePath: path.resolve("./assets/data/list_admin.json"),
    groupSettingsPath: path.resolve("./assets/data/group_settings.json"),
    configFilePath: path.resolve("./assets/config.json"),
    commandFilePath: path.resolve("./assets/json-data/command.json"),
    logDir: path.resolve("./logs"),
    resourceDir: path.resolve("./resources"),
    tempDir: path.resolve("./temp"),
    dataGifPath: path.resolve("./assets/gif"),
    DATA_GAME_FILE_PATH: path.resolve("./assets/data/game.json"),
    WEB_CONFIG_PATH: path.resolve("./assets/json-data/web-config.json"),
    MANAGER_FILE_PATH: path.resolve("./assets/json-data/manager-bot.json"),
    PROPHYLACTIC_CONFIG_PATH: path.resolve("./assets/json-data/prophylactic.json")
  }
}

const adminFilePath = botInfo.adminFilePath || path.resolve("./assets/data/list_admin.json")
const groupSettingsPath = botInfo.groupSettingsPath || path.resolve("./assets/data/group_settings.json")
const configFilePath = botInfo.configFilePath || path.resolve("./assets/config.json")
const commandFilePath = botInfo.commandFilePath || path.resolve("./assets/json-data/command.json")
const logDir = botInfo.logDir || path.resolve("./logs")
export const resourceDir = botInfo.resourceDir || path.resolve("./resources")
export const tempDir = botInfo.tempDir || path.resolve("./temp")
export const dataGifPath = botInfo.dataGifPath || path.resolve("./assets/gif")
const logManagerBotFilePath = path.join(logDir, "bot-manager.log")
const loggingMessageFilePath = path.join(logDir, "message.txt")
const loggingMessageJsonPath = path.join(logDir, "message.json")
const dataGamePath = botInfo.DATA_GAME_FILE_PATH || path.resolve("./assets/data/game.json")

export async function ensureLogFiles() {
  try {
    await mkdir(logDir, { recursive: true })
    await mkdir(resourceDir, { recursive: true })
    await mkdir(tempDir, { recursive: true })
    await mkdir(dataGifPath, { recursive: true })
    if (!fs.existsSync(logManagerBotFilePath)) fs.writeFileSync(logManagerBotFilePath, "")
    if (!fs.existsSync(loggingMessageFilePath)) fs.writeFileSync(loggingMessageFilePath, "")
    if (!fs.existsSync(loggingMessageJsonPath)) fs.writeFileSync(loggingMessageJsonPath, "{}")
    if (!fs.existsSync(dataGamePath)) fs.writeFileSync(dataGamePath, "{}")
  } catch (err) {
    console.error("Lỗi khi tạo thư mục hoặc file log:", err)
  }
}

export function mkdirRecursive(dirPath) {
  if (fs.existsSync(dirPath)) return
  try {
    fs.mkdirSync(dirPath, { recursive: true })
  } catch (err) {
    if (err.code !== "EEXIST") throw err
  }
}

export function readConfig() {
  try {
    const data = fs.readFileSync(configFilePath, "utf-8")
    return JSON.parse(data)
  } catch (error) {
    console.error("Lỗi đọc tệp config.json:", error)
    return {}
  }
}

export function readAdmins() {
  try {
    const data = fs.readFileSync(adminFilePath, "utf-8")
    return JSON.parse(data)
  } catch (error) {
    console.error("Lỗi đọc tệp admin:", error)
    return []
  }
}

export function logManagerBot(message) {
  const timestamp = getTimeToString(getTimeNow())
  const logEntry = `${timestamp} - ${message}\n`
  fs.appendFileSync(logManagerBotFilePath, logEntry)
}

export function logMessageToFile(data, type = "message") {
  const timestamp = getTimeToString(getTimeNow())
  const logData = `${data}\n`
  fs.appendFileSync(loggingMessageFilePath, logData + "\n", "utf8")
  if (type === "group") console.log(chalk.yellowBright.bold(`[${timestamp}]\n`), chalk.yellowBright(logData))
  else console.log(chalk.blueBright.bold(`[${timestamp}]\n`), chalk.blueBright(logData))
}

export function readGroupSettings() {
  try {
    const data = fs.readFileSync(groupSettingsPath, "utf-8")
    return JSON.parse(data)
  } catch (error) {
    console.error("Lỗi khi đọc file group_settings.json:", error)
    return {}
  }
}

export function writeGroupSettings(settings) {
  try {
    fs.writeFileSync(groupSettingsPath, JSON.stringify(settings, null, 2), "utf-8")
  } catch (error) {
    console.error("Lỗi khi ghi file group_settings.json:", error)
  }
}

export function readCommandConfig() {
  try {
    const data = fs.readFileSync(commandFilePath, "utf-8")
    return JSON.parse(data)
  } catch (error) {
    console.error("Lỗi khi đọc file command.json:", error)
    return { commands: [] }
  }
}

export function writeCommandConfig(config) {
  try {
    fs.writeFileSync(commandFilePath, JSON.stringify(config, null, 2))
  } catch (error) {
    console.error("Lỗi khi ghi file command.json:", error)
  }
}

const WEB_CONFIG_PATH = botInfo.WEB_CONFIG_PATH || path.resolve("./assets/json-data/web-config.json")
export function readWebConfig() {
  try {
    const data = fs.readFileSync(WEB_CONFIG_PATH, "utf-8")
    return JSON.parse(data)
  } catch (error) {
    console.error("Lỗi khi đọc file web-config.json:", error)
    return {}
  }
}

export function writeWebConfig(config) {
  fs.writeFileSync(WEB_CONFIG_PATH, JSON.stringify(config, null, 2))
}

const MANAGER_FILE_PATH = botInfo.MANAGER_FILE_PATH || path.resolve("./assets/json-data/manager-bot.json")
export function readManagerFile() {
  try {
    const data = fs.readFileSync(MANAGER_FILE_PATH, "utf8")
    let parsedData = JSON.parse(data)
    if (!parsedData) parsedData = {}
    return parsedData
  } catch (error) {
    if (error.code === "ENOENT") return {}
    console.error("Lỗi khi đọc file block:", error)
    return {}
  }
}

export function writeManagerFile(data) {
  fs.writeFileSync(MANAGER_FILE_PATH, JSON.stringify(data, null, 2))
}

export function pushMessageToWebLog(io, nameType, senderName, content, avtGroup) {
  if (io) {
    const messageData = { nameType, senderName, content, avtGroup }
    io.emit("newMessage", messageData)
  }
}

const PROPHYLACTIC_CONFIG_PATH = botInfo.PROPHYLACTIC_CONFIG_PATH || path.resolve("./assets/json-data/prophylactic.json")
export function readProphylacticConfig() {
  try {
    const data = fs.readFileSync(PROPHYLACTIC_CONFIG_PATH, "utf8")
    const parsedData = JSON.parse(data)
    return parsedData
  } catch (error) {
    console.error("Lỗi khi đọc file prophylactic.json:", error)
    return {
      prophylacticUploadAttachment: {
        enable: false,
        lastBlocked: "",
        numRequestZalo: 0
      }
    }
  }
}

export function writeProphylacticConfig(data) {
  try {
    fs.writeFileSync(PROPHYLACTIC_CONFIG_PATH, JSON.stringify(data, null, 2))
  } catch (error) {
    console.error("Lỗi khi ghi file prophylactic.json:", error)
  }
}
