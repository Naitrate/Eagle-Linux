const child_process = require('child_process');
const fs = require('fs');
const path = require('path');
const { getMockRegOutput, isMachineIdQuery } = require('./machine-id');

/*
 * --------------------------------------------------------------------------
 * Eagle Linux screenshot compatibility layer
 * --------------------------------------------------------------------------
 *
 * Eagle's Windows implementation invokes NiuniuCapture.exe.
 *
 * Linux screenshots are handled directly by screen-capture.js through:
 *
 *   org.freedesktop.portal.Screenshot.Screenshot
 *
 * Eagle modes:
 *
 *   mode 1 = window capture
 *   mode 2 = region capture
 *   mode 3 = fullscreen capture
 *
 * The portal implementation is intentionally NOT duplicated here.
 *
 * This stub only prevents Eagle's Windows-specific NiuniuCapture.exe
 * invocation from attempting to execute on Linux.
 * --------------------------------------------------------------------------
 */

const origExecFile = child_process.execFile;

child_process.execFile = function (file, args, options, callback) {
  if (typeof args === 'function') {
    callback = args;
    args = [];
    options = {};
  } else if (typeof options === 'function') {
    callback = options;
    options = {};
  }

  if (typeof file === 'string' && file.includes('NiuniuCapture')) {
    console.log(
      '[STUBS] NiuniuCapture.exe intercepted on Linux; ' +
      'screenshots must be handled by the XDG Desktop Portal.'
    );

    const error = new Error(
      'NiuniuCapture.exe is unavailable on Linux. ' +
      'Use org.freedesktop.portal.Screenshot instead.'
    );

    if (typeof callback === 'function') {
      process.nextTick(() => {
        callback(error, '', '');
      });
    }

    return;
  }

  return origExecFile.call(
    child_process,
    file,
    args,
    options,
    callback
  );
};


/* --------------------------------------------------------------------------
 * Resolve ffmpeg / ffprobe binaries by basename
 * -------------------------------------------------------------------------- */

function resolveMediaBin(cmdPath) {
  if (typeof cmdPath !== 'string') return cmdPath;

  const base = path.basename(cmdPath).toLowerCase();

  if (base.includes('ffprobe')) return 'ffprobe';
  if (base.includes('ffmpeg')) return 'ffmpeg';

  return cmdPath;
}


/* --------------------------------------------------------------------------
 * Original child_process functions
 * -------------------------------------------------------------------------- */

const origExecFileSync = child_process.execFileSync;
const origExecSync = child_process.execSync;
const origExec = child_process.exec;
const origSpawn = child_process.spawn;


/* --------------------------------------------------------------------------
 * execSync
 *
 * Normalise bundled Windows ffmpeg/ffprobe paths to the system binaries.
 * -------------------------------------------------------------------------- */

