/*
 * Eagle Linux / macOS / Windows screenshot implementation
 *
 * Linux:
 *   Uses org.freedesktop.portal.Screenshot directly through dbus-next.
 *
 * Screenshot portal target values (v3+ only):
 *
 *   1 = Screen
 *   2 = Window
 *   4 = Area
 *   8 = Active Window
 *
 * Screenshot portal v2 does NOT support the target option.
 * In that case Eagle falls back to the non-targeted Screenshot()
 * API, using interactive=true for region capture and
 * interactive=false for fullscreen/window capture.
 *
 * Eagle modes:
 *   1 = Window capture
 *   2 = Area / Region capture
 *   3 = Fullscreen capture
 *
 * Linux screenshot implementation:
 *
 *   Eagle
 *      |
 *      v
 *   org.freedesktop.portal.Desktop
 *      |
 *      v
 *   org.freedesktop.portal.Screenshot.Screenshot()
 *      |
 *      v
 *   xdg-desktop-portal-kde
 *      |
 *      v
 *   KDE/Wayland selection UI
 *
 * There are intentionally NO Linux screenshot utility fallbacks.
 *
 * We do not use:
 *
 *   - Spectacle
 *   - Flameshot
 *   - grim
 *   - slurp
 *   - maim
 *   - scrot
 *   - gnome-screenshot
 *   - gdbus
 *   - busctl
 *   - Python
 *   - shell scripts
 *
 * The portal is the sole Linux screenshot implementation.
 */

const LINUX_WINDOW_CAPTURE_DELAY_MS =
3000;


class ScreenCapture {

    #isScreenCapturing = false;


    constructor() {
        this.#isScreenCapturing = false;
    }


    /*
     * ============================================================
     * PUBLIC ENTRY POINT
     * ============================================================
     */

    async capture({ mode, item }) {

        if (this.#isScreenCapturing) {

            ipcRenderer.send(
                'electron-info',
                '[bg] ignore screencapture, because the last operation not finished.'
            );

            return;
        }


        const id =
        guid();


        const format =
        preferences.screencapture.format ||
        'png';


        const quality =
        preferences?.screencapture?.quality
        ? preferences.screencapture.quality / 100
        : 0.9;


        const tempPath =
        `${EAGLE_THUMBNAIL_TEMP_PATH}/${id}.png`;


        let currentDisplay =
        null;


        try {

            currentDisplay =
            await ipcRenderer.invoke(
                'screen.getCursorDisplay'
            );

        }
        catch (err) {

            ipcRenderer.send(
                'electron-log',
                `[bg] Could not get cursor display: ${
                    err?.stack || err
                }`
            );
        }


        const isRetina =
        currentDisplay?.scaleFactor == 2;


        ipcRenderer.send(
            'electron-info',
            `[bg] Start screencapture, mode: ${mode}, path: ${tempPath}`
        );


        analytics.event(
            'Screenshot',
            'Create',
            mode
        );


        try {

            /*
             * Linux uses the XDG Desktop Portal exclusively.
             */
            if (
                process.platform === 'linux'
            ) {

                await this.#captureLinux({
                    mode,
                    tempPath
                });

            }

            /*
             * Original non-Linux implementations.
             */
            else {

                switch (mode) {

                    case 3:

                        await this.#captureFullScreen({
                            format,
                                tempPath
                        });

                        break;

                    default:

