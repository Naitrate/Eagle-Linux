#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
BUILD_DIR="${REPO_DIR}/build/rpm"

echo "=== Building Fedora / RHEL RPM Package ==="
bash "${REPO_DIR}/packaging/ensure-extracted-app.sh"

mkdir -p "${BUILD_DIR}/"{BUILD,RPMS,SOURCES,SPECS,SRPMS}

cp "${REPO_DIR}/packaging/ensure-extracted-app.sh" "${BUILD_DIR}/SOURCES/"
cp "${REPO_DIR}/packaging/ensure-electron.sh" "${BUILD_DIR}/SOURCES/"
cp "${REPO_DIR}/packaging/eagle.metainfo.xml" "${BUILD_DIR}/SOURCES/"
cp "${REPO_DIR}/extract-installer.py" "${BUILD_DIR}/SOURCES/"
cp "${REPO_DIR}/eagle-unpacked-layout.json" "${BUILD_DIR}/SOURCES/"
cp "${REPO_DIR}/patch.js" "${BUILD_DIR}/SOURCES/"
# patches/ is a directory; an SRPM can only carry files declared as SourceN,
# so it travels as a tarball. Keep this in step with .copr/Makefile.
tar -czf "${BUILD_DIR}/SOURCES/patches.tar.gz" -C "${REPO_DIR}" patches
tar -czf "${BUILD_DIR}/SOURCES/app_patches.tar.gz" -C "${REPO_DIR}" app_patches
cp -r "${REPO_DIR}/app" "${BUILD_DIR}/SOURCES/"
cp "${SCRIPT_DIR}/eagle.spec" "${BUILD_DIR}/SPECS/"

rpmbuild --nodeps --define "_topdir ${BUILD_DIR}" -bb "${BUILD_DIR}/SPECS/eagle.spec"

echo "=== RPM Package Built Successfully in ${BUILD_DIR}/RPMS ==="
