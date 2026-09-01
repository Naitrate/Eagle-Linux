const os = require('os');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const electron = require('electron');
const child_process = require('child_process');
const isMainProcess = !process.type || process.type === 'browser';

// ==========================================================================
// Electron icon compatibility
//
// Eagle's Windows build uses icon.ico for the tray.
// Linux Electron is more reliable when given a PNG-backed NativeImage.
//
// Patch nativeImage early so any later Eagle code that calls:
//
//     nativeImage.createFromPath(".../icon.ico")
//
// transparently receives the Linux PNG instead.
// ==========================================================================

const eagleStubsDir = path.dirname(path.resolve(__filename));

// ==========================================================================
// Eagle AI Search Linux compatibility patch
//
// AI Search is installed dynamically into:
//   ~/.config/Eagle/Plugins/ai-search
//
// It is not part of extracted_app, so extracted_app_patches cannot modify it.
// Patch the plugin after it appears on disk.
// ==========================================================================

const eagleTrayIconPng = path.join(
  eagleStubsDir,
  'extracted_app',
  'assets',
  'icon.png'
);

console.log(
  `[STUBS ICON] Linux tray icon: ${eagleTrayIconPng}, ` +
  `exists=${fs.existsSync(eagleTrayIconPng)}`
);

if (
  electron &&
  electron.nativeImage &&
  !electron.nativeImage.__eagleLinuxIconWrapped
) {
  const originalNativeImageCreateFromPath =
  electron.nativeImage.createFromPath.bind(
    electron.nativeImage
  );

  electron.nativeImage.createFromPath = function(imagePath) {
    let resolvedPath = imagePath;

    if (
      typeof imagePath === 'string' &&
      imagePath.toLowerCase().endsWith('.ico')
    ) {
      const siblingPng = imagePath.replace(
        /\.ico$/i,
        '.png'
      );

      if (fs.existsSync(siblingPng)) {
        resolvedPath = siblingPng;
      } else if (fs.existsSync(eagleTrayIconPng)) {
        resolvedPath = eagleTrayIconPng;
      }

      console.log(
        '[STUBS ICON] nativeImage.createFromPath:',
        imagePath,
        '->',
        resolvedPath
      );
    }

    try {
      const image =
      originalNativeImageCreateFromPath(
        resolvedPath
      );

      console.log(
        '[STUBS ICON] NativeImage:',
        {
          path: resolvedPath,
          empty: image.isEmpty(),
                  size: image.getSize()
        }
      );

      return image;
    } catch (err) {
      console.error(
        '[STUBS ICON] NativeImage load failed:',
        resolvedPath,
        err
      );

      if (
        resolvedPath !== eagleTrayIconPng &&
        fs.existsSync(eagleTrayIconPng)
      ) {
        return originalNativeImageCreateFromPath(
          eagleTrayIconPng
        );
      }

      throw err;
    }
  };

  electron.nativeImage.__eagleLinuxIconWrapped = true;
}


console.log(`[STUBS] Eagle Linux Compatibility Layer (process.type: ${process.type || 'main'}).`);

// Enable native XDG Desktop Portal file picker (KDE file dialog under KDE Plasma)
process.env.GTK_USE_PORTAL = '1';

// 1. Ensure GTK FileChooser and GSettings desktop schemas are loaded on NixOS
try {
  const schemaDirs = [];
  const gsettingsBase = '/run/current-system/sw/share/gsettings-schemas';
  if (fs.existsSync(gsettingsBase)) {
    fs.readdirSync(gsettingsBase).forEach(d => {
      const p = path.join(gsettingsBase, d, 'glib-2.0/schemas');
      if (fs.existsSync(p)) schemaDirs.push(p);
    });
  }
  if (fs.existsSync('/nix/store')) {
    const storeDirs = fs.readdirSync('/nix/store');
    for (const d of storeDirs) {
      if (d.includes('gtk+3') || d.includes('gsettings-desktop-schemas') || d.includes('xdg-desktop-portal-gtk')) {
        const sDir = path.join('/nix/store', d, 'share/gsettings-schemas');
        if (fs.existsSync(sDir)) {
          for (const sd of fs.readdirSync(sDir)) {
            const p = path.join(sDir, sd, 'glib-2.0/schemas');
            if (fs.existsSync(p)) schemaDirs.push(p);
          }
        }
      }
    }
  }
  if (schemaDirs.length > 0) {
    process.env.GSETTINGS_SCHEMA_DIR = schemaDirs.join(':') + (process.env.GSETTINGS_SCHEMA_DIR ? `:${process.env.GSETTINGS_SCHEMA_DIR}` : '');
  }
} catch (e) {}

// Wrap path.join & path.resolve to prevent TypeError when Eagle passes undefined environment variables
const origPathJoin = path.join;
path.join = function(...args) {
  const safeArgs = args.map(a => (a === undefined || a === null) ? '' : String(a));
  return origPathJoin.apply(this, safeArgs);
};

const origPathResolve = path.resolve;
path.resolve = function(...args) {
  const safeArgs = args.map(a => (a === undefined || a === null) ? '' : String(a));
  return origPathResolve.apply(this, safeArgs);
};

// 2. Ensure Windows environment variables used by Eagle have fallback paths on Linux
const configDir = path.join(os.homedir(), '.config', 'Eagle');
const eagleAppDataDir = path.join(configDir, 'AppData');
try { fs.mkdirSync(eagleAppDataDir, { recursive: true }); } catch (e) {}

process.env.APPDATA = process.env.APPDATA || eagleAppDataDir;
process.env.LOCALAPPDATA = process.env.LOCALAPPDATA || eagleAppDataDir;
process.env.ProgramData = process.env.ProgramData || eagleAppDataDir;
process.env.PROGRAMFILES = process.env.PROGRAMFILES || os.tmpdir();
process.env.SYSTEMROOT = process.env.SYSTEMROOT || '/tmp';
process.env.WINDIR = process.env.WINDIR || '/tmp';
process.env.USERPROFILE = process.env.USERPROFILE || os.homedir();
process.env.HOMEDRIVE = process.env.HOMEDRIVE || 'C:';
process.env.HOMEPATH = process.env.HOMEPATH || os.homedir();
process.env.SystemDrive = process.env.SystemDrive || 'C:';
process.env.COMPUTERNAME = process.env.COMPUTERNAME || os.hostname() || 'LINUX-HOST';
process.env.USERNAME = process.env.USERNAME || process.env.USER || 'user';
process.env.USERDOMAIN = process.env.USERDOMAIN || 'WORKGROUP';
process.env.TEMP = process.env.TEMP || os.tmpdir();
process.env.TMP = process.env.TMP || os.tmpdir();
process.env.EDGE_NATIVE = 'edge_coreclr.node';

// Ensure system ffmpeg / ffprobe wrapper scripts & manifest exist in Eagle Plugins directory
try {
  const pluginsDir = path.join(os.homedir(), '.config', 'Eagle', 'Plugins');
  const ffmpegNames = ['ffmpeg-mac-x64', 'ffmpeg-mac-arm64', 'ffmpeg-win-x64'];

  for (const name of ffmpegNames) {
    const dir = path.join(pluginsDir, name);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const manifestPath = path.join(dir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      const manifestObj = {
        id: name,
        version: '6.1.0',
        name: 'FFmpeg',
        description: 'FFmpeg module with GPU acceleration'
      };
      fs.writeFileSync(manifestPath, JSON.stringify(manifestObj, null, 2));
    }

    const scriptFiles = ['ffmpeg', 'ffprobe', 'ffmpeg.exe', 'ffprobe.exe'];
    for (const sFile of scriptFiles) {
      const p = path.join(dir, sFile);
      const targetBin = sFile.includes('ffprobe') ? 'ffprobe' : 'ffmpeg';
      const scriptContent = `#!/bin/sh\nexec ${targetBin} "$@"\n`;
      try {
        let isOurWrapper = false;
        if (fs.existsSync(p)) {
          try {
            const content = fs.readFileSync(p, 'utf8');
            if (content.startsWith('#!/bin/sh')) isOurWrapper = true;
          } catch (e) {}
          if (!isOurWrapper) {
            fs.unlinkSync(p);
          }
        }
        if (!isOurWrapper) {
          fs.writeFileSync(p, scriptContent, { mode: 0o755 });
        }
      } catch (err) {}
    }
  }

  // Auto-fix CRLF line endings on shell scripts in Eagle Plugins
  const fixSh = (dir) => {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          fixSh(full);
        } else if (entry.isFile() && entry.name.endsWith('.sh')) {
          try {
            const str = fs.readFileSync(full, 'utf8');
            if (str.includes('\r\n')) {
              fs.writeFileSync(full, str.replace(/\r\n/g, '\n'), { mode: 0o755 });
            }
          } catch (e) {}
        }
      }
    } catch (e) {}
  };
  fixSh(pluginsDir);
} catch (e) {}
const net = require('net');
const origNetListen = net.Server.prototype.listen;
net.Server.prototype.listen = function(...args) {
  const onError = (err) => {
    if (err && err.code === 'EADDRINUSE') {
      const p = (typeof args[0] === 'number' && args[0] < 42000) ? args[0] + 10 : 41603;
      console.log(`[STUBS NET SERVER] Port ${args[0]} occupied, attempting fallback port ${p}`);
      try { origNetListen.call(this, p); } catch (e) {}
    }
  };
  this.once('error', onError);
  return origNetListen.apply(this, args);
};

