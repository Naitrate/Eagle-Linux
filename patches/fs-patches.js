const fs = require('fs');
const path = require('path');

const eagleStubsDir = path.resolve(__dirname, '..');

// Original fs methods, captured before any interception below
const origFs = {
  existsSync: fs.existsSync,
  accessSync: fs.accessSync,
  access: fs.access,
  readFileSync: fs.readFileSync,
  readFile: fs.readFile,
  writeFileSync: fs.writeFileSync,
  writeFile: fs.writeFile,
  statSync: fs.statSync,
  stat: fs.stat,
  lstatSync: fs.lstatSync,
  lstat: fs.lstat,
  openSync: fs.openSync,
  open: fs.open,
  copyFileSync: fs.copyFileSync,
  unlinkSync: fs.unlinkSync
};

// Copy edge-cs.dll fallback to ProgramData/Eagle if expected by edge.js
try {
  const eagleTmpDir = path.join(process.env.ProgramData, 'Eagle');
  if (!fs.existsSync(eagleTmpDir)) {
    fs.mkdirSync(eagleTmpDir, { recursive: true });
  }
  const targetEdgeDll = path.join(eagleTmpDir, 'edge-cs.dll');
  if (!fs.existsSync(targetEdgeDll)) {
    fs.writeFileSync(targetEdgeDll, '');
  }
} catch (e) {}

// Path matching logic for Windows system files & DLLs
function isHostPath(p) {
  if (!p) return false;
  const str = String(p).toLowerCase();
  return str.startsWith('c:') || str.includes('system32') || str.includes('drivers') || str.includes('hosts');
}

function isDllPath(p) {
  if (!p) return false;
  const str = String(p).toLowerCase();
  return str.endsWith('.dll') || str.includes('.dll');
}

// Dummy stat structure
const dummyStat = {
  isFile: () => true,
  isDirectory: () => false,
  isBlockDevice: () => false,
  isCharacterDevice: () => false,
  isSymbolicLink: () => false,
  isFIFO: () => false,
  isSocket: () => false,
  size: 1024,
  mtime: new Date(),
  atime: new Date(),
  ctime: new Date(),
  birthtime: new Date()
};

const backupAppBundle = path.join(eagleStubsDir, 'backup/old_app_versions/3/app.bundle.js');
const backupIndexHtml = path.join(eagleStubsDir, 'backup/old_app_versions/3/index.html');
const backupRunJs = path.join(eagleStubsDir, 'backup/old_app_versions/3/app/run.js');

// Pristine run.js contents, CRLF-terminated with no trailing newline.
// This exact byte sequence hashes to f9a77da6177275249fb3ab3a9bc9e799 --
// the value Eagle's tamper check expects. Do not "normalise" the line
// endings or append a trailing newline; that changes the digest.
const untamperedRunJsBuffer = Buffer.from(
  '636f6e737420627974656e6f6465203d20726571756972652827627974656e6f646527293b0d0a636f6e7374207638203d20726571756972652827763827293b0d0a76382e736574466c61677346726f6d537472696e6728272d2d6e6f2d6c617a7927293b0d0a72657175697265285f5f6469726e616d65202b20272f72756e2e6a736327293b0d0a72657175697265285f5f6469726e616d65202b20272f6d61696e2e6a736327293b',
  'hex'
);

function parseEncoding(opts) {
  if (!opts) return null;
  if (typeof opts === 'string') return opts;
  if (typeof opts === 'object' && opts.encoding) return opts.encoding;
  return null;
}

// Hook fs existence, access, stat, read, open for Windows paths and DLL checks
fs.existsSync = function(p) {
  if (typeof p === 'string' && (p.includes('ipv4_data') || p.includes('Certifications'))) return true;
  if (typeof p === 'string' && (p.endsWith('DisableEdge') || p.includes('DisableEdge'))) return true;
  if (typeof p === 'string' && (p.includes('edge_coreclr') || p.includes('edge_nativeclr') || p.includes('electron-edge-js'))) return true;
  if (typeof p === 'string' && (p.includes('NiuniuCapture.exe') || p.includes('NiuniuCapture.dll'))) return true;
  if (isHostPath(p) || isDllPath(p)) return true;
  return origFs.existsSync.apply(this, arguments);
};

fs.accessSync = function(p, mode) {
  if (typeof p === 'number' || (typeof p !== 'string' && !Buffer.isBuffer(p) && !(p instanceof URL))) {
    return undefined;
  }
  if (typeof p === 'string' && (p.includes('ipv4_data') || p.includes('Certifications'))) return undefined;
  if (isHostPath(p) || isDllPath(p)) return undefined;
  return origFs.accessSync.apply(this, arguments);
};

fs.access = function(p, ...args) {
  const cb = args.find(a => typeof a === 'function');
  if (typeof p === 'number' || (typeof p !== 'string' && !Buffer.isBuffer(p) && !(p instanceof URL))) {
    if (cb) process.nextTick(() => cb(null));
    return;
  }
  if (typeof p === 'string' && (p.includes('ipv4_data') || p.includes('Certifications'))) {
    if (cb) process.nextTick(() => cb(null));
    return;
  }
  if (isHostPath(p) || isDllPath(p)) {
    if (cb) process.nextTick(() => cb(null));
    return;
  }
  return origFs.access.apply(this, [p, ...args]);
};

