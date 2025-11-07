import path from 'path'
import process from 'process'
import { spawn } from 'child_process'
import fs from 'fs'
import { fileURLToPath } from 'url'

export const projectRoot = path.resolve(process.cwd())
const args = process.argv.slice(2)
const botId = args[0] || null
const usePM2 = args.length > 0

let cfgPath = null
let botName = 'admin'

if (botId) {
  botName = botId
  cfgPath = path.join(projectRoot, 'mybot', `${botId}.json`)
} else {
  cfgPath = path.join(projectRoot, 'assets', 'config.json')
  botName = 'admin'
}

export { cfgPath, botName }

function validateFiles() {
  if (!fs.existsSync(cfgPath)) {
    console.error(`❌ File config không tồn tại: ${cfgPath}`)
    process.exit(1)
  }
  
  const indexPath = path.join(projectRoot, 'src', 'index.js')
  if (!fs.existsSync(indexPath)) {
    console.error(`❌ File index.js không tồn tại: ${indexPath}`)
    process.exit(1)
  }
  
  return indexPath
}

function checkPM2() {
  return new Promise((resolve) => {
    const pm2Check = spawn('pm2', ['--version'], {
      stdio: 'pipe',
      shell: true,
      timeout: 5000
    })
    
    let hasOutput = false
    
    pm2Check.stdout.on('data', () => {
      hasOutput = true
    })
    
    pm2Check.on('close', (code) => {
      resolve(code === 0 || hasOutput)
    })
    
    pm2Check.on('error', () => {
      resolve(false)
    })
    
    setTimeout(() => {
      try {
        pm2Check.kill()
      } catch {}
      resolve(false)
    }, 5000)
  })
}

function startWithPM2(indexPath) {
  const processName = botId ? `mybot-${botId}` : 'admin-bot'
  
  const pm2Args = [
    'start',
    indexPath,
    '--name', processName,
    '--silent',
    '--no-autorestart'
  ]
  
  const pm2Process = spawn('pm2', pm2Args, {
    stdio: 'inherit',
    shell: true
  })
  
  pm2Process.on('close', (code) => {
    process.exit(code)
  })
  
  pm2Process.on('error', () => {
    process.exit(1)
  })
  
  ;['SIGINT', 'SIGTERM'].forEach(signal => {
    process.on(signal, () => {
      pm2Process.kill(signal)
    })
  })
}

function startDirect(indexPath) {
  const nodeProcess = spawn('node', [indexPath, botId || 'admin'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      BOT_ID: botId || 'admin',
      BOT_NAME: botName,
      CONFIG_PATH: cfgPath,
      PROJECT_ROOT: projectRoot
    }
  })
  
  nodeProcess.on('close', (code) => {
    process.exit(code)
  })
  
  nodeProcess.on('error', () => {
    process.exit(1)
  })
  
  ;['SIGINT', 'SIGTERM'].forEach(signal => {
    process.on(signal, () => {
      nodeProcess.kill(signal)
    })
  })
}

async function main() {
  const indexPath = validateFiles()
  
  if (usePM2) {
    const pm2Available = await checkPM2()
    if (!pm2Available) {
      startDirect(indexPath)
      return
    }
    startWithPM2(indexPath)
  } else {
    startDirect(indexPath)
  }
}

const currentFile = fileURLToPath(import.meta.url)
const scriptFile = process.argv[1]

if (currentFile === scriptFile || path.resolve(currentFile) === path.resolve(scriptFile)) {
  main().catch(() => {
    process.exit(1)
  })
}
