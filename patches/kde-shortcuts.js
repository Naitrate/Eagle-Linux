// ==========================================================================
// Native KDE Plasma KGlobalAccel Shortcuts Integration (Main Process)
// ==========================================================================

const fs = require('fs');
const os = require('os');
const path = require('path');
const child_process = require('child_process');
let electron;
try {
  electron = require('electron');
} catch (e) {}

const isMainProcess = !process.type || process.type === 'browser';
const eagleStubsDir = path.resolve(__dirname, '..');

function initKdePlasmaShortcutsInternal() {
  if (!isMainProcess || (process.platform !== 'linux' && os.platform() !== 'linux')) {
    return;
  }

  let allKeybinds = {};
  try {
    const defaultPrefsPath = path.join(eagleStubsDir, 'app', 'app', 'js', 'default-preferences.js');
    if (fs.existsSync(defaultPrefsPath)) {
      const defaultPrefs = require(defaultPrefsPath);
      if (defaultPrefs && defaultPrefs.shortcuts && defaultPrefs.shortcuts.keybinds) {
        allKeybinds = { ...defaultPrefs.shortcuts.keybinds };
      }
    }
  } catch (e) {
    console.warn('[STUBS KDE] Failed to load default-preferences:', e.message);
  }

  // Also merge user settings if present
  try {
    const userSettingsPath = path.join(os.homedir(), '.config', 'Eagle', 'settings.json');
    if (fs.existsSync(userSettingsPath)) {
      const userSettings = JSON.parse(fs.readFileSync(userSettingsPath, 'utf8'));
      if (userSettings && userSettings.shortcuts && userSettings.shortcuts.keybinds) {
        allKeybinds = { ...allKeybinds, ...userSettings.shortcuts.keybinds };
      }
    }
  } catch (e) {
    // Ignore if settings.json not found
  }

  const formatDisplayName = (key) => {
    const parts = key.split('.');
    const category = parts[0] ? parts[0].charAt(0).toUpperCase() + parts[0].slice(1) : '';
    const name = parts.slice(1).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
    return `${category}: ${name}`;
  };

  console.log(`[STUBS KDE] Registering all ${Object.keys(allKeybinds).length} native KDE Plasma shortcuts via D-Bus...`);

  for (const [actionKey, shortcutStr] of Object.entries(allKeybinds)) {
    // Exclude platform specific non-linux keybinds if any
    if (actionKey.endsWith('.darwin') && process.platform !== 'darwin') continue;
    if (actionKey.endsWith('.win32') && process.platform === 'darwin') continue;

    const displayName = formatDisplayName(actionKey);

    child_process.execFile('dbus-send', [
      '--session',
      '--type=method_call',
      '--dest=org.kde.kglobalaccel',
      '/kglobalaccel',
      'org.kde.KGlobalAccel.doRegister',
      'array:string:eagle.desktop,' + actionKey + ',Eagle,' + displayName
    ], (err) => {
      if (err) return;
    });
  }

  // Listen for D-Bus trigger signals from KDE Plasma
  try {
    const monitor = child_process.spawn('dbus-monitor', [
      "type='signal',interface='org.kde.KGlobalAccelComponent'"
    ]);

    if (monitor.stdout) {
      monitor.stdout.on('data', (data) => {
        const text = data.toString();
        for (const actionKey of Object.keys(allKeybinds)) {
          if (text.includes(actionKey)) {
            console.log(`[STUBS KDE] Global shortcut triggered: ${actionKey}`);

            const allWins = (electron && electron.BrowserWindow) ? electron.BrowserWindow.getAllWindows() : [];
            const mainWin = allWins.find(w => w && !w.isDestroyed() && w.getBounds().width > 200);

            if (mainWin) {
              if (mainWin.isMinimized()) mainWin.restore();
              mainWin.show();
              mainWin.focus();

              mainWin.webContents.send('dispatch-shortcut', actionKey);
            }
            break;
          }
        }
      });
    }
  } catch (e) {
    console.warn('[STUBS KDE] Could not start dbus-monitor:', e.message);
  }
}

if (isMainProcess && electron) {
  if (electron.app && electron.app.isReady && electron.app.isReady()) {
    initKdePlasmaShortcutsInternal();
  } else if (electron.app && electron.app.once) {
    electron.app.once('ready', initKdePlasmaShortcutsInternal);
  }
}

module.exports = {
  initKdePlasmaShortcutsInternal
};
