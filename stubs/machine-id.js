const fs = require('fs');

function getSystemMachineId() {
  try {
    if (fs.existsSync('/sys/class/dmi/id/product_uuid')) {
      const uuid = fs.readFileSync('/sys/class/dmi/id/product_uuid', 'utf8').trim();
      if (uuid && uuid.length > 10) return uuid.toLowerCase();
    }
  } catch (e) {}

  try {
    if (fs.existsSync('/etc/machine-id')) {
      const mid = fs.readFileSync('/etc/machine-id', 'utf8').trim();
      if (mid && mid.length >= 32) {
        return `${mid.substring(0, 8)}-${mid.substring(8, 12)}-${mid.substring(12, 16)}-${mid.substring(16, 20)}-${mid.substring(20, 32)}`.toLowerCase();
      }
    }
  } catch (e) {}

  try {
    if (fs.existsSync('/var/lib/dbus/machine-id')) {
      const mid = fs.readFileSync('/var/lib/dbus/machine-id', 'utf8').trim();
      if (mid && mid.length >= 32) {
        return `${mid.substring(0, 8)}-${mid.substring(8, 12)}-${mid.substring(12, 16)}-${mid.substring(16, 20)}-${mid.substring(20, 32)}`.toLowerCase();
      }
    }
  } catch (e) {}

  return '5e83073c-4110-1c59-87c9-ffcdc7b622e8';
}

const SYSTEM_MACHINE_GUID = getSystemMachineId();
console.log(`[STUBS MACHINE ID] System Machine GUID: ${SYSTEM_MACHINE_GUID}`);

function getMockRegOutput() {
  return `HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography\n    MachineGuid    REG_SZ    ${SYSTEM_MACHINE_GUID}\n`;
}

function isMachineIdQuery(cmd) {
  if (typeof cmd !== 'string') return false;
  return cmd.includes('MachineGuid') ||
         cmd.includes('SOFTWARE\\Microsoft\\Cryptography') ||
         (cmd.includes('reg') && cmd.includes('query') && cmd.includes('Cryptography'));
}

class FakeWinreg {
  constructor(options) {
    this.hive = options ? options.hive : 'HKLM';
    this.key = options ? options.key : '';
  }
  get(name, cb) {
    if (typeof cb === 'function') {
      process.nextTick(() => cb(null, { name: name || 'MachineGuid', type: 'REG_SZ', value: SYSTEM_MACHINE_GUID }));
    }
  }
  values(cb) {
    if (typeof cb === 'function') {
      process.nextTick(() => cb(null, [{ name: 'MachineGuid', type: 'REG_SZ', value: SYSTEM_MACHINE_GUID }]));
    }
  }
  keys(cb) {
    if (typeof cb === 'function') process.nextTick(() => cb(null, []));
  }
}
FakeWinreg.HKLM = 'HKLM';
FakeWinreg.HKCU = 'HKCU';
FakeWinreg.HKCR = 'HKCR';
FakeWinreg.HKU = 'HKU';
FakeWinreg.HKCC = 'HKCC';

module.exports = {
  SYSTEM_MACHINE_GUID,
  getSystemMachineId,
  getMockRegOutput,
  isMachineIdQuery,
  FakeWinreg
};
