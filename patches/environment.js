const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');

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

// Fall back to an alternate port when Eagle's local server port is occupied
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
