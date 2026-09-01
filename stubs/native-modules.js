const Module = require('module');
const path = require('path');
const electron = require('electron');
const { FakeWinreg } = require('./machine-id');

function createCallableProxy(name) {
  const dummyFn = function(...args) {
    const cb = args.find(a => typeof a === 'function');
    if (cb) process.nextTick(() => cb(null, {}));
    return true;
  };
  return new Proxy(dummyFn, {
    get(target, prop) {
      if (prop === 'then') return undefined;
      if (prop === 'symbol') return Symbol(name);
      if (typeof target[prop] !== 'undefined') return target[prop];
      return createCallableProxy(`${name}.${String(prop)}`);
    },
    apply(target, thisArg, args) {
      const cb = args.find(a => typeof a === 'function');
      if (cb) process.nextTick(() => cb(null, {}));
      return true;
    }
  });
}

const origResolveFilename = Module._resolveFilename;
Module._resolveFilename = function(request, parent, isMain, options) {
  if (typeof request === 'string') {
    const lowerReq = request.toLowerCase();
    if (
      lowerReq.includes('windows-foreground') ||
      lowerReq.includes('windows-autostart') ||
      lowerReq.includes('winreg') ||
      lowerReq.includes('edge-cs') ||
      lowerReq.includes('edge-js') ||
      lowerReq.includes('kde-plasma') ||
      lowerReq.endsWith('.node')
    ) {
      console.log(`[STUBS] Intercepted Module._resolveFilename for native/windows module: ${request}`);
      return request;
    }
  }
  return origResolveFilename.apply(this, arguments);
};

const origModuleLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (typeof request === 'string') {
    const lowerReq = request.toLowerCase();

    if (
      lowerReq === 'edge-cs' ||
      lowerReq === 'edge-js' ||
      lowerReq.endsWith('/edge-cs') ||
      lowerReq.endsWith('\\edge-cs') ||
      lowerReq.endsWith('/edge-js') ||
      lowerReq.endsWith('\\edge-js')
    ) {
      console.log(`[STUBS] Providing safe Mock implementation for edge-cs/edge-js: ${request}`);
      const dummyEdgeFunc = function(data, callback) {
        console.log('[STUBS EDGE-CS] Intercepted edge function call:', data);
        if (typeof callback === 'function') {
          process.nextTick(() => callback(null, true));
        } else if (typeof data === 'function') {
          process.nextTick(() => data(null, true));
        }
        return true;
      };
      dummyEdgeFunc.func = function(opts) {
        return dummyEdgeFunc;
      };
      return dummyEdgeFunc;
    }

    if (lowerReq === 'winreg' || lowerReq.endsWith('/winreg') || lowerReq.endsWith('\\winreg')) {
      console.log(`[STUBS] Providing FakeWinreg implementation for: ${request}`);
      return FakeWinreg;
    }

    if (
      lowerReq.includes('windows-foreground') ||
      lowerReq.includes('windows-autostart') ||
      lowerReq.includes('windows-shortcuts') ||
      lowerReq.includes('win32') ||
      lowerReq.includes('kde-plasma') ||
      (lowerReq.endsWith('.node') && !lowerReq.includes('bytenode'))
    ) {
      console.log(`[STUBS] Intercepted native module load before dlopen: ${request}`);

      if (lowerReq.includes('kde-plasma') || lowerReq.includes('kde')) {
        return {
          registerShortcut: (id, name, shortcut, cb) => {
            if (cb) process.nextTick(() => cb(null, true));
            return true;
          },
          unregisterShortcut: (id, cb) => {
            if (cb) process.nextTick(() => cb(null, true));
            return true;
          },
          unregisterAllShortcuts: (cb) => {
            if (cb) process.nextTick(() => cb(null, true));
            return true;
          }
        };
      }

      return createCallableProxy(request);
    }
  }

  return origModuleLoad.apply(this, arguments);
};

module.exports = {
  createCallableProxy
};
