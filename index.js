import path from 'path';
import process from 'process';
import { spawn } from 'child_process';
import fs from 'fs';
import { fileURLToPath } from 'url';

export const projectRoot = path.resolve(process.cwd());
const args = process.argv;
const botName = args[2] || 'admin';
const runWithPM2 = args.length > 2;
export const cfgPath = path.join(projectRoot, 'mybot', 'bots', `${botName}.json`);

function validateFiles() {
    if (!fs.existsSync(cfgPath)) {
        process.exit(1);
    }
    const indexPath = path.join(projectRoot, 'src', 'index.js');
    if (!fs.existsSync(indexPath)) {
        process.exit(1);
    }
    return indexPath;
}

function checkPM2() {
    return new Promise((resolve) => {
        const pm2Command = 'pm2';
        const pm2Check = spawn(pm2Command, ['--version'], { 
            stdio: 'pipe',
            shell: true,
        });
        let hasOutput = false;
        pm2Check.stdout.on('data', () => {
            hasOutput = true;
        });
        pm2Check.on('close', (code) => {
            resolve(code === 0 || hasOutput);
        });
        pm2Check.on('error', () => {
            resolve(false);
        });
        setTimeout(() => {
            pm2Check.kill();
            resolve(false);
        }, 5000);
    });
}

function startWithPM2(indexPath) {
    const pm2Command = 'pm2';
    const pm2Args = [
        'start', 
        indexPath,
        '--name', botName,
        '--silent',
        '--no-autorestart',
    ];
    const pm2Process = spawn(pm2Command, pm2Args, {
        stdio: 'inherit',
        shell: true,
        env: {
            ...process.env,
            BOT_NAME: botName,
            CONFIG_PATH: cfgPath,
            PROJECT_ROOT: projectRoot,
            NODE_ENV: 'production',
            PM2_HOME: process.env.PM2_HOME || path.join(process.env.USERPROFILE || process.env.HOME, '.pm2')
        }
    });
    pm2Process.on('close', (code) => {
        process.exit(code);
    });
    pm2Process.on('error', () => {
        process.exit(1);
    });
    ['SIGINT', 'SIGTERM'].forEach(signal => {
        process.on(signal, () => {
            pm2Process.kill(signal);
        });
    });
}

function startDirect(indexPath) {
    const nodeProcess = spawn('node', [indexPath], {
        stdio: 'inherit',
        env: {
            ...process.env,
            BOT_NAME: botName,
            CONFIG_PATH: cfgPath,
            PROJECT_ROOT: projectRoot
        }
    });
    nodeProcess.on('close', (code) => {
        process.exit(code);
    });
    nodeProcess.on('error', () => {
        process.exit(1);
    });
    ['SIGINT', 'SIGTERM'].forEach(signal => {
        process.on(signal, () => {
            nodeProcess.kill(signal);
        });
    });
}

async function main() {
    const indexPath = validateFiles();
    if (runWithPM2) {
        const pm2Available = await checkPM2();
        if (!pm2Available) {
            startDirect(indexPath);
            return;
        }
        startWithPM2(indexPath);
    } else {
        startDirect(indexPath);
    }
}

const currentFile = fileURLToPath(import.meta.url);
const scriptFile = process.argv[1];

if (currentFile === scriptFile || path.resolve(currentFile) === path.resolve(scriptFile)) {
    main().catch(() => {
        process.exit(1);
    });
}
