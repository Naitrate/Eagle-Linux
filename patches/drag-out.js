// ==========================================================================
// Drag-out to the desktop / file manager (main process)
//
// Eagle's renderer cancels the HTML5 drag and asks the main process to
// start a native one with webContents.startDrag({ files, icon }). Electron
// returns *silently* without dragging when the icon is empty, and a path
// Electron cannot stat (e.g. still URI-encoded, as Eagle's renderer keeps
// imagesDir) produces a drop the file manager ignores (issue #2).
//
// Wrap startDrag so each call is logged and normalised: decode paths that
// only exist decoded, drop the ones that do not exist at all, and fall back
// to the app icon when Eagle's drag image is missing.
// ==========================================================================

const fs = require('fs');
const { fileURLToPath } = require('url');
const { eagleTrayIconPng } = require('./tray-icon');

let electron;
try {
  electron = require('electron');
} catch (e) {}

const isMainProcess = !process.type || process.type === 'browser';

function resolveDragPath(p) {
  if (typeof p !== 'string' || p.length === 0) return null;
  const candidates = [p];
  if (p.startsWith('file://')) {
    try { candidates.push(fileURLToPath(p)); } catch (e) {}
  }
  try { candidates.push(decodeURIComponent(p)); } catch (e) {}
  return candidates.find(c => fs.existsSync(c)) || null;
}

function isUsableIcon(icon) {
  return !!(icon && typeof icon.isEmpty === 'function' && !icon.isEmpty());
}

function fallbackIcon() {
  const image = electron.nativeImage.createFromPath(eagleTrayIconPng);
  if (!image.isEmpty()) return image.resize({ width: 64 });
  // Any non-empty image will do; an empty one cancels the drag.
  return electron.nativeImage.createFromBitmap(
    Buffer.from([0, 0, 0, 0]),
    { width: 1, height: 1 }
  );
}

function normaliseDragItem(item) {
  const requested = []
    .concat(item && item.files ? item.files : [])
    .concat(item && item.file ? [item.file] : []);
  const files = requested.map(resolveDragPath).filter(Boolean);

  let icon = item && item.icon;
  if (typeof icon === 'string') {
    icon = electron.nativeImage.createFromPath(icon);
  }
  const iconOk = isUsableIcon(icon);

  console.log('[STUBS DRAG] startDrag', {
    requested,
    files,
    icon: iconOk ? icon.getSize() : 'empty -> app icon'
  });

  return { files, icon: iconOk ? icon : fallbackIcon() };
}

function wrapStartDrag(webContents) {
  if (!webContents || webContents.__eagleLinuxDragWrapped) return;
  const originalStartDrag = webContents.startDrag;
  if (typeof originalStartDrag !== 'function') return;

  webContents.startDrag = function(item) {
    let normalised;
    try {
      normalised = normaliseDragItem(item);
    } catch (err) {
      console.error('[STUBS DRAG] Could not normalise drag item:', err);
      return originalStartDrag.call(this, item);
    }
    if (normalised.files.length === 0) {
      console.log('[STUBS DRAG] No existing files to drag; ignoring');
      return;
    }
    return originalStartDrag.call(this, normalised);
  };
  webContents.__eagleLinuxDragWrapped = true;
}

if (isMainProcess && process.platform === 'linux' && electron && electron.app) {
  electron.app.on('web-contents-created', (event, webContents) => {
    wrapStartDrag(webContents);
  });
}

module.exports = {
  resolveDragPath,
  normaliseDragItem
};
