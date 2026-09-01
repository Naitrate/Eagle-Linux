/**
 * Eagle Linux Compatibility Layer - Master Patches Index
 *
 * Load order mirrors stubs.js and is significant:
 *
 *  - anti-tamper must patch crypto before Eagle computes any digest.
 *  - environment must run before fs-patches: it defines process.env.ProgramData
 *    (used to seed the edge-cs.dll stub) and installs the path.join/resolve
 *    guards that tolerate undefined Windows env vars.
 *  - machine-id must precede process-execution and native-modules, which
 *    consume getMockRegOutput()/FakeWinreg.
 *  - native-modules must precede window-manager, which uses createCallableProxy.
 */

// 1. Anti-tamper & crypto hooks
const antiTamper = require('./anti-tamper');

// 2. Linux PNG NativeImage / Tray icon resolution
const trayIcon = require('./tray-icon');

// 3. Environment: Windows env var fallbacks, GTK/GSettings, ffmpeg wrappers
const environment = require('./environment');

// 4. File system hooks
const fsPatches = require('./fs-patches');

// 5. Machine ID & Winreg
const machineId = require('./machine-id');

// 6. Process execution
const processExecution = require('./process-execution');

// 7. Module._load interception & native proxies
const nativeModules = require('./native-modules');

// 8. UI & Window management
const windowManager = require('./window-manager');

// 9. Renderer-only fixes (no-op in the main process)
const rendererFixes = require('./renderer-fixes');

// 10. Dynamically-installed plugin patches & desktop integration
const aiSearch = require('./ai-search');
const kdeShortcuts = require('./kde-shortcuts');

process.on('uncaughtException', (err) => {
  console.log('[UNCAUGHT EXCEPTION SUPPRESSED]', err.stack || err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.log('[UNHANDLED REJECTION SUPPRESSED]', reason);
});

console.log(`[PATCHES MASTER] Eagle Linux Compatibility Layer successfully initialized (process.type: ${process.type || 'main'}).`);

module.exports = {
  antiTamper,
  trayIcon,
  environment,
  fsPatches,
  machineId,
  processExecution,
  nativeModules,
  windowManager,
  rendererFixes,
  aiSearch,
  kdeShortcuts
};
