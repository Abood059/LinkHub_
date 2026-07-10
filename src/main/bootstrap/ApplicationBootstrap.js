// src/main/bootstrap/ApplicationBootstrap.js
'use strict';

const path = require('path');
const container = require('./container');
const WindowManager = require('../infrastructure/windows/WindowManager');
const WindowRegistry = require('../infrastructure/windows/WindowRegistry');
const IpcBootstrap = require('./IpcBootstrap');

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
                if (errorService) {
                    errorService.warn('ADB binary not found. Please ensure resources/bin/win/adb.exe or LINKHUB_ADB_PATH is set.', {
                        source: 'ApplicationBootstrap'
                    });
                }
            }
            if (!toolsStatus.scrcpy) {
                if (errorService) {
                    errorService.warn('scrcpy binary not found. Please ensure resources/bin/win/scrcpy.exe or LINKHUB_SCRCPY_PATH is set.', {
                        source: 'ApplicationBootstrap'
                    });
                }
            }
            if (!toolsStatus.ytdlp) {
                if (errorService) {
                    errorService.warn('yt-dlp binary not found. Please ensure resources/bin/win/yt-dlp.exe or LINKHUB_YTDLP_PATH is set.', {
                        source: 'ApplicationBootstrap'
                    });
                }
            }
        }

        // 3. Initialize database (ensures directory and file exist)
        const dbManager = container.resolve('databaseManager');
        if (dbManager && typeof dbManager.initDb === 'function') {
            await dbManager.initDb();
            console.log('[Bootstrap] Database initialized.');
        }

        // 4. Initialize window management infrastructure
        this._windowRegistry = new WindowRegistry();
        this._windowManager = new WindowManager(this._windowRegistry);

        // 5. Pass windowManager to container for event broadcasting and StateSyncService initialization
        container.setWindowManager(this._windowManager);
        console.log('[Bootstrap] WindowManager set and StateSyncServices initialized.');

        // 6. Register IPC handlers
        try {
            IpcBootstrap.register(container);
            console.log('[Bootstrap] IPC handlers registered.');
        } catch (error) {
            // Error handled silently
        }

        // 7. Setup DeviceEventHandler and start monitoring (after StateSyncService is ready)
        const connectionService = container.resolve('connectionService');
        const deviceEventHandler = container.resolve('deviceEventHandler');
        if (deviceEventHandler && connectionService) {
            deviceEventHandler.setup(connectionService);
            console.log('[Bootstrap] DeviceEventHandler setup completed.');
        }

        // 8. Start ADB monitoring and wireless discovery (after StateSyncService is ready)
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

        // 9. Create main window
        await this.createMainWindow();

        console.log('[Bootstrap] Application ready.');
    }

    async createMainWindow() {
        const mainWindow = this._windowManager.createMainWindow({
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