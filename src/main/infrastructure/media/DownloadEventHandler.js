// src/main/infrastructure/media/DownloadEventHandler.js
'use strict';

const { adjustProgressForCombinedDownload } = require('./YtdlpUtils');

/**
 * DownloadEventHandler
 * مسؤول عن معالجة أحداث التحميل من yt-dlp-wrap-plus
 */
class DownloadEventHandler {
    constructor(downloadManager, logger = null, windowManager = null) {
        this._downloadManager = downloadManager;
        this._logger = logger;
        this._windowManager = windowManager;
    }

    setWindowManager(windowManager) {
        this._windowManager = windowManager;
    }

    /**
     * معالجة حدث التقدم
     * @param {string} processId - معرف العملية
     * @param {Object} progress - بيانات التقدم من yt-dlp-wrap-plus
     * @param {Function} onProgress - دالة رد الاتصال للتقدم
     */
    handleProgress(processId, progress, onProgress) {
        const entry = this._downloadManager.getDownloadEntry(processId);
        if (!entry) return;

        // حساب التقدم المعدل للتحميلات المركبة (فيديو+صوت)
        const adjustedProgress = adjustProgressForCombinedDownload(
            progress.percent,
            progress.totalSize,
            entry,
            progress
        );

        entry.percent = adjustedProgress.percent;
        entry.speed = progress.currentSpeed;
        entry.size = adjustedProgress.size;
        entry.eta = progress.eta;

        if (onProgress) {
            onProgress({
                percent: adjustedProgress.percent,
                speed: progress.currentSpeed,
                size: adjustedProgress.size,
                eta: progress.eta
            });
        }
    }

    /**
     * معالجة اسم الملف من حدث ytDlpEvent
     * @param {string} processId - معرف العملية
     * @param {string} filename - اسم الملف
     */
    handleFilename(processId, filename) {
        const entry = this._downloadManager.getDownloadEntry(processId);
        if (!entry) return;

        entry.actualFilename = filename;
    }

    /**
     * معالجة حدث إغلاق العملية
     * @param {string} processId - معرف العملية
     * @param {string} outputPath - مسار المخرجات
     * @param {number} code - كود الخروج
     * @param {string} deviceId - معرف الجهاز
     * @param {string} url - رابط التحميل
     * @param {string} title - عنوان الفيديو
     * @param {Function} startDownloadCallback - دالة إعادة التحميل
     */
    async handleClose(processId, outputPath, code, deviceId, url, title, startDownloadCallback) {
        const entry = this._downloadManager.getDownloadEntry(processId);
        if (!entry) return;

        // التعامل مع الإيقاف اليدوي - لا ترسل خطأ
        if (entry.manuallyStopped) {
            this._downloadManager.updateDownloadStatus(processId, 'stopped');
            return;
        }

        if (code === 0) {
            const result = await this._downloadManager.handleDownloadSuccess(
                processId,
                outputPath,
                deviceId,
                url,
                title,
                entry.actualFilename
            );
            this._downloadManager.updateDownloadStatus(processId, 'completed');

            // إرسال حدث النقل التلقائي إذا تم النقل بنجاح
            if (result && result.transferResult) {
                this._sendTransferEvent(processId, deviceId, result.transferResult);
            }
        } else {
            // التحقق من إعادة المحاولة
            if (this._downloadManager.shouldRetry(entry, code)) {
                this._downloadManager.handleRetry(
                    entry,
                    processId,
                    url,
                    entry.formatId,
                    { outputPath, deviceId, title },
                    startDownloadCallback,
                    code
                );
                return;
            } else {
                this._downloadManager.handleDownloadFailure(
                    processId,
                    code,
                    deviceId,
                    url,
                    title
                );
                this._downloadManager.updateDownloadStatus(processId, 'failed');
            }
        }
    }

    /**
     * إرسال حدث النقل إلى الواجهة
     * @param {string} processId - معرف العملية
     * @param {string} deviceId - معرف الجهاز
     * @param {Object} transferResult - نتيجة النقل
     */
    _sendTransferEvent(processId, deviceId, transferResult) {
        if (!this._windowManager) {
            return;
        }

        try {
            const windows = this._windowManager.getAllWindows();
            if (windows && windows.length > 0) {
                const mainWindow = windows[0];
                if (transferResult.success) {
                    mainWindow.webContents.send('transfer:complete', {
                        downloadId: processId,
                        deviceId: deviceId,
                        message: transferResult.message
                    });
                } else {
                    mainWindow.webContents.send('transfer:error', {
                        downloadId: processId,
                        deviceId: deviceId,
                        error: transferResult.message
                    });
                }
            }
        } catch (err) {
            if (this._logger) {
                this._logger.error(`Failed to send transfer event: ${err.message}`);
            }
        }
    }

    /**
     * معالجة حدث الخطأ
     * @param {string} processId - معرف العملية
     * @param {Error} err - كائن الخطأ
     * @param {string} deviceId - معرف الجهاز
     * @param {string} url - رابط التحميل
     */
    handleError(processId, err, deviceId, url) {
        const entry = this._downloadManager.getDownloadEntry(processId);
        if (!entry) return;

        this._downloadManager.handleProcessError(
            processId,
            err,
            deviceId,
            url
        );
        this._downloadManager.removeDownloadEntry(processId);
    }
}

module.exports = DownloadEventHandler;
