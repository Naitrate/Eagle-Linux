const fs = require('fs');
const path = require('path');
const electron = require('electron');

const eagleStubsDir = path.resolve(__dirname, '..');
const eagleTrayIconPng = path.join(
  eagleStubsDir,
  'extracted_app',
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

module.exports = {
  eagleTrayIconPng
};
