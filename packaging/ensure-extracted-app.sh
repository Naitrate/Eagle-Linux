#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "${SCRIPT_DIR}/extract-installer.py" ]; then
    REPO_DIR="${SCRIPT_DIR}"
elif [ -f "${SCRIPT_DIR}/../extract-installer.py" ]; then
    REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
else
    REPO_DIR="${SCRIPT_DIR}"
fi

if [ ! -d "${REPO_DIR}/app" ] || [ ! -f "${REPO_DIR}/app/run.jsc" ]; then
    echo "=== [INFO] app/ or run.jsc not found. Extracting upstream Eagle Windows installer... ==="
    INSTALLER_EXE="${REPO_DIR}/Eagle-4.0-x64-build23.exe"
    
    if [ ! -f "${INSTALLER_EXE}" ]; then
        echo "[INFO] Downloading upstream Eagle Windows installer..."
        curl -sSL "https://r2-app.eagle.cool/releases/Eagle-4.0-x64-build23.exe" -o "${INSTALLER_EXE}"
    fi

    python3 "${REPO_DIR}/extract-installer.py" "${INSTALLER_EXE}" "${REPO_DIR}" "${REPO_DIR}/eagle-unpacked-layout.json"
    
    if [ ! -d "${REPO_DIR}/app" ]; then
        echo "[ERROR] Extraction failed to produce app/"
        exit 1
    fi

    if [ -d "${REPO_DIR}/app.asar.unpacked" ]; then
        echo "[INFO] Merging app.asar.unpacked into app..."
        cp -r "${REPO_DIR}/app.asar.unpacked/." "${REPO_DIR}/app/"
        rm -rf "${REPO_DIR}/app.asar.unpacked"
    fi
    
    if [ -d "${REPO_DIR}/app_patches" ]; then
        echo "[INFO] Merging app_patches..."
        cp -r "${REPO_DIR}/app_patches/." "${REPO_DIR}/app/"
    else
        # Skipping this silently produces a package that builds and installs
        # fine but ships upstream's Windows screen-capture.js, so screenshots
        # do not work and nothing says why.
        echo "[ERROR] app_patches/ not found at ${REPO_DIR}/app_patches" >&2
        echo "[ERROR] The Linux overrides (XDG screen capture, patched bundle)" >&2
        echo "[ERROR] would be missing from this build. Refusing to continue." >&2
        exit 1
    fi

    echo "[INFO] Normalizing Linux tray icon..."
    eagle_assets="${REPO_DIR}/app/assets"
    if [ -f "${eagle_assets}/icon.png" ]; then
        if [ -f "${eagle_assets}/icon.ico" ]; then
            mv "${eagle_assets}/icon.ico" "${eagle_assets}/icon.ico.windows" 2>/dev/null || true
        fi
        cp "${eagle_assets}/icon.png" "${eagle_assets}/icon.ico"
    fi

    echo "[INFO] Creating dummy NiuniuCapture.exe stub..."
    cat << 'EOF' > "${REPO_DIR}/app/NiuniuCapture.exe"
#!/bin/sh
exit 0
EOF
    chmod +x "${REPO_DIR}/app/NiuniuCapture.exe"
    if [ -d "${REPO_DIR}/app/app" ]; then
        cp "${REPO_DIR}/app/NiuniuCapture.exe" "${REPO_DIR}/app/app/NiuniuCapture.exe"
    fi

    echo "[INFO] Symlinking Linux illustration images..."
    for theme in dark light; do
        img_dir="${REPO_DIR}/app/app/assets/images/${theme}/illustrations"
        if [ -d "${img_dir}" ]; then
            for win_img in "${img_dir}"/*-win32.png; do
                if [ -f "${win_img}" ]; then
                    linux_img="${win_img%-win32.png}-linux.png"
                    cp "${win_img}" "${linux_img}" 2>/dev/null || true
                fi
            done
        fi
    done

    echo "=== [SUCCESS] app/ extracted & patched successfully ==="
fi
