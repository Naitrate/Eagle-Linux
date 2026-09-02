%define _enable_debug_packages 0
%define debug_package %{nil}
%define __strip /bin/true
%global __brp_strip %{nil}
%global __brp_strip_comment_note %{nil}
%global __brp_strip_static_archive %{nil}

Name:           eagle
Version:        4.0.2
Release:        1%{?dist}
Summary:        Digital asset manager for designers (Linux Port)

License:        Proprietary
URL:            https://eagle.cool

Source0:        ensure-extracted-app.sh
Source1:        extract-installer.py
Source2:        eagle-unpacked-layout.json
Source3:        patch.js

BuildRequires:  python3, curl, bash, unzip
Requires:       python3, zstd, xdotool, ffmpeg, dbus-tools

%description
Eagle helps you collect, search, and organize your design files in one place.

%prep

%build
# Ensure app payload exists (extract if missing, e.g. COPR or mock chroots)
SRC_DIR="%{_sourcedir}"
if [ ! -d "${SRC_DIR}/app" ] || [ ! -f "${SRC_DIR}/app/run.jsc" ]; then
    SCRIPT=""
    for candidate in \
        "${SRC_DIR}/ensure-extracted-app.sh" \
        "${SRC_DIR}/packaging/ensure-extracted-app.sh" \
        "$(dirname ${SRC_DIR})/packaging/ensure-extracted-app.sh"; do
        if [ -f "$candidate" ]; then
            SCRIPT="$candidate"
            break
        fi
    done

    if [ -n "$SCRIPT" ]; then
        bash "$SCRIPT"
    fi
fi

%install
rm -rf %{buildroot}
mkdir -p %{buildroot}/usr/share/eagle
mkdir -p %{buildroot}/usr/bin
mkdir -p %{buildroot}/usr/share/applications
mkdir -p %{buildroot}/usr/share/icons/hicolor/512x512/apps
mkdir -p %{buildroot}/usr/share/pixmaps
mkdir -p %{buildroot}/lib/udev/rules.d

app=""
PATCH_JS=""
PATCHES_DIR=""

for candidate in \
    "%{_sourcedir}/app" \
    "%{_sourcedir}/../app" \
    "$(dirname %{_sourcedir})/app" \
    "$(dirname $(dirname %{_sourcedir}))/app"; do
    if [ -d "$candidate" ] && [ -f "$candidate/run.jsc" ]; then
        app="$candidate"
        break
    fi
done

for candidate in \
    "%{_sourcedir}/patch.js" \
    "%{_sourcedir}/../patch.js" \
    "$(dirname %{_sourcedir})/patch.js" \
    "$(dirname $(dirname %{_sourcedir}))/patch.js"; do
    if [ -f "$candidate" ]; then
        PATCH_JS="$candidate"
        break
    fi
done

for candidate in \
    "%{_sourcedir}/patches" \
    "%{_sourcedir}/../patches" \
    "$(dirname %{_sourcedir})/patches" \
    "$(dirname $(dirname %{_sourcedir}))/patches"; do
    if [ -d "$candidate" ]; then
        PATCHES_DIR="$candidate"
        break
    fi
done

# patch.js is a one-line shim around patches/index.js, so patches/ is just as
# mandatory -- without it the package installs cleanly and then crashes on
# launch. Fail the build instead.
if [ -z "$app" ] || [ -z "$PATCH_JS" ] || [ -z "$PATCHES_DIR" ]; then
    echo "[ERROR] Could not locate app/, patch.js or patches/"
    exit 1
fi

cp -r "${app}" %{buildroot}/usr/share/eagle/

# Bundle the Electron runtime rather than bootstrapping it via npx at first
# launch (npm >= 12 / Node >= 26 break that path).
for c in "%{_sourcedir}/packaging/ensure-electron.sh" \
         "$(dirname %{_sourcedir})/packaging/ensure-electron.sh" \
         "%{_sourcedir}/ensure-electron.sh"; do
    if [ -f "$c" ]; then ENSURE_ELECTRON="$c"; break; fi
done
if [ -z "${ENSURE_ELECTRON:-}" ]; then
    echo "[ERROR] Could not locate ensure-electron.sh"
    exit 1
fi
bash "${ENSURE_ELECTRON}" %{buildroot}/usr/share/eagle/electron
cp "${PATCH_JS}" %{buildroot}/usr/share/eagle/patch.js
cp -r "${PATCHES_DIR}" %{buildroot}/usr/share/eagle/
cp "${app}/assets/icon.png" %{buildroot}/usr/share/icons/hicolor/512x512/apps/eagle.png
cp "${app}/assets/icon.png" %{buildroot}/usr/share/pixmaps/eagle.png

# AppStream metadata so software centres (Discover, GNOME Software) show the
# app with a description, categories and release history rather than a bare
# desktop entry.
mkdir -p %{buildroot}/usr/share/metainfo
for c in "%{_sourcedir}/packaging/eagle.metainfo.xml" \
         "$(dirname %{_sourcedir})/packaging/eagle.metainfo.xml" \
         "%{_sourcedir}/eagle.metainfo.xml"; do
    if [ -f "$c" ]; then cp "$c" %{buildroot}/usr/share/metainfo/cool.eagle.Eagle.metainfo.xml; break; fi
done

