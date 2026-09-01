// ==========================================================================
// Eagle AI Search Linux compatibility patch
//
// Eagle installs the AI Search plugin dynamically into:
//   ~/.config/Eagle/Plugins/ai-search/
//
// It is not part of app/, so app_patches cannot modify it -- the plugin has
// to be patched on disk after it appears.
//
// The Windows plugin expects:
//   - a bundled Windows/macOS zstd binary
//   - an explicitly selected Python environment
//
// On Linux we use the system zstd and default to linux-x64-gpu.
// ==========================================================================

const fs = require('fs');
const os = require('os');
const path = require('path');

const isMainProcess = !process.type || process.type === 'browser';

function patchAiSearchEnvironmentManager() {
  try {
    const pluginPath = path.join(
      os.homedir(),
      '.config',
      'Eagle',
      'Plugins',
      'ai-search'
    );

    const filePath = path.join(
      pluginPath,
      'modules',
      'environment-resource-manager',
      'index.js'
    );

    if (!fs.existsSync(filePath)) {
      return false;
    }

    const configPath = path.join(
      pluginPath,
      'modules',
      'environment-resource-manager',
      'config.json'
    );

    if (fs.existsSync(configPath)) {
      try {
        const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (configData.pythonEnvironments && !configData.pythonEnvironments['linux-x64-gpu']) {
          configData.pythonEnvironments['linux-x64-gpu'] = {
            name: 'Linux GPU (CUDA)',
            displayName: 'Linux GPU (CUDA)',
            description: 'Uses Linux system Python environment with GPU CUDA acceleration',
            url: '',
            md5: 'skip',
            platform: 'linux',
            arch: ['x64'],
            type: 'gpu',
            size: 0,
            installedSize: 0,
            extractTo: 'python-env',
            requirements: { chip: 'NVIDIA GPU / Linux', memory: '8GB+' },
            checkFiles: []
          };
          configData.pythonEnvironments['linux-x64-cpu'] = {
            name: 'Linux CPU',
            displayName: 'Linux CPU',
            description: 'Uses Linux system Python environment with CPU computation',
            url: '',
            md5: 'skip',
            platform: 'linux',
            arch: ['x64'],
            type: 'cpu',
            size: 0,
            installedSize: 0,
            extractTo: 'python-env',
            requirements: { chip: 'x64 CPU / Linux', memory: '8GB+' },
            checkFiles: []
          };
          fs.writeFileSync(configPath, JSON.stringify(configData, null, 4), 'utf8');
          console.log('[STUBS AI SEARCH] Added Linux environments to config.json');
        }
      } catch (cfgErr) {
        console.error('[STUBS AI SEARCH] Failed to patch config.json:', cfgErr);
      }
    }

    let source = fs.readFileSync(filePath, 'utf8');
    let changed = false;

    // ----------------------------------------------------------------------
    // 1. _checkZstd()
    // ----------------------------------------------------------------------

    if (
      source.includes('async _checkZstd()') &&
      !source.includes("if (process.platform === 'linux' || os.platform() === 'linux')")
    ) {
      source = source.replace(
        /async _checkZstd\(\)\s*\{/,
        `async _checkZstd() {
        if (process.platform === 'linux' || os.platform() === 'linux') {
            return 'valid';
        }`
      );

      changed = true;
      console.log('[STUBS AI SEARCH] Patched _checkZstd()');
    }

    // ----------------------------------------------------------------------
    // 2. _getSelectedPythonEnv()
    // ----------------------------------------------------------------------

    if (
      (source.includes('async _getSelectedPythonEnv') ||
        source.includes('_getSelectedPythonEnv()')) &&
      !source.includes("this.pythonEnvConfigs?.['linux-x64-gpu']")
    ) {
      const returnPattern =
        /(\s+return selectedKey && this\.pythonEnvConfigs \? this\.pythonEnvConfigs\[selectedKey\] : null;)/;

      if (returnPattern.test(source)) {
        source = source.replace(
          returnPattern,
          `
        // Linux: automatically select the bundled GPU Python environment
        if (
            !selectedKey &&
            (process.platform === 'linux' || os.platform() === 'linux') &&
            this.pythonEnvConfigs?.['linux-x64-gpu']
        ) {
            selectedKey = 'linux-x64-gpu';
            this._setPersistentValue(
                'selectedPythonEnvVersion',
                selectedKey
            );
        }

        return selectedKey && this.pythonEnvConfigs
            ? this.pythonEnvConfigs[selectedKey]
            : null;`
        );

        changed = true;
        console.log(
          '[STUBS AI SEARCH] Patched _getSelectedPythonEnv()'
        );
      }
    }

    // ----------------------------------------------------------------------
    // 3. installZstd()
    // ----------------------------------------------------------------------

    if (
      source.includes('async installZstd(callbacks = {})') &&
      !source.includes("message: 'System zstd used on Linux'") &&
      !source.includes("System zstd used on Linux")
    ) {
      const installPattern =
        /(async installZstd\(callbacks = \{\}\)\s*\{[\s\S]*?try\s*\{)/;

      if (installPattern.test(source)) {
        source = source.replace(
          installPattern,
          `$1
            if (process.platform === 'linux' || os.platform() === 'linux') {
                this._updateState('zstd', 'valid');
                onComplete?.({
                    component: 'zstd',
                    message: 'System zstd used on Linux'
                });
                return;
            }`
        );

        changed = true;
        console.log(
          '[STUBS AI SEARCH] Patched installZstd()'
        );
      }
    }

    if (changed) {
      fs.writeFileSync(filePath, source, 'utf8');

      console.log(
        '[STUBS AI SEARCH] AI Search Linux compatibility patch applied'
      );
    }

    const isFullyPatched =
      source.includes("this.pythonEnvConfigs?.['linux-x64-gpu']") &&
      source.includes("System zstd used on Linux");

    return isFullyPatched;

  } catch (err) {
    console.error(
      '[STUBS AI SEARCH] Failed to patch environment-resource-manager:',
      err
    );

    return false;
  }
}

function patchAiSearchPythonServer() {
  try {
    const pluginPath = path.join(
      os.homedir(),
      '.config',
      'Eagle',
      'Plugins',
      'ai-search'
    );
    const filePath = path.join(pluginPath, 'modules', 'python-server.js');
    if (!fs.existsSync(filePath)) return false;

    let source = fs.readFileSync(filePath, 'utf8');
    if (source.includes('getPythonExecutable()') && !source.includes('Using system python on Linux')) {
      const targetPattern = /(if \(!fs\.existsSync\(pythonPath\)\) \{)/;
      if (targetPattern.test(source)) {
        source = source.replace(
          targetPattern,
          `$1
            if (process.platform === 'linux' || os.platform() === 'linux') {
                try {
                    const { execSync } = require('child_process');
                    const sysPython = execSync('which python3 || which python', { encoding: 'utf8' }).trim();
                    if (sysPython && fs.existsSync(sysPython)) {
                        logger.info(\`[Python Server] Using system python on Linux: \${sysPython}\`);
                        return sysPython;
                    }
                } catch (e) {
                    logger.warn(\`[Python Server] Failed to resolve system python via which: \${e.message}\`);
                }
            }`
        );
        fs.writeFileSync(filePath, source, 'utf8');
        console.log('[STUBS AI SEARCH] Patched python-server.js for Linux fallback');
      }
    }
    return true;
  } catch (err) {
    console.error('[STUBS AI SEARCH] Failed to patch python-server.js:', err);
    return false;
  }
}

// Wait for Eagle to create/install the AI Search plugin.
if (isMainProcess) {
  let attempts = 0;

  const timer = setInterval(() => {
    attempts++;

    const res1 = patchAiSearchEnvironmentManager();
    const res2 = patchAiSearchPythonServer();

    if ((res1 && res2) || attempts >= 300) {
      clearInterval(timer);
    }
  }, 100);
}

module.exports = {
  patchAiSearchEnvironmentManager,
  patchAiSearchPythonServer
};