// Electron Window & Lifecycle Management (Prevent white background windows and force clean exit)
if (isMainProcess && electron) {
  const { app } = electron;
  let mainEagleWinId = null;

  // IPC listener for main window controls (minimize, maximize, close)
  if (electron.ipcMain) {
    electron.ipcMain.on('eagle-main-window-action', (event, action) => {
      try {
        const win = electron.BrowserWindow.fromWebContents(event.sender);
        if (!win || win.isDestroyed()) return;

        if (action === 'minimize') {
          win.minimize();
        } else if (action === 'maximize') {
          if (win.isMaximized()) win.unmaximize();
          else win.maximize();
        } else if (action === 'close') {
          win.close();
        }
      } catch (err) {}
    });
  }

  // Run the suppression check repeatedly during startup
  if (electron.app) {
    electron.app.on('browser-window-created', (event, win) => {

      // ======================================================================
      // Eagle background.html compatibility fix
      //
      // We have confirmed that the unwanted white window is:
      //
      //   file:///.../app/background.html
      //
      // It is a real BrowserWindow used by Eagle for background functionality.
      // We DO NOT destroy it. We only prevent it from becoming visible.
      // ======================================================================

      const isEagleBackgroundWindow = () => {
        try {
          if (!win || win.isDestroyed()) return false;

          const url = win.webContents.getURL();

          return (
            typeof url === 'string' &&
            (
              url.includes('/app/background.html') ||
              url.endsWith('/background.html')
            )
          );
        } catch (e) {
          return false;
        }
      };

      const hideEagleBackgroundWindow = (reason) => {
        try {
          if (!win || win.isDestroyed()) return;
          if (!isEagleBackgroundWindow()) return;

          console.log(
            `[STUBS BACKGROUND] Hiding background.html window ` +
            `${win.id} (${reason})`
          );

          // This is the same operation that you confirmed works manually
          // through:
          //
          // require('@electron/remote').getCurrentWindow().hide()

          try {
            win.hide();
          } catch (e) {}

          try {
            win.setSkipTaskbar(true);
          } catch (e) {}

          try {
            win.setFocusable(false);
          } catch (e) {}

          try {
            win.setOpacity(0);
          } catch (e) {}
        } catch (err) {
          console.error(
            '[STUBS BACKGROUND] Failed to hide background.html:',
            err
          );
        }
      };

      // ----------------------------------------------------------------------
      // The URL is initially blank when browser-window-created fires, so wait
      // until navigation has started/finished before identifying the window.
      // ----------------------------------------------------------------------

      if (win.webContents) {

        win.webContents.on(
          'did-start-loading',
          () => {
            hideEagleBackgroundWindow('did-start-loading');
          }
        );

        win.webContents.on(
          'dom-ready',
          () => {
            let url = '';

            try {
              url = win.webContents.getURL();
            } catch (e) {}

            console.log(
              `[STUBS WINDOW ${win.id}] dom-ready URL:`,
              url
            );

            hideEagleBackgroundWindow('dom-ready');
          }
        );

        win.webContents.on(
          'did-finish-load',
          () => {
            let url = '';

            try {
              url = win.webContents.getURL();
            } catch (e) {}

            console.log(
              `[STUBS WINDOW ${win.id}] did-finish-load URL:`,
              url
            );

            hideEagleBackgroundWindow('did-finish-load');
          }
        );

        win.webContents.on(
          'did-frame-finish-load',
          () => {
            hideEagleBackgroundWindow('did-frame-finish-load');
          }
        );
      }

      // ----------------------------------------------------------------------
      // Eagle may call BrowserWindow.show() after background.html has loaded.
      //
      // Catch the native show event and immediately hide it again.
      // ----------------------------------------------------------------------

      win.on(
        'show',
        () => {
          if (isEagleBackgroundWindow()) {
            console.log(
              `[STUBS BACKGROUND] Eagle attempted to SHOW ` +
              `background.html window ${win.id}`
            );

            hideEagleBackgroundWindow('show');
          }
        }
      );

      win.on(
        'ready-to-show',
        () => {
          if (isEagleBackgroundWindow()) {
            hideEagleBackgroundWindow('ready-to-show');
          }
        }
      );

      win.on(
        'focus',
        () => {
          if (isEagleBackgroundWindow()) {
            hideEagleBackgroundWindow('focus');
          }
        }
      );

      // ======================================================================
      // Existing main-window injection logic
      // ======================================================================

      if (!win || win.isDestroyed()) return;

      const checkAndInject = () => {
        try {
          if (win.isDestroyed()) return;

          const title =
          win.getTitle ? win.getTitle() : '';

          const bounds =
          win.getBounds ? win.getBounds() : {};

          // Only inject into the large main Eagle window.
          if (title !== 'Eagle') return;
          if (bounds.width <= 700 || bounds.height <= 700) return;

          mainEagleWinId = win.id;
        } catch (e) {
          return;
        }

        const code = `
        (function() {
          if (document.title !== 'Eagle') return;
          if (document.getElementById('eagle-main-window-controls')) return;
          if (!document.body) return;

          const bar = document.createElement('div');

          bar.id = 'eagle-main-window-controls';

          bar.style.cssText =
          'position: fixed; top: 10px; right: 14px; ' +
          'z-index: 2147483647; display: flex; gap: 6px; ' +
          'align-items: center; -webkit-app-region: no-drag; ' +
          'user-select: none;';

          bar.innerHTML = \`
          <style>
          .eagle-win-btn {
            width: 28px !important;
            height: 28px !important;
            border-radius: 4px !important;
            border: none !important;
            outline: none !important;
            cursor: pointer !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            background-color: transparent !important;
            background: transparent !important;
            transition: background-color 0.15s ease !important;
            padding: 0 !important;
            margin: 0 !important;
            box-sizing: border-box !important;
          }

          .eagle-win-btn-default:hover {
            background-color: rgba(255, 255, 255, 0.14) !important;
          }

          .eagle-win-btn-close:hover {
            background-color: #d93838 !important;
          }

          .eagle-win-btn-close:hover svg path {
            stroke: #ffffff !important;
          }
          </style>

          <button
          id="eagle-main-win-min"
          class="eagle-win-btn eagle-win-btn-default"
          title="Minimize">

          <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          style="display:block;">

          <line
          x1="1"
          y1="5"
          x2="9"
          y2="5"
          stroke="rgba(255,255,255,0.75)"
          stroke-width="1.1"
          stroke-linecap="round"/>
          </svg>
          </button>

          <button
          id="eagle-main-win-max"
          class="eagle-win-btn eagle-win-btn-default"
          title="Maximize/Restore">

          <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          style="display:block;">

          <rect
          x="1"
          y="1"
          width="8"
          height="8"
          rx="1.5"
          fill="none"
          stroke="rgba(255,255,255,0.75)"
          stroke-width="1.1"/>
          </svg>
          </button>

          <button
          id="eagle-main-win-close"
          class="eagle-win-btn eagle-win-btn-close"
          title="Close">

          <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          style="display:block;">

          <path
          d="M2 2L8 8M8 2L2 8"
          stroke="rgba(255,255,255,0.75)"
          stroke-width="1.1"
          stroke-linecap="round"/>
          </svg>
          </button>
          \`;

          document.body.appendChild(bar);

          try {
            const { ipcRenderer } = require('electron');

            const minBtn =
            document.getElementById('eagle-main-win-min');

            const maxBtn =
            document.getElementById('eagle-main-win-max');

            const closeBtn =
            document.getElementById('eagle-main-win-close');

            if (minBtn) {
              minBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();

                ipcRenderer.send(
                  'eagle-main-window-action',
                  'minimize'
                );
              };
            }

            if (maxBtn) {
              maxBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();

                ipcRenderer.send(
                  'eagle-main-window-action',
                  'maximize'
                );
              };
            }

            if (closeBtn) {
              closeBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();

                ipcRenderer.send(
                  'eagle-main-window-action',
                  'close'
                );
              };
            }

          } catch (e) {}
        })();
        `;

        win.webContents
        .executeJavaScript(code)
        .catch(() => {});
      };

      win.webContents.on(
        'dom-ready',
        checkAndInject
      );

      win.webContents.on(
        'did-finish-load',
        checkAndInject
      );

      win.on(
        'page-title-updated',
        checkAndInject
      );
    });
  }

// ==========================================================================
// CustomBrowserWindow wrapper
// ==========================================================================

const OrigBrowserWindow = electron.BrowserWindow;

if (OrigBrowserWindow && !OrigBrowserWindow.__wrapped) {
  function CustomBrowserWindow(options = {}) {
    options = options || {};

    const width = Number(options.width) || 0;
    const height = Number(options.height) || 0;

    // ----------------------------------------------------------------------
    // IMPORTANT:
    //
    // Do NOT classify windows by size alone.
    //
    // background.html can be a large BrowserWindow while still being a
    // completely hidden utility/background renderer.
    //
    // The actual Eagle UI is identified by title="Eagle".
    // ----------------------------------------------------------------------

    const isMainWindow = (
      options.title === 'Eagle' &&
      width > 700 &&
      height > 700 &&
      options.show !== false
    );

    const isBackgroundWorker = false;

    if (isMainWindow) {
      options.show = true;
      options.skipTaskbar = false;
    } else {
      // Keep utility/background windows from being shown during creation.
      options.show = false;
      options.skipTaskbar = true;
      options.focusable = false;
      options.hasShadow = false;

      // Don't use transparent:true here unless Eagle requested it.
      // Just make the native window invisible.
      options.backgroundColor =
        options.backgroundColor || '#00000000';
    }

    console.log(
      `[STUBS WINDOW CREATED] ` +
      `title="${options.title}", ` +
      `size=${width}x${height}, ` +
      `show=${options.show}, ` +
      `isMainWindow=${isMainWindow}, ` +
      `isBackgroundWorker=${isBackgroundWorker}`
    );

    console.log(
      '[STUBS WINDOW OPTIONS]',
      JSON.stringify({
        title: options.title,
        width: options.width,
        height: options.height,
        x: options.x,
        y: options.y,
        show: options.show,
        frame: options.frame,
        transparent: options.transparent,
        backgroundColor: options.backgroundColor,
        hasShadow: options.hasShadow,
        resizable: options.resizable,
        movable: options.movable,
        focusable: options.focusable,
        skipTaskbar: options.skipTaskbar,
        webPreferences: options.webPreferences
      }, null, 2)
    );

    // ----------------------------------------------------------------------
    // Create the actual Electron window first.
    // ----------------------------------------------------------------------

    const win = new OrigBrowserWindow(options);

    console.log(`[STUBS WINDOW ${win.id}] created`);

    // ----------------------------------------------------------------------
    // Immediately force background windows invisible.
    // ----------------------------------------------------------------------

    const hideBackgroundWindow = (reason) => {
      if (!isBackgroundWorker) return;
      if (win.isDestroyed()) return;

      console.log(
        `[STUBS WINDOW ${win.id}] Keeping background window hidden` +
        (reason ? ` (${reason})` : '')
      );

      try {
        win.hide();
      } catch (e) {}

      try {
        win.setSkipTaskbar(true);
      } catch (e) {}

      try {
        win.setFocusable(false);
      } catch (e) {}

      try {
        win.setOpacity(0);
      } catch (e) {}
    };

    if (isBackgroundWorker) {
      hideBackgroundWindow('created');

      // --------------------------------------------------------------------
      // background.html is loaded after BrowserWindow creation.
      //
      // These hooks catch any point where Electron/Eagle tries to bring the
      // window back into the visible state.
      // --------------------------------------------------------------------

      if (win.webContents) {

        win.webContents.on(
          'did-start-loading',
          () => hideBackgroundWindow('did-start-loading')
        );

        win.webContents.on(
          'dom-ready',
          () => {
            let url = '';

            try {
              url = win.webContents.getURL();
            } catch (e) {}

            console.log(
              `[STUBS WINDOW ${win.id}] dom-ready URL:`,
              url
            );

            hideBackgroundWindow('dom-ready');
          }
        );

        win.webContents.on(
          'did-finish-load',
          () => {
            let url = '';

            try {
              url = win.webContents.getURL();
            } catch (e) {}

            console.log(
              `[STUBS WINDOW ${win.id}] did-finish-load URL:`,
              url
            );

            hideBackgroundWindow('did-finish-load');
          }
        );

        win.webContents.on(
          'did-frame-finish-load',
          () => hideBackgroundWindow('did-frame-finish-load')
        );
      }

      win.on(
        'show',
        () => {
          console.log(
            `[STUBS WINDOW ${win.id}] SHOW EVENT intercepted`
          );

          hideBackgroundWindow('show');
        }
      );

      win.on(
        'ready-to-show',
        () => {
          console.log(
            `[STUBS WINDOW ${win.id}] READY-TO-SHOW for background window`
          );

          hideBackgroundWindow('ready-to-show');
        }
      );

      win.on(
        'focus',
        () => {
          console.log(
            `[STUBS WINDOW ${win.id}] FOCUS EVENT on background window`
          );

          hideBackgroundWindow('focus');
        }
      );
    }

    // ----------------------------------------------------------------------
    // Window diagnostics
    // ----------------------------------------------------------------------

    try {
      console.log(
        `[STUBS WINDOW ${win.id}] bounds=`,
        win.getBounds()
      );
    } catch (e) {}

    try {
      console.log(
        `[STUBS WINDOW ${win.id}] visible=`,
        win.isVisible()
      );
    } catch (e) {}

    try {
      console.log(
        `[STUBS WINDOW ${win.id}] backgroundColor=`,
        win.getBackgroundColor()
      );
    } catch (e) {}

    if (win.webContents) {

      win.webContents.on(
        'did-start-loading',
        () => {
          console.log(
            `[STUBS WINDOW ${win.id}] did-start-loading`
          );
        }
      );

      win.webContents.on(
        'dom-ready',
        () => {
          console.log(
            `[STUBS WINDOW ${win.id}] dom-ready`
          );
        }
      );

      win.webContents.on(
        'did-finish-load',
        () => {
          console.log(
            `[STUBS WINDOW ${win.id}] did-finish-load`
          );

          try {
            console.log(
              `[STUBS WINDOW ${win.id}] URL:`,
              win.webContents.getURL()
            );
          } catch (e) {}
        }
      );

      win.webContents.on(
        'did-fail-load',
        (
          _event,
          errorCode,
          errorDescription,
          validatedURL
        ) => {
          console.log(
            `[STUBS WINDOW ${win.id}] did-fail-load`,
            {
              errorCode,
              errorDescription,
              validatedURL
            }
          );
        }
      );

      win.webContents.on(
        'render-process-gone',
        (_event, details) => {
          console.log(
            `[STUBS WINDOW ${win.id}] render-process-gone`,
            details
          );
        }
      );

      win.webContents.on(
        'console-message',
        (
          _event,
          level,
          message,
          line,
          sourceId
        ) => {
          console.log(
            `[STUBS WINDOW ${win.id}] renderer-console`,
            {
              level,
              message,
              line,
              sourceId
            }
          );
        }
      );
    }

    // ----------------------------------------------------------------------
    // Do NOT destroy background.html.
    //
    // Eagle actually uses this renderer for background functionality.
    // We only want it invisible.
    // ----------------------------------------------------------------------

    win.on('closed', () => {
      setTimeout(() => {
        try {
          const allWins =
            OrigBrowserWindow.getAllWindows();

          const visibleWins =
            allWins.filter(
              w =>
                !w.isDestroyed() &&
                w.isVisible()
            );

          if (visibleWins.length === 0) {
            console.log(
              '[STUBS] Main UI window closed, ' +
              'destroying remaining windows and exiting...'
            );

            allWins.forEach(w => {
              try {
                if (!w.isDestroyed()) {
                  w.destroy();
                }
              } catch (e) {}
            });

            if (app) {
              app.quit();
            }

            setTimeout(
              () => process.exit(0),
              100
            );
          }
        } catch (e) {
          process.exit(0);
        }
      }, 150);
    });

    return win;
  }

  Object.setPrototypeOf(
    CustomBrowserWindow,
    OrigBrowserWindow
  );

  Object.assign(
    CustomBrowserWindow,
    OrigBrowserWindow
  );

  CustomBrowserWindow.prototype =
    OrigBrowserWindow.prototype;

  CustomBrowserWindow.__wrapped = true;

  electron.BrowserWindow =
    CustomBrowserWindow;
}

// ==========================================================================
// CustomTray wrapper
//
// Eagle's Windows build passes:
//
//     /assets/icon.ico
//
// Linux Electron may fail when Tray receives the ICO path directly.
// Convert the path to a NativeImage first so Chromium/Electron never has
// to interpret the Windows ICO resource itself.
//
// The nativeImage.createFromPath() wrapper near the top of this file
// handles the actual ICO -> PNG conversion.
// ==========================================================================

const OrigTray = electron.Tray;

if (
  OrigTray &&
  !OrigTray.__eagleLinuxTrayWrapped
) {

  function resolveTrayImage(image) {

    // Eagle may already provide a NativeImage.
    if (
      image &&
      typeof image !== 'string'
    ) {
      console.log(
        '[STUBS TRAY] Received non-string image; preserving object'
      );

      return image;
    }

    if (typeof image !== 'string') {
      return image;
    }

    let imagePath = image;

    console.log(
      '[STUBS TRAY] Original image:',
      imagePath
    );

    // --------------------------------------------------------------
    // Windows ICO -> Linux PNG
    // --------------------------------------------------------------

    if (
      imagePath.toLowerCase().endsWith('.ico')
    ) {

      const siblingPng =
        imagePath.replace(
          /\.ico$/i,
          '.png'
        );

      if (
        fs.existsSync(siblingPng)
      ) {

        imagePath =
          siblingPng;

        console.log(
          '[STUBS TRAY] ICO -> sibling PNG:',
          imagePath
        );

      } else if (
        fs.existsSync(eagleTrayIconPng)
      ) {

        imagePath =
          eagleTrayIconPng;

        console.log(
          '[STUBS TRAY] ICO -> Linux tray PNG:',
          imagePath
        );
      }
    }

    // --------------------------------------------------------------
    // Missing image -> known-good Linux PNG
    // --------------------------------------------------------------

    if (
      typeof imagePath === 'string' &&
      !fs.existsSync(imagePath) &&
      fs.existsSync(eagleTrayIconPng)
    ) {

      console.log(
        '[STUBS TRAY] Missing image -> Linux tray PNG:',
        eagleTrayIconPng
      );

      imagePath =
        eagleTrayIconPng;
    }

    // --------------------------------------------------------------
    // Convert path to NativeImage.
    //
    // This is intentional even though nativeImage.createFromPath()
    // is already patched above. It guarantees Tray receives a
    // NativeImage rather than an ICO filename.
    // --------------------------------------------------------------

    if (
      typeof imagePath === 'string' &&
      electron.nativeImage
    ) {

      try {

        const nativeImage =
          electron.nativeImage.createFromPath(
            imagePath
          );

        console.log(
          '[STUBS TRAY] NativeImage created:',
          {
            path: imagePath,
            empty: nativeImage.isEmpty(),
            size: nativeImage.getSize()
          }
        );

        if (
          !nativeImage.isEmpty()
        ) {
          return nativeImage;
        }

        console.log(
          '[STUBS TRAY] NativeImage is empty:',
          imagePath
        );

      } catch (err) {

        console.error(
          '[STUBS TRAY] NativeImage conversion failed:',
          err
        );
      }
    }

    // Leave the original object/path intact as a last resort.
    return imagePath;
  }


  function CustomTray(image) {

    const resolvedImage =
      resolveTrayImage(image);

    console.log(
      '[STUBS TRAY] Creating Tray with:',
      typeof resolvedImage === 'string'
        ? resolvedImage
        : '[NativeImage]'
    );

    try {

      const tray =
        new OrigTray(
          resolvedImage
        );

      console.log(
        '[STUBS TRAY] Tray instance created successfully'
      );

      // ------------------------------------------------------------
      // Prevent Eagle from restoring the Windows ICO later through
      // Tray.setImage().
      // ------------------------------------------------------------

      const originalSetImage =
        tray.setImage;

      if (
        typeof originalSetImage === 'function'
      ) {

        tray.setImage = function(img) {

          console.log(
            '[STUBS TRAY] setImage called:',
            img
          );

          const resolved =
            resolveTrayImage(img);

          console.log(
            '[STUBS TRAY] setImage resolved:',
            typeof resolved === 'string'
              ? resolved
              : '[NativeImage]'
          );

          return originalSetImage.call(
            this,
            resolved
          );
        };
      }

      return tray;

    } catch (err) {

      console.error(
        '[STUBS TRAY] Tray creation failed:',
        err
      );

      // Do not let a tray failure prevent Eagle from starting.
      return {
        setToolTip: () => {},
        setContextMenu: () => {},
        on: () => {},
        destroy: () => {},
        setImage: () => {},
        setPressedImage: () => {}
      };
    }
  }


  Object.setPrototypeOf(
    CustomTray,
    OrigTray
  );

  Object.assign(
    CustomTray,
    OrigTray
  );

  CustomTray.prototype =
    OrigTray.prototype;

  CustomTray.__eagleLinuxTrayWrapped = true;

  electron.Tray =
    CustomTray;
}


// ==========================================================================
// Main-process window shutdown
// ==========================================================================

if (app) {

  app.on(
    'window-all-closed',
    () => {

      console.log(
        '[STUBS] All windows closed, shutting down Eagle process...'
      );

      app.quit();

      setTimeout(
        () => process.exit(0),
        200
      );
    }
  );
}

// End of:
//     if (isMainProcess && electron)
// ==========================================================================

}

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
  return str.startsWith('c:') || str.includes('system32/drivers') || str.includes('system32\\drivers') || str.includes('drivers/etc/hosts') || str.endsWith('/hosts');
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

