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

if [ ! -d "${REPO_DIR}/extracted_app" ] || [ ! -f "${REPO_DIR}/extracted_app/run.jsc" ]; then
    echo "=== [INFO] extracted_app/ or run.jsc not found. Extracting upstream Eagle Windows installer... ==="
    INSTALLER_EXE="${REPO_DIR}/Eagle-4.0-x64-build23.exe"
    
    if [ ! -f "${INSTALLER_EXE}" ]; then
        echo "[INFO] Downloading upstream Eagle Windows installer..."
        curl -sSL "https://r2-app.eagle.cool/releases/Eagle-4.0-x64-build23.exe" -o "${INSTALLER_EXE}"
    fi

    python3 "${REPO_DIR}/extract-installer.py" "${INSTALLER_EXE}" "${REPO_DIR}" "${REPO_DIR}/eagle-unpacked-layout.json"
    
    if [ ! -d "${REPO_DIR}/extracted_app" ]; then
        echo "[ERROR] Extraction failed to produce extracted_app/"
        exit 1
    fi

    if [ -d "${REPO_DIR}/app.asar.unpacked" ]; then
        echo "[INFO] Merging app.asar.unpacked into extracted_app..."
        cp -r "${REPO_DIR}/app.asar.unpacked/." "${REPO_DIR}/extracted_app/"
        rm -rf "${REPO_DIR}/app.asar.unpacked"
    fi
    
    if [ -d "${REPO_DIR}/extracted_app_patches" ]; then
        echo "[INFO] Merging extracted_app_patches..."
        cp -r "${REPO_DIR}/extracted_app_patches/." "${REPO_DIR}/extracted_app/"
    fi

    echo "[INFO] Normalizing Linux tray icon..."
    eagle_assets="${REPO_DIR}/extracted_app/assets"
    if [ -f "${eagle_assets}/icon.png" ]; then
        if [ -f "${eagle_assets}/icon.ico" ]; then
            mv "${eagle_assets}/icon.ico" "${eagle_assets}/icon.ico.windows" 2>/dev/null || true
        fi
        cp "${eagle_assets}/icon.png" "${eagle_assets}/icon.ico"
    fi

    echo "[INFO] Creating dummy NiuniuCapture.exe stub..."
    cat << 'EOF' > "${REPO_DIR}/extracted_app/NiuniuCapture.exe"
#!/bin/sh
exit 0
EOF
    chmod +x "${REPO_DIR}/extracted_app/NiuniuCapture.exe"
    if [ -d "${REPO_DIR}/extracted_app/app" ]; then
        cp "${REPO_DIR}/extracted_app/NiuniuCapture.exe" "${REPO_DIR}/extracted_app/app/NiuniuCapture.exe"
    fi

    echo "[INFO] Symlinking Linux illustration images..."
    for theme in dark light; do
        img_dir="${REPO_DIR}/extracted_app/app/assets/images/${theme}/illustrations"
        if [ -d "${img_dir}" ]; then
            for win_img in "${img_dir}"/*-win32.png; do
                if [ -f "${win_img}" ]; then
                    linux_img="${win_img%-win32.png}-linux.png"
                    cp "${win_img}" "${linux_img}" 2>/dev/null || true
                fi
            done
        fi
    done

    echo "=== [SUCCESS] extracted_app/ extracted & patched successfully ==="
fi
