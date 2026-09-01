# 🛠️ Eagle Packaging & Build Instructions

All build outputs are automatically output to the `build/` directory in the repository root.

---

## 1. Master Build Runner (All Packages)

To build all available Linux packages (AppImage, RPM, Arch Linux, Flatpak) in a single command:

```bash
./packaging/build-all.sh
```

---

## 2. AppImage (Universal Portable Package)

Generates a standalone portable `.AppImage` executable compatible with Ubuntu, Debian, Fedora, Arch Linux, openSUSE, Mint, and Manjaro:

```bash
./packaging/appimage/build-appimage.sh
```

* **Output File**: `build/Eagle-4.0.0-x86_64.AppImage`
* **Run**: `./build/Eagle-4.0.0-x86_64.AppImage`

---

## 3. Fedora / RHEL RPM Package

Builds a native `.rpm` installer package:

```bash
./packaging/fedora/build-rpm.sh
```

* **Output File**: `build/eagle-4.0.0-1.x86_64.rpm`
* **Install**: `sudo dnf install ./build/eagle-4.0.0-1.x86_64.rpm`

---

## 4. Arch Linux Package (`PKGBUILD`)

Builds a native Pacman package (`.pkg.tar.zst`):

### Option A: Native Build on Arch Linux
```bash
cd packaging/arch
makepkg -si
```

### Option B: Unattended Build via Docker Container (Clean Environment)
```bash
docker run --rm -v $(pwd):/eagle archlinux:latest bash -c "
  pacman -Sy --needed --noconfirm base-devel zstd &&
  useradd -m builder &&
  chown -R builder:builder /eagle/packaging/arch &&
  su builder -c 'cd /eagle/packaging/arch && makepkg -d -f'
"
```

* **Output File**: `build/eagle-bin-4.0.0-1-x86_64.pkg.tar.zst`
* **Install**: `sudo pacman -U build/eagle-bin-4.0.0-1-x86_64.pkg.tar.zst`

---

## 5. Flatpak Package (`cool.eagle.Eagle.flatpak`)

Builds a single-file `.flatpak` bundle with full hardware ID and KDE shortcut D-Bus access:

```bash
./packaging/flatpak/build-flatpak.sh
```

* **Output File**: `build/cool.eagle.Eagle.flatpak`
* **Install**: `flatpak install build/cool.eagle.Eagle.flatpak`
* **Run**: `flatpak run cool.eagle.Eagle`

---

## 6. Nix Flake & Classic Nix Build

### Build with Nix Flakes
```bash
nix build .#default --impure
```

### Run directly without installing
```bash
nix run .#default --impure
```

### Build with Classic Nix
```bash
nix-build default.nix
```
* **Output**: `./result/bin/eagle`
