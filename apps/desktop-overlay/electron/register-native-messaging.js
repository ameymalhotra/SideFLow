const fs = require('fs');
const path = require('path');

const HOST_NAME = 'com.sideflow.nmh';

/** Profile subdir names a Chromium user-data dir can contain (Chrome 110+ also reads per-profile NMH dirs). */
const PROFILE_SUBDIRS = ['Default', 'Profile 1', 'Profile 2', 'Profile 3', 'Profile 4', 'Profile 5'];

/**
 * Directories where Chrome/Chromium/Edge look for Native Messaging host manifests.
 *
 * Chrome historically reads from the user-data-level `NativeMessagingHosts/` dir, but
 * since Chrome 110+ it ALSO reads from `<user-data>/<Profile>/NativeMessagingHosts/`,
 * and the per-profile entry can take precedence. We register in both so the host is
 * discoverable regardless of which lookup path the current Chrome build prefers.
 *
 * @param {string} home
 * @param {NodeJS.Platform} platform
 */
function getNativeMessagingHostDirs(home, platform) {
  /** @type {string[]} */
  const userDataRoots = [];
  if (platform === 'darwin') {
    const base = (seg) => path.join(home, 'Library', 'Application Support', ...seg);
    userDataRoots.push(
      base(['Google', 'Chrome']),
      base(['Google', 'Chrome Beta']),
      base(['Google', 'Chrome Canary']),
      base(['Chromium']),
      base(['Microsoft Edge']),
      base(['BraveSoftware', 'Brave-Browser']),
      base(['Arc', 'User Data']),
      base(['Vivaldi']),
    );
  } else if (platform === 'win32') {
    const local = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    userDataRoots.push(
      path.join(local, 'Google', 'Chrome', 'User Data'),
      path.join(local, 'Google', 'Chrome Beta', 'User Data'),
      path.join(local, 'Chromium', 'User Data'),
      path.join(local, 'Microsoft', 'Edge', 'User Data'),
      path.join(local, 'BraveSoftware', 'Brave-Browser', 'User Data'),
      path.join(local, 'Arc', 'User Data'),
      path.join(local, 'Vivaldi', 'User Data'),
    );
  } else {
    const config = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
    userDataRoots.push(
      path.join(config, 'google-chrome'),
      path.join(config, 'google-chrome-beta'),
      path.join(config, 'chromium'),
      path.join(config, 'microsoft-edge'),
      path.join(config, 'BraveSoftware', 'Brave-Browser'),
      path.join(config, 'vivaldi'),
      path.join(config, 'arc', 'User Data'),
    );
  }

  const dirs = [];
  for (const root of userDataRoots) {
    dirs.push(path.join(root, 'NativeMessagingHosts'));
    for (const profile of PROFILE_SUBDIRS) {
      const profilePath = path.join(root, profile);
      try {
        if (fs.existsSync(profilePath)) {
          dirs.push(path.join(profilePath, 'NativeMessagingHosts'));
        }
      } catch {
        /* ignore */
      }
    }
  }
  return dirs;
}

/**
 * Absolute path passed to Chrome: the executable host launcher.
 *
 * We always register a thin wrapper script (not the bare `*.js`) because Chrome
 * spawns Native Messaging hosts with a minimal PATH (`/usr/bin:/bin:/usr/sbin:/sbin`
 * on macOS/Linux). A `#!/usr/bin/env node` shebang fails when Node lives in
 * Homebrew, nvm, fnm, volta, or asdf; the wrapper primes PATH first.
 *
 * @param {string} electronDir - directory containing `native-host/`
 */
function getHostLaunchPath(electronDir) {
  const hostDir = path.join(electronDir, 'native-host');
  if (process.platform === 'win32') {
    return path.join(hostDir, 'launch-win.cmd');
  }
  return path.join(hostDir, 'launch-unix.sh');
}

function readAllowedOrigins(electronDir) {
  const p = path.join(electronDir, 'native-host', 'allowed-origins.json');
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (Array.isArray(raw.origins)) {
      return raw.origins.filter((o) => typeof o === 'string' && o.startsWith('chrome-extension://'));
    }
  } catch {
    /* missing */
  }
  return [];
}

/**
 * Writes Native Messaging host manifests so Chrome can spawn the bridge.
 * Safe to call on every app launch (refreshes absolute paths).
 */
function registerNativeMessagingHosts(electronDir) {
  const origins = readAllowedOrigins(electronDir);
  if (origins.length === 0) {
    console.warn('SideFlow: native messaging allowed-origins.json has no origins; extension bridge will not register.');
    return;
  }

  const hostPath = getHostLaunchPath(electronDir);
  if (!fs.existsSync(hostPath)) {
    console.warn('SideFlow: native host not found at', hostPath);
    return;
  }

  if (process.platform !== 'win32') {
    for (const rel of ['launch-unix.sh', 'sideflow-native-host.js']) {
      try {
        fs.chmodSync(path.join(electronDir, 'native-host', rel), 0o755);
      } catch {
        /* file may be missing on partial installs; ignore */
      }
    }
  }

  const manifest = {
    name: HOST_NAME,
    path: path.resolve(hostPath),
    type: 'stdio',
    allowed_origins: origins,
  };

  const home = require('os').homedir();
  const dirs = getNativeMessagingHostDirs(home, process.platform);
  const fileName = `${HOST_NAME}.json`;
  const json = JSON.stringify(manifest, null, 2);

  const written = [];
  for (const dir of dirs) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      const target = path.join(dir, fileName);
      fs.writeFileSync(target, json, 'utf8');
      written.push(target);
    } catch (err) {
      console.warn('SideFlow: could not write native messaging manifest to', dir, err.message);
    }
  }
  if (written.length > 0) {
    console.log(`[SideFlow] Registered native messaging host '${HOST_NAME}' -> ${manifest.path}`);
    for (const target of written) {
      console.log(`  manifest: ${target}`);
    }
  } else {
    console.warn('[SideFlow] Failed to write any native messaging manifest. Extension will not connect.');
  }
}

module.exports = {
  registerNativeMessagingHosts,
  getHostLaunchPath,
  readAllowedOrigins,
  HOST_NAME,
};
