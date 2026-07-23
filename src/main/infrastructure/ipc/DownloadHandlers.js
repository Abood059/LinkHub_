// src/main/infrastructure/ipc/DownloadHandlers.js
'use strict';

/**
 * DownloadHandlers
 * طبقة IPC للنقل الخالص (Transport Layer)
 * المبادئ:
 * - لا تحتوي على منطق أعمال أو بحث أو اتخاذ قرارات
 * - دورها الحصري: استقبال الطلبات من الواجهة → تحويلها إلى استدعاءات للخدمات → إعادة النتائج
 * - لا تبحث في قاعدة البيانات لمنطق بدء/استئناف التحميل
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
            console.log('[DownloadHandlers] === استقبال IPC: download:inspect ===');
            console.log('[DownloadHandlers] url:', url);
            const result = this._downloadOrchestrator.inspectLink(url);
            console.log('[DownloadHandlers] نتيجة inspectLink:', result);
            return result;
        });

        ipcMain.handle('download:start', async (event, url, formatId, deviceId = null, options = {}) => {
            console.log('[DownloadHandlers] === استقبال IPC: download:start ===');
            console.log('[DownloadHandlers] url:', url);
            console.log('[DownloadHandlers] formatId:', formatId);
            console.log('[DownloadHandlers] deviceId:', deviceId);
            console.log('[DownloadHandlers] options:', options);
            const result = this._downloadOrchestrator.startDownload(url, formatId, deviceId, options);
            console.log('[DownloadHandlers] نتيجة startDownload:', result);
            return result;
        });

        ipcMain.handle('download:stop', async (event, processId) => {
            console.log('[DownloadHandlers] === استقبال IPC: download:stop ===');
            console.log('[DownloadHandlers] processId:', processId);
            const result = this._downloadOrchestrator.stopDownload(processId);
            console.log('[DownloadHandlers] نتيجة stopDownload:', result);
            return result;
        });

        ipcMain.handle('download:resume', async (event, processId, url, formatId, deviceId = null, options = {}) => {
            console.log('[DownloadHandlers] === استقبال IPC: download:resume ===');
            console.log('[DownloadHandlers] processId:', processId);
            console.log('[DownloadHandlers] url:', url);
            console.log('[DownloadHandlers] formatId:', formatId);
            console.log('[DownloadHandlers] deviceId:', deviceId);
            console.log('[DownloadHandlers] options:', options);
            const result = this._downloadOrchestrator.resumeDownload(processId, url, formatId, deviceId, options);
            console.log('[DownloadHandlers] نتيجة resumeDownload:', result);
            return result;
        });

        ipcMain.handle('download:metadata', async (event, url) => {
            return this._downloadOrchestrator.getMetadata(url);
        });
        
        ipcMain.handle('download:active', async () => {
            return this._downloadOrchestrator.getActiveDownloads();
        });

        ipcMain.handle('download:transferToDevice', async (event, localPath, deviceId) => {
            return this._downloadOrchestrator.transferFileToDevice(localPath, deviceId);
        });

        ipcMain.handle('download:delete', async (event, downloadId) => {
            return this._downloadOrchestrator.deleteDownload(downloadId);
        });

        ipcMain.handle('download:deleteAll', async () => {
            return this._downloadOrchestrator.deleteAllDownloads();
        });

        ipcMain.handle('download:deleteBeforeDate', async (event, date) => {
            return this._downloadOrchestrator.deleteDownloadsBeforeDate(date);
        });

        ipcMain.handle('download:getHistory', async () => {
            return this._downloadOrchestrator.getDownloadHistory();
        });

        ipcMain.handle('download:findExisting', async (event, url, formatId) => {
            return this._downloadOrchestrator.findHistoricalDownload(url, formatId);
        });
    }
}

module.exports = DownloadHandlers;