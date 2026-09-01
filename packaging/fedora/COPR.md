# Fedora COPR Build Configuration Guide

This file documents the exact configuration required to build the `eagle` RPM package on [Fedora COPR](https://copr.fedorainfracloud.org/).

## 1. COPR SCM Project Settings

| Field | Value |
| :--- | :--- |
| **Type** | Git |
| **Clone URL** | `https://github.com/Naitrate/Eagle-Linux` |
| **Committish** | *(leave empty or `master`)* |
| **Subdirectory** | `.` (or leave empty) |
| **Spec File** | `packaging/fedora/eagle.spec` |
| **Build Method** | `rpkg` *(or `make srpm`)* |

## 2. Build Isolation Settings

* **Enable internet access during build**: **Enabled (Checked)**
  * *Required so `curl` can download the upstream Eagle installer during extraction.*
* **Isolation**: **Default** (`mock` / `systemd-nspawn`)

## 3. Automated `make srpm` Support

The repository includes a `.copr/Makefile` at the repository root. If you choose **make srpm** as the build method in COPR, COPR will automatically execute `.copr/Makefile` to generate the SRPM without needing additional custom flags.