// Original fs methods
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
  open: fs.open
};

// Hook fs existence, access, stat, read, open for Windows paths and DLL checks
fs.existsSync = function(p) {
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
  if (isHostPath(p) || isDllPath(p)) return undefined;
  return origFs.accessSync.apply(this, arguments);
};

fs.access = function(p, ...args) {
  const cb = args.find(a => typeof a === 'function');
  if (typeof p === 'number' || (typeof p !== 'string' && !Buffer.isBuffer(p) && !(p instanceof URL))) {
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
  if (typeof p === 'string' && p.includes('app.bundle.js')) {
    const stat = origFs.statSync.call(this, p, opts);
    return Object.assign(Object.create(Object.getPrototypeOf(stat)), stat, { size: 4408963 });
  }
  if (isHostPath(p) || isDllPath(p)) return dummyStat;
  return origFs.statSync.apply(this, arguments);
};

fs.stat = function(p, ...args) {
  const cb = args.find(a => typeof a === 'function');
  if (isHostPath(p) || isDllPath(p)) {
    if (cb) process.nextTick(() => cb(null, dummyStat));
    return;
  }
  return origFs.stat.apply(this, args);
};

const backupAppBundle = path.join(__dirname, 'backup/1/extracted_app/app/app.bundle.js');
const backupIndexHtml = path.join(__dirname, 'backup/1/extracted_app/app/index.html');
const backupRunJs = path.join(__dirname, 'backup/1/extracted_app/run.js');

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

let isAppReadyForTamperCheck = false;
if (electron.app) {
  electron.app.on('ready', () => {
    isAppReadyForTamperCheck = true;
  });
}

fs.readFileSync = function(p, opts) {
  if (typeof p === 'string' && !p.includes('stubs')) {
    const stack = (new Error().stack || '');
    const isTamper =
    isAppReadyForTamperCheck ||
    stack.includes('evalmachine') ||
    stack.includes('tamper') ||
    stack.includes('hash');

    // ...existing tamper-check code...
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
    const stack = (new Error().stack || '');
    const isTamper = isAppReadyForTamperCheck || stack.includes('evalmachine') || stack.includes('tamper') || stack.includes('hash');

    if (isTamper && (p.endsWith('run.js') || p.endsWith('/run.js') || p.endsWith('\\run.js'))) {
      console.log('[STUBS FS] Intercepted readFile for run.js tamper check on:', p);
      const enc = parseEncoding(opts);
      const res = (fs.existsSync(backupRunJs)) ? origFs.readFileSync.call(fs, backupRunJs) : untamperedRunJsBuffer;
      const formatted = enc ? res.toString(enc) : res;
      if (cb) process.nextTick(() => cb(null, formatted));
      return;
    }

    if (isTamper && p.includes('app.bundle.js')) {
      console.log('[STUBS FS] Intercepted readFile for app.bundle.js tamper check on:', p);
      const enc = parseEncoding(opts);
      if (fs.existsSync(backupAppBundle)) {
        const b = origFs.readFileSync.call(fs, backupAppBundle);
        const formatted = enc ? b.toString(enc) : b;
        if (cb) process.nextTick(() => cb(null, formatted));
        return;
      }
    }

    if (isTamper && (p.endsWith('index.html') || p.endsWith('/index.html') || p.endsWith('\\index.html'))) {
      console.log('[STUBS FS] Intercepted readFile for index.html tamper check on:', p);
      const enc = parseEncoding(opts);
      if (fs.existsSync(backupIndexHtml)) {
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

fs.writeFileSync = function(p, data, opts) { if (isHostPath(p)) return undefined; return origFs.writeFileSync.call( fs, p, data, opts ); };

fs.writeFile = function(p, ...args) { const cb = args.find(a => typeof a === 'function'); if (isHostPath(p)) { if (cb) process.nextTick(() => cb(null)); return; } return origFs.writeFile.call( fs, p, ...args ); };

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

/*
 * --------------------------------------------------------------------------
 * Eagle Linux screenshot compatibility layer
 * --------------------------------------------------------------------------
 *
 * Eagle's Windows implementation invokes NiuniuCapture.exe.
 *
 * Linux screenshots are handled directly by screen-capture.js through:
 *
 *   org.freedesktop.portal.Screenshot.Screenshot
 *
 * Eagle modes:
 *
 *   mode 1 = window capture
 *   mode 2 = region capture
 *   mode 3 = fullscreen capture
 *
 * The portal implementation is intentionally NOT duplicated here.
 *
 * This stub only prevents Eagle's Windows-specific NiuniuCapture.exe
 * invocation from attempting to execute on Linux.
 * --------------------------------------------------------------------------
 */

const origExecFile = child_process.execFile;

child_process.execFile = function (file, args, options, callback) {
  if (typeof args === 'function') {
    callback = args;
    args = [];
    options = {};
  } else if (typeof options === 'function') {
    callback = options;
    options = {};
  }

  if (typeof file === 'string' && file.includes('NiuniuCapture')) {
    console.log(
      '[STUBS] NiuniuCapture.exe intercepted on Linux; ' +
      'screenshots must be handled by the XDG Desktop Portal.'
    );

    const error = new Error(
      'NiuniuCapture.exe is unavailable on Linux. ' +
      'Use org.freedesktop.portal.Screenshot instead.'
    );

    if (typeof callback === 'function') {
      process.nextTick(() => {
        callback(error, '', '');
      });
    }

    return;
  }

  return origExecFile.call(
    child_process,
    file,
    args,
    options,
    callback
  );
};


/* --------------------------------------------------------------------------
 * Resolve ffmpeg / ffprobe binaries by basename
 * -------------------------------------------------------------------------- */

function resolveMediaBin(cmdPath) {
  if (typeof cmdPath !== 'string') return cmdPath;

  const base = path.basename(cmdPath).toLowerCase();

  if (base.includes('ffprobe')) return 'ffprobe';
  if (base.includes('ffmpeg')) return 'ffmpeg';

  return cmdPath;
}


/* --------------------------------------------------------------------------
 * Original child_process functions
 * -------------------------------------------------------------------------- */

const origExecFileSync = child_process.execFileSync;
const origExecSync = child_process.execSync;
const origExec = child_process.exec;
const origSpawn = child_process.spawn;


/* --------------------------------------------------------------------------
 * Locate the Wayland parent window identifier.
 *
 * Electron does not expose this through a universal API, so we try several
 * environment variables and finally allow Eagle to run without a parent.
 *
 * KDE's portal accepts:
 *
 *   wayland:<surface-name>
 *
 * For Electron this is normally obtained from the native Wayland surface.
 *
 * -------------------------------------------------------------------------- */

function getPortalParentWindow() {
  /*
   * Explicit override is useful for debugging.
   *
   * Example:
   *
   *   EAGLE_PORTAL_PARENT=wayland:12345
   */
  if (process.env.EAGLE_PORTAL_PARENT) {
    return process.env.EAGLE_PORTAL_PARENT;
  }

  /*
   * Some Electron/GTK environments expose a usable parent through these.
   */
  const candidates = [
    process.env.XDG_PORTAL_PARENT_WINDOW,
    process.env.GTK_PARENT_WINDOW,
    process.env.WAYLAND_PARENT_WINDOW,
  ];

  for (const value of candidates) {
    if (value && typeof value === 'string') {
      return value;
    }
  }

  return '';
}

/* --------------------------------------------------------------------------
 * Build shell command safely.
 *
 * We do NOT use /bin/bash here.
 *
 * Your previous log showed:
 *
 *   spawn /bin/bash ENOENT
 *
 * NixOS may not provide /bin/bash in the way Node expects.
 *
 * Instead use the shell explicitly from PATH.
 * -------------------------------------------------------------------------- */

function shellQuote(value) {
  return "'" + String(value).replace(/'/g, "'\\''") + "'";
}

/* --------------------------------------------------------------------------
 * execFileSync
 *
 * Preserve normal behavior for everything except media binaries.
 * -------------------------------------------------------------------------- */

child_process.execFileSync = function(
  file,
  args,
  options
) {

  if (typeof file === 'string') {
    file = resolveMediaBin(file);
  }

  return origExecFileSync.call(
    child_process,
    file,
    args,
    options
  );
};


/* --------------------------------------------------------------------------
 * execSync
 * -------------------------------------------------------------------------- */

child_process.execSync = function(
  command,
  options
) {

  if (typeof command === 'string') {

    command =
      command.replace(
        /(?:^|\s)([^\s"'`]*ffmpeg(?:\.exe)?)(?=\s|$)/gi,
        match => {
          const leading =
            match.match(/^\s*/)?.[0] || '';

          return leading + 'ffmpeg';
        }
      );

    command =
      command.replace(
        /(?:^|\s)([^\s"'`]*ffprobe(?:\.exe)?)(?=\s|$)/gi,
        match => {
          const leading =
            match.match(/^\s*/)?.[0] || '';

          return leading + 'ffprobe';
        }
      );
  }

  return origExecSync.call(
    child_process,
    command,
    options
  );
};


/* --------------------------------------------------------------------------
 * exec
 * -------------------------------------------------------------------------- */

child_process.exec = function(
  command,
  options,
  callback
) {

  return origExec.call(
    child_process,
    command,
    options,
    callback
  );
};


/* --------------------------------------------------------------------------
 * spawn
 * -------------------------------------------------------------------------- */

child_process.spawn = function(
  file,
  args,
  options
) {

  if (typeof file === 'string') {

    file = resolveMediaBin(file);
  }

  return origSpawn.call(
    child_process,
    file,
    args,
    options
  );
};

function isMachineIdQuery(cmd) {
  if (!cmd) return false;
  const str = String(cmd).toLowerCase();
  return str.includes('cryptography') || str.includes('machineguid') || str.includes('reg.exe') || str.includes('reg query') || str.includes('hklm:') || str.includes('ioreg') || str.includes('system_profiler') || str.includes('hw.uuid') || str.includes('ioplatformexpertdevice') || str.includes('wmic csproduct') || str.includes('win32_computersystemproduct');
}

function formatAsGuid(str) {
  const clean = String(str || '').replace(/[^a-fA-F0-9]/g, '');
  if (clean.length < 32) return '5e83073c-4110-1c59-87c9-ffcdc7b622e8';
  return `${clean.slice(0, 8)}-${clean.slice(8, 12)}-${clean.slice(12, 16)}-${clean.slice(16, 20)}-${clean.slice(20, 32)}`.toLowerCase();
}

function getSystemMachineId() {
  try {
    if (origFs.existsSync('/sys/class/dmi/id/product_uuid')) {
      const uuid = origFs.readFileSync('/sys/class/dmi/id/product_uuid', 'utf8').trim();
      if (uuid && uuid.length >= 32) return formatAsGuid(uuid);
    }
  } catch (e) {}

  try {
    if (origFs.existsSync('/etc/machine-id')) {
      const mid = origFs.readFileSync('/etc/machine-id', 'utf8').trim();
      if (mid && mid.length >= 32) return formatAsGuid(mid);
    }
  } catch (e) {}

  try {
    if (origFs.existsSync('/var/lib/dbus/machine-id')) {
      const mid = origFs.readFileSync('/var/lib/dbus/machine-id', 'utf8').trim();
      if (mid && mid.length >= 32) return formatAsGuid(mid);
    }
  } catch (e) {}

  return '5e83073c-4110-1c59-87c9-ffcdc7b622e8';
}

const SYSTEM_MACHINE_GUID = getSystemMachineId();
console.log(`[STUBS MACHINE ID] System Machine GUID: ${SYSTEM_MACHINE_GUID}`);

function getMockRegOutput() {
  return `HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography\n    MachineGuid    REG_SZ    ${SYSTEM_MACHINE_GUID}\n`;
}

child_process.execFileSync = function(file, args, options) {
  const cmdStr = (file || '') + ' ' + (Array.isArray(args) ? args.join(' ') : '');
  if (isMachineIdQuery(cmdStr)) {
    console.log('[STUBS MACHINE ID QUERY (execFileSync)]:', cmdStr);
    return getMockRegOutput();
  }
  const resolved = resolveMediaBin(file);
  if (resolved !== file) {
    console.log(`[STUBS EXECFILESYNC REDIRECT]: ${file} -> ${resolved}`);
    return origExecFileSync.call(this, resolved, args, options);
  }
  return origExecFileSync.call(this, file, args, options);
};

child_process.execFile = function(file, args, options, callback) {
  if (typeof options === 'function') { callback = options; options = null; }
  const cmdStr = (file || '') + ' ' + (Array.isArray(args) ? args.join(' ') : '');
  if (isMachineIdQuery(cmdStr)) {
    console.log('[STUBS MACHINE ID QUERY (execFile)]:', cmdStr);
    if (callback) callback(null, getMockRegOutput(), '');
    return;
  }
  const resolved = resolveMediaBin(file);
  if (resolved !== file) {
    console.log(`[STUBS EXECFILE REDIRECT]: ${file} -> ${resolved}`);
    return origExecFile.call(this, resolved, args, options, callback);
  }
  return origExecFile.call(this, file, args, options, callback);
};

child_process.execSync = function(cmd, opts) {
  if (isMachineIdQuery(cmd) || (typeof cmd === 'string' && (cmd.includes('HKLM:') || cmd.includes('Cryptography') || cmd.includes('MachineGuid')))) {
    console.log('[STUBS MACHINE ID QUERY (execSync)]:', cmd);
    return getMockRegOutput();
  }
  if (typeof cmd === 'string' && (cmd.includes('powershell') || cmd.includes('powershell.exe'))) {
    let cleanCmd = cmd
      .replace(/powershell(\.exe)?/gi, '')
      .replace(/-NoProfile/gi, '')
      .replace(/-NonInteractive/gi, '')
      .replace(/-Command/gi, '')
      .replace(/Remove-item alias:curl;/gi, '')
      .replace(/Remove-Item -ErrorAction SilentlyContinue alias:curl;/gi, '')
      .trim();
    if ((cleanCmd.startsWith('"') && cleanCmd.endsWith('"')) || (cleanCmd.startsWith("'") && cleanCmd.endsWith("'"))) {
      cleanCmd = cleanCmd.slice(1, -1).trim();
    }
    console.log(`[STUBS POWERSHELL -> SH (execSync)]: ${cleanCmd}`);
    try {
      return origExecSync.call(this, cleanCmd, opts);
    } catch (err) {
      console.log(`[STUBS POWERSHELL -> SH FALLBACK (execSync)] Error:`, err.message);
      return Buffer.from('');
    }
  }
  return origExecSync.apply(this, arguments);
};

child_process.exec = function(cmd, opts, cb) {
  if (typeof opts === 'function') { cb = opts; opts = null; }
  if (isMachineIdQuery(cmd) || (typeof cmd === 'string' && (cmd.includes('HKLM:') || cmd.includes('Cryptography') || cmd.includes('MachineGuid')))) {
    console.log('[STUBS MACHINE ID QUERY (exec)]:', cmd);
    if (cb) cb(null, getMockRegOutput(), '');
    return;
  }
  if (typeof cmd === 'string' && (cmd.includes('powershell') || cmd.includes('powershell.exe'))) {
    let cleanCmd = cmd
      .replace(/powershell(\.exe)?/gi, '')
      .replace(/-NoProfile/gi, '')
      .replace(/-NonInteractive/gi, '')
      .replace(/-Command/gi, '')
      .replace(/Remove-item alias:curl;/gi, '')
      .replace(/Remove-Item -ErrorAction SilentlyContinue alias:curl;/gi, '')
      .trim();
    if ((cleanCmd.startsWith('"') && cleanCmd.endsWith('"')) || (cleanCmd.startsWith("'") && cleanCmd.endsWith("'"))) {
      cleanCmd = cleanCmd.slice(1, -1).trim();
    }
    console.log(`[STUBS POWERSHELL -> SH (exec)]: ${cleanCmd}`);
    return origExec.call(this, cleanCmd, opts, cb);
  }
  return origExec.call(this, cmd, opts, cb);
};

child_process.spawn = function(command, args, options) {
  const rawArgs = Array.isArray(args) ? args : [];
  let scriptCmd = rawArgs.join(' ');

  const resolved = resolveMediaBin(command);
  if (resolved !== command) {
    console.log(`[STUBS SPAWN REDIRECT]: ${command} -> ${resolved}`);
    return origSpawn.call(this, resolved, args, options);
  }

  if (typeof command === 'string' && (command.includes('powershell') || command.includes('powershell.exe'))) {
    console.log(`[STUBS POWERSHELL COMMAND DETECTED]: ${command} ${scriptCmd}`);

    if (scriptCmd.includes('HKLM:') || scriptCmd.includes('Cryptography') || scriptCmd.includes('MachineGuid')) {
      console.log('[STUBS POWERSHELL -> REGISTRY MOCK]');
      const { Readable, Writable } = require('stream');
      const { EventEmitter } = require('events');
      const dummyProc = new EventEmitter();
      const mockGuid = 'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography\n    MachineGuid    REG_SZ    5e83073c-4110-1c59-87c9-ffcdc7b622e8\n';
      dummyProc.stdout = new Readable({ read() { this.push(mockGuid); this.push(null); } });
      dummyProc.stderr = new Readable({ read() { this.push(null); } });
      dummyProc.stdin = new Writable({ write(chunk, enc, cb) { if (cb) cb(); } });
      dummyProc.kill = () => {};
      process.nextTick(() => {
        dummyProc.emit('close', 0);
        dummyProc.emit('exit', 0);
      });
      return dummyProc;
    }

    let cleanCmd = scriptCmd
      .replace(/Remove-item alias:curl;/gi, '')
      .replace(/Remove-Item -ErrorAction SilentlyContinue alias:curl;/gi, '')
      .replace(/-NoProfile/gi, '')
      .replace(/-NonInteractive/gi, '')
      .replace(/-Command/gi, '')
      .trim();

    if ((cleanCmd.startsWith('"') && cleanCmd.endsWith('"')) || (cleanCmd.startsWith("'") && cleanCmd.endsWith("'"))) {
      cleanCmd = cleanCmd.slice(1, -1).trim();
    }

    console.log(`[STUBS POWERSHELL -> SH FORWARDING]: /bin/sh -c "${cleanCmd}"`);
    return origSpawn.call(this, '/bin/sh', ['-c', cleanCmd], options);
  }

  if (typeof command === 'string' && command.includes('cmd.exe')) {
    console.log('[STUBS POWERSHELL -> CMD.EXE STUBBED]:', command);
    const { Readable, Writable } = require('stream');
    const { EventEmitter } = require('events');
    const dummyProc = new EventEmitter();
    dummyProc.stdout = new Readable({ read() { this.push(null); } });
    dummyProc.stderr = new Readable({ read() { this.push(null); } });
    dummyProc.stdin = new Writable({ write(chunk, enc, cb) { if (cb) cb(); } });
    dummyProc.kill = () => {};
    process.nextTick(() => {
      dummyProc.emit('close', 0);
      dummyProc.emit('exit', 0);
    });
    return dummyProc;
  }

  return origSpawn.apply(this, arguments);
};

// MD5 Hash mapping to pass anti-tamper
const md5Hashes = {
  'afe9aeeb940d22a258040a29934130ff': 'f9a77da6177275249fb3ab3a9bc9e799',
  'f447d0d0e9e2328604d79732b6f16f88': 'f9a77da6177275249fb3ab3a9bc9e799',
  'c2d4bad4bd8d772031ca6a377d51b011': 'f9a77da6177275249fb3ab3a9bc9e799',
  '666f230ec6266eb366f06f475939f3f6': '74a46ea6e50b477401d325c40136573c',
  '38cbbdf0801776761f36e149447cb1a7': '479b7f739abd467eba6c33da0d6a6fd8'
};

const origCreateHash = crypto.createHash;
crypto.createHash = function(algorithm, options) {
  const hash = origCreateHash.call(crypto, algorithm, options);
  if (typeof algorithm === 'string' && algorithm.toLowerCase() === 'md5') {
    const origDigest = hash.digest;
    hash.digest = function(encoding) {
      let buf;
      try {
        buf = encoding ? origDigest.call(this) : origDigest.apply(this, arguments);
      } catch (e) {
        return origDigest.apply(this, arguments);
      }
      const strHex = (Buffer.isBuffer(buf) ? buf.toString('hex') : String(buf)).toLowerCase();
      if (md5Hashes[strHex]) {
        const targetHex = md5Hashes[strHex];
        const targetBuf = Buffer.from(targetHex, 'hex');
        if (!encoding) return targetBuf;
        if (encoding === 'hex') return targetHex;
        return targetBuf.toString(encoding);
      }
      if (encoding && Buffer.isBuffer(buf)) {
        return buf.toString(encoding);
      }
      return buf;
    };
  }
  return hash;
};

// Intercept dialog.showOpenDialog for GTK directory selection
if (electron.dialog) {
  const origShowOpenDialog = electron.dialog.showOpenDialog;
  electron.dialog.showOpenDialog = function(...args) {
    let opts = args.find(arg => arg && typeof arg === 'object' && !arg.isDestroyed);
    if (opts && opts.properties && opts.properties.includes('openDirectory')) {
      delete opts.filters;
    }
    return origShowOpenDialog.apply(this, args);
  };

  const origShowOpenDialogSync = electron.dialog.showOpenDialogSync;
  if (origShowOpenDialogSync) {
    electron.dialog.showOpenDialogSync = function(...args) {
      let opts = args.find(arg => arg && typeof arg === 'object' && !arg.isDestroyed);
      if (opts && opts.properties && opts.properties.includes('openDirectory')) {
        delete opts.filters;
      }
      return origShowOpenDialogSync.apply(this, args);
    };
  }

  electron.dialog.showErrorBox = function(title, content) {
    console.log('[STUBS] Intercepted and suppressed showErrorBox:', title, '->', content);
  };
}

// App single-instance lock and method stubs
if (electron.app) {
  const origAppQuit = electron.app.quit;
  const origAppExit = electron.app.exit;
  electron.app.quit = function() {
    console.log('[STUBS] Executing app.quit()...');
    try { if (origAppQuit) origAppQuit.call(electron.app); } catch (e) {}
    setTimeout(() => process.exit(0), 200);
  };
  electron.app.exit = function(code) {
    console.log('[STUBS] Executing app.exit() with code:', code);
    try { if (origAppExit) origAppExit.call(electron.app, code); } catch (e) {}
    process.exit(code || 0);
  };

  const appMethods = [
    'setUserTasks', 'setJumpList', 'setAppUserModelId', 'clearRecentDocuments',
    'setAboutPanelOptions', 'showAboutPanel', 'badgeCount', 'setActivationPolicy'
  ];
  appMethods.forEach(method => {
    if (typeof electron.app[method] !== 'function') {
      electron.app[method] = function(...args) { return true; };
    }
  });

  const autostartFile = path.join(os.homedir(), '.config/autostart/eagle.desktop');
  const possibleDesktopFiles = [
    path.join(__dirname, 'eagle.desktop'),
    '/run/current-system/sw/share/applications/eagle.desktop',
    '/usr/share/applications/eagle.desktop',
    path.join(os.homedir(), '.local/share/applications/eagle.desktop')
  ];

  function cleanupStaleElectronDesktop() {
    try {
      const stale = path.join(os.homedir(), '.config/autostart/electron.desktop');
      if (fs.existsSync(stale)) {
        fs.unlinkSync(stale);
        console.log('[STUBS] Cleaned up stale electron.desktop autostart entry');
      }
    } catch (e) {}
  }

  electron.app.setLoginItemSettings = function(settings) {
    console.log('[STUBS] setLoginItemSettings called:', settings);
    cleanupStaleElectronDesktop();
    try {
      if (settings && settings.openAtLogin) {
        fs.mkdirSync(path.dirname(autostartFile), { recursive: true });
        const src = possibleDesktopFiles.find(p => fs.existsSync(p));
        if (src) {
          fs.copyFileSync(src, autostartFile);
          console.log('[STUBS] Created autostart entry from:', src);
        } else {
          const desktopContent = `[Desktop Entry]\nType=Application\nName=Eagle\nComment=Digital asset manager\nExec=eagle %u\nIcon=eagle\nTerminal=false\nStartupWMClass=Eagle\nCategories=Graphics;Utility;\n`;
          fs.writeFileSync(autostartFile, desktopContent, 'utf-8');
          console.log('[STUBS] Created fallback autostart entry:', autostartFile);
        }
      } else {
        if (fs.existsSync(autostartFile)) {
          fs.unlinkSync(autostartFile);
          console.log('[STUBS] Removed autostart entry:', autostartFile);
        }
      }
    } catch (e) {
      console.error('[STUBS] Error updating autostart settings:', e);
    }
  };

  electron.app.getLoginItemSettings = function() {
    cleanupStaleElectronDesktop();
    const exists = fs.existsSync(autostartFile);
    return {
      openAtLogin: exists,
      openAsHidden: false,
      wasOpenedAtLogin: false,
      executableWillLaunchAtLogin: exists
    };
  };

  if (!electron.app.dock) {
    electron.app.dock = {
      bounce: () => {}, cancelBounce: () => {}, setBadge: () => {},
      getBadge: () => '', hide: () => {}, show: () => {}, setIcon: () => {}, setMenu: () => {}
    };
  }
}

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

// Patch BrowserWindow prototype methods
if (electron.BrowserWindow) {
  const bwMethods = [
    'setThumbarButtons', 'setOverlayIcon', 'setFlashFrame', 'setSkipTaskbar',
    'setVibrancy', 'setOpacity', 'setRepresentedFilename', 'setDocumentEdited',
    'setProgressBar', 'setTouchBar', 'setWindowButtonVisibility', 'setAppDetails',
    'setUserTasks', 'setShape', 'setThumbnailClip', 'setThumbnailToolTip', 'setSheetOffset',
    'setIcon', 'removeWorkSpace', 'hookWindowMessage', 'unhookWindowMessage'
  ];
  bwMethods.forEach(method => {
    if (typeof electron.BrowserWindow.prototype[method] !== 'function') {
      electron.BrowserWindow.prototype[method] = createCallableProxy();
    }
  });
}

// SystemPreferences stubs
if (electron.systemPreferences) {
  const sysMethods = [
    'getAccentColor', 'isAeroGlassEnabled', 'getColor', 'getUserDefault',
    'subscribeNotification', 'unsubscribeNotification', 'getSystemColor'
  ];
  sysMethods.forEach(method => {
    if (typeof electron.systemPreferences[method] !== 'function') {
      electron.systemPreferences[method] = function(...args) { return '0078d7'; };
    }
  });
}

// Enable @electron/remote module in main process
let remoteMain;
if (isMainProcess) {
  try {
    const remoteMainPath = path.join(__dirname, 'extracted_app/node_modules/@electron/remote/main');
    if (fs.existsSync(remoteMainPath) || fs.existsSync(remoteMainPath + '.js') || fs.existsSync(path.join(remoteMainPath, 'index.js'))) {
      remoteMain = require(remoteMainPath);
      if (remoteMain && typeof remoteMain.initialize === 'function') {
        const origInit = remoteMain.initialize;
        remoteMain.initialize = function() {
          try { return origInit.apply(this, arguments); } catch (err) {}
        };
        if (electron.app) {
          electron.app.on('web-contents-created', (event, webContents) => {
            try { remoteMain.enable(webContents); } catch (err) {}
          });
        }
      }
    }
  } catch (err) {}
}

if (isMainProcess && electron.app) {
  electron.app.on('browser-window-created', (event, win) => {
    if (remoteMain && win && win.webContents) {
      try { remoteMain.enable(win.webContents); } catch (err) {}
    }
  });
}

// Renderer fixes: window.ig fallback and CSS body display fix
if (typeof window !== 'undefined') {
  let _ig = undefined;
  try {
    Object.defineProperty(window, 'ig', {
      get() {
        if (_ig) return _ig;
        return { getItems: () => [], render: () => {}, layout: () => {} };
      },
      set(v) { _ig = v; },
      configurable: true,
      enumerable: true
    });
  } catch (e) {}
}

if (typeof document !== 'undefined') {
  const showBody = () => {
    try {
      if (document.head) {
        const style = document.createElement('style');
        style.id = 'stubs-body-fix';
        style.innerHTML = 'body { display: block !important; }';
        document.head.appendChild(style);
      }
    } catch (e) {}
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', showBody);
  } else {
    showBody();
  }
}

// Module require & native binary interception
const Module = require('module');

const origDlopen = process.dlopen;
process.dlopen = function(module, filename, flags) {
  try {
    return origDlopen.call(process, module, filename, flags);
  } catch (err) {
    module.exports = createCallableProxy();
    return true;
  }
};

if (Module._extensions['.node']) {
  const origNodeExt = Module._extensions['.node'];
  Module._extensions['.node'] = function(module, filename) {
    try {
      return origNodeExt.call(this, module, filename);
    } catch (err) {
      module.exports = createCallableProxy();
    }
  };
}

const origResolveFilename = Module._resolveFilename;
Module._resolveFilename = function(request, parent, isMain, options) {
  if (typeof request === 'string' && (request.includes('edge_coreclr') || request.includes('edge_nativeclr') || request.includes('electron-edge-js'))) {
    return 'edge_coreclr.node';
  }
  return origResolveFilename.apply(this, arguments);
};

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (typeof request === 'string' && (request.includes('electron-edge-js') || request.includes('edge') || request.includes('edge_coreclr') || request === 'edge_coreclr.node')) {
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

  if (typeof request === 'string' && (request.includes('auto-launch') || request.includes('AutoLaunch'))) {
    console.log(`[STUBS] Intercepted auto-launch module: ${request}`);

    return class CustomAutoLaunch {
      constructor(options) {
        this.name = options ? options.name : 'Eagle';
        this.autostartPath = path.join(os.homedir(), '.config/autostart/eagle.desktop');
      }

      async enable() {
        console.log('[STUBS] CustomAutoLaunch.enable() called');
        cleanupStaleElectronDesktop();
        fs.mkdirSync(path.dirname(this.autostartPath), { recursive: true });
        const possibleDesktopFiles = [
          path.join(__dirname, 'eagle.desktop'),
          '/run/current-system/sw/share/applications/eagle.desktop',
          '/usr/share/applications/eagle.desktop',
          path.join(os.homedir(), '.local/share/applications/eagle.desktop')
        ];
        const src = possibleDesktopFiles.find(p => fs.existsSync(p));
        if (src) {
          fs.copyFileSync(src, this.autostartPath);
          console.log('[STUBS] CustomAutoLaunch copied desktop file from:', src);
        } else {
          const desktopContent = `[Desktop Entry]\nType=Application\nName=Eagle\nComment=Digital asset manager\nExec=eagle %u\nIcon=eagle\nTerminal=false\nStartupWMClass=Eagle\nCategories=Graphics;Utility;\n`;
          fs.writeFileSync(this.autostartPath, desktopContent, 'utf-8');
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

  if (request === 'md5' || (typeof request === 'string' && (request.endsWith('/md5') || request.endsWith('/md5/md5.js')))) {
    const md5Fn = originalLoad.apply(this, arguments);
    const wrappedMd5 = function(message, options) {
      const res = md5Fn(message, options);
      if (md5Hashes[res]) {
        return md5Hashes[res];
      }
      return res;
    };
    return Object.assign(wrappedMd5, md5Fn);
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

// ==========================================================================
// Eagle AI Search Linux compatibility patch
//
// Eagle installs the AI Search plugin dynamically into:
//   ~/.config/Eagle/Plugins/ai-search/
//
// The Windows plugin expects:
//   - a bundled Windows/macOS zstd binary
//   - an explicitly selected Python environment
//
// On Linux we use the system zstd and default to linux-x64-gpu.
// ==========================================================================

function patchAiSearchEnvironmentManager() {
  try {
    const pluginPath = path.join(
      os.homedir(),
      '.config',
      'Eagle',
      'Plugins',
      'ai-search'
    );

    const filePath = path.join(
      pluginPath,
      'modules',
      'environment-resource-manager',
      'index.js'
    );

    if (!fs.existsSync(filePath)) {
      return false;
    }

    const configPath = path.join(
      pluginPath,
      'modules',
      'environment-resource-manager',
      'config.json'
    );

    if (fs.existsSync(configPath)) {
      try {
        const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (configData.pythonEnvironments && !configData.pythonEnvironments['linux-x64-gpu']) {
          configData.pythonEnvironments['linux-x64-gpu'] = {
            name: 'Linux GPU (CUDA)',
            displayName: 'Linux GPU (CUDA)',
            description: 'Uses Linux system Python environment with GPU CUDA acceleration',
            url: '',
            md5: 'skip',
            platform: 'linux',
            arch: ['x64'],
            type: 'gpu',
            size: 0,
            installedSize: 0,
            extractTo: 'python-env',
            requirements: { chip: 'NVIDIA GPU / Linux', memory: '8GB+' },
            checkFiles: []
          };
          configData.pythonEnvironments['linux-x64-cpu'] = {
            name: 'Linux CPU',
            displayName: 'Linux CPU',
            description: 'Uses Linux system Python environment with CPU computation',
            url: '',
            md5: 'skip',
            platform: 'linux',
            arch: ['x64'],
            type: 'cpu',
            size: 0,
            installedSize: 0,
            extractTo: 'python-env',
            requirements: { chip: 'x64 CPU / Linux', memory: '8GB+' },
            checkFiles: []
          };
          fs.writeFileSync(configPath, JSON.stringify(configData, null, 4), 'utf8');
          console.log('[STUBS AI SEARCH] Added Linux environments to config.json');
        }
      } catch (cfgErr) {
        console.error('[STUBS AI SEARCH] Failed to patch config.json:', cfgErr);
      }
    }

    let source = fs.readFileSync(filePath, 'utf8');
    let changed = false;

    // ----------------------------------------------------------------------
    // 1. _checkZstd()
    // ----------------------------------------------------------------------

    if (
      source.includes('async _checkZstd()') &&
      !source.includes("if (process.platform === 'linux' || os.platform() === 'linux')")
    ) {
      source = source.replace(
        /async _checkZstd\(\)\s*\{/,
        `async _checkZstd() {
        if (process.platform === 'linux' || os.platform() === 'linux') {
            return 'valid';
        }`
      );

      changed = true;
      console.log('[STUBS AI SEARCH] Patched _checkZstd()');
    }

    // ----------------------------------------------------------------------
    // 2. _getSelectedPythonEnv()
    // ----------------------------------------------------------------------

    if (
      (source.includes('async _getSelectedPythonEnv') ||
        source.includes('_getSelectedPythonEnv()')) &&
      !source.includes("this.pythonEnvConfigs?.['linux-x64-gpu']")
    ) {
      const returnPattern =
        /(\s+return selectedKey && this\.pythonEnvConfigs \? this\.pythonEnvConfigs\[selectedKey\] : null;)/;

      if (returnPattern.test(source)) {
        source = source.replace(
          returnPattern,
          `
        // Linux: automatically select the bundled GPU Python environment
        if (
            !selectedKey &&
            (process.platform === 'linux' || os.platform() === 'linux') &&
            this.pythonEnvConfigs?.['linux-x64-gpu']
        ) {
            selectedKey = 'linux-x64-gpu';
            this._setPersistentValue(
                'selectedPythonEnvVersion',
                selectedKey
            );
        }

        return selectedKey && this.pythonEnvConfigs
            ? this.pythonEnvConfigs[selectedKey]
            : null;`
        );

        changed = true;
        console.log(
          '[STUBS AI SEARCH] Patched _getSelectedPythonEnv()'
        );
      }
    }

    // ----------------------------------------------------------------------
    // 3. installZstd()
    // ----------------------------------------------------------------------

    if (
      source.includes('async installZstd(callbacks = {})') &&
      !source.includes("message: 'System zstd used on Linux'") &&
      !source.includes("System zstd used on Linux")
    ) {
      const installPattern =
        /(async installZstd\(callbacks = \{\}\)\s*\{[\s\S]*?try\s*\{)/;

      if (installPattern.test(source)) {
        source = source.replace(
          installPattern,
          `$1
            if (process.platform === 'linux' || os.platform() === 'linux') {
                this._updateState('zstd', 'valid');
                onComplete?.({
                    component: 'zstd',
                    message: 'System zstd used on Linux'
                });
                return;
            }`
        );

        changed = true;
        console.log(
          '[STUBS AI SEARCH] Patched installZstd()'
        );
      }
    }

    if (changed) {
      fs.writeFileSync(filePath, source, 'utf8');

      console.log(
        '[STUBS AI SEARCH] AI Search Linux compatibility patch applied'
      );
    }

    const isFullyPatched =
      source.includes("this.pythonEnvConfigs?.['linux-x64-gpu']") &&
      source.includes("System zstd used on Linux");

    return isFullyPatched;

  } catch (err) {
    console.error(
      '[STUBS AI SEARCH] Failed to patch environment-resource-manager:',
      err
    );

    return false;
  }
}

function patchAiSearchPythonServer() {
  try {
    const pluginPath = path.join(
      os.homedir(),
      '.config',
      'Eagle',
      'Plugins',
      'ai-search'
    );
    const filePath = path.join(pluginPath, 'modules', 'python-server.js');
    if (!fs.existsSync(filePath)) return false;

    let source = fs.readFileSync(filePath, 'utf8');
    if (source.includes('getPythonExecutable()') && !source.includes('Using system python on Linux')) {
      const targetPattern = /(if \(!fs\.existsSync\(pythonPath\)\) \{)/;
      if (targetPattern.test(source)) {
        source = source.replace(
          targetPattern,
          `$1
            if (process.platform === 'linux' || os.platform() === 'linux') {
                try {
                    const { execSync } = require('child_process');
                    const sysPython = execSync('which python3 || which python', { encoding: 'utf8' }).trim();
                    if (sysPython && fs.existsSync(sysPython)) {
                        logger.info(\`[Python Server] Using system python on Linux: \${sysPython}\`);
                        return sysPython;
                    }
                } catch (e) {
                    logger.warn(\`[Python Server] Failed to resolve system python via which: \${e.message}\`);
                }
            }`
        );
        fs.writeFileSync(filePath, source, 'utf8');
        console.log('[STUBS AI SEARCH] Patched python-server.js for Linux fallback');
      }
    }
    return true;
  } catch (err) {
    console.error('[STUBS AI SEARCH] Failed to patch python-server.js:', err);
    return false;
  }
}

// Wait for Eagle to create/install the AI Search plugin.
if (isMainProcess) {
  let attempts = 0;

  const timer = setInterval(() => {
    attempts++;

    const res1 = patchAiSearchEnvironmentManager();
    const res2 = patchAiSearchPythonServer();

    if ((res1 && res2) || attempts >= 300) {
      clearInterval(timer);
    }
  }, 100);
}

// ==========================================================================
// Native KDE Plasma KGlobalAccel Shortcuts Integration (Main Process)
// ==========================================================================
function initKdePlasmaShortcutsInternal() {
  if (!isMainProcess || (process.platform !== 'linux' && os.platform() !== 'linux')) {
    return;
  }

  let allKeybinds = {};
  try {
    const defaultPrefsPath = path.join(eagleStubsDir, 'extracted_app', 'app', 'js', 'default-preferences.js');
    if (fs.existsSync(defaultPrefsPath)) {
      const defaultPrefs = require(defaultPrefsPath);
      if (defaultPrefs && defaultPrefs.shortcuts && defaultPrefs.shortcuts.keybinds) {
        allKeybinds = { ...defaultPrefs.shortcuts.keybinds };
      }
    }
  } catch (e) {
    console.warn('[STUBS KDE] Failed to load default-preferences:', e.message);
  }

  // Also merge user settings if present
  try {
    const userSettingsPath = path.join(os.homedir(), '.config', 'Eagle', 'settings.json');
    if (fs.existsSync(userSettingsPath)) {
      const userSettings = JSON.parse(fs.readFileSync(userSettingsPath, 'utf8'));
      if (userSettings && userSettings.shortcuts && userSettings.shortcuts.keybinds) {
        allKeybinds = { ...allKeybinds, ...userSettings.shortcuts.keybinds };
      }
    }
  } catch (e) {
    // Ignore if settings.json not found
  }

  const formatDisplayName = (key) => {
    const parts = key.split('.');
    const category = parts[0] ? parts[0].charAt(0).toUpperCase() + parts[0].slice(1) : '';
    const name = parts.slice(1).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
    return `${category}: ${name}`;
  };

  console.log(`[STUBS KDE] Registering all ${Object.keys(allKeybinds).length} native KDE Plasma shortcuts via D-Bus...`);

  for (const [actionKey, shortcutStr] of Object.entries(allKeybinds)) {
    // Exclude platform specific non-linux keybinds if any
    if (actionKey.endsWith('.darwin') && process.platform !== 'darwin') continue;
    if (actionKey.endsWith('.win32') && process.platform === 'darwin') continue;

    const displayName = formatDisplayName(actionKey);

    child_process.execFile('dbus-send', [
      '--session',
      '--type=method_call',
      '--dest=org.kde.kglobalaccel',
      '/kglobalaccel',
      'org.kde.KGlobalAccel.doRegister',
      'array:string:eagle.desktop,' + actionKey + ',Eagle,' + displayName
    ], (err) => {
      if (err) return;
    });
  }

  // Listen for D-Bus trigger signals from KDE Plasma
  try {
    const monitor = child_process.spawn('dbus-monitor', [
      "type='signal',interface='org.kde.KGlobalAccelComponent'"
    ]);

    if (monitor.stdout) {
      monitor.stdout.on('data', (data) => {
        const text = data.toString();
        for (const actionKey of Object.keys(allKeybinds)) {
          if (text.includes(actionKey)) {
            console.log(`[STUBS KDE] Global shortcut triggered: ${actionKey}`);
            
            const allWins = electron.BrowserWindow ? electron.BrowserWindow.getAllWindows() : [];
            const mainWin = allWins.find(w => w && !w.isDestroyed() && w.getBounds().width > 200);

            if (mainWin) {
              if (mainWin.isMinimized()) mainWin.restore();
              mainWin.show();
              mainWin.focus();

              mainWin.webContents.send('dispatch-shortcut', actionKey);
            }
            break;
          }
        }
      });
    }
  } catch (e) {
    console.warn('[STUBS KDE] Could not start dbus-monitor:', e.message);
  }
}

if (isMainProcess) {
  if (electron.app && electron.app.isReady && electron.app.isReady()) {
    initKdePlasmaShortcutsInternal();
  } else if (electron.app && electron.app.once) {
    electron.app.once('ready', initKdePlasmaShortcutsInternal);
  }
}

process.on('uncaughtException', (err) => {
  console.log('[UNCAUGHT EXCEPTION SUPPRESSED]', err.stack || err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.log('[UNHANDLED REJECTION SUPPRESSED]', reason);
});
