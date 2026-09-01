{ pkgs ? import <nixpkgs> { config.allowUnfree = true; }
, enableAiSearch ? true
, gpuBackend ? "cpu" # Options: "cuda" (NVIDIA NVENC/CUDA), "rocm" (AMD ROCm), "cpu" (CPU-only)
}:

let
  pname = "eagle";
  version = "4.0.0";
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

      if [ ! -d "$extraction_dir/extracted_app" ]; then
        echo "ERROR: Eagle extraction did not produce extracted_app/"
        exit 1
      fi

      echo "Copying extracted application..."
      cp -r \
        "$extraction_dir/extracted_app" \
        "$out/share/eagle/"

      if [ -d "$extraction_dir/app.asar.unpacked" ]; then
        echo "Merging app.asar.unpacked..."
        cp -r \
          "$extraction_dir/app.asar.unpacked/." \
          "$out/share/eagle/extracted_app/"
      fi

      if [ -d "./extracted_app_patches" ]; then
        echo "Applying extracted_app_patches..."
        cp -r \
          ./extracted_app_patches/. \
          "$out/share/eagle/extracted_app/"
      fi

      eagle_assets="$out/share/eagle/extracted_app/assets"

      if [ -f "$eagle_assets/icon.png" ]; then
        echo "Installing Linux-compatible Eagle tray icon..."
        if [ -f "$eagle_assets/icon.ico" ]; then
          mv "$eagle_assets/icon.ico" "$eagle_assets/icon.ico.windows"
        fi
        cp "$eagle_assets/icon.png" "$eagle_assets/icon.ico"
      fi

      echo "Installing stubs.js..."
      cp "./stubs.js" "$out/share/eagle/stubs.js"

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
      cat << 'EOF' > "$out/share/eagle/extracted_app/NiuniuCapture.exe"
#!/bin/sh
exit 0
EOF
      chmod +x "$out/share/eagle/extracted_app/NiuniuCapture.exe"

      if [ -d "$out/share/eagle/extracted_app/app" ]; then
        cp "$out/share/eagle/extracted_app/NiuniuCapture.exe" "$out/share/eagle/extracted_app/app/NiuniuCapture.exe"
      fi

      # Symlink Linux illustrations to Win32 assets for Welcome screen
      for theme in dark light; do
        dir="$out/share/eagle/extracted_app/app/assets/images/$theme/illustrations"
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
      if [ -f "$out/share/eagle/extracted_app/assets/icon.png" ]; then
        cp "$out/share/eagle/extracted_app/assets/icon.png" "$out/share/icons/hicolor/512x512/apps/eagle.png"
        cp "$out/share/eagle/extracted_app/assets/icon.png" "$out/share/pixmaps/eagle.png"
      fi

      # Install udev rule allowing unprivileged access to DMI product_uuid
      mkdir -p "$out/lib/udev/rules.d"
      cat << 'EOF' > "$out/lib/udev/rules.d/99-eagle-dmi.rules"
# Allow unprivileged read access to DMI product_uuid for Eagle Machine ID detection
SUBSYSTEM=="dmi", KERNEL=="product_uuid", MODE="0444"
EOF

      makeWrapper ${pkgs.nodejs}/bin/npx "$out/bin/eagle" \
        --add-flags "--yes electron@22.3.7 -r $out/share/eagle/stubs.js $out/share/eagle/extracted_app --no-sandbox" \
        --set GTK_USE_PORTAL "1" \
        --prefix NODE_PATH : "$out/share/eagle/extracted_app/node_modules" \
        --prefix XDG_DATA_DIRS : "${pkgs.gtk3}/share/gsettings-schemas/${pkgs.gtk3.name}:${pkgs.gsettings-desktop-schemas}/share/gsettings-schemas/${pkgs.gsettings-desktop-schemas.name}" \
        --prefix PATH : "${pkgs.lib.makeBinPath (
          [
            pkgs.glib
            pkgs.nodejs
            pkgs.coreutils
            pkgs.findutils
            pkgs.powershell
            pkgs.ffmpeg-full
            (if pkgs ? kstart then pkgs.kstart else pkgs.kdePackages.kstart)
          ]
          ++ (if enableAiSearch then [ aiPythonEnv ] else [])
        )}" \
        --prefix LD_LIBRARY_PATH : "${pkgs.lib.makeLibraryPath (
          [
            pkgs.stdenv.cc.cc.lib
            pkgs.zlib
            pkgs.glib
          ]
          ++ (if enableAiSearch then [ aiPythonEnv ] else [])
        )}"

      runHook postInstall
    '';
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
