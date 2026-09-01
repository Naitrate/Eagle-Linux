# 🛠️ Developer & Maintainer Guide

Comprehensive reference for maintainers on releasing packages, pushing binary caches to Cachix, updating Flakes, and updating extraction layouts.

---

## 1. 🚀 Publishing Releases to GitHub

Whenever you publish a version tag, GitHub Actions (`.github/workflows/packages.yml`) automatically builds all 4 Linux package formats and attaches them as release assets on GitHub Releases.

### Step-by-Step Tag Release

```bash
# 1. Tag the release
git tag v4.0.0

# 2. Push the tag to GitHub
git push origin v4.0.0
```

### Published Release Assets

GitHub Actions will automatically attach the following files to the release:
* `Eagle-4.0.0-x86_64.AppImage` (Universal Portable AppImage)
* `eagle-4.0.0-1.x86_64.rpm` (Fedora / RHEL RPM)
* `eagle-bin-4.0.0-1-x86_64.pkg.tar.zst` (Arch Linux PKGBUILD)
* `cool.eagle.Eagle.flatpak` (Single-File Flatpak Bundle)

---

## 2. ⚡ Pushing Builds to Cachix Binary Cache

To populate your Cachix binary cache (`eagle-nix`) so users can download pre-compiled Nix binaries instantly:

### Method A: Push built `./result` symlink
```bash
nix build .#default --impure
cachix push eagle-nix ./result
```

### Method B: Pipe `nix path-info` to Cachix
```bash
nix path-info --impure .#default | cachix push eagle-nix
```

### Method C: Automatic Watch Exec
```bash
cachix watch-exec eagle-nix -- nix build .#default --impure
```

---

## 3. ❄️ Nix Flake Maintenance

### Updating Flake Inputs Locally
To bump `nixpkgs` or other flake inputs:
```bash
nix flake update
```

### Automated Weekly Flake Updates
The repository includes [`.github/workflows/update-flake-lock.yml`](file:///.github/workflows/update-flake-lock.yml). 
Every Monday at midnight UTC, GitHub Actions runs `nix flake update` and automatically opens a Pull Request with the updated `flake.lock`.

---

## 4. 🔍 Regenerating Extraction Offsets

If upstream Eagle releases a new Windows installer executable:

```bash
EAGLE_REFERENCE_APP=./extracted_app \
python3 ./extract-installer.py \
  --generate-layout \
  ./Eagle-4.0-x64-buildXX.exe \
  ./eagle-unpacked-layout.json
```
