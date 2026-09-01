const Module = require('module');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { FakeWinreg } = require('./machine-id');
const {
  autostartFile,
  possibleDesktopFiles,
  fallbackDesktopContent,
  cleanupStaleElectronDesktop
} = require('./autostart');

// Missing callable proxy helper
function createCallableProxy() {
  const fn = function() {};
  return new Proxy(fn, {
    get(target, prop, receiver) {
      if (prop === Symbol.toPrimitive || prop === 'inspect' || prop === 'prototype') {
        return Reflect.get(target, prop, receiver);
      }
      if (prop in target) return Reflect.get(target, prop, receiver);
      return createCallableProxy();
    },
    apply(target, thisArg, argArray) { return undefined; },
    construct(target, argArray, newTarget) { return createCallableProxy(); }
  });
}

const origDlopen = process.dlopen;
process.dlopen = function(module, filename, flags) {
  if (typeof filename === 'string' && (filename.endsWith('.dll') || filename.includes('.dll') || filename.endsWith('.node') || filename.includes('/build/Release/') || filename.includes('win32') || filename.includes('edge'))) {
    console.log(`[STUBS] Preventing native dlopen on Win32/DLL binary: ${filename}`);
    module.exports = createCallableProxy();
    return true;
  }
  try {
    return origDlopen.call(process, module, filename, flags);
  } catch (err) {
    console.log(`[STUBS] Native dlopen failed safely for: ${filename}`);
    module.exports = createCallableProxy();
    return true;
  }
};

if (Module._extensions['.node']) {
  Module._extensions['.node'] = function(module, filename) {
    console.log(`[STUBS] Intercepted .node extension load: ${filename}`);
    module.exports = createCallableProxy();
  };
}

const origResolveFilename = Module._resolveFilename;
Module._resolveFilename = function(request, parent, isMain, options) {
  if (typeof request === 'string' && (request.includes('edge_coreclr') || request.includes('edge_nativeclr') || request.includes('electron-edge-js'))) {
    return 'electron-edge-js';
  }
  return origResolveFilename.apply(this, arguments);
};

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (typeof request === 'string') {
    const lowerReq = request.toLowerCase();
    if (lowerReq.includes('electron-edge-js') || lowerReq.includes('edge') || lowerReq.includes('edge_coreclr') || lowerReq === 'edge_coreclr.node') {
      console.log(`[STUBS] Intercepted edge module load: ${request}`);
      const dummyEdgeFunc = function() {
        const asyncFn = function(data, cb) {
          if (typeof cb === 'function') process.nextTick(() => cb(null, null));
          return Promise.resolve(null);
        };
        return asyncFn;
      };
      dummyEdgeFunc.func = dummyEdgeFunc;
      return dummyEdgeFunc;
    }

    if (lowerReq === 'winreg' || lowerReq.endsWith('/winreg') || lowerReq.endsWith('\\winreg')) {
      console.log(`[STUBS] Providing FakeWinreg implementation for: ${request}`);
      return FakeWinreg;
    }

    if (lowerReq.endsWith('.node') || (lowerReq.includes('node_modules') && lowerReq.includes('/build/release/')) || lowerReq.includes('ffi') || lowerReq.includes('ref') || lowerReq.includes('windows-foreground-love') || lowerReq.includes('forcefocus')) {
      console.log(`[STUBS] Intercepted native module load before dlopen: ${request}`);
      return createCallableProxy();
    }
  }

  if (typeof request === 'string' && (request.includes('auto-launch') || request.includes('AutoLaunch'))) {
    console.log(`[STUBS] Intercepted auto-launch module: ${request}`);

    return class CustomAutoLaunch {
      constructor(options) {
        this.name = options ? options.name : 'Eagle';
        this.autostartPath = autostartFile;
      }

      async enable() {
        console.log('[STUBS] CustomAutoLaunch.enable() called');
        cleanupStaleElectronDesktop();
        fs.mkdirSync(path.dirname(this.autostartPath), { recursive: true });
        const src = possibleDesktopFiles.find(p => fs.existsSync(p));
        if (src) {
          fs.copyFileSync(src, this.autostartPath);
          console.log('[STUBS] CustomAutoLaunch copied desktop file from:', src);
        } else {
          fs.writeFileSync(this.autostartPath, fallbackDesktopContent, 'utf-8');
          console.log('[STUBS] CustomAutoLaunch created fallback autostart entry');
        }
      }

      async disable() {
        console.log('[STUBS] CustomAutoLaunch.disable() called');
        cleanupStaleElectronDesktop();
        if (fs.existsSync(this.autostartPath)) {
          fs.unlinkSync(this.autostartPath);
        }
      }

      async isEnabled() {
        cleanupStaleElectronDesktop();
        return fs.existsSync(this.autostartPath);
      }
    };
  }

  if (typeof request === 'string' && (request === 'nsfw' || request.endsWith('/nsfw') || request.includes('nsfw.node'))) {
    try {
      const res = originalLoad.apply(this, arguments);
      return res;
    } catch (err) {
      console.log(`[STUBS] Providing JS fallback for nsfw file watcher`);
      const dummyNsfw = function(watchPath, eventCallback, options) {
        return Promise.resolve({
          start: () => Promise.resolve(),
          stop: () => Promise.resolve()
        });
      };
      return dummyNsfw;
    }
  }

  try {
    return originalLoad.apply(this, arguments);
  } catch (err) {
    if (typeof request === 'string' && (request.endsWith('.node') || request.includes('/build/Release/') || request.includes('winreg') || request.includes('auto-launch') || request.includes('ffi') || request.includes('ref') || request.includes('windows-foreground-love') || request.includes('nsfw'))) {
      console.log(`[STUBS] Intercepted missing/invalid native module: ${request}`);
      return createCallableProxy();
    }
    throw err;
  }
};

module.exports = {
  createCallableProxy
};
