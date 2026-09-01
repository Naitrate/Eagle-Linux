const fs = require('fs');
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
