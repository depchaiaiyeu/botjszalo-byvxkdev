import path from "path";
import process from "process";
import fs from "fs";
let _botName = null;
let _cfgPath = null;
let _projectRoot = null;
function debugEnv() {
  console.log("=== ENVIRONMENT DEBUG ===");
  console.log("process.argv:", process.argv);
  console.log("process.env.BOT_NAME:", process.env.BOT_NAME);
  console.log("process.env.CONFIG_PATH:", process.env.CONFIG_PATH);
  console.log("process.env.PROJECT_ROOT:", process.env.PROJECT_ROOT);
  console.log("process.cwd():", process.cwd());
  console.log("=========================");
}
export function getBotName() {
  if (_botName === null) {
    _botName = process.env.BOT_NAME;
    if (!_botName) {
      const args = process.argv;
      _botName = args[2] || "admin";
      console.warn(`BOT_NAME không có trong env, sử dụng fallback: ${_botName}`);
    }
  }
  return _botName;
}
export function getProjectRoot() {
  if (_projectRoot === null) {
    _projectRoot = process.env.PROJECT_ROOT;
    if (!_projectRoot) {
      _projectRoot = path.resolve(process.cwd());
      console.warn(`PROJECT_ROOT không có trong env, sử dụng fallback: ${_projectRoot}`);
    }
  }
  return _projectRoot;
}
export function getCfgPath() {
  if (_cfgPath === null) {
    _cfgPath = process.env.CONFIG_PATH;
    if (!_cfgPath) {
      const botName = getBotName();
      const projectRoot = getProjectRoot();
      _cfgPath = path.join(projectRoot, "mybot", "bots", `${botName}.json`);
      console.warn(`CONFIG_PATH không có trong env, sử dụng fallback: ${_cfgPath}`);
    }
  }
  return _cfgPath;
}
export function getConfig() {
  return {
    botName: getBotName(),
    cfgPath: getCfgPath(),
    projectRoot: getProjectRoot()
  };
}
export function validateConfigFile() {
  const cfgPath = getCfgPath();
  if (!fs.existsSync(cfgPath)) {
    console.error(`Config file không tồn tại: ${cfgPath}`);
    return false;
  }
  try {
    const configContent = fs.readFileSync(cfgPath, "utf8");
    JSON.parse(configContent);
    return true;
  } catch (error) {
    console.error(`Config file không hợp lệ: ${cfgPath}`, error.message);
    return false;
  }
}
export function validateEnv(showDebug = false) {
  if (showDebug) {
    debugEnv();
  }
  try {
    const config = getConfig();
    if (!validateConfigFile()) {
      return false;
    }
    return true;
  } catch (error) {
    console.error("Environment validation failed:", error.message);
    if (showDebug) {
      debugEnv();
    }
    return false;
  }
}
export function loadConfig() {
  const cfgPath = getCfgPath();
  try {
    const configContent = fs.readFileSync(cfgPath, "utf8");
    const config = JSON.parse(configContent);
    config._meta = {
      botName: getBotName(),
      configPath: cfgPath,
      projectRoot: getProjectRoot(),
      loadedAt: new Date().toISOString()
    };
    return config;
  } catch (error) {
    console.error(`Lỗi load config từ ${cfgPath}:`, error.message);
    throw error;
  }
}
export function resetCache() {
  _botName = null;
  _cfgPath = null;
  _projectRoot = null;
}
export function setEnvVars(envVars) {
  if (envVars.BOT_NAME) process.env.BOT_NAME = envVars.BOT_NAME;
  if (envVars.CONFIG_PATH) process.env.CONFIG_PATH = envVars.CONFIG_PATH;
  if (envVars.PROJECT_ROOT) process.env.PROJECT_ROOT = envVars.PROJECT_ROOT;
  resetCache();
}
export async function getBotInfo() {
  const cfgPath = getCfgPath();
  if (!fs.existsSync(cfgPath)) {
    console.trace(`Không tìm thấy file cấu hình bot: ${cfgPath}`);
    return null;
  }
  try {
    const cfgData = await fs.promises.readFile(cfgPath, "utf8");
    return JSON.parse(cfgData);
  } catch (error) {
    console.error(error);
    return null;
  }
}
if (!process.env.SKIP_ENV_VALIDATION) {
  process.nextTick(() => {
    try {
      validateEnv(false);
    } catch (error) {
      console.warn("Auto-validation failed, but continuing...", error.message);
    }
  });
}
