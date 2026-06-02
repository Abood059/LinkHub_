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

    startDownload(file, secondaryFile = null) {
        if (!file) {
            throw new Error('file is required');
        }

        return this._ytdlpAdapter.startDownload(file, secondaryFile);
    }

    stopDownload(fileId) {
        return this._ytdlpAdapter.stopDownload(fileId);
    }
}

module.exports = DownloadOrchestrator;