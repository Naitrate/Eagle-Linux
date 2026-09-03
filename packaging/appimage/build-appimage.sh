#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
APPDIR="${REPO_DIR}/build/Eagle.AppDir"
OUTPUT_DIR="${REPO_DIR}/build"
APPIMAGETOOL="${REPO_DIR}/build/appimagetool"

# Derive the version rather than hardcoding it. This used to be spelled out in
# three places, so a release bump could silently ship an AppImage named after
# the previous version. The spec is the single source of truth; EAGLE_VERSION
# overrides it for one-off builds.
VERSION="${EAGLE_VERSION:-$(sed -n 's/^Version:[[:space:]]*//p' "${REPO_DIR}/packaging/fedora/eagle.spec" | head -1)}"
if [ -z "${VERSION}" ]; then
    echo "[ERROR] could not read Version from packaging/fedora/eagle.spec" >&2
    exit 1
fi
OUTPUT_FILE="${OUTPUT_DIR}/Eagle-${VERSION}-x86_64.AppImage"
echo "[INFO] Building version ${VERSION}"

echo "=== Building AppImage Package Structure ==="
bash "${REPO_DIR}/packaging/ensure-extracted-app.sh"

if [ -d "${APPDIR}" ]; then
    chmod -R +w "${APPDIR}" 2>/dev/null || true
    rm -rf "${APPDIR}"
fi
mkdir -p "${APPDIR}/usr/bin" "${APPDIR}/usr/share/eagle" "${APPDIR}/usr/share/applications" "${APPDIR}/usr/share/icons/hicolor/512x512/apps" "${OUTPUT_DIR}"

# Place app, patch.js, and patches folder in root and usr/share/eagle
cp -r "${REPO_DIR}/app" "${APPDIR}/app"
cp "${REPO_DIR}/patch.js" "${APPDIR}/patch.js"
cp -r "${REPO_DIR}/patches" "${APPDIR}/patches"

cp -r "${REPO_DIR}/app" "${APPDIR}/usr/share/eagle/"
cp "${REPO_DIR}/patch.js" "${APPDIR}/usr/share/eagle/"
cp -r "${REPO_DIR}/patches" "${APPDIR}/usr/share/eagle/"

# Bundle the Electron runtime rather than bootstrapping it via npx at first
# launch (npm >= 12 / Node >= 26 break that path).
bash "${REPO_DIR}/packaging/ensure-electron.sh" "${APPDIR}/usr/share/eagle/electron"

# AppStream metadata, so the AppImage carries app info for tools that read it
mkdir -p "${APPDIR}/usr/share/metainfo"
cp "${REPO_DIR}/packaging/eagle.metainfo.xml" \
   "${APPDIR}/usr/share/metainfo/cool.eagle.Eagle.metainfo.xml"

# Bundle the tools Eagle's plugins shell out to. The rpm and Arch packages
# declare ffmpeg and exiv2 as dependencies, Nix puts them on PATH and the
# Flatpak builds exiv2 in-sandbox; an AppImage has no dependency mechanism, so
# they have to travel inside it or video/exif plugins silently fail on any host
# that happens not to have them.
TOOLS_LIB="${APPDIR}/usr/lib/eagle-tools"
mkdir -p "${TOOLS_LIB}"

for tool in ffmpeg ffprobe exiv2; do
    src="$(command -v "${tool}" 2>/dev/null || true)"
    if [ -z "${src}" ]; then
        echo "[ERROR] ${tool} not found on the build host, so it cannot be bundled." >&2
        echo "[ERROR] Install it (apt install ffmpeg exiv2) and re-run." >&2
        exit 1
    fi
    cp -L "${src}" "${APPDIR}/usr/bin/${tool}"
    chmod +x "${APPDIR}/usr/bin/${tool}"
done

# Copy each tool's shared libraries, leaving the core runtime to the host.
# Mixing a bundled glibc with the host's loader is the classic way to make an
# AppImage that only runs on the machine that built it.
for tool in ffmpeg ffprobe exiv2; do
    ldd "${APPDIR}/usr/bin/${tool}" 2>/dev/null | awk '/=> \//{print $3}' | while read -r lib; do
        case "${lib##*/}" in
            libc.so.*|libm.so.*|libpthread.so.*|libdl.so.*|librt.so.*|ld-linux*|libresolv.so.*)
                continue ;;
        esac
        [ -f "${TOOLS_LIB}/${lib##*/}" ] || cp -L "${lib}" "${TOOLS_LIB}/" 2>/dev/null || true
    done
done

# Point the bundled binaries at the bundled libraries. Doing this with RPATH
# rather than LD_LIBRARY_PATH keeps the override scoped to these three tools,
# so Electron still resolves its own libraries from the host.
if ! command -v patchelf >/dev/null 2>&1; then
    echo "[ERROR] patchelf is required to point the bundled tools at their libraries." >&2
    exit 1
fi

for tool in ffmpeg ffprobe exiv2; do
    patchelf --set-rpath '$ORIGIN/../lib/eagle-tools' "${APPDIR}/usr/bin/${tool}"
done

