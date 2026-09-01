let electron;
try {
  electron = require('electron');
} catch (e) {}
const fs = require('fs');
const path = require('path');
const { createCallableProxy } = require('./native-modules');
const {
  autostartFile,
  possibleDesktopFiles,
  fallbackDesktopContent,
  cleanupStaleElectronDesktop
} = require('./autostart');

const isMainProcess = !process.type || process.type === 'browser';

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

    electron.ipcMain.on('images-change', (event, images) => {
      console.log('[STUBS IPC] images-change received in main process:', Array.isArray(images) ? images.map(i => ({ id: i.id, name: i.name })) : images);
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

          try { win.hide(); } catch (e) {}
          try { win.setSkipTaskbar(true); } catch (e) {}
          try { win.setFocusable(false); } catch (e) {}
          try { win.setOpacity(0); } catch (e) {}
        } catch (err) {
          console.error(
            '[STUBS BACKGROUND] Failed to hide background.html:',
            err
          );
        }
      };

      const injectGlobalStyles = () => {
        try {
          if (win.isDestroyed() || !win.webContents) return;
          const globalCssCode = `
          (function() {
            if (!document.getElementById('eagle-global-style-fix')) {
              const style = document.createElement('style');
              style.id = 'eagle-global-style-fix';
              style.innerHTML = \`
                body, body[platform=linux], body[platform=win32], body[platform=darwin] {
                  background-color: var(--color-theme, #1f1f1f) !important;
                }
              \`;
              const target = document.head || document.documentElement || document.body;
              if (target) target.appendChild(style);
            }

            if (!window.__eagleContentEditablePolyfillInjected) {
              window.__eagleContentEditablePolyfillInjected = true;

              document.addEventListener('focusin', function(e) {
                const target = e.target;
                if (target && target.getAttribute && target.getAttribute('contenteditable') === 'plaintext-only') {
                  target.setAttribute('contenteditable', 'true');
                  target.style.webkitUserModify = 'read-write-plaintext-only';
                }
              }, true);

              document.addEventListener('input', function(e) {
                const target = e.target;
                if (target && target.isContentEditable) {
                  if (window.angular) {
                    try {
                      const $el = window.angular.element(target);
                      $el.triggerHandler('input');
                      $el.triggerHandler('change');
                    } catch (err) {}
                  }
                }
              }, true);

              document.addEventListener('keydown', function(e) {
                const target = e.target;
                if (target && target.isContentEditable && e.key === 'Enter') {
                  if (target.getAttribute('no-line-breaks') === 'true' || target.id === 'inspector-name') {
                    e.preventDefault();
                    e.stopPropagation();
                    target.blur();
                  }
                }
              }, true);
            }
          })();
          `;
          win.webContents.executeJavaScript(globalCssCode).catch(() => {});
        } catch (e) {}
      };

      // ----------------------------------------------------------------------
      // The URL is initially blank when browser-window-created fires, so wait
      // until navigation has started/finished before identifying the window.
      // ----------------------------------------------------------------------

      if (win.webContents) {
        try {
          if (win.webContents.setBackgroundThrottling) {
            win.webContents.setBackgroundThrottling(false);
          }
        } catch (e) {}

        win.webContents.on('ipc-message', (event, channel, ...args) => {
          if (channel === 'images-change' || channel.includes('image') || channel.includes('rename') || channel.includes('change')) {
            console.log(`[STUBS IPC-MESSAGE win ${win.id} (${channel})]:`, JSON.stringify(args));
          }
        });

        win.webContents.on('before-input-event', (event, input) => {
          if (input.type === 'keyDown') {
            if (
              input.key === 'F12' ||
              (input.control && input.shift && (input.key === 'I' || input.key === 'i')) ||
              (input.meta && input.alt && (input.key === 'I' || input.key === 'i'))
            ) {
              console.log(`[STUBS DEVTOOLS] Toggling DevTools for window ${win.id}`);
              try {
                win.webContents.toggleDevTools();
              } catch (e) {}
            }
          }
        });

        win.webContents.on('did-start-loading', () => {
          hideEagleBackgroundWindow('did-start-loading');
        });

        win.webContents.on('dom-ready', () => {
          let url = '';
          try {
            url = win.webContents.getURL();
          } catch (e) {}

          console.log(`[STUBS WINDOW ${win.id}] dom-ready URL:`, url);

          hideEagleBackgroundWindow('dom-ready');
        });

        win.webContents.on('did-finish-load', () => {
          let url = '';
          try {
            url = win.webContents.getURL();
          } catch (e) {}

          console.log(`[STUBS WINDOW ${win.id}] did-finish-load URL:`, url);

          hideEagleBackgroundWindow('did-finish-load');
        });

        win.webContents.on('did-frame-finish-load', () => {
          hideEagleBackgroundWindow('did-frame-finish-load');
        });
      }

      // ----------------------------------------------------------------------
      // Eagle may call BrowserWindow.show() after background.html has loaded.
      //
      // Catch the native show event and immediately hide it again.
      // ----------------------------------------------------------------------

      win.on('show', () => {
        if (isEagleBackgroundWindow()) {
          console.log(
            `[STUBS BACKGROUND] Eagle attempted to SHOW ` +
            `background.html window ${win.id}`
          );

          hideEagleBackgroundWindow('show');
        }
      });

      win.on('ready-to-show', () => {
        if (isEagleBackgroundWindow()) {
          hideEagleBackgroundWindow('ready-to-show');
        }
      });

      win.on('focus', () => {
        if (isEagleBackgroundWindow()) {
          hideEagleBackgroundWindow('focus');
        }
      });

      // ======================================================================
      // Main-window injection logic & global style injection
      // ======================================================================

      if (!win || win.isDestroyed()) return;

      const checkAndInject = () => {
        injectGlobalStyles();

        try {
          if (win.isDestroyed()) return;

          const title = win.getTitle ? win.getTitle() : '';
          const bounds = win.getBounds ? win.getBounds() : {};

          // Only inject window controls into the main Eagle window.
          //
          // title === 'Eagle' is the real discriminator (Eagle's viewer and
          // collect windows carry their own titles). The size test is only a
          // guard against tiny popups, so keep the floor low: the original
          // 700x700 threshold rejected ordinary main windows -- a restored
          // 1158x682 window failed the height check and got no controls.
          if (title !== 'Eagle') return;
          if (bounds.width < 600 || bounds.height < 400) return;

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
          body, body[platform=linux], body[platform=win32], body[platform=darwin] {
            background-color: var(--color-theme, #1f1f1f) !important;
          }

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

      win.webContents.on('dom-ready', checkAndInject);
      win.webContents.on('did-finish-load', checkAndInject);
      win.on('page-title-updated', checkAndInject);
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
    //
    // The authoritative signal for "this window must stay invisible" is
    // Eagle asking for it hidden (show: false). background.html is created
    // that way, and the URL-based enforcement in the browser-window-created
    // handler above catches it regardless. isMainWindow/isBackgroundWorker
    // below are diagnostics for the log line only -- do not gate behaviour
    // on them.
    // ----------------------------------------------------------------------

    const isMainWindow = (
      options.title === 'Eagle' &&
      width > 700 &&
      height > 700 &&
      options.show !== false
    );

    const isExplicitlyHidden = (options.show === false);
    const isBackgroundWorker = isExplicitlyHidden;

    options.webPreferences = options.webPreferences || {};
    options.webPreferences.devTools = true;
    options.webPreferences.backgroundThrottling = false;

    if (isExplicitlyHidden) {
      options.show = false;
      options.skipTaskbar = true;
      options.focusable = false;
    } else {
      options.show = true;
      if (options.skipTaskbar === undefined) options.skipTaskbar = false;
      if (options.focusable === undefined) options.focusable = true;
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

      try { win.hide(); } catch (e) {}
      try { win.setSkipTaskbar(true); } catch (e) {}
      try { win.setFocusable(false); } catch (e) {}
      try { win.setOpacity(0); } catch (e) {}
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

        win.webContents.on('dom-ready', () => {
          let url = '';
          try {
            url = win.webContents.getURL();
          } catch (e) {}

          console.log(`[STUBS WINDOW ${win.id}] dom-ready URL:`, url);

          hideBackgroundWindow('dom-ready');
        });

        win.webContents.on('did-finish-load', () => {
          let url = '';
          try {
            url = win.webContents.getURL();
          } catch (e) {}

          console.log(`[STUBS WINDOW ${win.id}] did-finish-load URL:`, url);

          hideBackgroundWindow('did-finish-load');
        });

        win.webContents.on(
          'did-frame-finish-load',
          () => hideBackgroundWindow('did-frame-finish-load')
        );
      }

      win.on('show', () => {
        console.log(`[STUBS WINDOW ${win.id}] SHOW EVENT intercepted`);
        hideBackgroundWindow('show');
      });

      win.on('ready-to-show', () => {
        console.log(`[STUBS WINDOW ${win.id}] READY-TO-SHOW for background window`);
        hideBackgroundWindow('ready-to-show');
      });

      win.on('focus', () => {
        console.log(`[STUBS WINDOW ${win.id}] FOCUS EVENT on background window`);
        hideBackgroundWindow('focus');
      });
    }

    // ----------------------------------------------------------------------
    // Window diagnostics
    // ----------------------------------------------------------------------

    try {
      console.log(`[STUBS WINDOW ${win.id}] bounds=`, win.getBounds());
    } catch (e) {}

    try {
      console.log(`[STUBS WINDOW ${win.id}] visible=`, win.isVisible());
    } catch (e) {}

    try {
      console.log(`[STUBS WINDOW ${win.id}] backgroundColor=`, win.getBackgroundColor());
    } catch (e) {}

    if (win.webContents) {

      win.webContents.on('did-start-loading', () => {
        console.log(`[STUBS WINDOW ${win.id}] did-start-loading`);
      });

      win.webContents.on('dom-ready', () => {
        console.log(`[STUBS WINDOW ${win.id}] dom-ready`);
      });

      win.webContents.on('did-finish-load', () => {
        console.log(`[STUBS WINDOW ${win.id}] did-finish-load`);

        try {
          console.log(`[STUBS WINDOW ${win.id}] URL:`, win.webContents.getURL());
        } catch (e) {}
      });

      win.webContents.on(
        'did-fail-load',
        (_event, errorCode, errorDescription, validatedURL) => {
          console.log(
            `[STUBS WINDOW ${win.id}] did-fail-load`,
            { errorCode, errorDescription, validatedURL }
          );
        }
      );

      win.webContents.on('render-process-gone', (_event, details) => {
        console.log(`[STUBS WINDOW ${win.id}] render-process-gone`, details);
      });

      win.webContents.on(
        'console-message',
        (_event, level, message, line, sourceId) => {
          console.log(
            `[STUBS WINDOW ${win.id}] renderer-console`,
            { level, message, line, sourceId }
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
          const allWins = OrigBrowserWindow.getAllWindows();

          const visibleWins = allWins.filter(
            w => !w.isDestroyed() && w.isVisible()
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

            setTimeout(() => process.exit(0), 100);
          }
        } catch (e) {
          process.exit(0);
        }
      }, 150);
    });

    return win;
  }

  Object.setPrototypeOf(CustomBrowserWindow, OrigBrowserWindow);
  Object.assign(CustomBrowserWindow, OrigBrowserWindow);
  CustomBrowserWindow.prototype = OrigBrowserWindow.prototype;
  CustomBrowserWindow.__wrapped = true;

  electron.BrowserWindow = CustomBrowserWindow;
}

// ==========================================================================
// Main-process window shutdown
// ==========================================================================

if (app) {
  app.on('window-all-closed', () => {
    console.log('[STUBS] All windows closed, shutting down Eagle process...');

    app.quit();

    setTimeout(() => process.exit(0), 200);
  });
}

// End of:
//     if (isMainProcess && electron)
// ==========================================================================

}

// Intercept dialog.showOpenDialog for GTK directory selection
if (electron && electron.dialog) {
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
if (electron && electron.app) {
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
          fs.writeFileSync(autostartFile, fallbackDesktopContent, 'utf-8');
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

// Patch BrowserWindow prototype methods
if (electron && electron.BrowserWindow) {
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
if (electron && electron.systemPreferences) {
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
    const remoteMainPath = path.join(path.resolve(__dirname, '..'), 'app/node_modules/@electron/remote/main');
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

if (isMainProcess && electron && electron.app) {
  electron.app.on('browser-window-created', (event, win) => {
    if (remoteMain && win && win.webContents) {
      try { remoteMain.enable(win.webContents); } catch (err) {}
    }
  });
}
