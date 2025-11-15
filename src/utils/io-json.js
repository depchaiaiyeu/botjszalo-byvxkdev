import fs from "fs"
import path from "path"
import chalk from "chalk"
import { mkdir } from "fs/promises"
import { getTimeToString, getTimeNow } from "./format-util.js"

export const botId = process.argv[2] || 'main'
const isMainBot = botId === 'main'

console.log(chalk.cyan(`Bot ID: ${botId}`))

let botInfo = {
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

if (!isMainBot) {
  const subBotPath = path.resolve("./mybot", `${botId}.json`)
  console.log(chalk.yellow(`Tải dữ liệu bot con với ID: ${botId}`))

  if (fs.existsSync(subBotPath)) {
    try {
      const subBotData = JSON.parse(fs.readFileSync(subBotPath, "utf-8"))
      botInfo = {
        adminFilePath: path.resolve("./mybot/data/list_admin_" + botId + ".json"),
        groupSettingsPath: path.resolve("./mybot/data/group_settings_" + botId + ".json"),
        configFilePath: path.resolve("./mybot/data/config_" + botId + ".json"),
        commandFilePath: path.resolve("./mybot/json-data/command.json"),
        logDir: path.resolve("./logs", botId),
        resourceDir: path.resolve("./resources", botId),
        tempDir: path.resolve("./temp", botId),
        dataGifPath: path.resolve("./assets/gif"),
        DATA_GAME_FILE_PATH: path.resolve("./assets/data/game.json"),
        WEB_CONFIG_PATH: path.resolve("./mybot/json-data/web-config_" + botId + ".json"),
        MANAGER_FILE_PATH: path.resolve("./mybot/json-data/manager-bot_" + botId + ".json"),
        PROPHYLACTIC_CONFIG_PATH: path.resolve("./mybot/json-data/prophylactic_" + botId + ".json"),
        subBotId: botId,
        subBotConfig: subBotData,
        mainBotConfigPath: path.resolve("./assets/config.json"),
        mainCommandPath: path.resolve("./assets/json-data/command.json")
      }
    } catch (error) {
      console.error(chalk.red(`❌ Lỗi khi đọc bot con ${botId}: ${error.message}`))
      process.exit(1)
    }
  } else {
    console.error(chalk.red(`❌ Bot con ${botId} không tồn tại`))
    process.exit(1)
  }
} else {
  console.log(chalk.green(`Tải dữ liệu bot chính...`))
}

const adminFilePath = botInfo.adminFilePath
const groupSettingsPath = botInfo.groupSettingsPath
const configFilePath = botInfo.configFilePath
const commandFilePath = botInfo.commandFilePath
const logDir = botInfo.logDir
export const resourceDir = botInfo.resourceDir
export const tempDir = botInfo.tempDir
export const dataGifPath = botInfo.dataGifPath
const logManagerBotFilePath = path.join(logDir, "bot-manager.log")
const loggingMessageFilePath = path.join(logDir, "message.txt")
const loggingMessageJsonPath = path.join(logDir, "message.json")
const dataGamePath = botInfo.DATA_GAME_FILE_PATH

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
    const config = JSON.parse(data)

    if (!isMainBot && Object.keys(config).length === 0 && botInfo.mainBotConfigPath) {
      try {
        const mainData = fs.readFileSync(botInfo.mainBotConfigPath, "utf-8");
        const mainConfig = JSON.parse(mainData);
        return mainConfig
      } catch (err) {
        console.error("Lỗi đọc config bot chính:", err)
        return config
      }
    }

    return config
  } catch (error) {
    console.error("Lỗi đọc tệp config.json:", error)
    return {}
  }
}

export function readAdmins() {
  try {
    const data = fs.readFileSync(adminFilePath, "utf-8")
    const admins = JSON.parse(data)
    return admins
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
    const settings = JSON.parse(data)
    return settings
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
    let commandPath = commandFilePath
    
    if (!isMainBot && botInfo.mainCommandPath) {
      if (!fs.existsSync(commandFilePath)) {
        commandPath = botInfo.mainCommandPath
        const mainData = fs.readFileSync(commandPath, "utf-8")
        const mainConfig = JSON.parse(mainData)
        
        if (mainConfig.prefix) {
          mainConfig.prefix = "."
        }
        
        const subBotDir = path.dirname(commandFilePath)
        mkdirRecursive(subBotDir)
        fs.writeFileSync(commandFilePath, JSON.stringify(mainConfig, null, 2))
        console.log(chalk.green(`✅ Đã khởi tạo command cho bot con thành công`))
        
        return mainConfig
      }
    }

    const data = fs.readFileSync(commandPath, "utf-8")
    const config = JSON.parse(data)

    if (config.prefix && config.prefix !== ".") {
      config.prefix = "."
      fs.writeFileSync(commandPath, JSON.stringify(config, null, 2))
    }

    return config
  } catch (error) {
    console.error(`Lỗi khi đọc file command.json:`, error)
    return { commands: [], prefix: "." }
  }
}

export function writeCommandConfig(config) {
  try {
    if (config.prefix && config.prefix !== ".") {
      config.prefix = "."
    }
    fs.writeFileSync(commandFilePath, JSON.stringify(config, null, 2))
  } catch (error) {
    console.error(`Lỗi khi ghi file command.json:`, error)
  }
}

const WEB_CONFIG_PATH = botInfo.WEB_CONFIG_PATH
export function readWebConfig() {
  try {
    const data = fs.readFileSync(WEB_CONFIG_PATH, "utf-8")
    const config = JSON.parse(data)
    return config
  } catch (error) {
    console.error("Lỗi khi đọc file web-config.json:", error)
    return {}
  }
}

export function writeWebConfig(config) {
  fs.writeFileSync(WEB_CONFIG_PATH, JSON.stringify(config, null, 2))
}

const MANAGER_FILE_PATH = botInfo.MANAGER_FILE_PATH
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

const PROPHYLACTIC_CONFIG_PATH = botInfo.PROPHYLACTIC_CONFIG_PATH
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

export function getSubBotConfig() {
  if (!isMainBot && botInfo.subBotConfig) {
    return botInfo.subBotConfig
  }
  return null
}

export function isSubBotInstance() {
  return !isMainBot
}

export function isBotMain() {
  return isMainBot
}

export function getBotId() {
  return botId
}
