// ==========================================================================
// Linux file clipboard (replacement for my_modules/win-clipboard)
//
// Eagle's main process copies files through my_modules/win-clipboard, which
// builds a .NET DataObject via electron-edge-js. edge is stubbed on Linux, so
// writePaths() resolved with nothing written: Eagle showed "copied" while the
// system clipboard kept its old contents (issue #2).
//
// Publish the paths as text/uri-list instead. That is what Dolphin, Nautilus
// (GTK4 GdkFileList), Thunar and browsers read when pasting files. Electron
// can only put one raw format on the clipboard per write, so the
// image-alongside-files behaviour of the Windows build is not reproduced.
// ==========================================================================

const path = require('path');
const { pathToFileURL, fileURLToPath } = require('url');

let electron;
try {
  electron = require('electron');
} catch (e) {}

const URI_LIST = 'text/uri-list';
const GNOME_COPIED_FILES = 'x-special/gnome-copied-files';

function isWinClipboardRequest(request) {
  return /(^|[/\\])win-clipboard([/\\]index(\.js)?)?$/i.test(request);
}

function toUriList(paths) {
  return paths
    .filter(p => typeof p === 'string' && p.length > 0)
    .map(p => pathToFileURL(path.resolve(p)).href)
    .join('\r\n') + '\r\n';
}

// Accepts text/uri-list (comments and blank lines allowed) and
// x-special/gnome-copied-files ("copy"/"cut" on the first line).
function parseFileUris(text) {
  const paths = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const entry = line.trim();
    if (!entry.startsWith('file://')) continue;
    try {
      paths.push(fileURLToPath(entry));
    } catch (e) {}
  }
  return paths;
}

// Not gated on availableFormats(): Chromium omits types it does not know,
// such as x-special/gnome-copied-files, from that list.
function readFormat(clipboard, format) {
  try {
    return clipboard.readBuffer(format).toString('utf8');
  } catch (e) {
    return '';
  }
}

function writePaths(paths, callback) {
  const list = Array.isArray(paths) ? paths : [paths];
  try {
    electron.clipboard.writeBuffer(URI_LIST, Buffer.from(toUriList(list), 'utf8'));
    console.log(`[STUBS CLIPBOARD] Copied ${list.length} file(s) as ${URI_LIST}`);
    if (callback) process.nextTick(() => callback(null, null));
  } catch (err) {
    console.error('[STUBS CLIPBOARD] writePaths failed:', err);
    if (callback) process.nextTick(() => callback(err, null));
  }
}

function readPaths(callback) {
  let paths = [];
  try {
    const { clipboard } = electron;
    paths = parseFileUris(readFormat(clipboard, URI_LIST));
    if (paths.length === 0) {
      paths = parseFileUris(readFormat(clipboard, GNOME_COPIED_FILES));
    }
  } catch (err) {
    console.error('[STUBS CLIPBOARD] readPaths failed:', err);
  }
  // Eagle falls back to pasting clipboard image data when this is empty, so
  // always hand back an array rather than null.
  if (callback) process.nextTick(() => callback(null, paths));
}

module.exports = {
  isWinClipboardRequest,
  linuxWinClipboard: { readPaths, writePaths },
  toUriList,
  parseFileUris
};
