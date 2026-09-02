{ pkgs ? import <nixpkgs> { config.allowUnfree = true; }
, enableAiSearch ? true
, gpuBackend ? "cpu" # Options: "cuda" (NVIDIA NVENC/CUDA), "rocm" (AMD ROCm), "cpu" (CPU-only)
}:

let
  pname = "eagle";
  version = "4.0.5";
  appname = "Eagle";

  pythonPackages = ps: with ps; [
    fastapi
    uvicorn
    python-multipart
    (if gpuBackend == "cuda" && (ps ? torchWithCuda) then ps.torchWithCuda else ps.torch)
    transformers
    huggingface-hub
    pillow
    numpy
    faiss
    requests
    pytest
    pydantic
    python-dotenv
    psutil
    aiosqlite
    aiofiles
  ];

  aiPythonEnv = if enableAiSearch then pkgs.python3.withPackages pythonPackages else null;

  srcs = {
    x86_64-linux = pkgs.fetchurl {
      url = "https://r2-app.eagle.cool/releases/Eagle-4.0-x64-build23.exe";
      hash = "sha256-b5Kuy2xT9eOp3uSWBfGVWuEW4q3NXtLm3h0Z1zL5TTg=";
    };
    aarch64-linux = pkgs.fetchurl {
      url = "https://r2-app.eagle.cool/releases/Eagle-4.0-x64-build23.exe";
      hash = "sha256-b5Kuy2xT9eOp3uSWBfGVWuEW4q3NXtLm3h0Z1zL5TTg=";
    };
    aarch64-darwin = pkgs.fetchurl {
      url = "https://r2-app.eagle.cool/releases/Eagle-4.0-arm64-build23.dmg";
      hash = "sha256-iZz4gKFaF7sf5Uk5EQ7FamqfivSjId4NVcFnDGvuU3c=";
    };
    x86_64-darwin = pkgs.fetchurl {
      url = "https://r2-app.eagle.cool/releases/Eagle-4.0-x64-build23.dmg";
      hash = "sha256-qorS5icm6hJS/WP4AgUNUZtXKMLratLcYIk42ViaEqE=";
    };
  };

  src = srcs.${pkgs.stdenv.hostPlatform.system} or (throw "Unsupported system: ${pkgs.stdenv.hostPlatform.system}");

  meta = with pkgs.lib; {
    description = "Eagle digital asset manager for Linux and macOS";
    homepage = "https://eagle.cool";
    license = licenses.unfree;
    mainProgram = "eagle";
    platforms = [
      "x86_64-linux"
      "aarch64-linux"
      "aarch64-darwin"
      "x86_64-darwin"
    ];
  };

  # Shared library closure for Electron.
  #
  # Also prepended to the launcher's LD_LIBRARY_PATH: Electron dlopen()s
  # several of these, and a dlopen has no NEEDED entry for patchelf to
  # rewrite. libglvnd is only the GL dispatch layer -- the driver itself
  # lives in /run/opengl-driver/lib, which the wrapper adds separately.
  electronRuntimeLibs = with pkgs; [
    alsa-lib at-spi2-atk at-spi2-core atk cairo cups dbus expat
    fontconfig freetype gdk-pixbuf glib gtk3 libdrm libgbm libGL libnotify
    libpulseaudio libsecret libuuid libxkbcommon libxkbfile mesa nspr nss
    pango pciutils pipewire stdenv.cc.cc.lib systemd vulkan-loader zlib
    # X11 libraries. These live at the top level in current nixpkgs; the old
    # pkgs.xorg.* aliases are deprecated.
    libx11 libxcb libxcomposite libxcursor libxdamage libxext libxfixes
    libxi libxrandr libxrender libxscrnsaver libxshmfence libxtst
  ];

  # Electron runtime, bundled rather than bootstrapped at first launch.
  #
  # Eagle used to launch through `npx electron@22.3.7`, which no longer works
  # on current toolchains: npm >= 12 blocks install scripts via allowScripts,
  # and on Node >= 26 the extract-zip in Electron's install.js fails silently.
  # Nixpkgs no longer carries Electron 22 (only 41+ are supported), so fetch
  # the upstream binary release and patch it here.
  #
  # This deliberately mirrors nixpkgs' own electron-*-bin recipe and does NOT
  # use autoPatchelfHook. autoPatchelfHook rewrites every ELF in the tree,
  # which leaves Electron unable to fork its zygote ("Zygote could not fork")
  # and makes Crashpad's ELF reader fail, killing the process with SIGTRAP
  # before it ever opens a window. Patching only the two executables, and
  # pointing their rpath at the unpacked directory so they resolve their own
  # bundled .so files, avoids that.
  electron22 = pkgs.stdenv.mkDerivation (finalAttrs: {
    pname = "electron";
    version = "22.3.7";

    src = pkgs.fetchurl {
      url = "https://github.com/electron/electron/releases/download/v${finalAttrs.version}/electron-v${finalAttrs.version}-linux-x64.zip";
      # Matches the published SHASUMS256.txt for this release.
      sha256 = "a04a8e95032e13808c6da3a244739edecbdb25e34accc8a8a53db257f225a5c9";
    };

    nativeBuildInputs = [ pkgs.unzip pkgs.makeWrapper ];
    buildInputs = [ pkgs.glib pkgs.gtk3 ];

    dontUnpack = true;
    dontBuild = true;

    installPhase = ''
      runHook preInstall
      mkdir -p $out/libexec/electron
      unzip -q -d $out/libexec/electron $src
      # Shared objects are loaded, never executed; keeping them non-executable
      # also stops later fixup hooks from treating them as binaries.
      chmod u-x $out/libexec/electron/*.so*
      runHook postInstall
    '';

    preFixup = ''
      makeWrapper "$out/libexec/electron/electron" $out/bin/electron
    '';

    postFixup = ''
      patchelf \
        --set-interpreter "$(cat $NIX_CC/nix-support/dynamic-linker)" \
        --set-rpath "${pkgs.lib.makeLibraryPath electronRuntimeLibs}:$out/libexec/electron" \
        $out/libexec/electron/electron \
        $out/libexec/electron/chrome_crashpad_handler

      patchelf \
        --set-rpath "${pkgs.lib.makeLibraryPath [ pkgs.libGL pkgs.pciutils pkgs.vulkan-loader ]}" \
        $out/libexec/electron/lib*GL*

      rm "$out/libexec/electron/libvulkan.so.1"
      ln -s -t "$out/libexec/electron" "${pkgs.lib.getLib pkgs.vulkan-loader}/lib/libvulkan.so.1"
    '';

    meta = with pkgs.lib; {
      description = "Electron ${finalAttrs.version} runtime for the Eagle Linux port";
      platforms = [ "x86_64-linux" ];
      sourceProvenance = with sourceTypes; [ binaryNativeCode ];
      license = licenses.mit;
    };
  });

  linux = pkgs.stdenv.mkDerivation rec {
    inherit pname version meta;

    src = pkgs.lib.cleanSourceWith {
      filter = path: type:
        let
          baseName = baseNameOf path;
        in
          baseName != "old" &&
          baseName != "Windows" &&
          baseName != "result" &&
          baseName != "build" &&
          baseName != ".git" &&
          baseName != "app.asar" &&
          baseName != "app.asar.unpacked";
      src = ./.;
    };

    nativeBuildInputs = [
      pkgs.makeWrapper
      pkgs.copyDesktopItems
      pkgs.libicns
      pkgs.icoutils
      pkgs.shared-mime-info
      pkgs.imagemagick
      pkgs.python3
    ];

    desktopItems = [
      (pkgs.makeDesktopItem {
        name = "eagle";
        desktopName = "Eagle";
        comment = "Digital asset manager for designers";
        exec = "eagle %u";
        icon = "eagle";
        terminal = false;
        type = "Application";
        categories = [
          "Graphics"
          "Utility"
        ];
        startupNotify = true;
        startupWMClass = "Eagle";
        mimeTypes = [
          "application/x-eaglepack"
          "application/x-eagleplugin"
          "application/x-eaglelibrary"
          "x-scheme-handler/eagle"
        ];
      })
    ];

    buildInputs = [
      pkgs.nodejs
      pkgs.gtk3
      pkgs.gsettings-desktop-schemas
      pkgs.glib
      pkgs.stdenv.cc.cc.lib
      pkgs.zlib
    ] ++ (if enableAiSearch then [ aiPythonEnv ] else []);

    dontBuild = true;

    installPhase = ''
      runHook preInstall

      mkdir -p \
        "$out/share/eagle" \
        "$out/bin" \
        "$out/share/pixmaps"

      # Extract the official Windows Eagle installer.
      extraction_dir="$(mktemp -d)"

      echo "Extracting Eagle Windows installer..."
      ${pkgs.python3}/bin/python3 \
        ./extract-installer.py \
        "${srcs.x86_64-linux}" \
        "$extraction_dir" \
        ./eagle-unpacked-layout.json

      if [ ! -d "$extraction_dir/app" ]; then
        echo "ERROR: Eagle extraction did not produce app/"
        exit 1
      fi

      echo "Copying extracted application..."
      cp -r \
        "$extraction_dir/app" \
        "$out/share/eagle/"

      if [ -d "$extraction_dir/app.asar.unpacked" ]; then
        echo "Merging app.asar.unpacked..."
        cp -r \
          "$extraction_dir/app.asar.unpacked/." \
          "$out/share/eagle/app/"
      fi

      if [ -d "./app_patches" ]; then
        echo "Applying app_patches..."
        cp -r \
          ./app_patches/. \
          "$out/share/eagle/app/"
      fi

      eagle_assets="$out/share/eagle/app/assets"

      if [ -f "$eagle_assets/icon.png" ]; then
        echo "Installing Linux-compatible Eagle tray icon..."
        if [ -f "$eagle_assets/icon.ico" ]; then
          mv "$eagle_assets/icon.ico" "$eagle_assets/icon.ico.windows"
        fi
        cp "$eagle_assets/icon.png" "$eagle_assets/icon.ico"
      fi

      echo "Installing patch.js and patches folder..."
      cp "./patch.js" "$out/share/eagle/patch.js"
      cp -r "./patches" "$out/share/eagle/patches"

      echo "Normalizing permissions..."
      chmod -R u+rwX,go+rX "$out/share/eagle"
      rm -rf "$extraction_dir"

      # Register Custom MIME Types
      mkdir -p "$out/share/mime/packages"
      cat << 'EOF' > "$out/share/mime/packages/eagle.xml"
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

      # Create dummy executable NiuniuCapture.exe so physical file checks pass
      cat << 'EOF' > "$out/share/eagle/app/NiuniuCapture.exe"
#!/bin/sh
exit 0
EOF
      chmod +x "$out/share/eagle/app/NiuniuCapture.exe"

      if [ -d "$out/share/eagle/app/app" ]; then
        cp "$out/share/eagle/app/NiuniuCapture.exe" "$out/share/eagle/app/app/NiuniuCapture.exe"
      fi

      # Symlink Linux illustrations to Win32 assets for Welcome screen
      for theme in dark light; do
        dir="$out/share/eagle/app/app/assets/images/$theme/illustrations"
        if [ -d "$dir" ]; then
          for win_img in "$dir"/*-win32.png; do
            if [ -f "$win_img" ]; then
              linux_img="''${win_img%-win32.png}-linux.png"
              ln -sf "$(basename "$win_img")" "$linux_img"
            fi
          done
        fi
      done

      # Install application icon into hicolor icon theme and pixmaps for desktop menu integration
      mkdir -p "$out/share/icons/hicolor/512x512/apps" "$out/share/pixmaps"
      if [ -f "$out/share/eagle/app/assets/icon.png" ]; then
        cp "$out/share/eagle/app/assets/icon.png" "$out/share/icons/hicolor/512x512/apps/eagle.png"
        cp "$out/share/eagle/app/assets/icon.png" "$out/share/pixmaps/eagle.png"
      fi

      # Install udev rule allowing unprivileged access to DMI product_uuid
      mkdir -p "$out/lib/udev/rules.d"
      cat << 'EOF' > "$out/lib/udev/rules.d/99-eagle-dmi.rules"
# Allow unprivileged read access to DMI product_uuid for Eagle Machine ID detection
SUBSYSTEM=="dmi", KERNEL=="product_uuid", MODE="0444"
EOF

      # Expose the runtime at the same share/eagle/electron path the Arch,
      # Fedora and AppImage launchers probe. The Nix wrapper below calls the
      # store path directly, so this is purely for layout consistency across
      # packaging targets.
      mkdir -p "$out/share/eagle/electron"
      ln -sf ${electron22}/libexec/electron/electron "$out/share/eagle/electron/electron"

      makeWrapper ${electron22}/bin/electron "$out/bin/eagle" \
        --add-flags "-r $out/share/eagle/patch.js $out/share/eagle/app --no-sandbox" \
        --set GTK_USE_PORTAL "1" \
        --prefix NODE_PATH : "$out/share/eagle/app/node_modules" \
        --prefix XDG_DATA_DIRS : "${pkgs.gtk3}/share/gsettings-schemas/${pkgs.gtk3.name}:${pkgs.gsettings-desktop-schemas}/share/gsettings-schemas/${pkgs.gsettings-desktop-schemas.name}" \
        --prefix PATH : "${pkgs.lib.makeBinPath (
          [
            pkgs.glib
            pkgs.nodejs
            pkgs.coreutils
            pkgs.findutils
            pkgs.ffmpeg-full
            # The Exif Metadata plugin bundles Windows and macOS builds of
            # exiv2 only, and picks the macOS one on Linux, where it cannot
            # execute. Putting exiv2 on PATH lets that binary be replaced with
            # a wrapper, the same way ffmpeg-full serves the video plugin.
            pkgs.exiv2
            (if pkgs ? kstart then pkgs.kstart else pkgs.kdePackages.kstart)
          ]
          ++ (if enableAiSearch then [ aiPythonEnv ] else [])
        )}" \
        --prefix LD_LIBRARY_PATH : "/run/opengl-driver/lib:${pkgs.lib.makeLibraryPath (
          electronRuntimeLibs
          ++ (if enableAiSearch then [ aiPythonEnv ] else [])
        )}"

      runHook postInstall
    '';

    passthru = { electron = electron22; };
  };

  darwin = pkgs.stdenv.mkDerivation {
    inherit pname version src meta;

    nativeBuildInputs = [
      pkgs.makeWrapper
      pkgs._7zz
    ];

    sourceRoot = ".";

    unpackPhase = ''
      runHook preUnpack
      7z x "$src" -o"unpacked_dmg"
      if [ -d "unpacked_dmg/${appname}/${appname}.app" ]; then
        cp -R "unpacked_dmg/${appname}/${appname}.app" .
      elif [ -d "unpacked_dmg/${appname}.app" ]; then
        cp -R "unpacked_dmg/${appname}.app" .
      else
        find unpacked_dmg -maxdepth 3 -name "*.app" -exec cp -R {} . \;
      fi
      runHook postUnpack
    '';

    installPhase = ''
      runHook preInstall
      mkdir -p $out/{Applications,bin}
      cp -R ${appname}.app $out/Applications/
      makeWrapper $out/Applications/${appname}.app/Contents/MacOS/${appname} $out/bin/eagle
      runHook postInstall
    '';
  };
in
if pkgs.stdenv.hostPlatform.isDarwin then darwin else linux
