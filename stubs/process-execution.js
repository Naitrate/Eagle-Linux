const child_process = require('child_process');
const fs = require('fs');
const path = require('path');
const { getMockRegOutput, isMachineIdQuery } = require('./machine-id');

let cachedPowerShellBin = undefined;

function getPowerShellBinary() {
  if (cachedPowerShellBin !== undefined) return cachedPowerShellBin;

  const envPath = process.env.PATH || '';
  const searchDirs = envPath.split(path.delimiter).filter(Boolean);

  const extraCandidates = [
    '/run/current-system/sw/bin',
    '/usr/bin',
    '/usr/local/bin',
    '/bin'
  ];

  for (const dir of extraCandidates) {
    if (!searchDirs.includes(dir)) {
      searchDirs.push(dir);
    }
  }

  const binaryNames = ['pwsh', 'powershell'];

  for (const dir of searchDirs) {
    for (const binName of binaryNames) {
      const fullPath = path.join(dir, binName);
      try {
        if (fs.existsSync(fullPath)) {
          const stat = fs.statSync(fullPath);
          if (stat && !stat.isDirectory()) {
            console.log(`[STUBS POWERSHELL DETECTED ON PATH]: ${binName} at ${fullPath}`);
            cachedPowerShellBin = fullPath;
            return cachedPowerShellBin;
          }
        }
      } catch (e) {}
    }
  }

  cachedPowerShellBin = null;
  return null;
}

function resolveMediaBin(cmd) {
  if (typeof cmd !== 'string') return cmd;

  if (cmd.endsWith('ghostscript/gs') || cmd.endsWith('ghostscript\\gs') || cmd === 'ghostscript') {
    return 'gs';
  }
  if (cmd.endsWith('ffmpeg/ffmpeg') || cmd.endsWith('ffmpeg\\ffmpeg') || cmd === 'ffmpeg') {
    return 'ffmpeg';
  }
  if (cmd.endsWith('ffprobe/ffprobe') || cmd.endsWith('ffprobe\\ffprobe') || cmd === 'ffprobe') {
    return 'ffprobe';
  }
  return cmd;
}

const origExecFile = child_process.execFile;
const origExecSync = child_process.execSync;
const origExec = child_process.exec;
const origSpawn = child_process.spawn;

child_process.execFile = function(file, args, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = null;
  }
  const resolved = resolveMediaBin(file);
  if (resolved !== file) {
    console.log(`[STUBS EXECFILE REDIRECT]: ${file} -> ${resolved}`);
    return origExecFile.call(this, resolved, args, options, callback);
  }

  if (isMachineIdQuery(file) || (Array.isArray(args) && args.some(a => isMachineIdQuery(a)))) {
    console.log('[STUBS MACHINE ID QUERY (execFile)]:', file, args);
    if (callback) callback(null, getMockRegOutput(), '');
    return;
  }

  if (typeof file === 'string' && (file.includes('powershell') || file.includes('powershell.exe'))) {
    const psBin = getPowerShellBinary();
    if (psBin) {
      console.log(`[STUBS POWERSHELL -> ${psBin.toUpperCase()} (execFile)]: ${psBin} ${Array.isArray(args) ? args.join(' ') : ''}`);
      return origExecFile.call(this, psBin, args, options, callback);
    }
  }
  return origExecFile.call(this, file, args, options, callback);
};

child_process.execSync = function(cmd, opts) {
  if (isMachineIdQuery(cmd) || (typeof cmd === 'string' && (cmd.includes('HKLM:') || cmd.includes('Cryptography') || cmd.includes('MachineGuid')))) {
    console.log('[STUBS MACHINE ID QUERY (execSync)]:', cmd);
    return getMockRegOutput();
  }
  if (typeof cmd === 'string' && (cmd.includes('powershell') || cmd.includes('powershell.exe'))) {
    const psBin = getPowerShellBinary();
    if (psBin) {
      const psCmd = cmd.replace(/powershell(\.exe)?/gi, psBin);
      console.log(`[STUBS POWERSHELL -> ${psBin.toUpperCase()} (execSync)]: ${psCmd}`);
      try {
        return origExecSync.call(this, psCmd, opts);
      } catch (err) {
        console.log(`[STUBS POWERSHELL EXEC ERROR (execSync)]: ${err.message}`);
        return Buffer.from('');
      }
    } else {
      let cleanCmd = cmd
        .replace(/powershell(\.exe)?/gi, '')
        .replace(/-NoProfile/gi, '')
        .replace(/-NonInteractive/gi, '')
        .replace(/-Command/gi, '')
        .replace(/Remove-item alias:curl;/gi, '')
        .replace(/Remove-Item -ErrorAction SilentlyContinue alias:curl;/gi, '')
        .trim();
      if ((cleanCmd.startsWith('"') && cleanCmd.endsWith('"')) || (cleanCmd.startsWith("'") && cleanCmd.endsWith("'"))) {
        cleanCmd = cleanCmd.slice(1, -1).trim();
      }
      console.log(`[STUBS POWERSHELL -> SH (execSync)]: ${cleanCmd}`);
      try {
        return origExecSync.call(this, cleanCmd, opts);
      } catch (err) {
        console.log(`[STUBS POWERSHELL -> SH FALLBACK (execSync)] Error:`, err.message);
        return Buffer.from('');
      }
    }
  }
  return origExecSync.apply(this, arguments);
};

