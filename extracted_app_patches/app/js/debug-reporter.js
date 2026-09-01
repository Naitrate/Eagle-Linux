var DebugReporter = {
	output: "",
	isMac: process.platform === 'darwin',
	getGPUInfo: function () {

		let canvas = document.createElement('canvas');
		let gl;
		let debugInfo;
		let vendor;
		let renderer;

		try {
  			gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
		} 
		catch (e) {}

		if (gl) {
			debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
			vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
			renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
			return renderer;
		}
		else {
			return "unknown";
		}
	},
	getOSVersion: function () {
	    var isMacOS = process.platform === 'darwin';
	    if (!isMacOS) {
	        return os.release();
	    }
	    else {
	        try {
	            const parseVersion = function (plist) {
	                const matches = /<key>ProductVersion<\/key>[\s]*<string>([\d.]+)<\/string>/.exec(plist);
	                if (!matches) {
	                    return;
	                }
	                return matches[1];
	            };
	            const file = fs.readFileSync('/System/Library/CoreServices/SystemVersion.plist', 'utf8');
	            const matches = parseVersion(file);
	            if (!matches) {
	                return os.release();
	            }
	            return matches;
	        }
	        catch (err) {
	            return os.release();
	        }
	    }
	},
	getOSName: function () {
	    var isMacOS = process.platform === 'darwin';
	    if (!isMacOS) {
	        return "Windows"
	    }
	    else {
	        return "macOS"
	    }
	},
	printPlugins: function (callback) {
		try {

			const plugins = pluginModule.plugins;
			const pluginsStr = plugins.map((plugin) => {
				return `${plugin?.manifest?.name} (${plugin?.manifest?.version}): ${plugin?.path}`;
			}).join("\n");

			this.output += 
`
 
===========================================================================================
Plugin Information
===========================================================================================
${pluginsStr}

`;
			callback();
		}
		catch (err) {
			this.output += 
`
===========================================================================================
 Plugin Information
===========================================================================================
${err.stack || err}
 

`;
			callback(err);
		}
	},
	printHeader: function (callback) {
		try {
			this.output += 
`
===========================================================================================
 Eagle Debugger Report
===========================================================================================
 Created at      |  ${new Date().toISOString()}
 

`;
			callback();
		}
		catch (err) {
			this.output += 
`
===========================================================================================
 Eagle Debugger Report
===========================================================================================
${err.stack || err}
 

`;
			callback(err);
		}
	},
	printSystemInfo: async function (callback) {
		try {
			const os = require('os');
			var osStr = `${this.getOSName()} ${this.getOSVersion()}(${process.arch})`;
			var gpuStr = `${this.getGPUInfo()}`;
			var screenStr = "";
			var allDisplays = await ipcRenderer.invoke('SCREEN.', 'getAllDisplays');
			var screens = allDisplays.map((screen) => {
				return {
					width: screen.size.width,
					height: screen.size.height,
                    scaleFactor: screen.scaleFactor
				}
			});

			screens.forEach((screen, index) => {
				screenStr += `${index + 1}: ${screen.width} x ${screen.height} (devicePixelRatio: ${screen.scaleFactor}) `;
			});

			let cpus = os.cpus();
			let cpuString = "";
	        if (cpus[0] && cpus[0].model) {
	            cpuString = `${cpus[0].model} (${cpus.length}core)`;
	        }
	        else {
	            cpuString = `${cpus.length} core`;
	        }

			if (this.isMac) {
				this.output += 
`
===========================================================================================
 System Information
===========================================================================================
 OS              |  ${osStr}
 CPU             |  ${cpuString}
 GPU             |  ${gpuStr}
 Memory (global) |  ${os.totalmem() / 1024 / 1024 / 1024} GB
 Memory (free)   |  ${os.freemem() / 1024 / 1024 / 1024} GB
 Screen          |  ${screenStr}
 Device ID       |  ${machineID}
                 |  
 process.env     |  PWD: ${process.env.PWD}
                 |  TMPDIR: ${process.env.TMPDIR}
                 |  LANG: ${process.env.LANG}

 
`;
			}
			else {
				const execSync = require('child_process').execSync;
				var stdoutString;
				try {
				    stdoutString = execSync(`reg query "HKLM\\SOFTWARE\\Microsoft\\NET Framework Setup\\NDP\\v4\\Full" /v Version`, {}, {
				        timeout: 5000
				    }).toString();
				    var arr = stdoutString.split("REG_SZ");
				    stdoutString = arr[arr.length - 1].trim();
				}
				catch (err) {
				    stdoutString = err.stack;
				}
				this.output += 
`
===========================================================================================
 System Information
===========================================================================================
 OS              |  ${osStr}
 CPU             |  ${cpuString}
 GPU             |  ${gpuStr}
 Memory (global) |  ${os.totalmem() / 1024 / 1024 / 1024} GB
 Memory (free)   |  ${os.freemem() / 1024 / 1024 / 1024} GB
 Screen          |  ${screenStr}
 Device ID       |  ${machineID}
 NET Framework   |  ${stdoutString}
                 |  
 process.env     |  APPDATA: ${process.env.APPDATA}
                 |  COMSPEC: ${process.env.COMSPEC}
                 |  SYSTEMDRIVE: ${process.env.SYSTEMDRIVE}
                 |  SYSTEMROOT: ${process.env.SYSTEMROOT}
                 |  WINDIR: ${process.env.WINDIR}
                 |  TMP: ${process.env.TMP}
                 |  TMPDIR: ${process.env.TMPDIR}
                 |  LANG: "zh_TW.UTF-8"

 
`;
			}
			callback();
		}
		catch (err) {
			this.output += 
`
===========================================================================================
 System Information
===========================================================================================
${err.stack || err}
 

`;
			callback(err);
		}
	},
	printApplicationInfo: function (callback) {
		try {

			var pjson = require(appRoot + '/package.json');
			const appVersion = pjson.version;
			const buildVersion = pjson.buildVersion;
			const buildNumber = pjson.buildNumber;

			var libraryStr = "";
			var libraryHistory = electronSettings.getSync('libraryHistory') || [];
			var normalizeHistory = [];
			libraryHistory.forEach(function (history) {
                if (history) { normalizeHistory.push(path.normalize(history).replace(/\\$/g, "").replace(/\/$/, "")); }
            });
            libraryHistory = [...new Set(normalizeHistory)];
			libraryHistory.forEach((libraryPath, index) => {
				if (index === 0) {
					libraryStr += ` Library          |  ${libraryPath}
`;
				}
				else {
					libraryStr += `                  |  ${libraryPath}
`;
				}
			});

			this.output += 
`
===========================================================================================
 Application Information
===========================================================================================
 Version          |  ${appVersion} Build${buildNumber} (${buildVersion})
 Path             |  ${appRoot.path}
 Language         |  ${i18n.locale}
${libraryStr}
`;

			if (this.isMac) {
				this.output += 
`
 
`;
			}
			else {
				var dllRoot = app.getAppPath().replace("\\resources\\app.asar", "");

				// Niunniun
				var NiunniunExeStr = ``;
				var NiunniunExeStat;
				var NiunniunExePath = path.normalize(`${dllRoot}/NiuniuCapture.exe`);

				var NiunniunDllStr = ``;
				var NiunniunDllStat;
				var NiunniunDllPath = path.normalize(`${dllRoot}/NiuniuCapture.dll`);

				var MagickDllStr = ``;
				var MagickDllStat;
				var MagickDllPath = path.normalize(`${dllRoot}/Magick.dll`);

				var MagickCoreDllStr = ``;
				var MagickCoreDllStat;
				var MagickCoreDllPath = path.normalize(`${dllRoot}/Magick.Core.dll`);

				if (fs.existsSync(NiunniunExePath)) {
					NiunniunExeStat = fs.statSync(NiunniunExePath);
					NiunniunExeStr = `Niunniun.exe (${NiunniunExePath}) (${NiunniunExeStat.size / 1024} KB)`;
				}
				else {
					NiunniunExeStr = `Niunniun.exe (Not Found)`;
				}

				if (fs.existsSync(NiunniunDllPath)) {
					NiunniunDllStat = fs.statSync(NiunniunDllPath);
					NiunniunDllStr = `Niunniun.dll (${NiunniunDllPath}) (${NiunniunDllStat.size / 1024} KB)`;
				}
				else {
					NiunniunDllStr = `Niunniun.dll (Not Found)`;
				}

				if (fs.existsSync(MagickDllPath)) {
					MagickDllStat = fs.statSync(MagickDllPath);
					MagickDllStr = `Magick.dll (${MagickDllPath}) (${MagickDllStat.size / 1024} KB)`;
				}
				else {
					MagickDllStr = `Magick.dll (Not Found)`;
				}

				if (fs.existsSync(MagickCoreDllPath)) {
					MagickCoreDllStat = fs.statSync(MagickCoreDllPath);
					MagickCoreDllStr = `Magick.Core.dll (${MagickCoreDllPath}) (${MagickCoreDllStat.size / 1024} KB)`;
				}
				else {
					MagickCoreDllStr = `Magick.Core.dll (Not Found)`;
				}

				// Edge-cs
				var EdgeCsStr = ``;
				var EdgeCsStat;
				var EdgeCsPath = path.normalize(`${dllRoot}/edge-cs.dll`);

				if (fs.existsSync(EdgeCsPath)) {
					EdgeCsStat = fs.statSync(EdgeCsPath);
					EdgeCsStr = `Edge-cs (${EdgeCsPath}) (${EdgeCsStat.size / 1024} KB)`;
				}
				else {
					EdgeCsStr = `Edge-cs (Not Found)`;
				}

				this.output += 
`                  |  
 Plugins          |  ${NiunniunExeStr}
                  |  ${NiunniunDllStr}
                  |  ${MagickDllStr}
                  |  ${MagickCoreDllStr}
                  |  ${EdgeCsStr}

`;
				var dirs = fs.readdirSync(dllRoot);
				var dirsStr = "";
				this.output += 
`                  |  
 Files            |  ${dirs.length} files`;
				dirs.forEach(function(dir) {
					dirsStr +=`
                  |  ${dir}`;
				});
				this.output += dirsStr;
			}
			callback();
		}
		catch (err) {
			this.output += 
`
===========================================================================================
 Application Information
===========================================================================================
${err.stack || err}
 

`;
			callback(err);
		}
	},
	printLibraryInfo: function (callback) {
		try {

			if (!$bodyScope.libraryPath) {
				this.output += 
`
 
===========================================================================================
 Library Information
===========================================================================================
 No library has been opened yet


`;
				callback();
				return;
			}

			var isWritable = function (dir) {
				try { fs.accessSync(dir, fs.W_OK) } catch (err) { return "No"; }
				return "Yes"
			};

			var alcCheck = function (dir) {
				if (!ACCESS.checkALCs(dir)) return "NO";
				return "YES"
			};

			var getSize = function (dir) {
				try { return fs.statSync(dir).size } catch (err) { return 0; }
				return 0;
			};

			var libraryPath = $bodyScope.libraryPath;
			var metadataPath = path.normalize(`${libraryPath}/metadata.json`);
			var mtimePath = path.normalize(`${libraryPath}/mtime.json`);
			var tagsPath = path.normalize(`${libraryPath}/tags.json`);
			var savedFilterPath = path.normalize(`${libraryPath}/saved-filters.json`);
			var allCount = $bodyScope.raw && $bodyScope.raw.length || "undefined";
			var folderCount = $bodyScope.folderList && $bodyScope.folderList.length || "undefined";
			var smartFolderCount = $bodyScope.smartFolders && $bodyScope.smartFolders.length || "undefined";
			var quickAccessCount = $bodyScope.quickAccess && $bodyScope.quickAccess.length || "undefined";
			var fileTypeCount = eagle.filter.filterCounts && JSON.stringify(eagle.filter.filterCounts);

			this.output += 
`
 
===========================================================================================
 Library Information
===========================================================================================
 Path             | ${libraryPath} | Writable: ${isWritable(libraryPath)} Acl: ${alcCheck(libraryPath)}
 Files            | ${allCount || 0}
 Folders          | ${folderCount || 0}
 SmartFolders     | ${smartFolderCount || 0}
 QuickAccess      | ${quickAccessCount || 0}
 metadata.json    | ${ (getSize(metadataPath) / 1024).toFixed(2) }KB | Writable: ${isWritable(metadataPath)}
 mtime.json       | ${ (getSize(mtimePath) / 1024).toFixed(2) }KB | Writable: ${isWritable(mtimePath)}
 tags.json        | ${ (getSize(tagsPath) / 1024).toFixed(2) }KB | Writable: ${isWritable(tagsPath)}
 saved-filters.json |  ${ (getSize(savedFilterPath) / 1024).toFixed(2) }KB | Writable: ${isWritable(savedFilterPath)}
 types            | ${fileTypeCount}


`;
			callback();
		}
		catch (err) {
			this.output += 
`
===========================================================================================
 Library Information
===========================================================================================
${err.stack || err}
 

`;
			callback(err);
		}
	},
	printDiskTesting: function (callback) {
		try {

			var diskSpeedTest = (dir) => {
				try {
					var startMkdirTime;
					var startWriteFileTime;
					var startRemoveDirTime;
					var mkdirTime;
					var writeFileTime;
					var removeDirTime;
					var fs = require("fs");
					fse = require('fs-extra');
					var json = `{"id":"KD9ZV3ZXM75X0","name":"illust_002_testC_v07","size":97191,"btime":1596099298000,"mtime":1596187276884,"ext":"png","tags":[],"folders":[],"isDeleted":false,"url":"","annotation":"","modificationTime":1596185885977,"width":1200,"height":1200,"noThumbnail":true,"palettes":[{"color":[59,131,250],"ratio":81},{"color":[217,219,234],"ratio":7},{"color":[73,49,32],"ratio":6},{"color":[227,95,23],"ratio":3.25},{"color":[36,179,251],"ratio":0.74},{"color":[249,159,142],"ratio":0.46}],"lastModified":1596187279643,"star":3}`;
					var testDir = path.normalize(dir + "/speedtest");

					if (!fs.existsSync(testDir)) {
					    fs.mkdirSync(testDir);
					}

					startMkdirTime = Date.now();
					for (var i = 0; i < 50; i++) {
					    var dir = `${testDir}/${i}`;
					    if (!fs.existsSync(dir)) {
					        fs.mkdirSync(dir);
					    }
					}
					mkdirTime = Date.now() - startMkdirTime;

					startWriteFileTime = Date.now();
					for (var i = 0; i < 50; i++) {
					    fs.writeFileSync(`${testDir}/${i}/~$metadata.json.tmp`, json, "utf8");
					}
					writeFileTime = Date.now() - startWriteFileTime;

					startRemoveDirTime = Date.now();
					for (var i = 0; i < 50; i++) {
					    fse.removeSync(`${testDir}/${i}`);
					}
					removeDirTime = Date.now() - startRemoveDirTime;

					fse.removeSync(testDir);

					return  {
						mkdirTime: mkdirTime,
						writeFileTime: writeFileTime,
						removeDirTime: removeDirTime
					}
				}
				catch (err) {
					console.log(err)
					return {
						mkdirTime: 0,
						writeFileTime: 0,
						removeDirTime: 0
					}
				}
			};

			var listDisks = () => {
				const execSync = require('child_process').execSync;
				var stdoutString;
				try {
					var command = "diskutil list";
					if (process.platform !== 'darwin') { command = "wmic logicaldisk get drivetype, size, filesystem, freespace, systemname, Description, Caption"; }
				    stdoutString = execSync(command, {}, {
				        timeout: 5000,
						encoding: 'utf8'
				    }).toString();

				    // 取得 S.M.A.R.T
				    if (process.platform !== 'darwin') {
				    	try {
				    		var str = execSync("wmic diskdrive get index,model,name,size,Caption,status", {}, { timeout: 5000, encoding: 'utf8' }).toString();
				    		stdoutString += `
${str}
`;
				    	}
				    	catch (err) {
				    		electronLog && electronLog.error("[app] " + err.stack || err);
				    	}
				    }
				    else {
				    	try {
					    	var disks = (stdoutString.match(/\/dev\/disk/g) || []);
					    	disks.forEach(function (disk, index) {
					    		var command = `diskutil info disk${index}`;
					    		var result = execSync(command, {}, {
							        timeout: 2000
							    }).toString();

							    stdoutString += `
----------

${result}

`;
					    	});
				    	}
				    	catch (err) {
				    		electronLog && electronLog.error("[app] " + err.stack || err);
				    	}
				    }
				}
				catch (err) {
				    stdoutString = err.stack;
				}
				return stdoutString;
			};

			var result0 = {
				mkdirTime: 0,
				writeFileTime: 0,
				removeDirTime: 0
			};

			var result1 = {
				mkdirTime: 0,
				writeFileTime: 0,
				removeDirTime: 0
			}

			const os = require('os');
			if (!fs.existsSync(EAGLE_THUMBNAIL_TEMP_PATH)) {
			    fs.mkdirSync(EAGLE_THUMBNAIL_TEMP_PATH);
			}
			result0 = diskSpeedTest(EAGLE_THUMBNAIL_TEMP_PATH);

			if ($bodyScope.libraryPath) {
				result1 = diskSpeedTest($bodyScope.libraryPath);
			}

			var stdoutString = listDisks();

			this.output += 
`
===========================================================================================
 Disk Performance Testing
===========================================================================================
 Location         | ${EAGLE_THUMBNAIL_TEMP_PATH}
 mkdir            | ${result0.mkdirTime}ms
 writeFile        | ${result0.writeFileTime}ms
 remove           | ${result0.removeDirTime}ms
------------------------------------------------------
 Location         | ${$bodyScope.libraryPath}
 mkdir            | ${result1.mkdirTime}ms
 writeFile        | ${result1.writeFileTime}ms
 remove           | ${result1.removeDirTime}ms


===========================================================================================
 Disk Information
===========================================================================================
${stdoutString}

`;
			callback();
		}
		catch (err) {
			this.output += 
`
===========================================================================================
 Disk Performance Testing
===========================================================================================
${err.stack || err}
 

`;
			callback(err);
		}
	},
	printNetworkTesting: function (callback) {
		const request = require('request');
		var that = this;
		var pingIP = (protocol, ip, port, callback) => {
			var start = Date.now();
			
			const options = {
				url: (port)? `${protocol}://${ip}:${port}`: `${protocol}://${ip}`,
				method: 'HEAD',
				timeout: 5000
			};

			console.log(options.url);
			// ping ip with request
			request(options, (err, res, body) => {
				if (err) {
					that.output += `[x] ${options.url} (${Date.now() - start}ms)\n`;
					callback();
				}
				else {
					console.log(`[v] ${options.url} (${Date.now() - start}ms)`);
					that.output += `[v] ${options.url} (${Date.now() - start}ms)\n`;
					callback();
				}
			});
		}

		this.output += 
`
===========================================================================================
 Network Testing
===========================================================================================
`;
		const async = require('async');
		var ips = [
			{
				protocol: "https",
				ip: "dribbble.com", 
			},
			{
				protocol: "https",
				ip: "pinterest.com", 
			},
			{
				protocol: "https",
				ip: "www.instagram.com", 
			},
			{
				protocol: "https",
				ip: "artstation.com", 
			},
			{
				protocol: "https",
				ip: "eagle.cool", 
			},
			{
				protocol: "https",
				ip: "en.eagle.cool", 
			},
			{
				protocol: "https",
				ip: "core.eagle.cool", 
			},
			{
				protocol: "https",
				ip: "community-cn.eagle.cool", 
			},
			{
				protocol: "https",
				ip: "eagleapp.oss-cn-hongkong.aliyuncs.com", 
			},
			{
				protocol: "https",
				ip: "oss-cn-shenzhen.aliyuncs.com", 
			},
			{
				ip: "oss-community-attachment.eagle.cool",
				protocol: "https",
			},
			{
				ip: "r2-plugin.eagle.cool",
				protocol: "https",
			},
			{
				protocol: "https",
				ip: "aliyuncs.com", 
			},
			{
				protocol: "http",
				ip: "120.79.10.37", 
			},
			{
				protocol: "http",
				ip: "localhost", 
				port: 41593
			},
			{
				protocol: "http",
				ip: "localhost", 
				port: 41595
			},
		];
		var cbs = ips.map(function(obj) {
        	return function(callback) {
        		pingIP(obj.protocol, obj.ip, obj.port, (err, result) =>  {
        			callback();
        		});
        	}
        });

		async.parallelLimit(cbs, 10, function(err, result) {
			that.output += `

`;
			callback();
		});
	},
	printHostInfo: function (callback) {
		try {
			var hostPath = "/etc/hosts";
        	if (process.platform === 'win32') { hostPath = "C:/Windows/System32/drivers/etc/hosts"; }
			var hostStr = fs.readFileSync(hostPath, "utf8");
			this.output += 
`
===========================================================================================
 Host Information
===========================================================================================
${hostStr}
`;
			callback();
		}
		catch (err) {
			this.output += 
`
===========================================================================================
 Host Information
===========================================================================================
${err.stack || err}
 

`;
			callback(err);
		}
	},
	async writeDXDInfo (dest) {
		return new Promise((resolve, reject) => {
			if (process.platform !== 'win32') { return resolve(); }
			if (fs.existsSync(dest)) { return resolve(); }
			const cmd = `dxdiag /dontskip /whql:off /64bit /t ${dest}`;
			const exec = require('child_process').exec;
			exec(cmd, (err, stdout, stderr) => {
				console.log(err);
				console.log(stdout);
				let times = 0;
				const checkFile = () => {
					times++;
					if (fs.existsSync(dest)) {
						return resolve();
					}
					else {
						if (times > 10) {		
							return resolve();
						}
						else {
							setTimeout(checkFile, 1000);
						}
					}
				}
				checkFile();
			});
		});
	},
	save: function (callback) {

		var that = this;
		var savePath;
		var libraryPath;
		var metadataPath;
		var backupPath;
		var logPath;

		$bodyScope.openAll();
		$bodyScope.$evalAsync();

		var zipFileName = i18n.__("dialog.debugReport.fileName");

		dialog.showSaveDialog(currentWindow, {
            defaultPath: path.normalize(app.getPath('home') + '/Desktop/') + `${zipFileName}.zip`,
            title: "Save as",
            filters: [{ name: 'Save', extensions: ['zip'] }]
        }).then(result => {

            var zipPath = result.filePath;
			if (!zipPath) return;
			$bodyScope.debugReportStatus = {
				isExporting: true,
				progress: 0,
			};
			$bodyScope.$evalAsync();

			electronLog && electronLog.info(`[app] Export debug report: ${zipPath}`);

			this.printHeader((err) => {
				this.printSystemInfo((err) => {
					$bodyScope.debugReportStatus.progress = 10;
					$bodyScope.$evalAsync();
					this.printApplicationInfo((err) => {
						$bodyScope.debugReportStatus.progress = 20;
						$bodyScope.$evalAsync();
						this.printLibraryInfo((err) => {
							$bodyScope.debugReportStatus.progress = 30;
							$bodyScope.$evalAsync();
							this.printPlugins((err) => {
								this.printNetworkTesting((err) => {
									$bodyScope.debugReportStatus.progress = 50;
									$bodyScope.$evalAsync();
									this.printDiskTesting((err) => {
										$bodyScope.debugReportStatus.progress = 80;
										$bodyScope.$evalAsync();
										this.printHostInfo((err) => {
											(async () => {
												$bodyScope.debugReportStatus.progress = 90;
												$bodyScope.$evalAsync();
												console.log(that.output);

												const dxdiagPath = path.normalize(`${EAGLE_THUMBNAIL_TEMP_PATH}/dxdiag.txt`);
												await this.writeDXDInfo(dxdiagPath);

												var libraryPath = $bodyScope.libraryPath;
												var metadataPath = path.normalize(`${libraryPath}/metadata.json`);
												var mtimePath = path.normalize(`${libraryPath}/mtime.json`);
												var tagsPath = path.normalize(`${libraryPath}/tags.json`);
												var savedFilterPath = path.normalize(`${libraryPath}/saved-filters.json`);
												var backupPath = path.normalize(`${libraryPath}/backup`);
												var crashpadPath = app.getPath('crashDumps');
												var settingsPath = path.normalize(`${app.getPath('userData')}/Settings`);
												var logPath = electronLog.transports.file.findLogPath();
												var reportPath = path.normalize(`${EAGLE_THUMBNAIL_TEMP_PATH}/debug-report.txt`);
												var archiver = require('archiver');
												var archive = archiver('zip', { store: false, zlib: { level: 9, chunkSize: 16 * 1024 * 4 } });
												var outputStream = fs.createWriteStream(zipPath);
												fs.writeFileSync(reportPath, that.output, "utf8");

												archive.pipe(outputStream);
												archive.file(reportPath, { name: 'debug-report.txt' });

												if (libraryPath && fs.existsSync(libraryPath)) {
													if (fs.existsSync(metadataPath)) {
														archive.file(metadataPath, { name: 'metadata.json' });
													}
													if (fs.existsSync(mtimePath)) {
														archive.file(mtimePath, { name: 'mtime.json' });
													}
													if (fs.existsSync(tagsPath)) {
														archive.file(tagsPath, { name: 'tags.json' });
													}
													if (fs.existsSync(savedFilterPath)) {
														archive.file(savedFilterPath, { name: 'saved-filters.json' });
													}
													if (fs.existsSync(backupPath)) {
														archive.directory(backupPath, 'backup');
													}
													if (fs.existsSync(crashpadPath)) {
														archive.directory(crashpadPath, 'Crashpad');
													}
													if (fs.existsSync(settingsPath)) {
														archive.file(settingsPath, { name: 'Settings' });
													}
												}

												if (fs.existsSync(logPath)) {
													archive.file(logPath, { name: 'log.log' });
												}

												if (fs.existsSync(dxdiagPath)) {
													archive.file(dxdiagPath, { name: 'dxdiag.txt' });
												}

												archive.finalize();
												outputStream.on('close', function() {
													$bodyScope.debugReportStatus = {
														isExporting: false,
														progress: 0,
													};
													$bodyScope.$evalAsync();
													ipcRenderer.send('show-item-in-folder', zipPath);
												});

												that.output = "";
											})();
										});
									});
								});
							});
						});
					});
				});
			});	
		});
	}
}

$("body").on("click", "#export-debug-report-dialog .cancel", function () {
	$bodyScope.debugReportStatus = {
		isExporting: false,
		progress: 0,
	};
	$bodyScope.$evalAsync();
});