child_process.execSync = function(command, options) {

  if (typeof command === 'string') {

    command =
      command.replace(
        /(?:^|\s)([^\s"'`]*ffmpeg(?:\.exe)?)(?=\s|$)/gi,
        match => {
          const leading =
            match.match(/^\s*/)?.[0] || '';

          return leading + 'ffmpeg';
        }
      );

    command =
      command.replace(
        /(?:^|\s)([^\s"'`]*ffprobe(?:\.exe)?)(?=\s|$)/gi,
        match => {
          const leading =
            match.match(/^\s*/)?.[0] || '';

          return leading + 'ffprobe';
        }
      );
  }

  return origExecSync.call(
    child_process,
    command,
    options
  );
};

const mediaNormalisedExecSync = child_process.execSync;


/* --------------------------------------------------------------------------
 * PowerShell discovery
 * -------------------------------------------------------------------------- */

let cachedPowerShellBin = undefined;

function getPowerShellBinary() {
  if (cachedPowerShellBin !== undefined) {
    return cachedPowerShellBin;
  }

  const envPath = process.env.PATH || '';
  const pathDirs = envPath.split(path.delimiter);

  const candidates = process.platform === 'win32'
    ? ['pwsh.exe', 'powershell.exe', 'pwsh', 'powershell']
    : ['pwsh', 'powershell', 'pwsh.exe', 'powershell.exe'];

  for (const candidate of candidates) {
    for (const dir of pathDirs) {
      if (!dir) continue;
      const fullPath = path.join(dir, candidate);
      try {
        if (fs.existsSync(fullPath)) {
          const stat = fs.statSync(fullPath);
          if (stat.isFile() && (process.platform === 'win32' || (stat.mode & 0o111) !== 0)) {
            console.log(`[STUBS POWERSHELL DETECTED ON PATH]: ${candidate} at ${fullPath}`);
            cachedPowerShellBin = candidate;
            return cachedPowerShellBin;
          }
        }
      } catch (e) {}
    }
  }

  console.log('[STUBS POWERSHELL NOT FOUND ON PATH]: Falling back to bash conversion.');
  cachedPowerShellBin = null;
  return null;
}

child_process.execFileSync = function(file, args, options) {
  const cmdStr = (file || '') + ' ' + (Array.isArray(args) ? args.join(' ') : '');
  if (isMachineIdQuery(cmdStr)) {
    console.log('[STUBS MACHINE ID QUERY (execFileSync)]:', cmdStr);
    return getMockRegOutput();
  }
  if (typeof file === 'string' && (file.includes('powershell') || file.includes('powershell.exe'))) {
    const psBin = getPowerShellBinary();
    if (psBin) {
      console.log(`[STUBS POWERSHELL (execFileSync)]: ${file} -> ${psBin}`);
      return origExecFileSync.call(this, psBin, args, options);
    }
  }
  const resolved = resolveMediaBin(file);
  if (resolved !== file) {
    console.log(`[STUBS EXECFILESYNC REDIRECT]: ${file} -> ${resolved}`);
    return origExecFileSync.call(this, resolved, args, options);
  }
  return origExecFileSync.call(this, file, args, options);
};

child_process.execFile = function(file, args, options, callback) {
  if (typeof options === 'function') { callback = options; options = null; }
  const cmdStr = (file || '') + ' ' + (Array.isArray(args) ? args.join(' ') : '');
  if (isMachineIdQuery(cmdStr)) {
    console.log('[STUBS MACHINE ID QUERY (execFile)]:', cmdStr);
    if (callback) callback(null, getMockRegOutput(), '');
    return;
  }
  if (typeof file === 'string' && (file.includes('powershell') || file.includes('powershell.exe'))) {
    const psBin = getPowerShellBinary();
    if (psBin) {
      console.log(`[STUBS POWERSHELL (execFile)]: ${file} -> ${psBin}`);
      return origExecFile.call(this, psBin, args, options, callback);
    }
  }
  const resolved = resolveMediaBin(file);
  if (resolved !== file) {
    console.log(`[STUBS EXECFILE REDIRECT]: ${file} -> ${resolved}`);
    return origExecFile.call(this, resolved, args, options, callback);
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
  return mediaNormalisedExecSync.apply(this, arguments);
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
        .replace(/Remove-item alias:curl;/gi, '')
        .replace(/Remove-Item -ErrorAction SilentlyContinue alias:curl;/gi, '')
        .replace(/-NoProfile/gi, '')
        .replace(/-NonInteractive/gi, '')
        .replace(/-Command/gi, '')
        .trim();

      if ((cleanCmd.startsWith('"') && cleanCmd.endsWith('"')) || (cleanCmd.startsWith("'") && cleanCmd.endsWith("'"))) {
        cleanCmd = cleanCmd.slice(1, -1).trim();
      }

      console.log(`[STUBS POWERSHELL -> SH FORWARDING]: /bin/sh -c "${cleanCmd}"`);
      return origSpawn.call(this, '/bin/sh', ['-c', cleanCmd], options);
    }
  }

  if (typeof command === 'string' && command.includes('cmd.exe')) {
    console.log('[STUBS POWERSHELL -> CMD.EXE STUBBED]:', command);
    const { Readable, Writable } = require('stream');
    const { EventEmitter } = require('events');
    const dummyProc = new EventEmitter();
    dummyProc.stdout = new Readable({ read() { this.push(null); } });
    dummyProc.stderr = new Readable({ read() { this.push(null); } });
    dummyProc.stdin = new Writable({ write(chunk, enc, cb) { if (cb) cb(); } });
    dummyProc.kill = () => {};
    process.nextTick(() => {
      dummyProc.emit('close', 0);
      dummyProc.emit('exit', 0);
    });
    return dummyProc;
  }

  return origSpawn.apply(this, arguments);
};

module.exports = {
  getPowerShellBinary,
  resolveMediaBin
};