                        await this.#captureSpecific({
                            mode,
                            format,
                                tempPath,
                                quality
                        });

                        break;
                }
            }


            return await this.createItem({
                tempPath,
                mode,
                item,
                isRetina,
                format,
                    quality
            });

        }
        catch (err) {

            this.#isScreenCapturing =
            false;


            ipcRenderer.send(
                'electron-log',
                `[bg] Screenshot fail, path: ${tempPath}`
            );


            ipcRenderer.send(
                'electron-log',
                err?.stack || String(err)
            );


            return undefined;
        }
    }


    /*
     * ============================================================
     * LINUX SCREENSHOT PORTAL CAPABILITY DETECTION
     * ============================================================
     *
     * Screenshot portal:
     *
     *   v2:
     *     - Screenshot()
     *     - interactive
     *     - modal
     *     - handle_token
     *
     *   v3+:
     *     - Adds AvailableTargets
     *     - Adds target option
     *
     * We query the D-Bus Properties interface directly because
     * dbus-next proxy interfaces do not expose getProperty().
     */

    async #getLinuxScreenshotCapabilities() {

        const dbus =
        require('dbus-next');


        const bus =
        dbus.sessionBus();


        const BUS_NAME =
        'org.freedesktop.portal.Desktop';


        const OBJECT_PATH =
        '/org/freedesktop/portal/desktop';


        const SCREENSHOT_INTERFACE =
        'org.freedesktop.portal.Screenshot';


        try {

            const desktopObject =
            await bus.getProxyObject(
                BUS_NAME,
                OBJECT_PATH
            );


            const properties =
            desktopObject.getInterface(
                'org.freedesktop.DBus.Properties'
            );


            /*
             * ----------------------------------------------------
             * Screenshot portal version
             * ----------------------------------------------------
             */

            const versionResult =
            await properties.Get(
                SCREENSHOT_INTERFACE,
                'version'
            );


            const version =
            Number(
                versionResult?.value
            ) || 1;


            /*
             * ----------------------------------------------------
             * AvailableTargets
             * ----------------------------------------------------
             *
             * This property exists on Screenshot v3+.
             *
             * Bit flags:
             *
             *   1 = Screen
             *   2 = Window
             *   4 = Area
             *   8 = Active Window
             */

            let availableTargets =
            0;


            if (
                version >= 3
            ) {

                try {

                    const targetsResult =
                    await properties.Get(
                        SCREENSHOT_INTERFACE,
                        'AvailableTargets'
                    );


                    availableTargets =
                    Number(
                        targetsResult?.value
                    ) || 0;

                }
                catch (err) {

                    ipcRenderer.send(
                        'electron-log',
                        `[bg] Could not read Screenshot.AvailableTargets: ${
                            err?.stack || err
                        }`
                    );


                    availableTargets =
                    0;
                }
            }


            return {

                version,

                availableTargets,

                supportsScreen:
                (availableTargets & 1) !== 0,

                supportsWindow:
                (availableTargets & 2) !== 0,

                supportsArea:
                (availableTargets & 4) !== 0,

                supportsActiveWindow:
                (availableTargets & 8) !== 0
            };

        }
        finally {

            try {

                bus.disconnect();

            }
            catch (err) {

                /*
                 * Nothing to do.
                 */
            }
        }
    }


    /*
     * ============================================================
     * LINUX SCREENSHOT DISPATCH
     * ============================================================
     *
     * The portal version determines which API is used.
     *
     * Screenshot v3+:
     *   Use Eagle's requested target when supported.
     *
     * Screenshot v2:
     *   target does not exist, so use the non-targeted API.
     *
     * Mode behavior:
     *
     *   1 = Window
     *       Wait 3 seconds, then non-interactive capture.
     *
     *   2 = Region
     *       Interactive capture.
     *
     *   3 = Fullscreen
     *       Non-interactive capture.
     */

    async #captureLinux({
        mode,
        tempPath
    }) {

        this.#isScreenCapturing =
        true;


        try {

            const capabilities =
            await this.#getLinuxScreenshotCapabilities();


            ipcRenderer.send(
                'electron-info',
                `[bg] Linux Screenshot portal: ` +
                `v${capabilities.version}, ` +
                `AvailableTargets=${capabilities.availableTargets}`
            );


            /*
             * ----------------------------------------------------
             * Window capture delay
             * ----------------------------------------------------
             *
             * Give the user a few seconds before the screenshot
             * request is made.
             *
             * This happens before both v2 and v3 capture paths.
             */

            if (
                Number(mode) === 1
            ) {

                ipcRenderer.send(
                    'electron-info',
                    `[bg] Linux window capture: waiting ` +
                    `${LINUX_WINDOW_CAPTURE_DELAY_MS}ms before screenshot`
                );


                await this.#sleep(
                    LINUX_WINDOW_CAPTURE_DELAY_MS
                );
            }


            /*
             * ----------------------------------------------------
             * Screenshot portal v3+
             * ----------------------------------------------------
             */

            if (
                capabilities.version >= 3
            ) {

                const target =
                this.#linuxModeToPortalTarget(
                    mode
                );


                const targetSupport = {

                    1:
                    capabilities.supportsScreen,

                    2:
                    capabilities.supportsWindow,

                    4:
                    capabilities.supportsArea,

                    8:
                    capabilities.supportsActiveWindow
                };


                const supported =
                targetSupport[target] === true;


                /*
                 * Requested target is explicitly supported.
                 */
                if (
                    supported
                ) {

                    /*
                     * Fullscreen:
                     *   interactive=false
                     *
                     * Window:
                     *   interactive=false
                     *
                     * Region:
                     *   interactive=true
                     */
                    const interactive =
                    Number(mode) === 2;


                    ipcRenderer.send(
                        'electron-info',
                        `[bg] Linux screenshot: ` +
                        `mode=${mode}, ` +
                        `target=${target}, ` +
                        `interactive=${interactive}`
                    );


                    await this.#captureLinuxPortal({
                        target,
                        tempPath,
                        interactive
                    });


                    return tempPath;
                }


                /*
                 * Requested v3 target isn't available.
                 */
                ipcRenderer.send(
                    'electron-info',
                    `[bg] Linux screenshot target ${target} ` +
                    `is unsupported; using non-targeted fallback`
                );
            }


            /*
             * ----------------------------------------------------
             * V2 / UNSUPPORTED TARGET FALLBACK
             * ----------------------------------------------------
             *
             * Mode 1:
             *   Window -> non-interactive after 3 second delay.
             *
             * Mode 2:
             *   Region -> interactive.
             *
             * Mode 3:
             *   Fullscreen -> non-interactive.
             *
             * Note:
             *
             * Screenshot v2 has no standardized target option.
             * Therefore mode 1 cannot explicitly identify a window.
             */

            const interactive =
            Number(mode) === 2;


            ipcRenderer.send(
                'electron-info',
                `[bg] Linux Screenshot fallback: ` +
                `mode=${mode}, ` +
                `interactive=${interactive}`
            );


            await this.#captureLinuxPortalV2({
                mode,
                tempPath,
                interactive
            });


            return tempPath;

        }
        catch (err) {

            ipcRenderer.send(
                'electron-log',
                `[bg] Linux portal screenshot error: ${
                    err?.stack || err
                }`
            );


            throw err;

        }
        finally {

            this.#isScreenCapturing =
            false;
        }
    }


    /*
     * ============================================================
     * SLEEP / DELAY
     * ============================================================
     */

    async #sleep(ms) {

        await new Promise(
            resolve =>
            setTimeout(
                resolve,
                ms
            )
        );
    }


    /*
     * ============================================================
     * EAGLE MODE -> PORTAL TARGET
     * ============================================================
     *
     * These values are only sent to Screenshot v3+.
     */

    #linuxModeToPortalTarget(mode) {

    switch (
        Number(mode)
    ) {

        /*
         * Eagle window capture.
         *
         * Portal:
         *   2 = Window
         */
        case 1:

            return 2;


            /*
             * Eagle region capture.
             *
             * Portal:
             *   4 = Area
             */
            case 2:

                return 4;


                /*
                 * Eagle fullscreen capture.
                 *
                 * Portal:
                 *   1 = Screen
                 */
                case 3:

                    return 1;


                    /*
                     * Unknown mode.
                     *
                     * Region is the safest interactive behavior.
                     */
                    default:

                        return 4;
    }
    }


    /*
     * ============================================================
     * XDG DESKTOP PORTAL - V2 FALLBACK
     * ============================================================
     *
     * Used when:
     *
     *   - Screenshot portal version < 3
     *   - Screenshot portal v3+ does not advertise the requested
     *     Eagle target
     *
     * IMPORTANT:
     *
     * There is deliberately NO "target" option here.
     *
     * Screenshot v2 does not support target selection.
     */

    async #captureLinuxPortalV2({
        mode,
        tempPath,
        interactive = true
    }) {

        const dbus =
        require('dbus-next');


        const Variant =
        dbus.Variant;


        const bus =
        dbus.sessionBus();


        const BUS_NAME =
        'org.freedesktop.portal.Desktop';


        const OBJECT_PATH =
        '/org/freedesktop/portal/desktop';


        const SCREENSHOT_INTERFACE =
        'org.freedesktop.portal.Screenshot';


        const REQUEST_INTERFACE =
        'org.freedesktop.portal.Request';


        try {

            const desktopObject =
            await bus.getProxyObject(
                BUS_NAME,
                OBJECT_PATH
            );


            const screenshot =
            desktopObject.getInterface(
                SCREENSHOT_INTERFACE
            );


            if (
                !screenshot
            ) {

                throw new Error(
                    `Could not obtain ${SCREENSHOT_INTERFACE} D-Bus interface`
                );
            }


            /*
             * ----------------------------------------------------
             * Generate valid request token
             * ----------------------------------------------------
             */

            const token =
            `eagle_${process.pid}_${Date.now()}`;


            /*
             * ----------------------------------------------------
             * Parent window
             * ----------------------------------------------------
             */

            const parentWindow =
            '';


        ipcRenderer.send(
            'electron-info',
            '[bg] Linux portal v2 fallback parent window: <none>'
        );


        /*
         * ----------------------------------------------------
         * Portal options
         * ----------------------------------------------------
         *
         * No target option is included.
         */

        const options = {

            handle_token:
            new Variant(
                's',
                token
            ),

            modal:
            new Variant(
                'b',
                false
            ),

            interactive:
            new Variant(
                'b',
                interactive
            )
        };


        ipcRenderer.send(
            'electron-info',
            `[bg] Linux Screenshot v2 fallback: ` +
            `Eagle mode=${mode}, ` +
            `interactive=${interactive}`
        );


        /*
         * ----------------------------------------------------
         * Request screenshot
         * ----------------------------------------------------
         */

        const requestPath =
        await screenshot.Screenshot(
            parentWindow,
            options
        );


        if (
            typeof requestPath !== 'string' ||
            requestPath.length === 0
        ) {

            throw new Error(
                `Portal Screenshot() returned an invalid request path: ${
                    String(requestPath)
                }`
            );
        }


        ipcRenderer.send(
            'electron-info',
            `[bg] Linux portal v2 request: ${requestPath}`
        );


        /*
         * ----------------------------------------------------
         * Obtain Request interface
         * ----------------------------------------------------
         */

        const requestObject =
        await bus.getProxyObject(
            BUS_NAME,
            requestPath
        );


        const request =
        requestObject.getInterface(
            REQUEST_INTERFACE
        );


        if (
            !request
        ) {

            throw new Error(
                `Could not obtain ${REQUEST_INTERFACE} interface for ${requestPath}`
            );
        }


        /*
         * ----------------------------------------------------
         * Wait for Response signal
         * ----------------------------------------------------
         */

        const response =
        await new Promise(
            (resolve, reject) => {

                let finished =
                false;


                const cleanup =
                () => {

                    clearTimeout(
                        timeout
                    );


                    try {

                        request.removeListener(
                            'Response',
                            onResponse
                        );

                    }
                    catch (err) {

                        /*
                         * Nothing to do.
                         */
                    }
                };


                const finish =
                (
                    callback,
                 value
                ) => {

                    if (
                        finished
                    ) {

                        return;
                    }


                    finished =
                    true;


                    cleanup();


                    callback(
                        value
                    );
                };


                const onResponse =
                (
                    responseCode,
                 results
                ) => {

                    finish(
                        resolve,
                        {
                            responseCode:
                            Number(
                                responseCode
                            ),

                            results:
                            results || {}
                        }
                    );
                };


                const timeout =
                setTimeout(
                    () => {

                        finish(
                            reject,
                            new Error(
                                'Timed out waiting for portal Screenshot.Response'
                            )
                        );

                    },
                    120000
                );


                request.on(
                    'Response',
                    onResponse
                );
            }
        );


        ipcRenderer.send(
            'electron-info',
            `[bg] Linux portal v2 response code: ${
                response.responseCode
            }`
        );


        /*
         * ----------------------------------------------------
         * Handle cancellation/errors
         * ----------------------------------------------------
         */

        if (
            response.responseCode !== 0
        ) {

            if (
                response.responseCode === 1
            ) {

                throw new Error(
                    'Portal screenshot request was cancelled by the user'
                );
            }


            throw new Error(
                `Portal screenshot request returned response code ${
                    response.responseCode
                }`
            );
        }


        /*
         * ----------------------------------------------------
         * Extract URI
         * ----------------------------------------------------
         */

        const results =
        response.results || {};


        let uri =
        this.#unwrapDBusValue(
            results.uri
        );


        if (
            !uri &&
            Object.prototype.hasOwnProperty.call(
                results,
                'uri'
            )
        ) {

            uri =
            this.#unwrapDBusValue(
                results.uri
            );
        }


        if (
            typeof uri !== 'string'
        ) {

            throw new Error(
                `Portal returned no screenshot URI: ${
                    JSON.stringify(results)
                }`
            );
        }


        ipcRenderer.send(
            'electron-info',
            `[bg] Linux portal v2 screenshot URI: ${uri}`
        );


        /*
         * ----------------------------------------------------
         * Convert URI -> filesystem path
         * ----------------------------------------------------
         */

        const sourcePath =
        this.#fileUriToPath(
            uri
        );


        ipcRenderer.send(
            'electron-info',
            `[bg] Linux portal v2 screenshot source: ${sourcePath}`
        );


        /*
         * ----------------------------------------------------
         * Ensure Eagle temp directory exists
         * ----------------------------------------------------
         */

        await fs.promises.mkdir(
            path.dirname(tempPath),
                                {
                                    recursive: true
                                }
        );


        /*
         * ----------------------------------------------------
         * Wait for screenshot file
         * ----------------------------------------------------
         */

        await this.#waitForFile(
            sourcePath,
            10000
        );


        /*
         * ----------------------------------------------------
         * Copy portal screenshot to Eagle temp directory
         * ----------------------------------------------------
         */

        await fs.promises.copyFile(
            sourcePath,
            tempPath
        );


        /*
         * ----------------------------------------------------
         * Validate final file
         * ----------------------------------------------------
         */

        const stat =
        await fs.promises.stat(
            tempPath
        );


        if (
            !stat.isFile() ||
            stat.size <= 0
        ) {

            throw new Error(
                `Portal screenshot copied an empty file: ${tempPath}`
            );
        }


        ipcRenderer.send(
            'electron-info',
            `[bg] Linux portal v2 screenshot complete: ` +
            `${tempPath} (${stat.size} bytes)`
        );


        return tempPath;

        }
        finally {

            try {

                bus.disconnect();

            }
            catch (err) {

                /*
                 * Nothing to do.
                 */
            }
        }
    }


    /*
     * ============================================================
     * XDG DESKTOP PORTAL - V3+
     * ============================================================
     *
     * Target-aware Screenshot() implementation.
     *
     * Called only when the requested target is advertised by
     * Screenshot.AvailableTargets.
     */

    async #captureLinuxPortal({
        target,
        tempPath,
        interactive
    }) {

        const dbus =
        require('dbus-next');


        const Variant =
        dbus.Variant;


        const bus =
        dbus.sessionBus();


        const BUS_NAME =
        'org.freedesktop.portal.Desktop';


        const OBJECT_PATH =
        '/org/freedesktop/portal/desktop';


        const SCREENSHOT_INTERFACE =
        'org.freedesktop.portal.Screenshot';


        const REQUEST_INTERFACE =
        'org.freedesktop.portal.Request';


        try {

            /*
             * ----------------------------------------------------
             * Get Screenshot interface
             * ----------------------------------------------------
             */

            const desktopObject =
            await bus.getProxyObject(
                BUS_NAME,
                OBJECT_PATH
            );


            const screenshot =
            desktopObject.getInterface(
                SCREENSHOT_INTERFACE
            );


            if (
                !screenshot
            ) {

                throw new Error(
                    `Could not obtain ${SCREENSHOT_INTERFACE} D-Bus interface`
                );
            }


            /*
             * ----------------------------------------------------
             * Generate valid request token
             * ----------------------------------------------------
             */

            const token =
            `eagle_${process.pid}_${Date.now()}`;


            /*
             * ----------------------------------------------------
             * Parent window
             * ----------------------------------------------------
             */

            const parentWindow =
            '';


        ipcRenderer.send(
            'electron-info',
            '[bg] Linux portal parent window: <none>'
        );


        /*
         * ----------------------------------------------------
         * Portal options
         * ----------------------------------------------------
         */

        const options = {

            handle_token:
            new Variant(
                's',
                token
            ),

            modal:
            new Variant(
                'b',
                false
            ),

            interactive:
            new Variant(
                'b',
                interactive
            ),

            target:
            new Variant(
                'u',
                Number(
                    target
                )
            )
        };


        ipcRenderer.send(
            'electron-info',
            `[bg] Linux portal Screenshot ` +
            `target=${target}, ` +
            `interactive=${interactive}`
        );


        /*
         * ----------------------------------------------------
         * Request screenshot
         * ----------------------------------------------------
         */

        const requestPath =
        await screenshot.Screenshot(
            parentWindow,
            options
        );


        if (
            typeof requestPath !== 'string' ||
            requestPath.length === 0
        ) {

            throw new Error(
                `Portal Screenshot() returned an invalid request path: ${
                    String(requestPath)
                }`
            );
        }


        ipcRenderer.send(
            'electron-info',
            `[bg] Linux portal request: ${requestPath}`
        );


        /*
         * ----------------------------------------------------
         * Obtain Request interface
         * ----------------------------------------------------
         */

        const requestObject =
        await bus.getProxyObject(
            BUS_NAME,
            requestPath
        );


        const request =
        requestObject.getInterface(
            REQUEST_INTERFACE
        );


        if (
            !request
        ) {

            throw new Error(
                `Could not obtain ${REQUEST_INTERFACE} interface for ${requestPath}`
            );
        }


        /*
         * ----------------------------------------------------
         * Wait for Response signal
         * ----------------------------------------------------
         */

        const response =
        await new Promise(
            (resolve, reject) => {

                let finished =
                false;


                const cleanup =
                () => {

                    clearTimeout(
                        timeout
                    );


                    try {

                        request.removeListener(
                            'Response',
                            onResponse
                        );

                    }
                    catch (err) {

                        /*
                         * Nothing to do.
                         */
                    }
                };


                const finish =
                (
                    callback,
                 value
                ) => {

                    if (
                        finished
                    ) {

                        return;
                    }


                    finished =
                    true;


                    cleanup();


                    callback(
                        value
                    );
                };


                const onResponse =
                (
                    responseCode,
                 results
                ) => {

                    finish(
                        resolve,
                        {
                            responseCode:
                            Number(
                                responseCode
                            ),

                            results:
                            results || {}
                        }
                    );
                };


                const timeout =
                setTimeout(
                    () => {

                        finish(
                            reject,
                            new Error(
                                'Timed out waiting for portal Screenshot.Response'
                            )
                        );

                    },
                    120000
                );


                request.on(
                    'Response',
                    onResponse
                );
            }
        );


        ipcRenderer.send(
            'electron-info',
            `[bg] Linux portal response code: ${
                response.responseCode
            }`
        );


        /*
         * ----------------------------------------------------
         * Handle cancellation/errors
         * ----------------------------------------------------
         */

        if (
            response.responseCode !== 0
        ) {

            if (
                response.responseCode === 1
            ) {

                throw new Error(
                    'Portal screenshot request was cancelled by the user'
                );
            }


            throw new Error(
                `Portal screenshot request returned response code ${
                    response.responseCode
                }`
            );
        }


        /*
         * ----------------------------------------------------
         * Extract URI
         * ----------------------------------------------------
         */

        const results =
        response.results || {};


        let uri =
        this.#unwrapDBusValue(
            results.uri
        );


        if (
            !uri &&
            Object.prototype.hasOwnProperty.call(
                results,
                'uri'
            )
        ) {

            uri =
            this.#unwrapDBusValue(
                results.uri
            );
        }


        if (
            typeof uri !== 'string'
        ) {

            throw new Error(
                `Portal returned no screenshot URI: ${
                    JSON.stringify(results)
                }`
            );
        }


        ipcRenderer.send(
            'electron-info',
            `[bg] Linux portal screenshot URI: ${uri}`
        );


        /*
         * ----------------------------------------------------
         * Convert URI -> filesystem path
         * ----------------------------------------------------
         */

        const sourcePath =
        this.#fileUriToPath(
            uri
        );


        ipcRenderer.send(
            'electron-info',
            `[bg] Linux portal screenshot source: ${sourcePath}`
        );


        /*
         * ----------------------------------------------------
         * Ensure Eagle temp directory exists
         * ----------------------------------------------------
         */

        await fs.promises.mkdir(
            path.dirname(tempPath),
                                {
                                    recursive: true
                                }
        );


        /*
         * ----------------------------------------------------
         * Wait for screenshot file
         * ----------------------------------------------------
         */

        await this.#waitForFile(
            sourcePath,
            10000
        );


        /*
         * ----------------------------------------------------
         * Copy portal screenshot to Eagle temp directory
         * ----------------------------------------------------
         */

        await fs.promises.copyFile(
            sourcePath,
            tempPath
        );


        /*
         * ----------------------------------------------------
         * Validate final file
         * ----------------------------------------------------
         */

        const stat =
        await fs.promises.stat(
            tempPath
        );


        if (
            !stat.isFile() ||
            stat.size <= 0
        ) {

            throw new Error(
                `Portal screenshot copied an empty file: ${tempPath}`
            );
        }


        ipcRenderer.send(
            'electron-info',
            `[bg] Linux portal screenshot complete: ` +
            `${tempPath} (${stat.size} bytes)`
        );


        return tempPath;

        }
        finally {

            try {

                bus.disconnect();

            }
            catch (err) {

                /*
                 * Nothing to do.
                 */
            }
        }
    }


    /*
     * ============================================================
     * DBUS VARIANT UNWRAPPER
     * ============================================================
     */

    #unwrapDBusValue(value) {

    if (
        value &&
        typeof value === 'object' &&
        Object.prototype.hasOwnProperty.call(
            value,
            'value'
        )
    ) {

        return value.value;
    }


    return value;
    }


    /*
     * ============================================================
     * FILE URI -> PATH
     * ============================================================
     */

    #fileUriToPath(uri) {

    const {
        fileURLToPath
    } = require('url');


    let url;


    try {

        url =
        new URL(uri);

    }
    catch (err) {

        throw new Error(
            `Invalid portal screenshot URI: ${uri}`
        );
    }


    if (
        url.protocol !== 'file:'
    ) {

        throw new Error(
            `Unsupported portal screenshot URI scheme: ${
                url.protocol
            }`
        );
    }


    return fileURLToPath(
        url
    );
    }


    /*
     * ============================================================
     * WAIT FOR FILE
     * ============================================================
     */

    async #waitForFile(
        filePath,
        timeoutMs
    ) {

        const start =
        Date.now();


        while (
            Date.now() - start <
            timeoutMs
        ) {

            try {

                const stat =
                await fs.promises.stat(
                    filePath
                );


                if (
                    stat.isFile() &&
                    stat.size > 0
                ) {

                    return;
                }

            }
            catch (err) {

                /*
                 * Portal hasn't materialized the file yet.
                 */
            }


            await new Promise(
                resolve =>
                setTimeout(
                    resolve,
                    50
                )
            );
        }


        throw new Error(
            `Timed out waiting for portal screenshot file: ${filePath}`
        );
    }


    /*
     * ============================================================
     * EAGLE ITEM CREATION
     * ============================================================
     */

    async createItem({
        tempPath,
        mode,
        item,
        isRetina,
        format,
            quality
    }) {

        if (!tempPath) {
            return;
        }


        if (!item) {
            item = {};
        }


        const usingRetina =
        preferences.screencapture.useRetina === 'true';


        const needResize =
        !usingRetina &&
        isRetina;


        const needFormatConvert =
        format !== 'png';


        /*
         * Convert/resize only once.
         */

        if (
            needResize ||
            needFormatConvert
        ) {

            const img =
            nativeImage.createFromPath(
                tempPath
            );


            if (
                img &&
                !img.isEmpty()
            ) {

                const w =
                img.getSize().width;


                const h =
                img.getSize().height;


                const maxSize =
                needResize
                ? Math.floor(
                    Math.min(
                        w,
                        h
                    ) / 2
                )
                : undefined;


                const outputFormat =
                format === 'png'
                    ? 'image/png'
                    : (
                        format === 'webp'
                            ? 'image/webp'
                            : 'image/jpeg'
                    );


                const outputQuality =
                quality || 0.9;


                const tmp =
                `${tempPath}.tmp`;


                await new Promise(
                    resolve => {

                        compressWithCanvas(
                            tempPath,
                            tmp,
                            outputFormat,
                            outputQuality,
                            maxSize,
                            err => {

                                try {

                                    if (
                                        fs.existsSync(
                                            tmp
                                        )
                                    ) {

                                        fse.removeSync(
                                            tempPath
                                        );


                                        fse.moveSync(
                                            tmp,
                                            tempPath,
                                            {
                                                overwrite: true
                                            }
                                        );
                                    }

                                }
                                catch (conversionError) {

                                    ipcRenderer.send(
                                        'electron-log',
                                        `[bg] screenshot conversion error: ${
                                            conversionError?.stack ||
                                            conversionError
                                        }`
                                    );
                                }


                                resolve();
                            }
                        );
                    }
                );
            }
        }


        const name =
        item.name ??
        (
            'Screenshot - ' +
            require('moment')().format(
                'YYYY-MM-DD HH.mm.ss'
            )
        );


        const url =
        item.website ?? '';


        let tags =
        item.tags ?? [];


        const annotation =
        item.annotation ?? '';


        const folders =
        item.folders ?? [];


        const star =
        item.star ?? false;


        /*
         * Automatic Screenshot tag.
         */

        if (
            preferences
            .screencapture
            .autoTagging
            .enable != 'false'
        ) {

            if (
                tags.length === 0
            ) {

                tags = [
                    'Screenshot'
                ];
            }
        }


        /*
         * Clipboard.
         */

        if (
            preferences
            .screencapture
            .autoWriteClipboard
            != 'false'
        ) {

            clipboard.writeImage(
                nativeImage.createFromPath(
                    tempPath
                )
            );
        }


        const result = {

            id:
            guid(),

            name:
            name,

            url:
            url,

            tags:
            tags,

            folders:
            folders || [],

            annotation:
            annotation || '',

            path:
            tempPath,

            modificationTime:
            Date.now()
        };


        if (
            star
        ) {

            result.star =
            star;
        }


        return result;
    }


    /*
     * ============================================================
     * ORIGINAL NON-LINUX FULLSCREEN
     * ============================================================
     */

    async #captureFullScreen({
        format,
            tempPath
    }) {

        return new Promise(
            async (
                resolve,
                reject
            ) => {

                try {

                    const desktopCapturer = {

                        getSources:
                        opts =>
                        ipcRenderer.invoke(
                            'DESKTOP_CAPTURER_GET_SOURCES',
                            opts
                        )
                    };


                    const thumbSize =
                    await this.#determineScreenShotSize();


                    const currentDisplay =
                    await ipcRenderer.invoke(
                        'screen.getCursorDisplay'
                    );


                    const options = {

                        types: [
                            'screen'
                        ],

                        thumbnailSize:
                        thumbSize
                    };


                    const sources =
                    await desktopCapturer.getSources(
                        options
                    );


                    let selectedSource =
                    null;


                    for (
                        const dataSource
                        of sources
                    ) {

                        const name =
                        dataSource.name
                        .toLowerCase();


                        if (
                            sources.length === 1 ||
                            name === 'entire screen' ||
                            name === '整个屏幕' ||
                            name === 'screen 1' ||
                            `${currentDisplay?.id}` ===
                            dataSource?.display_id
                        ) {

                            selectedSource =
                            dataSource;

                            break;
                        }
                    }


                    if (
                        !selectedSource
                    ) {

                        throw new Error(
                            'Could not find a screen source'
                        );
                    }


                    const buffer =
                    selectedSource
                    .thumbnail
                    .toPNG();


                    await fs.promises.writeFile(
                        tempPath,
                        buffer
                    );


                    this.#isScreenCapturing =
                    false;


                    resolve(
                        tempPath
                    );

                }
                catch (err) {

                    this.#isScreenCapturing =
                    false;


                    ipcRenderer.send(
                        'electron-log',
                        err?.stack || err
                    );


                    reject(
                        err
                    );
                }
            }
        );
    }


    async #determineScreenShotSize() {

        try {

            const currentDisplay =
            await ipcRenderer.invoke(
                'screen.getCursorDisplay'
            );


            const screenSize =
            currentDisplay.workAreaSize;


            const maxDimension =
            Math.max(
                screenSize.width,
                screenSize.height
            );


            return {

                width:
                parseInt(
                    maxDimension *
                    window.devicePixelRatio
                ),

                height:
                parseInt(
                    maxDimension *
                    window.devicePixelRatio
                )
            };

        }
        catch (err) {

            ipcRenderer.send(
                'electron-log',
                'function determineScreenShotSize error...'
            );


            ipcRenderer.send(
                'electron-log',
                err?.stack || err
            );


            throw err;
        }
    }


    /*
     * ============================================================
     * GENERIC SPECIFIC CAPTURE
     * ============================================================
     */

    async #captureSpecific({
        format,
            quality,
            mode,
            tempPath
    }) {

        if (
            process.platform === 'darwin'
        ) {

            await this.#captureSpecificMac({
                format,
                    quality,
                    mode,
                    tempPath
            });

        }
        else if (
            process.platform === 'linux'
        ) {

            await this.#captureLinux({
                mode,
                tempPath
            });

        }
        else {

            await this.#captureSpecificWindows({
                format,
                    quality,
                    mode,
                    tempPath
            });
        }
    }


    /*
     * ============================================================
     * MACOS
     * ============================================================
     */

    async #captureSpecificMac({
        format,
            mode,
            quality,
            tempPath
    }) {

        return new Promise(
            async (
                resolve,
                reject
            ) => {

                try {

                    const command =
                    mode === 1
                    ? `screencapture -x -i -o -t png '${tempPath}'`
                    : `screencapture -x -w -o -t png '${tempPath}'`;


                    require('child_process').exec(
                        command,
                        err => {

                            if (
                                err
                            ) {

                                ipcRenderer.send(
                                    'electron-log',
                                    `[bg] screencapture error: ${err}`
                                );


                                reject(
                                    err
                                );


                                return;
                            }


                            if (
                                !fs.existsSync(
                                    tempPath
                                )
                            ) {

                                reject(
                                    new Error(
                                        `ENOENT: no such file or directory, open '${tempPath}'`
                                    )
                                );


                                return;
                            }


                            resolve(
                                tempPath
                            );
                        }
                    );

                }
                catch (err) {

                    reject(
                        err
                    );
                }
            }
        );
    }


    /*
     * ============================================================
     * WINDOWS
     * ============================================================
     */

    async #captureSpecificWindows({
        format,
            mode,
            quality,
            tempPath
    }) {

        return new Promise(
            (
                resolve,
             reject
            ) => {

                const md5 =
                require('md5');


                const now =
                new Date();


                const year =
                now.getFullYear();


                const mouth =
                now.getMonth() + 1;


                const date =
                now.getDate();


                const key =
                `niuniu_app_eagle_${year}${mouth}${date}`;


                const md5Key =
                md5(
                    key
                );


                let iniPath;


                switch (
                    preferences.general.language
                ) {

                    case 'zh_CN':

                        iniPath =
                        path.normalize(
                            dllRoot +
                            '/capture-zh_CN.ini'
                        );

                        break;


                    case 'zh_TW':

                        iniPath =
                        path.normalize(
                            dllRoot +
                            '/capture-zh_TW.ini'
                        );

                        break;


                    default:

                        iniPath =
                        path.normalize(
                            dllRoot +
                            '/capture-en.ini'
                        );

                        break;
                }


                const screenShotExePath =
                path.normalize(
                    `${dllRoot}/NiuniuCapture.exe`
                );


                const screenShotParams = [

                    md5Key +
                    ',' +
                    path.normalize(
                        tempPath
                    ) +
                    ',0,0,0,0,0,0,' +
                    iniPath
                ];


                this.#isScreenCapturing =
                true;


                if (
                    !fs.existsSync(
                        screenShotExePath
                    )
                ) {

                    this.#isScreenCapturing =
                    false;


                    ipcRenderer.send(
                        'electron-log',
                        `[bg] NiuniuCapture.exe does not exist: ${screenShotExePath}`
                    );


                    ipcRenderer.send(
                        'show-swal',
                        {

                            title:
                            i18n.__(
                                'Dialog.NiunNiuMissing.title'
                            ),

                            button:
                            i18n.__(
                                'general.ok'
                            ),

                            description:
                            i18n.__(
                                'Dialog.NiunNiuMissing.desc'
                            )
                            .replace(
                                '{screenShotExePath}',
                                screenShotExePath
                            )
                        }
                    );


                    reject(
                        new Error(
                            `ENOENT: no such file or directory, open '${screenShotExePath}'`
                        )
                    );


                    return;
                }


                execFile(
                    screenShotExePath,
                    screenShotParams,
                    err => {

                        this.#isScreenCapturing =
                        false;


                        if (
                            err
                        ) {

                            reject(
                                err
                            );


                            return;
                        }


                        if (
                            !fs.existsSync(
                                tempPath
                            )
                        ) {

                            reject(
                                new Error(
                                    `ENOENT: no such file or directory, open '${tempPath}'`
                                )
                            );


                            return;
                        }


                        resolve(
                            tempPath
                        );
                    }
                );
            }
        );
    }
}


eagle.screenCapture =
new ScreenCapture();