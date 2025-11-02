import { spawn } from "child_process"
import git from "isomorphic-git"
import http from "isomorphic-git/http/node"
import fs from "fs"
import path from "path"
import { ensureLogFiles, logManagerBot } from "./src/utils/io-json.js"

const GITHUB_TOKEN = "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"
const COMMIT_INTERVAL = 5 * 60 * 1000
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
  const gitDir = path.join(dir, ".git")
  if (!fs.existsSync(gitDir)) {
    fs.mkdirSync(gitDir, { recursive: true })
    fs.mkdirSync(path.join(gitDir, "refs", "heads"), { recursive: true })
    fs.mkdirSync(path.join(gitDir, "objects"), { recursive: true })
    fs.writeFileSync(path.join(gitDir, "HEAD"), "ref: refs/heads/main")
    const config = `[core]
  repositoryformatversion = 0
  filemode = true
  bare = false
  logallrefupdates = true
[remote "origin"]
  url = https://github.com/<user>/<repo>.git
  fetch = +refs/heads/*:refs/remotes/origin/*
[branch "main"]
  remote = origin
  merge = refs/heads/main`
    fs.writeFileSync(path.join(gitDir, "config"), config)
    console.log(".git created with remote origin")
  } else {
    const remotes = await git.listRemotes({ fs, dir })
    if (!remotes.find(r => r.remote === "origin")) {
      await git.addRemote({
        fs,
        dir,
        remote: "origin",
        url: "https://github.com/<user>/<repo>.git"
      })
    }
  }
}

async function getRepoUrl() {
  try {
    const remotes = await git.listRemotes({ fs, dir })
    const origin = remotes.find(r => r.remote === "origin")
    if (origin) return origin.url.replace("https://", `https://${GITHUB_TOKEN}@`)
  } catch (err) {}
  return null
}

async function autoCommit() {
  try {
    const repoUrl = await getRepoUrl()
    if (!repoUrl) {
      console.log("No remote origin found")
      return
    }
    const status = await git.statusMatrix({ fs, dir })
    const filesToAdd = status
      .filter(([filepath, , worktreeStatus]) => worktreeStatus !== 0 && !shouldExclude(filepath))
      .map(([filepath]) => filepath)
    if (filesToAdd.length === 0) {
      console.log("No changes to commit")
      return
    }
    for (const filepath of filesToAdd) await git.add({ fs, dir, filepath })
    const timestamp = new Date().toISOString()
    await git.commit({
      fs,
      dir,
      author: { name: "GitHub Action", email: "action@github.com" },
      message: `Auto commit: ${timestamp}`
    })
    try {
      await git.push({
        fs,
        http,
        dir,
        remote: "origin",
        ref: "main",
        onAuth: () => ({ username: GITHUB_TOKEN })
      })
      console.log("Auto commit & push done")
      logManagerBot("Auto commit & push done")
    } catch (err) {
      if (err.data?.statusCode === 422 || err.message.includes("rejected")) {
        console.log("Push rejected, pulling and retrying...")
        await git.fetch({
          fs,
          http,
          dir,
          remote: "origin",
          ref: "main",
          onAuth: () => ({ username: GITHUB_TOKEN })
        })
        await git.merge({
          fs,
          dir,
          ours: "main",
          theirs: "origin/main",
          author: { name: "GitHub Action", email: "action@github.com" }
        })
        await git.push({
          fs,
          http,
          dir,
          remote: "origin",
          ref: "main",
          force: true,
          onAuth: () => ({ username: GITHUB_TOKEN })
        })
        console.log("Auto commit after merge done")
        logManagerBot("Auto commit after merge done")
      } else {
        throw err
      }
    }
  } catch (err) {
    console.error("Auto commit failed:", err.message)
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
