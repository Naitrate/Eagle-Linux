// ==========================================================================
// Electron icon compatibility
//
// Eagle's Windows build uses icon.ico for the tray.
// Linux Electron is more reliable when given a PNG-backed NativeImage.
//
// Patch nativeImage early so any later Eagle code that calls:
//
//     nativeImage.createFromPath(".../icon.ico")
//
// transparently receives the Linux PNG instead.
// ==========================================================================

const fs = require('fs');
const path = require('path');
let electron;
try {
  electron = require('electron');
} catch (e) {}

const eagleStubsDir = path.resolve(__dirname, '..');

const eagleTrayIconPng = path.join(
  eagleStubsDir,
  'app',
  'assets',
  'icon.png'
);

console.log(
  `[STUBS ICON] Linux tray icon: ${eagleTrayIconPng}, ` +
  `exists=${fs.existsSync(eagleTrayIconPng)}`
);

if (
  electron &&
  electron.nativeImage &&
  !electron.nativeImage.__eagleLinuxIconWrapped
) {
  const originalNativeImageCreateFromPath =
  electron.nativeImage.createFromPath.bind(
    electron.nativeImage
  );

  electron.nativeImage.createFromPath = function(imagePath) {
    let resolvedPath = imagePath;

    if (
      typeof imagePath === 'string' &&
      imagePath.toLowerCase().endsWith('.ico')
    ) {
      const siblingPng = imagePath.replace(/\.ico$/i, '.png');

      if (fs.existsSync(siblingPng)) {
        resolvedPath = siblingPng;
      } else if (fs.existsSync(eagleTrayIconPng)) {
        resolvedPath = eagleTrayIconPng;
      }

      console.log(
        '[STUBS ICON] nativeImage.createFromPath:',
        imagePath,
        '->',
        resolvedPath
      );
    }

    try {
      const image = originalNativeImageCreateFromPath(resolvedPath);

      console.log(
        '[STUBS ICON] NativeImage:',
        {
          path: resolvedPath,
          empty: image.isEmpty(),
          size: image.getSize()
        }
      );

      return image;
    } catch (err) {
      console.error(
        '[STUBS ICON] NativeImage load failed:',
        resolvedPath,
        err
      );

      if (
        resolvedPath !== eagleTrayIconPng &&
        fs.existsSync(eagleTrayIconPng)
      ) {
        return originalNativeImageCreateFromPath(eagleTrayIconPng);
      }

      throw err;
    }
  };

  electron.nativeImage.__eagleLinuxIconWrapped = true;
}

// ==========================================================================
// CustomTray wrapper
//
// Eagle's Windows build passes:
//
//     /assets/icon.ico
//
// Linux Electron may fail when Tray receives the ICO path directly.
// Convert the path to a NativeImage first so Chromium/Electron never has
// to interpret the Windows ICO resource itself.
//
// The nativeImage.createFromPath() wrapper above handles the actual
// ICO -> PNG conversion.
// ==========================================================================

const OrigTray = electron && electron.Tray;

if (
  OrigTray &&
  !OrigTray.__eagleLinuxTrayWrapped
) {

  function resolveTrayImage(image) {

    // Eagle may already provide a NativeImage.
    if (
      image &&
      typeof image !== 'string'
    ) {
      console.log(
        '[STUBS TRAY] Received non-string image; preserving object'
      );

      return image;
    }

    if (typeof image !== 'string') {
      return image;
    }

    let imagePath = image;

    console.log(
      '[STUBS TRAY] Original image:',
      imagePath
    );

    // --------------------------------------------------------------
    // Windows ICO -> Linux PNG
    // --------------------------------------------------------------

    if (
      imagePath.toLowerCase().endsWith('.ico')
    ) {

      const siblingPng =
        imagePath.replace(
          /\.ico$/i,
          '.png'
        );

      if (
        fs.existsSync(siblingPng)
      ) {

        imagePath =
          siblingPng;

        console.log(
          '[STUBS TRAY] ICO -> sibling PNG:',
          imagePath
        );

      } else if (
        fs.existsSync(eagleTrayIconPng)
      ) {

        imagePath =
          eagleTrayIconPng;

        console.log(
          '[STUBS TRAY] ICO -> Linux tray PNG:',
          imagePath
        );
      }
    }

    // --------------------------------------------------------------
    // Missing image -> known-good Linux PNG
    // --------------------------------------------------------------

    if (
      typeof imagePath === 'string' &&
      !fs.existsSync(imagePath) &&
      fs.existsSync(eagleTrayIconPng)
    ) {

      console.log(
        '[STUBS TRAY] Missing image -> Linux tray PNG:',
        eagleTrayIconPng
      );

      imagePath =
        eagleTrayIconPng;
    }

    // --------------------------------------------------------------
    // Convert path to NativeImage.
    //
    // This is intentional even though nativeImage.createFromPath()
    // is already patched above. It guarantees Tray receives a
    // NativeImage rather than an ICO filename.
    // --------------------------------------------------------------

    if (
      typeof imagePath === 'string' &&
      electron.nativeImage
    ) {

      try {

        const nativeImage =
          electron.nativeImage.createFromPath(
            imagePath
          );

        console.log(
          '[STUBS TRAY] NativeImage created:',
          {
            path: imagePath,
            empty: nativeImage.isEmpty(),
            size: nativeImage.getSize()
          }
        );

        if (
          !nativeImage.isEmpty()
        ) {
          return nativeImage;
        }

        console.log(
          '[STUBS TRAY] NativeImage is empty:',
          imagePath
        );

      } catch (err) {

        console.error(
          '[STUBS TRAY] NativeImage conversion failed:',
          err
        );
      }
    }

    // Leave the original object/path intact as a last resort.
    return imagePath;
  }


  function CustomTray(image) {

    const resolvedImage =
      resolveTrayImage(image);

    console.log(
      '[STUBS TRAY] Creating Tray with:',
      typeof resolvedImage === 'string'
        ? resolvedImage
        : '[NativeImage]'
    );

    try {

      const tray =
        new OrigTray(
          resolvedImage
        );

      console.log(
        '[STUBS TRAY] Tray instance created successfully'
      );

      // ------------------------------------------------------------
      // Prevent Eagle from restoring the Windows ICO later through
      // Tray.setImage().
      // ------------------------------------------------------------

      const originalSetImage =
        tray.setImage;

      if (
        typeof originalSetImage === 'function'
      ) {

        tray.setImage = function(img) {

          console.log(
            '[STUBS TRAY] setImage called:',
            img
          );

          const resolved =
            resolveTrayImage(img);

          console.log(
            '[STUBS TRAY] setImage resolved:',
            typeof resolved === 'string'
              ? resolved
              : '[NativeImage]'
          );

          return originalSetImage.call(
            this,
            resolved
          );
        };
      }

      return tray;

    } catch (err) {

      console.error(
        '[STUBS TRAY] Tray creation failed:',
        err
      );

      // Do not let a tray failure prevent Eagle from starting.
      return {
        setToolTip: () => {},
        setContextMenu: () => {},
        on: () => {},
        destroy: () => {},
        setImage: () => {},
        setPressedImage: () => {}
      };
    }
  }


  Object.setPrototypeOf(
    CustomTray,
    OrigTray
  );

  Object.assign(
    CustomTray,
    OrigTray
  );

  CustomTray.prototype =
    OrigTray.prototype;

  CustomTray.__eagleLinuxTrayWrapped = true;

  electron.Tray =
    CustomTray;
}

module.exports = {
  eagleTrayIconPng
};
