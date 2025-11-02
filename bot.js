import { spawn, exec } from "child_process";
import path from "path";
import { ensureLogFiles, logManagerBot } from "./src/utils/io-json.js";

const GITHUB_TOKEN = "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";
let botProcess;

function runCommand(command, cwd = process.cwd()) {
  return new Promise((resolve, reject) => {
    exec(command, { cwd, maxBuffer: 1024 * 1024 * 50 }, (error, stdout, stderr) => {
      if (error) return reject(new Error(stderr || error.message));
      resolve(stdout || stderr);
    });
  });
}

async function autoCommit() {
  try {
    const repoPath = path.resolve(process.cwd());
    
    await runCommand('git config --global user.email "action@github.com"', repoPath);
    await runCommand('git config --global user.name "GitHub Action"', repoPath);
    
    const remoteUrl = await runCommand("git config --get remote.origin.url", repoPath);
    const authenticatedUrl = remoteUrl.trim().replace("https://", `https://${GITHUB_TOKEN}@`);
    await runCommand(`git remote set-url origin ${authenticatedUrl}`, repoPath);
    
    const excludeList = [
      "node_modules",
      "package-lock.json",
      "logs/message.json",
      "logs/message.txt",
      "*.txt",
      "*.log",
      "*.cache",
      "*.zip",
      "*.rar",
      ".gitignore",
      "temp/*"
    ];
    
    const excludeArgs = excludeList.map(x => `:(exclude)${x}`).join(" ");
    await runCommand(`git add . ${excludeArgs}`, repoPath);
    
    const diff = await runCommand("git diff --staged --quiet || echo changed", repoPath);
    if (!diff.includes("changed")) {
      console.log("No changes to commit");
      return;
    }
    
    const timestamp = new Date().toISOString();
    await runCommand(`git commit -m "Auto commit: ${timestamp}"`, repoPath);
    
    try {
      await runCommand("git push", repoPath);
      console.log("Auto commit & push done");
      logManagerBot("Auto commit & push done");
    } catch (err) {
      if (err.message.includes("fetch first") || err.message.includes("rejected")) {
        console.log("Push rejected, pulling latest changes...");
        await runCommand("git fetch origin main", repoPath);
        await runCommand("git rebase origin/main", repoPath);
        await runCommand("git push --force-with-lease", repoPath);
        console.log("Auto commit after rebase done");
        logManagerBot("Auto commit after rebase done");
      } else {
        throw err;
      }
    }
  } catch (e) {
    console.error("Auto commit failed:", e.message);
    logManagerBot(`Auto commit failed: ${e.message}`);
  }
}

function startBot() {
  botProcess = spawn("node", ["src/index.js"], {
    detached: true,
    stdio: "inherit"
  });
  
  attachBotEvents(botProcess);
  botProcess.unref();
  
  logManagerBot("Bot started");
  console.log("Bot started");
}

function stopBot() {
  if (botProcess && botProcess.pid) {
    try {
      process.kill(-botProcess.pid, "SIGTERM");
      logManagerBot("Bot stopped");
      console.log("Bot stopped");
    } catch (err) {
      logManagerBot(`Failed to stop bot: ${err.message}`);
      console.log("Failed to stop bot:", err.message);
    }
  } else {
    logManagerBot("Failed to stop bot: invalid PID");
    console.log("Failed to stop bot: invalid PID");
  }
}

function restartBot() {
  stopBot();
  setTimeout(() => {
    startBot();
    logManagerBot("Bot restarted");
    console.log("Bot restarted");
  }, 2000);
}

function attachBotEvents(botProcess) {
  botProcess.on("error", (err) => {
    logManagerBot(`Bot error: ${err.message}`);
    console.error("Bot error:", err.message);
    restartBot();
  });
  
  botProcess.on("exit", (code, signal) => {
    logManagerBot(`Bot exited with code: ${code}, signal: ${signal}`);
    console.log(`Bot exited with code: ${code}, signal: ${signal}`);
    if (code !== 0 && code !== null) {
      restartBot();
    }
  });
}

async function main() {
  ensureLogFiles();
  startBot();
  
  setInterval(autoCommit, 5 * 60 * 1000);
  
  process.on("SIGINT", () => {
    console.log("Received SIGINT, restarting bot...");
    restartBot();
  });
  
  process.on("SIGTERM", () => {
    console.log("Received SIGTERM, restarting bot...");
    restartBot();
  });
  
  process.on("exit", () => {
    console.log("Process exiting, attempting to restart bot...");
    setTimeout(startBot, 1000);
  });
}

main();
