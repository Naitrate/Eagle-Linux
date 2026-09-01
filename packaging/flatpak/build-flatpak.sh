#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
BUILD_DIR="${REPO_DIR}/build"
MANIFEST="${SCRIPT_DIR}/cool.eagle.Eagle.yml"
FLATPAK_BUILD_DIR="${BUILD_DIR}/flatpak-build"
FLATPAK_REPO="${BUILD_DIR}/flatpak-repo"
OUTPUT_FILE="${BUILD_DIR}/cool.eagle.Eagle.flatpak"

echo "=== Building Flatpak Package ==="
bash "${REPO_DIR}/packaging/ensure-extracted-app.sh"

if ! command -v flatpak-builder >/dev/null 2>&1; then
    echo "[INFO] flatpak-builder not installed. Skipping Flatpak bundle creation."
    echo "[INFO] To build manually on a system with flatpak-builder:"
    echo "       flatpak-builder --force-clean ${FLATPAK_BUILD_DIR} ${MANIFEST}"
    exit 0
fi

rm -rf "${FLATPAK_BUILD_DIR}" "${FLATPAK_REPO}"
mkdir -p "${BUILD_DIR}"

echo "[INFO] Running flatpak-builder..."
flatpak-builder --force-clean --repo="${FLATPAK_REPO}" "${FLATPAK_BUILD_DIR}" "${MANIFEST}"

echo "[INFO] Creating single-file .flatpak bundle..."
flatpak build-bundle "${FLATPAK_REPO}" "${OUTPUT_FILE}" cool.eagle.Eagle

echo "=== Success: Flatpak bundle created at ${OUTPUT_FILE} ==="
