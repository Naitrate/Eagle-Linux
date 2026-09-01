#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
APPDIR="${REPO_DIR}/build/Eagle.AppDir"
OUTPUT_DIR="${REPO_DIR}/build"
APPIMAGETOOL="${REPO_DIR}/build/appimagetool"

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
rm -f "${OUTPUT_DIR}/Eagle-4.0.2-x86_64.AppImage" 2>/dev/null || true
unset SOURCE_DATE_EPOCH || true
ARCH=x86_64 APPIMAGE_EXTRACT_AND_RUN=1 "${APPIMAGETOOL_CMD}" "${APPDIR}" "${OUTPUT_DIR}/Eagle-4.0.2-x86_64.AppImage"
echo "=== Success: AppImage created at ${OUTPUT_DIR}/Eagle-4.0.2-x86_64.AppImage ==="
