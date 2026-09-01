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

Requires:       electron, python3, zstd, xdotool, ffmpeg, dbus-tools

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
exec electron -r /usr/share/eagle/stubs.js /usr/share/eagle/extracted_app --no-sandbox "$@"
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

cat << 'EOF' > %{buildroot}/lib/udev/rules.d/99-eagle-dmi.rules
SUBSYSTEM=="dmi", KERNEL=="product_uuid", MODE="0444"
EOF

%files
/usr/bin/eagle
/usr/share/eagle/
/usr/share/applications/eagle.desktop
/usr/share/icons/hicolor/512x512/apps/eagle.png
/usr/share/pixmaps/eagle.png
/lib/udev/rules.d/99-eagle-dmi.rules

%changelog
* Mon Aug 31 2026 Bryce <bryce@example.com> - 4.0.0-1
- Initial Fedora / RHEL package for Eagle Linux Port
