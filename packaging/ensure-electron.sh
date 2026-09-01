#!/usr/bin/env bash
#
# Fetch and unpack the Electron runtime that Eagle is bundled against.
#
#   usage: ensure-electron.sh <dest-dir> [cache-dir]
#
# Eagle used to bootstrap Electron at runtime via `npx electron@22.3.7`. That
# path is no longer reliable on current distributions:
#
#   * npm >= 12 blocks package install scripts by default (allowScripts), so
#     Electron's postinstall never runs and the binary is never downloaded.
#     --ignore-scripts=false does not override this.
#
#   * On Node >= 26 the extract-zip used by Electron's install.js fails
#     silently -- it exits 0 having written a partial dist/ and no path.txt,
#     so the failure is invisible until launch.
#
# Both were reproduced on stock Arch (Node 26.8.1 / npm 12.0.2). Bundling the
# runtime at build time removes the dependency on npm and Node entirely.
#
set -euo pipefail

ELECTRON_VERSION="22.3.7"
ELECTRON_SHA256="a04a8e95032e13808c6da3a244739edecbdb25e34accc8a8a53db257f225a5c9"
ELECTRON_ZIP="electron-v${ELECTRON_VERSION}-linux-x64.zip"
ELECTRON_URL="https://github.com/electron/electron/releases/download/v${ELECTRON_VERSION}/${ELECTRON_ZIP}"

DEST="${1:-}"
if [ -z "${DEST}" ]; then
    echo "[ERROR] usage: ensure-electron.sh <dest-dir> [cache-dir]" >&2
    exit 1
fi
CACHE_DIR="${2:-${TMPDIR:-/tmp}/eagle-electron-cache}"
ZIP_PATH="${CACHE_DIR}/${ELECTRON_ZIP}"

verify() {
    echo "${ELECTRON_SHA256}  ${1}" | sha256sum -c --status -
}

# Already unpacked and executable at the destination -- nothing to do.
if [ -x "${DEST}/electron" ]; then
    echo "[INFO] Electron ${ELECTRON_VERSION} already present at ${DEST}"
    exit 0
fi

mkdir -p "${CACHE_DIR}"

if [ -f "${ZIP_PATH}" ] && verify "${ZIP_PATH}"; then
    echo "[INFO] Using cached ${ELECTRON_ZIP}"
else
    echo "[INFO] Downloading Electron ${ELECTRON_VERSION}..."
    rm -f "${ZIP_PATH}"
    curl -fsSL "${ELECTRON_URL}" -o "${ZIP_PATH}"
    if ! verify "${ZIP_PATH}"; then
        echo "[ERROR] Checksum mismatch for ${ELECTRON_ZIP}" >&2
        echo "[ERROR] expected ${ELECTRON_SHA256}" >&2
        echo "[ERROR] got      $(sha256sum "${ZIP_PATH}" | cut -d' ' -f1)" >&2
        rm -f "${ZIP_PATH}"
        exit 1
    fi
fi

echo "[INFO] Unpacking Electron into ${DEST}..."
mkdir -p "${DEST}"
# Deliberately system unzip rather than Node: extract-zip fails silently on
# Node >= 26, which is the bug this script exists to route around.
unzip -q -o "${ZIP_PATH}" -d "${DEST}"
chmod +x "${DEST}/electron"

if [ ! -x "${DEST}/electron" ]; then
    echo "[ERROR] Electron binary missing after unpack: ${DEST}/electron" >&2
    exit 1
fi

echo "[INFO] Electron ${ELECTRON_VERSION} ready at ${DEST}/electron"
