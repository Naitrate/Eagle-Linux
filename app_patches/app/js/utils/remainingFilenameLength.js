const path = require('path');
const EAGLE_THUMBNAIL_LENGTH = 10;

function remainingFilenameLength(libraryPath) {
    let maxPathLength = 4096;

    // both windows and macosx have 255 filename length limit
    let maxFilenameLength = 255 - EAGLE_THUMBNAIL_LENGTH;

    const dirPath = path.normalize(libraryPath).replace(/\\/g, "/");

    // base on os platform to set max path length limit
    if (process.platform === 'win32') {
        maxPathLength = 260 - 1 - 12 - EAGLE_THUMBNAIL_LENGTH;
    } else if (process.platform === 'darwin') {
        maxPathLength = 1023;
    }

    // calc remaining filename length
    // -28 -> /images/LHXFONDA3HQZ2.info/
    const remainingLength = maxPathLength - dirPath.length - 28;

    if (remainingLength < 0) {
        return 0;
    }
    
    return Math.min(remainingLength, maxFilenameLength);
}

module.exports = remainingFilenameLength;