child_process.exec = function(cmd, opts, cb) {
  if (typeof opts === 'function') { cb = opts; opts = null; }
  if (isMachineIdQuery(cmd) || (typeof cmd === 'string' && (cmd.includes('HKLM:') || cmd.includes('Cryptography') || cmd.includes('MachineGuid')))) {
    console.log('[STUBS MACHINE ID QUERY (exec)]:', cmd);
    if (cb) cb(null, getMockRegOutput(), '');
    return;
  }
  if (typeof cmd === 'string' && (cmd.includes('powershell') || cmd.includes('powershell.exe'))) {
    const psBin = getPowerShellBinary();
    if (psBin) {
      const psCmd = cmd.replace(/powershell(\.exe)?/gi, psBin);
      console.log(`[STUBS POWERSHELL -> ${psBin.toUpperCase()} (exec)]: ${psCmd}`);
      return origExec.call(this, psCmd, opts, cb);
    } else {
      let cleanCmd = cmd
        .replace(/powershell(\.exe)?/gi, '')
        .replace(/-NoProfile/gi, '')
        .replace(/-NonInteractive/gi, '')
        .replace(/-Command/gi, '')
        .replace(/Remove-item alias:curl;/gi, '')
        .replace(/Remove-Item -ErrorAction SilentlyContinue alias:curl;/gi, '')
        .trim();
      if ((cleanCmd.startsWith('"') && cleanCmd.endsWith('"')) || (cleanCmd.startsWith("'") && cleanCmd.endsWith("'"))) {
        cleanCmd = cleanCmd.slice(1, -1).trim();
      }
      console.log(`[STUBS POWERSHELL -> SH (exec)]: ${cleanCmd}`);
      return origExec.call(this, cleanCmd, opts, cb);
    }
  }
  return origExec.call(this, cmd, opts, cb);
};

child_process.spawn = function(command, args, options) {
  const rawArgs = Array.isArray(args) ? args : [];
  let scriptCmd = rawArgs.join(' ');

  const resolved = resolveMediaBin(command);
  if (resolved !== command) {
    console.log(`[STUBS SPAWN REDIRECT]: ${command} -> ${resolved}`);
    return origSpawn.call(this, resolved, args, options);
  }

  if (typeof command === 'string' && (command.includes('powershell') || command.includes('powershell.exe'))) {
    console.log(`[STUBS POWERSHELL COMMAND DETECTED]: ${command} ${scriptCmd}`);

    if (scriptCmd.includes('HKLM:') || scriptCmd.includes('Cryptography') || scriptCmd.includes('MachineGuid')) {
      console.log('[STUBS POWERSHELL -> REGISTRY MOCK]');
      const { Readable, Writable } = require('stream');
      const { EventEmitter } = require('events');
      const dummyProc = new EventEmitter();
      const mockGuid = getMockRegOutput();
      dummyProc.stdout = new Readable({ read() { this.push(mockGuid); this.push(null); } });
      dummyProc.stderr = new Readable({ read() { this.push(null); } });
      dummyProc.stdin = new Writable({ write(chunk, enc, cb) { if (cb) cb(); } });
      dummyProc.kill = () => {};
      process.nextTick(() => {
        dummyProc.emit('close', 0);
        dummyProc.emit('exit', 0);
      });
      return dummyProc;
    }

    const psBin = getPowerShellBinary();
    if (psBin) {
      console.log(`[STUBS POWERSHELL -> ${psBin.toUpperCase()} FORWARDING]: ${psBin} ${scriptCmd}`);
      return origSpawn.call(this, psBin, args, options);
    } else {
      let cleanCmd = scriptCmd
        .replace(/-NoProfile/gi, '')
        .replace(/-NonInteractive/gi, '')
        .replace(/-Command/gi, '')
        .replace(/Remove-item alias:curl;/gi, '')
        .replace(/Remove-Item -ErrorAction SilentlyContinue alias:curl;/gi, '')
        .trim();
      if ((cleanCmd.startsWith('"') && cleanCmd.endsWith('"')) || (cleanCmd.startsWith("'") && cleanCmd.endsWith("'"))) {
        cleanCmd = cleanCmd.slice(1, -1).trim();
      }
      console.log(`[STUBS POWERSHELL -> SH FORWARDING]: ${cleanCmd}`);
      return origSpawn.call(this, 'sh', ['-c', cleanCmd], options);
    }
  }

  return origSpawn.call(this, command, args, options);
};

module.exports = {
  getPowerShellBinary,
  resolveMediaBin
};
