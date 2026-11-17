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

// --------------------------------------------------------------------------
// Wayland: drag items out as an HTML5 drag instead
//
// On Wayland, Electron 22's startDrag() offers text/uri-list but writes zero
// bytes when the drop target reads it, so file managers accept the drop and
// copy nothing. An ordinary HTML5 drag carrying text/uri-list transfers
// fine. On Wayland, let the browser drag Eagle starts go ahead (Eagle
// cancels it in favour of startDrag), give it the selected files' URIs,
// and swallow Eagle's 'ondragstart' request for that drag.
//
// Only text/uri-list is set: Eagle's own drop handlers treat a URL in
// text/plain, or an <img> in text/html, as a web image to import, and use
// their global `dragging` flag to recognise internal drags (onto folders,
// tags, the trash), which keeps working.
// --------------------------------------------------------------------------

const htmlDragScript = `
(function() {
  if (window.__eagleLinuxHtmlDrag || typeof window.onDragStartContainer !== 'function') {
    return !!window.__eagleLinuxHtmlDrag;
  }
  const { ipcRenderer } = require('electron');
  const { pathToFileURL } = require('url');

  let swallowDragStart = false;
  const originalSend = ipcRenderer.send;
  ipcRenderer.send = function(channel, ...args) {
    if (channel === 'ondragstart' && swallowDragStart) {
      swallowDragStart = false;
      return;
    }
    return originalSend.call(this, channel, ...args);
  };

  function draggedFileUris(event) {
    const scope = angular.element('body').scope();
    if (!scope || !scope.imagesDir) return [];
    const box = jQuery('.box').has(event.target)[0];
    const target = (box && scope.getItemByElement(box)) || scope.selected[0];
    const items = scope.selected && scope.selected.length ? scope.selected : [target];
    const imagesDir = decodeURIComponent(scope.imagesDir);
    return items
      .filter(item => item && item.id && item.name && item.ext)
      .map(item => pathToFileURL(
        imagesDir + item.id + '.info/' + item.name + '.' + item.ext).href);
  }

  const originalDragStart = window.onDragStartContainer;
  window.onDragStartContainer = function(event) {
    const dt = event && event.dataTransfer;
    let uris = [];
    try { uris = dt ? draggedFileUris(event) : []; } catch (e) {}
    if (uris.length === 0) return originalDragStart.apply(this, arguments);

    // Eagle cancels the browser drag first thing; keep it alive.
    event.preventDefault = function() {};
    const result = originalDragStart.apply(this, arguments);
    dt.clearData();
    dt.setData('text/uri-list', uris.join('\\r\\n') + '\\r\\n');
    // Copy only: a "move" drop would take the file out of the library.
    dt.effectAllowed = 'copy';
    swallowDragStart = true;
    console.log('[STUBS DRAG] HTML5 drag-out', uris);
    return result;
  };

  window.__eagleLinuxHtmlDrag = true;
  return true;
})();
`;

function installHtmlDrag(webContents) {
  // onDragStartContainer may not exist yet at dom-ready/did-finish-load,
  // so keep trying for a while after each load.
  let retryTimer = null;
  const inject = (attempt = 0) => {
    clearTimeout(retryTimer);
    if (webContents.isDestroyed()) return;
    const url = webContents.getURL() || '';
    if (!/\/app\/index\.html(\?|#|$)/.test(url)) return;
    webContents.executeJavaScript(htmlDragScript)
      .then(installed => {
        if (installed) {
          console.log('[STUBS DRAG] HTML5 drag-out installed');
        } else if (attempt < 60) {
          retryTimer = setTimeout(() => inject(attempt + 1), 500);
        } else {
          console.log('[STUBS DRAG] HTML5 drag-out not installed: onDragStartContainer missing');
        }
      })
      .catch(() => {});
  };
  webContents.on('dom-ready', () => inject());
  webContents.on('did-finish-load', () => inject());
}

if (isMainProcess && process.platform === 'linux' && electron && electron.app) {
  const { usingWayland } = require('./wayland');
  electron.app.on('web-contents-created', (event, webContents) => {
    wrapStartDrag(webContents);
    if (usingWayland) installHtmlDrag(webContents);
  });
}

module.exports = {
  resolveDragPath,
  normaliseDragItem
};
