'use strict';

/**
 * DownloadHandlers
 * 
 * Thin IPC layer for download-related operations.
 * Responsibilities ONLY:
 * - Register IPC channels with Electron's ipcMain
 * - Forward requests to DownloadOrchestrator
 * - Return results/errors
 * 
 * NO business logic, NO runtime state, NO process execution.
 */
class DownloadHandlers {
    constructor(downloadOrchestrator) {
        if (!downloadOrchestrator) {
            throw new Error('DownloadOrchestrator is required for DownloadHandlers');
        }
        this._downloadOrchestrator = downloadOrchestrator;
    }

    /**
     * Register all download IPC channels
     */
    register(ipcMain) {
        if (!ipcMain || typeof ipcMain.handle !== 'function') {
            throw new Error('Valid ipcMain instance required');
        }

        // Inspect a URL (get formats and metadata)
        ipcMain.handle('download:inspect', async (event, url) => {
            if (!url) {
                throw new Error('URL is required');
            }
            return this._downloadOrchestrator.inspectLink(url);
        });

        // Start downloading a specific format
        ipcMain.handle('download:start', async (event, url, formatId, deviceId = null, options = {}) => {
            if (!url || !formatId) {
                throw new Error('url and formatId are required');
            }
            return this._downloadOrchestrator.startDownload(url, formatId, deviceId, options);
        });

        // Stop an ongoing download by URL
        ipcMain.handle('download:stop', async (event, url) => {
            if (!url) {
                throw new Error('URL is required');
            }
            return this._downloadOrchestrator.stopDownload(url);
        });

        // Get metadata only (lightweight, no formats)
        ipcMain.handle('download:metadata', async (event, url) => {
            if (!url) {
                throw new Error('URL is required');
            }
            return this._downloadOrchestrator.getMetadata(url);
        });
    }
}

module.exports = DownloadHandlers;