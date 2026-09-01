const fs = require('fs');
const path = require('path');
const electron = require('electron');

const origFs = {
  readFileSync: fs.readFileSync,
  readFile: fs.readFile,
  writeFileSync: fs.writeFileSync,
  writeFile: fs.writeFile,
  existsSync: fs.existsSync,
  accessSync: fs.accessSync,
  statSync: fs.statSync,
  copyFileSync: fs.copyFileSync,
  unlinkSync: fs.unlinkSync
};

const eagleStubsDir = path.resolve(__dirname, '..');
const backupRunJs = path.join(eagleStubsDir, 'backup', 'extracted_app_patches', 'run.js');
const backupAppBundle = path.join(eagleStubsDir, 'backup', 'extracted_app_patches', 'app', 'app.bundle.js');
const backupIndexHtml = path.join(eagleStubsDir, 'backup', 'extracted_app_patches', 'app', 'index.html');

const untamperedRunJsBuffer = Buffer.from(
  'const { app } = require("electron");\n' +
  'const path = require("path");\n' +
  'const bytenode = require("bytenode");\n' +
  'bytenode.runBytecodeFile(path.join(__dirname, "main.jsc"));\n',
  'utf8'
);

function parseEncoding(opts) {
  if (!opts) return null;
  if (typeof opts === 'string') return opts;
  if (typeof opts === 'object' && opts.encoding) return opts.encoding;
  return null;
}

function isHostPath(p) {
  if (!p) return false;
  const str = String(p).toLowerCase();
  return str.startsWith('c:') || str.includes('system32') || str.includes('drivers') || str.includes('hosts');
}

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
  const opts = args.find(a => typeof a === 'object' || typeof a === 'string');

  if (typeof p === 'string' && (p.includes('ipv4_data') || p.includes('Certifications'))) {
    console.log('[STUBS FS] Serving dummy data for readFile ipv4_data/Certifications:', p);
    if (cb) process.nextTick(() => cb(null, Buffer.alloc(64)));
    return;
  }
  if (typeof p === 'string' && !p.includes('stubs')) {
    if ((p.endsWith('run.js') || p.endsWith('/run.js') || p.endsWith('\\run.js')) && !p.endsWith('.jsc')) {
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

const origExistsSync = fs.existsSync;
fs.existsSync = function(p) {
  if (typeof p === 'string' && (p.includes('ipv4_data') || p.includes('Certifications'))) {
    return true;
  }
  return origExistsSync.apply(this, arguments);
};

const origAccessSync = fs.accessSync;
fs.accessSync = function(p, mode) {
  if (typeof p === 'string' && (p.includes('ipv4_data') || p.includes('Certifications'))) {
    return undefined;
  }
  return origAccessSync.apply(this, arguments);
};

const origStatSync = fs.statSync;
fs.statSync = function(p, opts) {
  if (typeof p === 'string' && (p.includes('ipv4_data') || p.includes('Certifications'))) {
    return {
      isFile: () => true,
      isDirectory: () => false,
      size: 64,
      mtimeMs: Date.now()
    };
  }
  return origStatSync.apply(this, arguments);
};

module.exports = {
  origFs,
  isHostPath
};
