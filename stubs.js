/**
 * Eagle Linux Compatibility Layer - Entry Point
 *
 * All compatibility patches are organized into dedicated modules under `./stubs/`:
 *  - stubs/environment.js       : NixOS GTK/GSettings & path safety wrappers
 *  - stubs/anti-tamper.js        : MD5 crypto anti-tamper overrides
 *  - stubs/tray-icon.js          : Linux PNG NativeImage icon resolution
 *  - stubs/machine-id.js         : System Machine GUID & FakeWinreg
 *  - stubs/process-execution.js  : PowerShell binary discovery & child_process hooks
 *  - stubs/fs-patches.js         : File system hooks, EXDEV rename fallback & dummy files
 *  - stubs/window-manager.js     : BrowserWindow wrapper, background window hiding & DevTools
 *  - stubs/native-modules.js     : Module._load interception & native proxies
 */

module.exports = require('./stubs/index.js');
