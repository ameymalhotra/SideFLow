/**
 * Mirrors Electron's default app.getPath('userData') for package name `sideflow-desktop`
 * (see package.json "name"), so the native host can read bridge-token.json without Electron.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const APP_DIR_NAME = 'sideflow-desktop';

function getUserDataPath() {
  const home = os.homedir();
  switch (process.platform) {
    case 'darwin':
      return path.join(home, 'Library', 'Application Support', APP_DIR_NAME);
    case 'win32': {
      const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
      return path.join(appData, APP_DIR_NAME);
    }
    default: {
      const config =
        process.env.XDG_CONFIG_HOME || path.join(home, '.config');
      return path.join(config, APP_DIR_NAME);
    }
  }
}

function getBridgeTokenPath() {
  return path.join(getUserDataPath(), 'bridge-token.json');
}

function readBridgeToken() {
  const tokenPath = getBridgeTokenPath();
  try {
    const raw = fs.readFileSync(tokenPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (typeof parsed.token === 'string' && parsed.token.length >= 32) {
      return parsed.token;
    }
  } catch {
    /* missing or invalid */
  }
  return null;
}

module.exports = { getUserDataPath, getBridgeTokenPath, readBridgeToken };
