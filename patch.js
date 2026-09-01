/**
 * Eagle Linux Compatibility Layer - Master Entry Point
 *
 * All compatibility patches are organized into dedicated modules under `./patches/`:
 *  - patches/anti-tamper.js        : MD5 crypto anti-tamper overrides
 *  - patches/tray-icon.js          : Linux PNG NativeImage & Tray wrapper
 *  - patches/environment.js        : Windows env fallbacks, GTK/GSettings, ffmpeg wrappers
 *  - patches/fs-patches.js         : File system hooks, EXDEV rename fallback & dummy files
 *  - patches/machine-id.js         : System Machine GUID & FakeWinreg
 *  - patches/process-execution.js  : PowerShell binary discovery & child_process hooks
 *  - patches/native-modules.js     : Module._load/dlopen interception & native proxies
 *  - patches/window-manager.js     : BrowserWindow wrapper, window controls, app lifecycle
 *  - patches/autostart.js          : Shared XDG autostart .desktop helpers
 *  - patches/renderer-fixes.js     : Renderer-only window.ig & body display fixes
 *  - patches/ai-search.js          : AI Search plugin Linux compatibility
 *  - patches/kde-shortcuts.js      : KDE Plasma KGlobalAccel global shortcuts
 *
 * See patches/index.js for the (significant) load order.
 */

module.exports = require('./patches/index.js');
