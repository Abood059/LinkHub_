// src/main/bootstrap/ApplicationBootstrap.js
'use strict';

const path = require('path');
const container = require('./container');
const WindowManager = require('../infrastructure/windows/WindowManager');
const WindowRegistry = require('../infrastructure/windows/WindowRegistry');

class ApplicationBootstrap {
    constructor() {
        this._windowManager = null;
        this._windowRegistry = null;
    }

    async run() {
        console.log('[Bootstrap] Starting application...');

        // 1. Initialize dependency container
        container.initialize();
        console.log('[Bootstrap] Container initialized.');

        // 2. Initialize error central service (logger)
        const errorService = container.resolve('errorCentralService');
        if (errorService && typeof errorService.init === 'function') {
            errorService.init();
            console.log('[Bootstrap] ErrorCentralService initialized.');
        }

        // 2.5. Verify required tools (adb, scrcpy, yt-dlp)
        const toolPathResolver = container.resolve('toolPathResolver');
        if (toolPathResolver && typeof toolPathResolver.verifyAll === 'function') {
            const toolsStatus = toolPathResolver.verifyAll();
            console.log('[Bootstrap] Tool verification results:', toolsStatus);

            if (!toolsStatus.adb) {
                console.warn('[Bootstrap] Warning: ADB not found. Device discovery and pairing will not work.');
                if (errorService) {
                    errorService.warn('ADB binary not found. Please ensure resources/bin/win/adb.exe or LINKHUB_ADB_PATH is set.', {
                        source: 'ApplicationBootstrap'
                    });
                }
            }
            if (!toolsStatus.scrcpy) {
                console.warn('[Bootstrap] Warning: scrcpy not found. Screen mirroring will not work.');
                if (errorService) {
                    errorService.warn('scrcpy binary not found. Please ensure resources/bin/win/scrcpy.exe or LINKHUB_SCRCPY_PATH is set.', {
                        source: 'ApplicationBootstrap'
                    });
                }
            }
            if (!toolsStatus.ytdlp) {
                console.warn('[Bootstrap] Warning: yt-dlp not found. Downloading will not work.');
                if (errorService) {
                    errorService.warn('yt-dlp binary not found. Please ensure resources/bin/win/yt-dlp.exe or LINKHUB_YTDLP_PATH is set.', {
                        source: 'ApplicationBootstrap'
                    });
                }
            }
        } else {
            console.warn('[Bootstrap] ToolPathResolver not available, skipping tool verification.');
        }

        // 3. Initialize database (ensures directory and file exist)
        const dbManager = container.resolve('databaseManager');
        if (dbManager && typeof dbManager.initDb === 'function') {
            await dbManager.initDb();
            console.log('[Bootstrap] Database initialized.');
        } else {
            console.warn('[Bootstrap] DatabaseManager not available or missing initDb method.');
        }

        // 4. Retrieve core services for monitoring
        const connectionService = container.resolve('connectionService');
        const deviceRegistry = container.resolve('deviceRegistry'); // for reference, not used directly

        // 5. Start ADB monitoring and wireless discovery
        if (connectionService) {
            if (typeof connectionService.startAdbMonitoring === 'function') {
                connectionService.startAdbMonitoring(500);
                console.log('[Bootstrap] ADB monitoring started.');
            }
            if (typeof connectionService.startWirelessDiscovery === 'function') {
                connectionService.startWirelessDiscovery();
                console.log('[Bootstrap] Wireless discovery started.');
            }
        }

        // 6. Initialize window management infrastructure
        this._windowRegistry = new WindowRegistry();
        this._windowManager = new WindowManager(this._windowRegistry);

        // 6.5. Pass windowManager to container for event broadcasting
        container.setWindowManager(this._windowManager);

        // 7. Create main window
        await this.createMainWindow();

        console.log('[Bootstrap] Application ready.');
    }

    async createMainWindow() {
        const indexPath = path.join(__dirname, '../../renderer/index.html');
        const mainWindow = this._windowManager.createMainWindow({
            loadFile: indexPath,
            show: false
        });
        mainWindow.once('ready-to-show', () => {
            mainWindow.show();
            if (process.env.NODE_ENV === 'development') {
                mainWindow.webContents.openDevTools();
            }
        });
        return mainWindow;
    }

    getWindowManager() {
        return this._windowManager;
    }

    getWindowRegistry() {
        return this._windowRegistry;
    }
}

module.exports = ApplicationBootstrap;