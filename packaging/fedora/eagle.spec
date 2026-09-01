%define _enable_debug_packages 0
%define debug_package %{nil}
%define __strip /bin/true
%global __brp_strip %{nil}
%global __brp_strip_comment_note %{nil}
%global __brp_strip_static_archive %{nil}

Name:           eagle
Version:        4.0.0
Release:        1%{?dist}
Summary:        Digital asset manager for designers (Linux Port)

License:        Proprietary
URL:            https://eagle.cool

Requires:       nodejs, python3, zstd, xdotool, ffmpeg, dbus-tools

%description
Eagle helps you collect, search, and organize your design files in one place.

%prep

%build

%install
rm -rf %{buildroot}
mkdir -p %{buildroot}/usr/share/eagle
mkdir -p %{buildroot}/usr/bin
mkdir -p %{buildroot}/usr/share/applications
mkdir -p %{buildroot}/usr/share/icons/hicolor/512x512/apps
mkdir -p %{buildroot}/usr/share/pixmaps
mkdir -p %{buildroot}/lib/udev/rules.d

cp -r %{_sourcedir}/extracted_app %{buildroot}/usr/share/eagle/
cp %{_sourcedir}/stubs.js %{buildroot}/usr/share/eagle/stubs.js
cp %{_sourcedir}/extracted_app/assets/icon.png %{buildroot}/usr/share/icons/hicolor/512x512/apps/eagle.png
cp %{_sourcedir}/extracted_app/assets/icon.png %{buildroot}/usr/share/pixmaps/eagle.png

cat << 'EOF' > %{buildroot}/usr/bin/eagle
#!/bin/sh
export GTK_USE_PORTAL=1

STUBS="/usr/share/eagle/stubs.js"
APP="/usr/share/eagle/extracted_app"

if command -v electron22 >/dev/null 2>&1; then
    ELECTRON_BIN="$(command -v electron22)"
elif command -v npx >/dev/null 2>&1; then
    for cache_dir in "${HOME}/.npm/_npx/"*/node_modules/electron; do
        if [ -d "${cache_dir}" ] && [ ! -f "${cache_dir}/path.txt" ]; then
            rm -rf "${cache_dir%/*/*}" 2>/dev/null || true
        fi
    done
    ELECTRON_BIN="npx --yes electron@22.3.7"
elif command -v electron >/dev/null 2>&1; then
    ELECTRON_BIN="$(command -v electron)"
else
    echo "[ERROR] No Electron runtime or nodejs/npx found. Please install nodejs."
    exit 1
fi

exec ${ELECTRON_BIN} -r "${STUBS}" "${APP}" --no-sandbox "$@"
EOF
chmod +x %{buildroot}/usr/bin/eagle

cat << 'EOF' > %{buildroot}/usr/share/applications/eagle.desktop
[Desktop Entry]
Categories=Graphics;Utility;
Comment=Digital asset manager for designers
Exec=eagle %u
Icon=eagle
MimeType=application/x-eaglepack;application/x-eagleplugin;application/x-eaglelibrary;x-scheme-handler/eagle;
Name=Eagle
StartupNotify=true
StartupWMClass=Eagle
Terminal=false
Type=Application
Version=1.5
EOF

mkdir -p %{buildroot}/usr/share/mime/packages
cat << 'EOF' > %{buildroot}/usr/share/mime/packages/eagle.xml
<?xml version="1.0" encoding="UTF-8"?>
<mime-info xmlns="http://www.freedesktop.org/standards/shared-mime-info">
  <mime-type type="application/x-eaglepack">
    <comment>Eagle Pack</comment>
    <glob pattern="*.eaglepack"/>
    <icon name="application-x-eaglepack"/>
  </mime-type>

  <mime-type type="application/x-eagleplugin">
    <comment>Eagle Plugin</comment>
    <glob pattern="*.eagleplugin"/>
    <icon name="application-x-eagleplugin"/>
  </mime-type>

  <mime-type type="application/x-eaglelibrary">
    <comment>Eagle Library</comment>
    <glob pattern="*.eagle"/>
    <icon name="application-x-eaglelibrary"/>
  </mime-type>
</mime-info>
EOF

cat << 'EOF' > %{buildroot}/lib/udev/rules.d/99-eagle-dmi.rules
SUBSYSTEM=="dmi", KERNEL=="product_uuid", MODE="0444"
EOF

%files
/usr/bin/eagle
/usr/share/eagle/
/usr/share/applications/eagle.desktop
/usr/share/icons/hicolor/512x512/apps/eagle.png
/usr/share/pixmaps/eagle.png
/usr/share/mime/packages/eagle.xml
/lib/udev/rules.d/99-eagle-dmi.rules

%changelog
* Mon Aug 31 2026 Bryce <bryce@example.com> - 4.0.0-1
- Initial Fedora / RHEL package for Eagle Linux Port
