#!/usr/bin/env bash

# TODO: Not usable yet, the plan is to move to the Mac installer.

# Variables
INSTALLER_URL="https://r2-app.eagle.cool/releases"
INSTALLER_EXE="Eagle-4.0-x64-build23.exe"
TARGET_DIR="Windows"
EXTRACT_SCRIPT="extract_eagle_full.py"

# Download the installer (using -L to follow HTTP redirects to the actual .exe file)
echo "Downloading Eagle installer..."
curl -O "$INSTALLER_URL"/"$INSTALLER_EXE"

# Execute the Python extraction script with the required arguments
echo "Extracting files to $TARGET_DIR directory..."

python "$EXTRACT_SCRIPT" "$INSTALLER_EXE" .

rm -rf ./app.asar.unpacked ./app.asar "$INSTALLER_EXE"

echo "Extraction complete. Installing patch files..."

cp -r ./app_patches/. ./app/

echo "Patching complete."