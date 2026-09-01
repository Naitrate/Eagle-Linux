/**
 * Shared XDG autostart helpers.
 *
 * Eagle's Windows build drives autostart through app.setLoginItemSettings()
 * and the auto-launch npm module. Both are mapped onto a .desktop entry in
 * ~/.config/autostart, so the logic lives here and is used by both
 * window-manager.js (Electron app API) and native-modules.js (auto-launch).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const autostartFile = path.join(os.homedir(), '.config/autostart/eagle.desktop');

const possibleDesktopFiles = [
  path.join(path.resolve(__dirname, '..'), 'eagle.desktop'),
  '/run/current-system/sw/share/applications/eagle.desktop',
  '/usr/share/applications/eagle.desktop',
  path.join(os.homedir(), '.local/share/applications/eagle.desktop')
];

const fallbackDesktopContent =
  `[Desktop Entry]\nType=Application\nName=Eagle\nComment=Digital asset manager\n` +
  `Exec=eagle %u\nIcon=eagle\nTerminal=false\nStartupWMClass=Eagle\nCategories=Graphics;Utility;\n`;

// Earlier builds registered autostart under Electron's own name; remove it so
// Eagle does not get launched twice.
function cleanupStaleElectronDesktop() {
  try {
    const stale = path.join(os.homedir(), '.config/autostart/electron.desktop');
    if (fs.existsSync(stale)) {
      fs.unlinkSync(stale);
      console.log('[STUBS] Cleaned up stale electron.desktop autostart entry');
    }
  } catch (e) {}
}

module.exports = {
  autostartFile,
  possibleDesktopFiles,
  fallbackDesktopContent,
  cleanupStaleElectronDesktop
};
