var addon;

if (process.platform === 'darwin') {
    if (process.arch === 'arm64') {
        try { addon = require('bindings')('osx-arm64.node'); } catch(e){}
    } else {
        try { addon = require('bindings')('osx-x64.node'); } catch(e){}
    }
} else if (process.platform === 'win32') {
    try { addon = require('bindings')('windows-x64.node'); } catch(e){}
}

var opsys = process.platform;

module.exports = (folderPath) => {

    try {

        if (!folderPath || typeof folderPath !== "string") return false;

        // check is system is mac osx
        if (opsys == "darwin" && addon) {
            // prevent like smb://192.168.0.1/
            if (RegExp('^smb:\\/\\/\\S+$').test(folderPath)) {
                return true;
            }

            let fileType = addon.pathType(folderPath);

            if (fileType == "smbfs" || fileType == "afpfs" || fileType == "nfs") {
                return true;
            }
        }

        // check is system is windows
        if ((opsys == "win32" || opsys == "win64") && addon) {

            // windows api only take like c:\
            if (RegExp('^([a-zA-Z]):').test(folderPath)) {

                // take c:\ only
                folderPath = folderPath.slice(0, 3)
            }

            // on windows they are only \\192.168.0.1 or Z:\ (mount) is network drive
            // test url is start with \\??????
            if (RegExp('^\\\\\\\\').test(folderPath)) {
                return true;
            }

            // winapi network-drive is 4
            if (addon.pathType(folderPath) == 4) {
                return true;
            }

            return false;
        }

        // check is system is linux
        if (opsys == "linux") {
            return false;
        }

        return false;
    } catch (err) {
        return false;
    }
}