# The libraries need a runpath too. patchelf writes DT_RUNPATH, and unlike the
# older DT_RPATH that is not inherited by a library's own dependencies: ffmpeg
# would find libavdevice, then libavdevice would fail to find libraw1394 and
# the binary would die with "cannot open shared object file" despite that
# library sitting right beside it.
for lib in "${TOOLS_LIB}"/*.so*; do
    [ -f "${lib}" ] || continue
    patchelf --set-rpath '$ORIGIN' "${lib}" 2>/dev/null || true
done

echo "[INFO] Bundled tools: $(ls "${APPDIR}/usr/bin" | tr '\n' ' ')"
echo "[INFO] Bundled tool libraries: $(ls "${TOOLS_LIB}" 2>/dev/null | wc -l)"

# Running them here is necessary but not sufficient: the build host has the
# same libraries installed, so anything missing from the bundle is quietly
# satisfied from /usr/lib and the run still succeeds. Check where each
# dependency actually resolves from, which is what catches an incomplete
# bundle on a machine that cannot notice the difference.
echo "[INFO] Verifying every dependency resolves from inside the bundle..."
leaked=0
for tool in ffmpeg ffprobe exiv2; do
    while read -r soname _arrow libpath; do
        [ -n "${libpath}" ] || continue
        case "${libpath}" in
            "${APPDIR}"/*) continue ;;      # resolved from the bundle
        esac
        case "${soname}" in
            libc.so.*|libm.so.*|libpthread.so.*|libdl.so.*|librt.so.*|libresolv.so.*|*ld-linux*)
                continue ;;                 # deliberately left to the host
        esac
        echo "[ERROR] ${tool}: ${soname} resolves to ${libpath}, outside the bundle" >&2
        leaked=$((leaked + 1))
        # LD_LIBRARY_PATH outranks DT_RUNPATH, so a host that sets it would
        # shadow the bundled libraries and make this check report phantom
        # leaks. Clear it so we see what the bundle alone resolves.
    done < <(env -u LD_LIBRARY_PATH ldd "${APPDIR}/usr/bin/${tool}" 2>/dev/null | awk '/=> \//{print $1, $2, $3}')
done
if [ "${leaked}" -ne 0 ]; then
    echo "[ERROR] ${leaked} dependencies would come from the host, so this" >&2
    echo "[ERROR] AppImage would only work on machines that already have them." >&2
    exit 1
fi
echo "[INFO] All dependencies resolve from the bundle."

# Run them. Bundling something that cannot start is worse than not bundling it,
# and a linkage problem is invisible until a user drags in a video.
echo "[INFO] Verifying the bundled tools actually run..."
"${APPDIR}/usr/bin/ffmpeg"  -version >/dev/null 2>&1 || { echo "[ERROR] bundled ffmpeg fails to run"  >&2; "${APPDIR}/usr/bin/ffmpeg"  -version 2>&1 | head -2 >&2; exit 1; }
"${APPDIR}/usr/bin/ffprobe" -version >/dev/null 2>&1 || { echo "[ERROR] bundled ffprobe fails to run" >&2; "${APPDIR}/usr/bin/ffprobe" -version 2>&1 | head -2 >&2; exit 1; }
"${APPDIR}/usr/bin/exiv2"  --version >/dev/null 2>&1 || { echo "[ERROR] bundled exiv2 fails to run"   >&2; "${APPDIR}/usr/bin/exiv2"  --version 2>&1 | head -2 >&2; exit 1; }
echo "[INFO] All three bundled tools run correctly."

cp "${SCRIPT_DIR}/AppRun" "${APPDIR}/AppRun"
chmod +x "${APPDIR}/AppRun"

# Desktop file and icon for AppImage root
cp "${REPO_DIR}/app/assets/icon.png" "${APPDIR}/eagle.png"
cp "${REPO_DIR}/app/assets/icon.png" "${APPDIR}/usr/share/icons/hicolor/512x512/apps/eagle.png"

cat << 'EOF' > "${APPDIR}/eagle.desktop"
[Desktop Entry]
Categories=Graphics;Utility;
Comment=Digital asset manager for designers
Exec=AppRun %u
Icon=eagle
MimeType=application/x-eaglepack;application/x-eagleplugin;application/x-eaglelibrary;x-scheme-handler/eagle;
Name=Eagle
StartupNotify=true
StartupWMClass=Eagle
Terminal=false
Type=Application
Version=1.5
EOF

cp "${APPDIR}/eagle.desktop" "${APPDIR}/usr/share/applications/eagle.desktop"

# Download appimagetool if not available locally or in PATH
if ! command -v appimagetool >/dev/null 2>&1; then
    if [ ! -f "${APPIMAGETOOL}" ]; then
        echo "[INFO] Downloading appimagetool..."
        curl -sL https://github.com/AppImage/AppImageKit/releases/download/continuous/appimagetool-x86_64.AppImage -o "${APPIMAGETOOL}"
        chmod +x "${APPIMAGETOOL}"
    fi
    APPIMAGETOOL_CMD="${APPIMAGETOOL}"
else
    APPIMAGETOOL_CMD="appimagetool"
fi

echo "=== Packaging AppImage Binary ==="
rm -f "${OUTPUT_FILE}" 2>/dev/null || true
unset SOURCE_DATE_EPOCH || true
ARCH=x86_64 APPIMAGE_EXTRACT_AND_RUN=1 "${APPIMAGETOOL_CMD}" "${APPDIR}" "${OUTPUT_FILE}"

if [ ! -s "${OUTPUT_FILE}" ]; then
    echo "[ERROR] appimagetool exited 0 but ${OUTPUT_FILE} is missing or empty" >&2
    exit 1
fi
echo "=== Success: AppImage created at ${OUTPUT_FILE} ==="
