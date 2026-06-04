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

        // 3. Initialize database (if needed)
        const dbManager = container.resolve('databaseManager');
        if (dbManager && typeof dbManager.initDb === 'function') {
            await dbManager.initDb();
            console.log('[Bootstrap] Database initialized.');
        }

        // 4. Retrieve core services for monitoring
        const connectionService = container.resolve('connectionService');
        const deviceRegistry = container.resolve('deviceRegistry'); // for reference, not used directly

        // 5. Start ADB monitoring and wireless discovery
        if (connectionService) {
            if (typeof connectionService.startAdbMonitoring === 'function') {
                connectionService.startAdbMonitoring(5000);
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