cat << 'EOF' > %{buildroot}/usr/bin/eagle
#!/bin/sh
export GTK_USE_PORTAL=1
export NODE_PATH="/usr/share/eagle/app/node_modules:${NODE_PATH:-}"

PATCH="/usr/share/eagle/patch.js"
APP="/usr/share/eagle/app"

# Prefer the Electron bundled with this package. Bootstrapping via npx is
# unreliable on current distros (npm >= 12 blocks install scripts; Node >= 26
# breaks Electron's extract-zip), so it is only a fallback now.
ELECTRON_BIN=""
for candidate in /usr/share/eagle/electron/electron /app/electron/electron; do
    if [ -x "${candidate}" ]; then
        ELECTRON_BIN="${candidate}"
        break
    fi
done

if [ -n "${ELECTRON_BIN}" ]; then
    :
elif command -v electron22 >/dev/null 2>&1; then
    ELECTRON_BIN="$(command -v electron22)"
elif command -v npx >/dev/null 2>&1; then
    # Prime the npx cache before healing it. npm >= 12 blocks postinstall
    # scripts via its allowScripts policy and --ignore-scripts=false no longer
    # overrides that, so this first call may leave electron unpacked but
    # without its binary. The heal loop below then runs install.js directly.
    # Without priming, a cold cache has nothing to heal and the launch fails.
    npx --yes --ignore-scripts=false electron@22.3.7 --version >/dev/null 2>&1 || true
    for cache_dir in "${HOME}/.npm/_npx/"*/node_modules/electron; do
        if [ -d "${cache_dir}" ] && [ ! -f "${cache_dir}/path.txt" ]; then
            if [ -f "${cache_dir}/install.js" ]; then
                (cd "${cache_dir}" && node install.js 2>/dev/null || true)
            fi
            if [ ! -f "${cache_dir}/path.txt" ]; then
                rm -rf "${cache_dir%/*/*}" 2>/dev/null || true
            fi
        fi
    done
    ELECTRON_BIN="npx --yes --ignore-scripts=false electron@22.3.7"
elif command -v electron >/dev/null 2>&1; then
    ELECTRON_BIN="$(command -v electron)"
else
    echo "[ERROR] No Electron runtime or nodejs/npm found. Please install nodejs & npm."
    exit 1
fi

exec ${ELECTRON_BIN} -r "${PATCH}" "${APP}" --no-sandbox "$@"
EOF
chmod +x %{buildroot}/usr/bin/eagle

cat << 'EOF' > %{buildroot}/usr/share/applications/eagle.desktop
[Desktop Entry]
Categories=Graphics;Utility;
Comment=Digital asset manager for designers
Exec=eagle %u
Icon=eagle
MimeType=application/x-eaglepack;application/x-eagleplugin;application/x-eaglelibrary;x-scheme-handler/eagle;
Name=Eagle
StartupNotify=true
StartupWMClass=Eagle
Terminal=false
Type=Application
Version=1.5
EOF

mkdir -p %{buildroot}/usr/share/mime/packages
cat << 'EOF' > %{buildroot}/usr/share/mime/packages/eagle.xml
<?xml version="1.0" encoding="UTF-8"?>
<mime-info xmlns="http://www.freedesktop.org/standards/shared-mime-info">
  <mime-type type="application/x-eaglepack">
    <comment>Eagle Pack</comment>
    <glob pattern="*.eaglepack"/>
    <icon name="application-x-eaglepack"/>
  </mime-type>

  <mime-type type="application/x-eagleplugin">
    <comment>Eagle Plugin</comment>
    <glob pattern="*.eagleplugin"/>
    <icon name="application-x-eagleplugin"/>
  </mime-type>

  <mime-type type="application/x-eaglelibrary">
    <comment>Eagle Library</comment>
    <glob pattern="*.eagle"/>
    <icon name="application-x-eaglelibrary"/>
  </mime-type>
</mime-info>
EOF

cat << 'EOF' > %{buildroot}/lib/udev/rules.d/99-eagle-dmi.rules
SUBSYSTEM=="dmi", KERNEL=="product_uuid", MODE="0444"
EOF

%files
/usr/bin/eagle
/usr/share/eagle/
/usr/share/applications/eagle.desktop
/usr/share/icons/hicolor/512x512/apps/eagle.png
/usr/share/pixmaps/eagle.png
/usr/share/mime/packages/eagle.xml
/usr/share/metainfo/cool.eagle.Eagle.metainfo.xml
/lib/udev/rules.d/99-eagle-dmi.rules

%changelog
* Tue Sep 01 2026 Naitrate <git@naitrate.net> - 4.0.2-1
- Migrate compatibility layer from stubs.js to modular patch.js + patches/
- Require patches/ at build time; a missing tree now fails instead of
  producing a package that crashes on launch
- Restore main-window minimize/maximize/close controls
- Correct anti-tamper digests for the app_patches XDG screen-capture build
- Bundle the Electron runtime at build time instead of bootstrapping it via
  npx at first launch, which fails on npm >= 12 (install scripts blocked by
  allowScripts) and Node >= 26 (extract-zip silently fails)
- Drop nodejs and npm from the runtime requirements

* Mon Aug 31 2026 Naitrate <git@naitrate.net> - 4.0.0-1
- Initial Fedora / RHEL package for Eagle Linux Port
