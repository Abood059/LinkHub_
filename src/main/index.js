'use strict';

const { app } = require('electron');
const ApplicationBootstrap = require('./bootstrap/ApplicationBootstrap');
const container = require('./bootstrap/container');

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
    app.quit();
}

let bootstrap = null;

// This method will be called when Electron has finished initialization and is ready to create browser windows.
app.whenReady().then(async () => {
    try {
        bootstrap = new ApplicationBootstrap();
        await bootstrap.run();
    } catch (error) {
        console.error('[Main] Fatal error during application startup:', error);
        app.quit();
    }
});

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// On macOS, re-create a window when the dock icon is clicked and no windows are open.
app.on('activate', () => {
    if (bootstrap && bootstrap.getWindowManager()) {
        const mainWindow = bootstrap.getWindowManager().getWindow('main');
        if (!mainWindow) {
            bootstrap.createMainWindow();
        } else {
            mainWindow.show();
        }
    }
});

// Graceful shutdown: terminate all managed processes before quitting.
app.on('before-quit', async (event) => {
    // Prevent default quit to allow async cleanup
    event.preventDefault();
    
    try {
        const processManager = container.resolve('processManager');
        if (processManager && processManager.terminateAll) {
            await processManager.terminateAll();
        }
        
        const dbManager = container.resolve('databaseManager');
        if (dbManager && dbManager.close) {
            await dbManager.close();
        }
        
        const errorService = container.resolve('errorCentralService');
        if (errorService && errorService.flush) {
            await errorService.flush();
        }
    } catch (err) {
        console.error('[Main] Error during graceful shutdown:', err);
    } finally {
        app.exit(0);
    }
});