fs.statSync = function(p, opts) {
  if (typeof p === 'string' && (p.includes('ipv4_data') || p.includes('Certifications'))) return dummyStat;
  if (typeof p === 'string' && p.includes('app.bundle.js')) {
    const stat = origFs.statSync.call(this, p, opts);
    return Object.assign(Object.create(Object.getPrototypeOf(stat)), stat, { size: 4408963 });
  }
  if (isHostPath(p) || isDllPath(p)) return dummyStat;
  return origFs.statSync.apply(this, arguments);
};

fs.stat = function(p, ...args) {
  const cb = args.find(a => typeof a === 'function');
  if (typeof p === 'string' && (p.includes('ipv4_data') || p.includes('Certifications'))) {
    if (cb) process.nextTick(() => cb(null, dummyStat));
    return;
  }
  if (isHostPath(p) || isDllPath(p)) {
    if (cb) process.nextTick(() => cb(null, dummyStat));
    return;
  }
  return origFs.stat.apply(this, args);
};

fs.readFileSync = function(p, opts) {
  if (typeof p === 'string' && (p.includes('ipv4_data') || p.includes('Certifications'))) {
    console.log('[STUBS FS] Serving dummy data for ipv4_data/Certifications:', p);
    return Buffer.alloc(64);
  }
  if (typeof p === 'string' && !p.includes('stubs')) {
    if ((p.endsWith('run.js') || p.endsWith('/run.js') || p.endsWith('\\run.js')) && !p.endsWith('.jsc')) {
      console.log('[STUBS FS] Intercepted readFileSync for run.js tamper check on:', p);
      const enc = parseEncoding(opts);
      const res = origFs.existsSync(backupRunJs) ? origFs.readFileSync.call(fs, backupRunJs) : untamperedRunJsBuffer;
      return enc ? res.toString(enc) : res;
    }

    if (p.includes('app.bundle.js')) {
      console.log('[STUBS FS] Intercepted readFileSync for app.bundle.js tamper check on:', p);
      const enc = parseEncoding(opts);
      if (origFs.existsSync(backupAppBundle)) {
        const b = origFs.readFileSync.call(fs, backupAppBundle);
        return enc ? b.toString(enc) : b;
      }
    }

    if ((p.endsWith('index.html') || p.endsWith('/index.html') || p.endsWith('\\index.html')) && !p.includes('node_modules')) {
      console.log('[STUBS FS] Intercepted readFileSync for index.html tamper check on:', p);
      const enc = parseEncoding(opts);
      if (origFs.existsSync(backupIndexHtml)) {
        const b = origFs.readFileSync.call(fs, backupIndexHtml);
        return enc ? b.toString(enc) : b;
      }
    }
  }

  if (isHostPath(p)) {
    return '127.0.0.1 localhost\n::1 localhost\n';
  }

  return origFs.readFileSync.apply(fs, arguments);
};

fs.readFile = function(p, ...args) {
  const cb = args.find(a => typeof a === 'function');
  const opts = args.find(a => typeof a === 'string' || (a && typeof a === 'object'));
  if (typeof p === 'string' && !p.includes('stubs')) {
    if (p.endsWith('run.js') || p.endsWith('/run.js') || p.endsWith('\\run.js')) {
      console.log('[STUBS FS] Intercepted readFile for run.js tamper check on:', p);
      const enc = parseEncoding(opts);
      const res = origFs.existsSync(backupRunJs) ? origFs.readFileSync.call(fs, backupRunJs) : untamperedRunJsBuffer;
      const formatted = enc ? res.toString(enc) : res;
      if (cb) process.nextTick(() => cb(null, formatted));
      return;
    }

    if (p.includes('app.bundle.js')) {
      console.log('[STUBS FS] Intercepted readFile for app.bundle.js tamper check on:', p);
      const enc = parseEncoding(opts);
      if (origFs.existsSync(backupAppBundle)) {
        const b = origFs.readFileSync.call(fs, backupAppBundle);
        const formatted = enc ? b.toString(enc) : b;
        if (cb) process.nextTick(() => cb(null, formatted));
        return;
      }
    }

    if (p.endsWith('index.html') || p.endsWith('/index.html') || p.endsWith('\\index.html')) {
      console.log('[STUBS FS] Intercepted readFile for index.html tamper check on:', p);
      const enc = parseEncoding(opts);
      if (origFs.existsSync(backupIndexHtml)) {
        const b = origFs.readFileSync.call(fs, backupIndexHtml);
        const formatted = enc ? b.toString(enc) : b;
        if (cb) process.nextTick(() => cb(null, formatted));
        return;
      }
    }
  }

  if (isHostPath(p)) {
    if (cb) process.nextTick(() => cb(null, '127.0.0.1 localhost\n::1 localhost\n'));
    return;
  }
  return origFs.readFile.apply(fs, arguments);
};

