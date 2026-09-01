/**
 * Eagle Linux Compatibility Layer - Master Stubs Index
 *
 * Modularized architecture dividing compatibility patches into dedicated modules:
 *  - environment.js: GTK, GSettings schema environment & path safety wrappers
 *  - anti-tamper.js: Crypto MD5 hash spoofing & anti-tamper verification
 *  - tray-icon.js: NativeImage Linux PNG tray icon resolution
 *  - machine-id.js: System Machine GUID resolution & FakeWinreg
 *  - process-execution.js: PowerShell discovery & child_process execution interception
 *  - fs-patches.js: File system hooks, EXDEV rename fallbacks, dummy file serving
 *  - window-manager.js: CustomBrowserWindow, background window management & DevTools
 *  - native-modules.js: Module._load & _resolveFilename interception and proxies
 */

const environment = require('./environment');
const antiTamper = require('./anti-tamper');
const trayIcon = require('./tray-icon');
const machineId = require('./machine-id');
const processExecution = require('./process-execution');
const fsPatches = require('./fs-patches');
const windowManager = require('./window-manager');
const nativeModules = require('./native-modules');

console.log('[STUBS MASTER] Eagle Linux Compatibility Layer successfully initialized.');

module.exports = {
  environment,
  antiTamper,
  trayIcon,
  machineId,
  processExecution,
  fsPatches,
  windowManager,
  nativeModules
};
