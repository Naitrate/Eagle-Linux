%define _enable_debug_packages 0
%define debug_package %{nil}
%define __strip /bin/true
%global __brp_strip %{nil}
%global __brp_strip_comment_note %{nil}
%global __brp_strip_static_archive %{nil}

Name:           eagle
Version:        4.0.4
Release:        1%{?dist}
Summary:        Digital asset manager for designers (Linux Port)

License:        Proprietary
URL:            https://eagle.cool

# Everything the build needs must be declared here. An SRPM only carries
# files listed as SourceN, so anything merely copied into the source
# directory by .copr/Makefile disappears when COPR rebuilds from the SRPM in
# a fresh chroot. patches/ is a directory, so it travels as a tarball.
Source0:        ensure-extracted-app.sh
Source1:        extract-installer.py
Source2:        eagle-unpacked-layout.json
Source3:        patch.js
Source4:        ensure-electron.sh
Source5:        eagle.metainfo.xml
Source6:        patches.tar.gz
Source7:        app_patches.tar.gz

BuildRequires:  python3, curl, bash, unzip, patchelf
Requires:       python3, zstd, xdotool, ffmpeg, dbus-tools

%description
Eagle helps you collect, search, and organize your design files in one place.

This package requires RPM Fusion (free). Eagle depends on ffmpeg for video
and audio previews, and Fedora ships only ffmpeg-free in its official
repositories, which omits the codecs Eagle needs. Enable RPM Fusion before
installing, or dnf cannot satisfy the ffmpeg dependency. On RHEL and its
rebuilds, EPEL is needed as well.

%prep

%build
# Ensure app payload exists (extract if missing, e.g. COPR or mock chroots)
SRC_DIR="%{_sourcedir}"

# app_patches carries the Linux-specific overrides -- most importantly the
# XDG portal screen-capture implementation. ensure-extracted-app.sh overlays
# it onto the extracted payload, but only if the directory is present, and it
# is another thing that cannot travel in an SRPM unless declared as a Source.
# Without this the package builds happily and ships upstream's Windows
# screen-capture.js, so screenshots silently do not work.
tar -xzf %{SOURCE7} -C "${SRC_DIR}"
if [ ! -f "${SRC_DIR}/app_patches/app/js/lib/api/screen-capture.js" ]; then
    echo "[ERROR] app_patches did not unpack from %{SOURCE7}"
    exit 1
fi

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

# app/ is far too large to travel as a Source, so it is extracted in %build
# and located here. Everything else comes from a SourceN macro, which rpm
# guarantees is present whether we build locally or from an SRPM in a clean
# COPR chroot.
if [ -z "$app" ]; then
    echo "[ERROR] Could not locate the extracted app/ payload"
    exit 1
fi

cp -r "${app}" %{buildroot}/usr/share/eagle/

# Some bundled .node modules were compiled on NixOS and carry /nix/store
# paths in their RPATH, which rpm rejects as invalid runpaths and which would
# be dangling references on any other distribution. Nothing ever loads them:
# patches/native-modules.js overrides Module._extensions['.node'] and
# process.dlopen to return a proxy. Strip the stale paths rather than either
# shipping them or silencing rpm's check.
if ! command -v patchelf >/dev/null 2>&1; then
    echo "[ERROR] patchelf is required to strip stale RPATHs from bundled"
    echo "[ERROR] .node modules. Without it rpm rejects the build with"
    echo "[ERROR] 'contains an invalid runpath'."
    exit 1
fi
find %{buildroot}/usr/share/eagle/app -name '*.node' -type f -exec \
    patchelf --remove-rpath {} \;

# Bundle the Electron runtime rather than bootstrapping it via npx at first
# launch (npm >= 12 / Node >= 26 break that path).
bash %{SOURCE4} %{buildroot}/usr/share/eagle/electron

cp %{SOURCE3} %{buildroot}/usr/share/eagle/patch.js

# patch.js is a one-line shim around patches/index.js, so patches/ is just as
# mandatory -- without it the package installs cleanly and then crashes on
# launch.
tar -xzf %{SOURCE6} -C %{buildroot}/usr/share/eagle/
if [ ! -f %{buildroot}/usr/share/eagle/patches/index.js ]; then
    echo "[ERROR] patches/ did not unpack from %{SOURCE6}"
    exit 1
fi

cp "${app}/assets/icon.png" %{buildroot}/usr/share/icons/hicolor/512x512/apps/eagle.png
cp "${app}/assets/icon.png" %{buildroot}/usr/share/pixmaps/eagle.png

# AppStream metadata so software centres (Discover, GNOME Software) show the
# app with a description, categories and release history rather than a bare
# desktop entry.
mkdir -p %{buildroot}/usr/share/metainfo
cp %{SOURCE5} %{buildroot}/usr/share/metainfo/cool.eagle.Eagle.metainfo.xml

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
* Wed Sep 02 2026 Naitrate <git@naitrate.net> - 4.0.4-1
- Keep the "start hidden" preference when autostart copies the installed
  eagle.desktop: the copy was verbatim, so --hidden was dropped on every
  rpm, Arch and Nix install

* Wed Sep 02 2026 Naitrate <git@naitrate.net> - 4.0.3-1
- Stop every imported and renamed item being called "_": upstream's
  remainingFilenameLength() only sets a maximum for win32 and darwin, so on
  Linux it returned NaN and name.substr(0, NaN) emptied every filename
- Fix autostart under Flatpak and AppImage, where the entry pointed at a
  command that does not exist outside the sandbox or the AppImage mount
- Re-apply app_patches on incremental builds instead of only on a fresh
  extraction, so an override cannot go missing from a build
- Fix the main window failing to open on a clean install: the native-module
  interceptor matched substrings, so Eagle's own default-preferences.js was
  replaced by a stub and createWindow threw
- Declare patches, ensure-electron.sh and the metainfo as rpm Sources, so
  they survive a rebuild from the SRPM in a clean COPR chroot
- Ship AppStream metadata and screenshots for software centres

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
