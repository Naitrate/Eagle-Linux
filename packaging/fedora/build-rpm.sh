#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
BUILD_DIR="${REPO_DIR}/build/rpm"

echo "=== Building Fedora / RHEL RPM Package ==="
bash "${REPO_DIR}/packaging/ensure-extracted-app.sh"

mkdir -p "${BUILD_DIR}/"{BUILD,RPMS,SOURCES,SPECS,SRPMS}

cp -r "${REPO_DIR}/extracted_app" "${BUILD_DIR}/SOURCES/"
cp "${REPO_DIR}/stubs.js" "${BUILD_DIR}/SOURCES/"
cp "${SCRIPT_DIR}/eagle.spec" "${BUILD_DIR}/SPECS/"

rpmbuild --define "_topdir ${BUILD_DIR}" -bb "${BUILD_DIR}/SPECS/eagle.spec"

echo "=== RPM Package Built Successfully in ${BUILD_DIR}/RPMS ==="
