import { spawn } from "child_process";
import simpleGit from "simple-git";
import { ensureLogFiles, logManagerBot } from "./src/utils/io-json.js";

const GITHUB_TOKEN = "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";
const COMMIT_INTERVAL = 5 * 60 * 1000;

let botProcess;
const git = simpleGit();

async function setupGit() {
  try {
    await git.addConfig("user.email", "action@github.com");
    await git.addConfig("user.name", "GitHub Action");
    
    const remotes = await git.getRemotes(true);
    const origin = remotes.find(r => r.name === "origin");
    
    if (origin) {
      const authUrl = origin.refs.fetch.replace("https://", `https://${GITHUB_TOKEN}@`);
      await git.remote(["set-url", "origin", authUrl]);
    }
  } catch (err) {
    logManagerBot(`Git setup failed: ${err.message}`);
    console.error("Git setup failed:", err.message);
  }
}

async function autoCommit() {
  try {
    const excludePatterns = [
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

    await git.add(".");
    
    for (const pattern of excludePatterns) {
      try {
        await git.reset(["HEAD", "--", pattern]);
      } catch (e) {}
    }

    const status = await git.status();
    
    if (status.staged.length === 0 && status.files.length === 0) {
      console.log("No changes to commit");
      return;
    }

    const timestamp = new Date().toISOString();
    await git.commit(`Auto commit: ${timestamp}`);

    try {
      await git.push("origin", "main");
      console.log("Auto commit & push done");
      logManagerBot("Auto commit & push done");
    } catch (err) {
      if (err.message.includes("rejected") || err.message.includes("fetch first")) {
        console.log("Push rejected, pulling and retrying...");
        await git.fetch("origin", "main");
        await git.rebase(["origin/main"]);
        await git.push("origin", "main", ["--force-with-lease"]);
        console.log("Auto commit after rebase done");
        logManagerBot("Auto commit after rebase done");
      } else {
        throw err;
      }
    }
  } catch (err) {
    console.error("Auto commit failed:", err.message);
    logManagerBot(`Auto commit failed: ${err.message}`);
  }
}

function startBot() {
  botProcess = spawn("node", ["src/index.js"], {
    detached: true,
    stdio: "inherit"
  });

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

async function main() {
  ensureLogFiles();
  await setupGit();
  
  startBot();

  await autoCommit();
  
  setInterval(autoCommit, COMMIT_INTERVAL);

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
