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

# This used to exit 0 when flatpak-builder was missing, so the script reported
# success while producing no bundle at all. Fail instead, and require the skip
# to be deliberate -- build-all.sh decides that, not this script.
if [ "${EAGLE_SKIP_FLATPAK:-0}" = "1" ]; then
    echo "[WARN] EAGLE_SKIP_FLATPAK=1 -- not building a Flatpak bundle."
    exit 0
fi

if ! command -v flatpak-builder >/dev/null 2>&1; then
    echo "[ERROR] flatpak-builder is not installed, so no Flatpak bundle can be built." >&2
    echo "[ERROR] Install it, or set EAGLE_SKIP_FLATPAK=1 to skip this target on purpose." >&2
    exit 1
fi

rm -rf "${FLATPAK_BUILD_DIR}" "${FLATPAK_REPO}"
mkdir -p "${BUILD_DIR}"

echo "[INFO] Running flatpak-builder..."
flatpak-builder --force-clean --repo="${FLATPAK_REPO}" "${FLATPAK_BUILD_DIR}" "${MANIFEST}"

echo "[INFO] Creating single-file .flatpak bundle..."
flatpak build-bundle "${FLATPAK_REPO}" "${OUTPUT_FILE}" cool.eagle.Eagle

if [ ! -s "${OUTPUT_FILE}" ]; then
    echo "[ERROR] flatpak build-bundle exited 0 but ${OUTPUT_FILE} is missing or empty" >&2
    exit 1
fi
echo "=== Success: Flatpak bundle created at ${OUTPUT_FILE} ==="
