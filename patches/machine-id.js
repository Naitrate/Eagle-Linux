const { origFs } = require('./fs-patches');

function isMachineIdQuery(cmd) {
  if (!cmd) return false;
  const str = String(cmd).toLowerCase();
  return str.includes('cryptography') || str.includes('machineguid') || str.includes('reg.exe') || str.includes('reg query') || str.includes('hklm:') || str.includes('ioreg') || str.includes('system_profiler') || str.includes('hw.uuid') || str.includes('ioplatformexpertdevice') || str.includes('wmic csproduct') || str.includes('win32_computersystemproduct');
}

function formatAsGuid(str) {
  const clean = String(str || '').replace(/[^a-fA-F0-9]/g, '');
  if (clean.length < 32) return '5e83073c-4110-1c59-87c9-ffcdc7b622e8';
  return `${clean.slice(0, 8)}-${clean.slice(8, 12)}-${clean.slice(12, 16)}-${clean.slice(16, 20)}-${clean.slice(20, 32)}`.toLowerCase();
}

function getSystemMachineId() {
  try {
    if (origFs.existsSync('/sys/class/dmi/id/product_uuid')) {
      const uuid = origFs.readFileSync('/sys/class/dmi/id/product_uuid', 'utf8').trim();
      if (uuid && uuid.length >= 32) return formatAsGuid(uuid);
    }
  } catch (e) {}

  try {
    if (origFs.existsSync('/etc/machine-id')) {
      const mid = origFs.readFileSync('/etc/machine-id', 'utf8').trim();
      if (mid && mid.length >= 32) return formatAsGuid(mid);
    }
  } catch (e) {}

  try {
    if (origFs.existsSync('/var/lib/dbus/machine-id')) {
      const mid = origFs.readFileSync('/var/lib/dbus/machine-id', 'utf8').trim();
      if (mid && mid.length >= 32) return formatAsGuid(mid);
    }
  } catch (e) {}

  return '5e83073c-4110-1c59-87c9-ffcdc7b622e8';
}

const SYSTEM_MACHINE_GUID = getSystemMachineId();
console.log(`[STUBS MACHINE ID] System Machine GUID: ${SYSTEM_MACHINE_GUID}`);

function getMockRegOutput() {
  return `HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography\n    MachineGuid    REG_SZ    ${SYSTEM_MACHINE_GUID}\n`;
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
  formatAsGuid,
  getMockRegOutput,
  isMachineIdQuery,
  FakeWinreg
};
