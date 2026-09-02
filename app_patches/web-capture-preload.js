const $$electronIpc = require('electron').ipcRenderer;
process.once('loaded', () => {
    global.$$electronIpc = $$electronIpc;
});