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
        fileTransferService = null,
        logger = null
    }) {
        this._ytdlpAdapter = ytdlpAdapter;
        this._deviceRegistry = deviceRegistry;
        this._fileTransferService = fileTransferService;
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

        // Merge deviceId and formatsData into options for adapter
        const adapterOptions = { ...options, deviceId, formatsData: options.formatsData };
        return this._ytdlpAdapter.startDownload(url, formatId, adapterOptions);
    }

    stopDownload(fileId) {
        return this._ytdlpAdapter.stopDownload(fileId);
    }

    async resumeDownload(processId, url, formatId, deviceId = null, options = {}) {
        if (!processId || !url || !formatId) {
            throw new Error('processId, url, and formatId are required');
        }
        // استئناف التحميل هو نفسه بدء تحميل جديد بنفس المعاملات
        // yt-dlp يدعم الاستئناف التلقائي
        return this._ytdlpAdapter.startDownload(url, formatId, { ...options, deviceId });
    }

    /**
     * معالجة اكتمال التحميل ونقل الملف للجهاز إذا لزم الأمر
     * @param {string} downloadId - معرف التحميل
     * @param {string} tempPath - المسار المؤقت للملف
     * @param {string} deviceId - معرف الجهاز (اختياري)
     */
    async handleDownloadComplete(downloadId, tempPath, deviceId = null) {
        if (!tempPath) {
            if (this._logger) {
                this._logger.warn(`No temp path provided for download ${downloadId}`);
            }
            return;
        }

        if (!deviceId || !this._fileTransferService) {
            // لا يوجد جهاز للنقل، الملف تم نقله بالفعل لمجلد التحميلات
            return;
        }

        try {
            // نقل الملف للجهاز
            const result = await this._fileTransferService.transferToDevice(tempPath, deviceId);
            
            if (result.success) {
                if (this._logger) {
                    this._logger.info(`File transferred successfully to device ${deviceId}`);
                }
                // إرسال إشعار للواجهة
                this._ytdlpAdapter.emit('transferComplete', {
                    downloadId,
                    deviceId,
                    message: result.message
                });
            } else {
                if (this._logger) {
                    this._logger.error(`Failed to transfer file to device: ${result.message}`);
                }
                // إرسال إشعار بالفشل
                this._ytdlpAdapter.emit('transferError', {
                    downloadId,
                    deviceId,
                    error: result.message
                });
            }
        } catch (err) {
            if (this._logger) {
                this._logger.error(`Error during file transfer: ${err.message}`);
            }
            this._ytdlpAdapter.emit('transferError', {
                downloadId,
                deviceId,
                error: err.message
            });
        }
    }
}

module.exports = DownloadOrchestrator;