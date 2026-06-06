'use strict';

/**
 * DownloadOrchestrator
 * مسؤول عن تنسيق عمليات التحميل فقط
 * بدون إدارة عمليات أو تنفيذ تقني
 */
class DownloadOrchestrator {
    constructor({
        ytdlpAdapter,
        deviceRegistry = null,
        logger = null
    }) {
        this._ytdlpAdapter = ytdlpAdapter;
        this._deviceRegistry = deviceRegistry;
        this._logger = logger;
    }

    async inspectLink(url) {
        return this._ytdlpAdapter.inspectFormats(url);
    }

    async getMetadata(url) {
        return this._ytdlpAdapter.extractMetadata(url);
    }

    async startDownload(url, formatId, deviceId = null, options = {}) {
        if (!url || !formatId) {
            throw new Error('url and formatId are required');
        }

        // Merge deviceId into options for adapter
        const adapterOptions = { ...options, deviceId };
        return this._ytdlpAdapter.startDownload(url, formatId, adapterOptions);
    }

    stopDownload(fileId) {
        return this._ytdlpAdapter.stopDownload(fileId);
    }
}

module.exports = DownloadOrchestrator;