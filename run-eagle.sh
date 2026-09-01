#!/usr/bin/env bash
# Eagle Linux Launcher Script

# Ensure custom NixOS binaries or system path resolution
export PATH="/run/current-system/sw/bin:$PATH"

# Force Electron to use XDG Desktop Portal for native desktop file pickers (KDE Plasma dialogs under KDE)
export GTK_USE_PORTAL=1

# Run Electron with the compatibility stub layer
exec npx --yes electron@22.3.7 \
    -r ./stubs.js app \
    --no-sandbox \
    "$@"