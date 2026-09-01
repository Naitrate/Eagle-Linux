var addon;
var opsys = process.platform;

if (process.platform === 'darwin') {
    if (process.arch === 'arm64') {
        try { addon = require('bindings')('osx-arm64.node'); } catch(e){}
    } else {
        try { addon = require('bindings')('osx-x64.node'); } catch(e){}
    }
} else if (process.platform === 'win32') {
    try { addon = require('bindings')('windows-x64.node'); } catch(e){}
}

module.exports = (path) => {
    if (opsys == "darwin" || opsys == "linux") {
        // do nothing
    }

    if (opsys == "win32" || opsys == "win64") {
        if (path.startsWith("/")) {
            return "unknow";
        }

        if (RegExp('^([a-zA-Z]):').test(path)) {
            path = path.slice(0, 3)
        }
    }

    if (RegExp('^\\\\\\\\').test(path)) {
        return "smb";
    }

    if (addon && typeof addon.fsType === 'function') {
        let result = addon.fsType(path);
        if (result) {
            return result.toString().toLowerCase();
        }
    }

    return "unknow";
}