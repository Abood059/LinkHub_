// src/main/infrastructure/ipc/DownloadHandlers.js
'use strict';

/**
 * DownloadHandlers
 * 
 * Thin IPC layer for download-related operations.
 */
class DownloadHandlers {
    constructor(downloadOrchestrator) {
        if (!downloadOrchestrator) {
            throw new Error('DownloadOrchestrator is required for DownloadHandlers');
        }
        this._downloadOrchestrator = downloadOrchestrator;
    }

    register(ipcMain) {
        if (!ipcMain || typeof ipcMain.handle !== 'function') {
            throw new Error('Valid ipcMain instance required');
        }

        ipcMain.handle('download:inspect', async (event, url) => {
            if (!url) throw new Error('URL is required');
            return this._downloadOrchestrator.inspectLink(url);
        });

        ipcMain.handle('download:start', async (event, url, formatId, deviceId = null, options = {}) => {
            if (!url || !formatId) throw new Error('url and formatId are required');
            return this._downloadOrchestrator.startDownload(url, formatId, deviceId, options);
        });

        // التعديل الأساسي: نمرر URL وليس processId
        ipcMain.handle('download:stop', async (event, url) => {
            if (!url) throw new Error('URL is required');
            return this._downloadOrchestrator.stopDownload(url);
        });

        ipcMain.handle('download:metadata', async (event, url) => {
            if (!url) throw new Error('URL is required');
            return this._downloadOrchestrator.getMetadata(url);
        });
        
        // إضافة جديدة: الحصول على قائمة التحميلات النشطة (اختياري)
        ipcMain.handle('download:active', async () => {
            return this._downloadOrchestrator.getActiveDownloads();
        });
    }
}

module.exports = DownloadHandlers;