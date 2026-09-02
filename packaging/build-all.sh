#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
BUILD_DIR="${REPO_DIR}/build"

echo "=================================================="
echo "      Eagle Linux Packaging Build Suite           "
echo "=================================================="

mkdir -p "${BUILD_DIR}"

# 1. Build AppImage
echo ""
if [ -f "${SCRIPT_DIR}/appimage/build-appimage.sh" ]; then
    bash "${SCRIPT_DIR}/appimage/build-appimage.sh"
fi

# 2. Build RPM (if rpmbuild is available)
echo ""
if command -v rpmbuild >/dev/null 2>&1; then
    bash "${SCRIPT_DIR}/fedora/build-rpm.sh"
    find "${BUILD_DIR}/rpm/RPMS" -name "*.rpm" -exec cp {} "${BUILD_DIR}/" \; 2>/dev/null || true
    echo "[INFO] RPM package copied to ${BUILD_DIR}/"
else
    echo "[INFO] Skipping RPM build (rpmbuild not installed)."
fi

# 3. Build Arch package (if makepkg is available)
echo ""
if command -v makepkg >/dev/null 2>&1; then
    echo "=== Building Arch Linux Package ==="
    (cd "${SCRIPT_DIR}/arch" && makepkg -d -f)
    find "${SCRIPT_DIR}/arch" -name "*.pkg.tar.zst" -exec cp {} "${BUILD_DIR}/" \; 2>/dev/null || true
    echo "[INFO] Arch Linux package copied to ${BUILD_DIR}/"
else
    echo "[INFO] To build Arch Linux package on Arch, run:"
    echo "       cd ${SCRIPT_DIR}/arch && makepkg -si"
    # Copy any pre-built .pkg.tar.zst if present
    find "${SCRIPT_DIR}/arch" -name "*.pkg.tar.zst" -exec cp {} "${BUILD_DIR}/" \; 2>/dev/null || true
fi

# 4. Build Flatpak bundle (if flatpak-builder is available)
echo ""
if [ -f "${SCRIPT_DIR}/flatpak/build-flatpak.sh" ]; then
    # build-flatpak.sh fails when flatpak-builder is missing, so that a CI run
    # cannot pass without producing a bundle. Skipping it here is a local
    # convenience, and it says so out loud rather than looking like a success.
    if command -v flatpak-builder >/dev/null 2>&1; then
        bash "${SCRIPT_DIR}/flatpak/build-flatpak.sh"
    else
        echo "*** SKIPPING Flatpak: flatpak-builder is not installed."
        echo "*** No .flatpak bundle will be in ${BUILD_DIR}."
        SKIPPED_FLATPAK=1
    fi
fi

echo "=================================================="
echo " All build artifacts available in: ${BUILD_DIR}"
if [ "${SKIPPED_FLATPAK:-0}" = "1" ]; then
    echo " NOTE: the Flatpak bundle was skipped (no flatpak-builder)."
fi
echo "=================================================="
