# Fedora COPR Build Configuration Guide

This file documents the exact configuration required to build the `eagle` RPM package on [Fedora COPR](https://copr.fedorainfracloud.org/).

## 1. COPR SCM Project Settings

| Field | Value |
| :--- | :--- |
| **Type** | Git |
| **Clone URL** | `https://github.com/Naitrate/Eagle-Linux.git` |
| **Committish** | *(leave empty or `master`)* |
| **Subdirectory** | `.` |
| **Spec File** | `./packaging/fedora/eagle.spec` |
| **Build Method** | **`make srpm`** *(Required: Uses `.copr/Makefile` to assemble SRPM sources without repository file duplication)* |

> [!IMPORTANT]
> **Build Method MUST be set to `make srpm`**. Selecting `rpkg` will cause builds to fail because `rpkg` isolates the spec file without resolving top-level source dependencies. `make srpm` triggers `.copr/Makefile` which properly copies source files into COPR's output directory.

## 2. Build Isolation Settings

* **Enable internet access during build**: **Enabled (Checked)**
  * *Required so `curl` can download the upstream Eagle installer during extraction.*
* **Isolation**: **Default** (`mock` / `systemd-nspawn`)

## 3. How `make srpm` Works

The repository includes a `.copr/Makefile` at the repository root. When **`make srpm`** is selected in COPR:
1. COPR invokes `.copr/Makefile` to copy `ensure-extracted-app.sh`, `ensure-electron.sh`, `extract-installer.py`, `eagle-unpacked-layout.json`, `patch.js`, the `patches/` directory, and `eagle.spec` into the output directory.
2. It executes `rpmbuild -bs` to create the SRPM cleanly without duplicating files in the git repository.
3. COPR passes the SRPM to `mock` for final package creation across all target chroots.
