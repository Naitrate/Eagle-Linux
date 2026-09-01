const electron = require('electron');
const path = require('path');
const os = require('os');
const isMainProcess = !process.type || process.type === 'browser';

if (isMainProcess && electron) {
  const { app } = electron;
  let mainEagleWinId = null;

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

  if (electron.app) {
    electron.app.on('browser-window-created', (event, win) => {

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
          console.error('[STUBS BACKGROUND] Failed to hide background.html:', err);
        }
      };

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
          hideEagleBackgroundWindow('dom-ready');
          injectGlobalStyles();
        });

        win.webContents.on('did-finish-load', () => {
          hideEagleBackgroundWindow('did-finish-load');
          injectGlobalStyles();
        });

        win.webContents.on('did-frame-finish-load', () => {
          hideEagleBackgroundWindow('did-frame-finish-load');
        });

        win.webContents.on('page-title-updated', (evt, title) => {
          if (typeof title === 'string' && title.includes('Eagle')) {
            mainEagleWinId = win.id;
          }
          if (isEagleBackgroundWindow()) {
            hideEagleBackgroundWindow('page-title-updated');
          }
          injectGlobalStyles();
        });

        win.on('show', () => {
          if (isEagleBackgroundWindow()) {
            hideEagleBackgroundWindow('show');
          }
        });

        win.on('focus', () => {
          if (isEagleBackgroundWindow()) {
            hideEagleBackgroundWindow('focus');
          }
        });
      }

      if (!win || win.isDestroyed()) return;

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

      const checkAndInject = () => {
        if (!win || win.isDestroyed()) return;
        injectGlobalStyles();
        const code = `
        (function() {
          if (window.__eagleTitlebarInjected) return;
          window.__eagleTitlebarInjected = true;

          const isLinux = true;
          if (isLinux) {
            document.body.setAttribute('platform', 'linux');
            document.documentElement.setAttribute('platform', 'linux');
          }
        })();
        `;
        win.webContents.executeJavaScript(code).catch(() => {});
      };

      win.webContents.on('dom-ready', checkAndInject);
      win.webContents.on('did-finish-load', checkAndInject);
      win.on('page-title-updated', checkAndInject);
    });
  }
}

const OrigBrowserWindow = electron.BrowserWindow;

if (OrigBrowserWindow && !OrigBrowserWindow.__wrapped) {
  function CustomBrowserWindow(options = {}) {
    options = options || {};

    const width = Number(options.width) || 0;
    const height = Number(options.height) || 0;

    const isMainWindow = (
      (options.title && options.title.includes('Eagle')) ||
      (width >= 800 && height >= 500)
    );

    const isBackgroundWorker = (
      (options.title && options.title.toLowerCase().includes('background')) ||
      (options.webPreferences && options.webPreferences.nodeIntegrationInWorker)
    );

    options.webPreferences = options.webPreferences || {};
    options.webPreferences.devTools = true;
    options.webPreferences.backgroundThrottling = false;

    const isExplicitlyHidden = (options.show === false);

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

    const win = new OrigBrowserWindow(options);

    if (isExplicitlyHidden) {
      try { win.hide(); } catch (e) {}
      try { win.setSkipTaskbar(true); } catch (e) {}
      try { win.setFocusable(false); } catch (e) {}
      try { win.setOpacity(0); } catch (e) {}
    }

    return win;
  }

  Object.setPrototypeOf(CustomBrowserWindow, OrigBrowserWindow);
  Object.assign(CustomBrowserWindow, OrigBrowserWindow);
  CustomBrowserWindow.prototype = OrigBrowserWindow.prototype;
  CustomBrowserWindow.__wrapped = true;

  electron.BrowserWindow = CustomBrowserWindow;

  if (electron.remote && electron.remote.BrowserWindow) {
    electron.remote.BrowserWindow = CustomBrowserWindow;
  }

  electron.dialog.showErrorBox = function(title, content) {
    console.log('[STUBS] Intercepted and suppressed showErrorBox:', title, '->', content);
  };
}

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
}
