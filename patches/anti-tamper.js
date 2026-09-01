const Module = require('module');
const crypto = require('crypto');

// MD5 Hash mapping to pass anti-tamper verification.
//
// Keys are hashes of modified files; values are the pristine hashes Eagle
// expects. Rewriting happens in a single pass, so every key must map DIRECTLY
// to a pristine value -- never to another key.
//
//   f9a77da6... = pristine run.js
//   74a46ea6... = pristine index.html
//   479b7f73... = pristine app.bundle.js
const md5Hashes = {
  'afe9aeeb940d22a258040a29934130ff': 'f9a77da6177275249fb3ab3a9bc9e799',
  'f447d0d0e9e2328604d79732b6f16f88': 'f9a77da6177275249fb3ab3a9bc9e799',
  'c2d4bad4bd8d772031ca6a377d51b011': 'f9a77da6177275249fb3ab3a9bc9e799',
  '666f230ec6266eb366f06f475939f3f6': '74a46ea6e50b477401d325c40136573c',
  '38cbbdf0801776761f36e149447cb1a7': '479b7f739abd467eba6c33da0d6a6fd8',

  // app_patches/app/app.bundle.js -- the XDG-portal screen-capture build that
  // ensure-extracted-app.sh / setup.sh overlay onto app/ during a clean build.
  // Absent from stubs.js because stubs.js only ever ran against a tree where
  // the overlay was already applied by hand; a packaged build regenerates app/
  // from scratch and lands on this hash, so it must be mapped or the tamper
  // check sees an unrecognised digest.
  'eb6b221347d45ef572b4b9e501c9c4f0': '479b7f739abd467eba6c33da0d6a6fd8'
};

function patchCryptoObject(targetCrypto) {
  if (!targetCrypto || targetCrypto.__eagleMd5Patched) return targetCrypto;
  const origCreateHash = targetCrypto.createHash;
  if (typeof origCreateHash === 'function') {
    targetCrypto.createHash = function(algorithm, options) {
      const hash = origCreateHash.call(targetCrypto, algorithm, options);
      if (typeof algorithm === 'string' && algorithm.toLowerCase() === 'md5') {
        const origDigest = hash.digest;
        hash.digest = function(encoding) {
          let buf;
          try {
            buf = origDigest.apply(this, arguments);
          } catch (e) {
            return origDigest.apply(this, arguments);
          }
          const strHex = (Buffer.isBuffer(buf) ? buf.toString('hex') : String(buf)).toLowerCase();
          console.log(`[STUBS MD5 HASH COMPUTED]: ${strHex}`);
          if (md5Hashes[strHex]) {
            console.log(`[STUBS MD5 REWRITTEN]: ${strHex} -> ${md5Hashes[strHex]}`);
            const targetHex = md5Hashes[strHex];
            const targetBuf = Buffer.from(targetHex, 'hex');
            if (!encoding) return targetBuf;
            if (encoding === 'hex') return targetHex;
            return targetBuf.toString(encoding);
          }
          return buf;
        };
      }
      return hash;
    };
  }
  targetCrypto.__eagleMd5Patched = true;
  return targetCrypto;
}

patchCryptoObject(crypto);

// Intercept require('crypto') / require('node:crypto') and the standalone md5 module
const origModuleLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'md5' || (typeof request === 'string' && (request.endsWith('/md5') || request.endsWith('/md5/md5.js')))) {
    const md5Fn = origModuleLoad.apply(this, arguments);
    const wrappedMd5 = function(message, options) {
      const res = md5Fn(message, options);
      if (md5Hashes[res]) {
        return md5Hashes[res];
      }
      return res;
    };
    return Object.assign(wrappedMd5, md5Fn);
  }

  const res = origModuleLoad.apply(this, arguments);
  if (typeof request === 'string' && (request === 'crypto' || request === 'node:crypto')) {
    return patchCryptoObject(res);
  }
  return res;
};

module.exports = {
  md5Hashes,
  patchCryptoObject
};