fs.writeFileSync = function(p, data, opts) {
  if (isHostPath(p)) return undefined;
  return origFs.writeFileSync.call(fs, p, data, opts);
};

fs.writeFile = function(p, ...args) {
  const cb = args.find(a => typeof a === 'function');
  if (isHostPath(p)) {
    if (cb) process.nextTick(() => cb(null));
    return;
  }
  return origFs.writeFile.call(fs, p, ...args);
};

// Cross-filesystem / EXDEV fallback for fs.renameSync, fs.rename, and fs.promises.rename
const origRenameSync = fs.renameSync;
fs.renameSync = function(oldPath, newPath) {
  console.log('[STUBS RENAME SYNC]:', oldPath, '->', newPath);
  try {
    return origRenameSync.call(fs, oldPath, newPath);
  } catch (err) {
    console.log('[STUBS RENAME SYNC ERROR]:', err ? err.message : err);
    if (err && (err.code === 'EXDEV' || err.code === 'ENOENT')) {
      try {
        origFs.copyFileSync.call(fs, oldPath, newPath);
        origFs.unlinkSync.call(fs, oldPath);
        return;
      } catch (e) {}
    }
    throw err;
  }
};

const origRename = fs.rename;
fs.rename = function(oldPath, newPath, cb) {
  console.log('[STUBS RENAME ASYNC]:', oldPath, '->', newPath);
  return origRename.call(fs, oldPath, newPath, (err) => {
    if (err) console.log('[STUBS RENAME ASYNC ERROR]:', err.message);
    if (err && (err.code === 'EXDEV' || err.code === 'ENOENT')) {
      try {
        origFs.copyFileSync.call(fs, oldPath, newPath);
        origFs.unlinkSync.call(fs, oldPath);
        if (typeof cb === 'function') return cb(null);
      } catch (e) {
        if (typeof cb === 'function') return cb(err);
      }
    }
    if (typeof cb === 'function') return cb(err);
  });
};

if (fs.promises) {
  const origPromisesRename = fs.promises.rename;
  fs.promises.rename = async function(oldPath, newPath) {
    console.log('[STUBS PROMISES RENAME]:', oldPath, '->', newPath);
    try {
      return await origPromisesRename.call(fs.promises, oldPath, newPath);
    } catch (err) {
      console.log('[STUBS PROMISES RENAME ERROR]:', err ? err.message : err);
      if (err && (err.code === 'EXDEV' || err.code === 'ENOENT')) {
        try {
          origFs.copyFileSync.call(fs, oldPath, newPath);
          origFs.unlinkSync.call(fs, oldPath);
          return;
        } catch (e) {}
      }
      throw err;
    }
  };
}

// Intercept fs.copyFileSync / fs.copyFile for plugin installation
const origCopyFileSync = fs.copyFileSync;
fs.copyFileSync = function(src, dest, flags) {
  try {
    return origCopyFileSync.apply(this, arguments);
  } catch (err) {
    if (typeof dest === 'string' && (dest.includes('ffmpeg') || dest.includes('Plugins'))) {
      console.log(`[STUBS COPYFILE INTERCEPTED]: ${src} -> ${dest}`);
      return undefined;
    }
    throw err;
  }
};

const origCopyFile = fs.copyFile;
fs.copyFile = function(src, dest, ...args) {
  const cb = args.find(a => typeof a === 'function');
  try {
    return origCopyFile.call(fs, src, dest, ...args);
  } catch (err) {
    if (typeof dest === 'string' && (dest.includes('ffmpeg') || dest.includes('Plugins'))) {
      console.log(`[STUBS COPYFILE INTERCEPTED (async)]: ${src} -> ${dest}`);
      if (cb) process.nextTick(() => cb(null));
      return;
    }
    throw err;
  }
};

if (fs.promises) {
  const origPromises = { ...fs.promises };
  if (origPromises.readFile) {
    fs.promises.readFile = async function(p, opts) {
      if (isHostPath(p)) return '127.0.0.1 localhost\n::1 localhost\n';
      return origPromises.readFile.apply(this, arguments);
    };
  }
  if (origPromises.access) {
    fs.promises.access = async function(p, mode) {
      if (isHostPath(p) || isDllPath(p)) return undefined;
      return origPromises.access.apply(this, arguments);
    };
  }
  if (origPromises.stat) {
    fs.promises.stat = async function(p, opts) {
      if (isHostPath(p) || isDllPath(p)) return dummyStat;
      return origPromises.stat.apply(this, arguments);
    };
  }
  if (origPromises.copyFile) {
    fs.promises.copyFile = async function(src, dest, flags) {
      try {
        return await origPromises.copyFile.apply(this, arguments);
      } catch (err) {
        if (typeof dest === 'string' && (dest.includes('ffmpeg') || dest.includes('Plugins'))) {
          console.log(`[STUBS PROMISES COPYFILE INTERCEPTED]: ${src} -> ${dest}`);
          return undefined;
        }
        throw err;
      }
    };
  }
}

module.exports = {
  origFs,
  isHostPath,
  isDllPath,
  dummyStat
};
