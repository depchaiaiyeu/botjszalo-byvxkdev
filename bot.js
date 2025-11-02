import { spawn } from "child_process"
import fs from "fs"
import path from "path"
import { logManagerBot, ensureLogFiles } from "./src/utils/io-json.js"
import esgit from "es-git"

const { Repository, Signature, Status } = esgit

const GITHUB_REPO = "depchaiaiyeu/botjszalo-byvxkdev"
const GITHUB_TOKEN = process.env.GITHUB_TOKEN
const COMMIT_INTERVAL = 5 * 60 * 1000 // 5 phút
const dir = process.cwd()
let botProcess

const excludePatterns = [
  "node_modules",
  "package-lock.json",
  "logs/message.json",
  "logs/message.txt",
  ".git",
  ".txt",
  ".log",
  ".cache",
  ".zip",
  ".rar",
  ".gitignore",
  "temp/"
]

function shouldExclude(filepath) {
  return excludePatterns.some(pattern => {
    if (pattern.startsWith(".") && pattern.length < 6) return filepath.endsWith(pattern)
    if (pattern.endsWith("/")) return filepath.startsWith(pattern.slice(0, -1))
    return filepath.includes(pattern)
  })
}

async function ensureGitRepo() {
  if (!fs.existsSync(path.join(dir, ".git"))) {
    const repo = await Repository.init(dir)
    const remoteUrl = `https://github.com/${GITHUB_REPO}.git`
    await repo.remoteAdd("origin", remoteUrl)
  }
}

async function getRepo() {
  return await Repository.open(dir)
}

async function autoCommit() {
  try {
    if (!GITHUB_TOKEN) {
      console.log("No GITHUB_TOKEN")
      return
    }

    const repo = await getRepo()
    const statuses = await repo.getStatus()
    const filesToAdd = Object.keys(statuses).filter(f => !shouldExclude(f) && statuses[f] !== Status.Current)

    if (filesToAdd.length === 0) {
      console.log("No changes to commit")
      return
    }

    for (const f of filesToAdd) {
      await repo.add(f)
    }

    const author = Signature.now("GitHub Action", "action@github.com")
    const message = `Auto commit: ${new Date().toISOString()}`
    await repo.commit(message, author, author)

    const remote = await repo.getRemote("origin")
    await remote.push("refs/heads/main", { username: GITHUB_TOKEN })

    console.log("✅ Auto commit & push done")
    logManagerBot("Auto commit & push done")

  } catch (err) {
    console.error("❌ Auto commit failed:", err.message)
    logManagerBot(`Auto commit failed: ${err.message}`)
  }
}

function startBot() {
  botProcess = spawn("node", ["src/index.js"], { detached: true, stdio: "inherit" })

  botProcess.on("error", err => {
    logManagerBot(`Bot error: ${err.message}`)
    console.error("Bot error:", err.message)
    restartBot()
  })

  botProcess.on("exit", (code, signal) => {
    logManagerBot(`Bot exited with code: ${code}, signal: ${signal}`)
    console.log(`Bot exited with code: ${code}, signal: ${signal}`)
    if (code !== 0 && code !== null) restartBot()
  })

  botProcess.unref()
  logManagerBot("Bot started")
  console.log("Bot started")
}

function stopBot() {
  if (botProcess && botProcess.pid) {
    try {
      process.kill(-botProcess.pid, "SIGTERM")
      logManagerBot("Bot stopped")
      console.log("Bot stopped")
    } catch (err) {
      logManagerBot(`Failed to stop bot: ${err.message}`)
      console.log("Failed to stop bot:", err.message)
    }
  }
}

function restartBot() {
  stopBot()
  setTimeout(() => {
    startBot()
    logManagerBot("Bot restarted")
    console.log("Bot restarted")
  }, 2000)
}

async function main() {
  if (!GITHUB_TOKEN) {
    console.error("❌ Missing GIT_TOKEN environment variable")
    return
  }
  ensureLogFiles()
  await ensureGitRepo()
  startBot()
  await autoCommit()
  setInterval(autoCommit, COMMIT_INTERVAL)

  process.on("SIGINT", () => {
    console.log("Received SIGINT, restarting bot...")
    restartBot()
  })
  process.on("SIGTERM", () => {
    console.log("Received SIGTERM, restarting bot...")
    restartBot()
  })
  process.on("exit", () => {
    console.log("Process exiting, attempting to restart bot...")
    setTimeout(startBot, 1000)
  })
}

main()
