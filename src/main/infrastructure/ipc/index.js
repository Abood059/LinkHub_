'use strict';

const { ipcMain } = require('electron');
const DeviceHandlers = require('./DeviceHandlers');
const DownloadHandlers = require('./DownloadHandlers');

/**
 * Register all IPC handlers with Electron's ipcMain.
 * This function should be called once during application startup,
 * after creating DeviceOrchestrator and DownloadOrchestrator.
 * 
 * @param {Object} deviceOrchestrator - Instance of DeviceOrchestrator
 * @param {Object} downloadOrchestrator - Instance of DownloadOrchestrator
 * @param {Object} fileTransferService - Instance of FileTransferService (optional)
 */
function registerIpcHandlers(deviceOrchestrator, downloadOrchestrator, fileTransferService = null) {
    if (!deviceOrchestrator || !downloadOrchestrator) {
        throw new Error('Both DeviceOrchestrator and DownloadOrchestrator are required');
    }

    const deviceHandlers = new DeviceHandlers(deviceOrchestrator);
    const downloadHandlers = new DownloadHandlers(downloadOrchestrator, fileTransferService);

    deviceHandlers.register(ipcMain);
    downloadHandlers.register(ipcMain);
}

module.exports = {
    registerIpcHandlers,
    DeviceHandlers,
    DownloadHandlers
};