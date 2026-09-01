#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

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
    echo "=== [SUCCESS] extracted_app/ extracted successfully ==="
fi
