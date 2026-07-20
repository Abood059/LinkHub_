// src/main/infrastructure/media/CompletionHandler.js
'use strict';

const { moveDownloadedFile } = require('./YtdlpUtils');
const fs = require('fs').promises;
const path = require('path');

/**
 * فئة مسؤولة عن معالجة اكتمال التحميل بنجاح ونقل الملفات
 */
class CompletionHandler {
    constructor(logger = null) {
        this._logger = logger;
    }

    /**
     * معالجة اكتمال التحميل بنجاح
     */
    async handleDownloadSuccess(entry, processId, finalOutputPath, deviceId, url, title) {
        if (!entry) return;

        entry.status = 'completed';
        entry.completedAt = new Date().toISOString();

        try {
            // استخراج المسار الفعلي للملف النهائي
            const actualOutputPath = finalOutputPath.replace('.%(ext)s', '');

            // البحث عن الملف المحمل الفعلي داخل المجلد المؤقت
            const tempDir = path.dirname(actualOutputPath);
            const files = await fs.readdir(tempDir);
            const downloadedFile = files.find(f => f.startsWith(path.basename(actualOutputPath)));

            if (downloadedFile) {
                const tempFilePath = path.join(tempDir, downloadedFile);

                // نقل الملف إلى مجلد التنزيلات
                const { finalPath, tempPath } = await moveDownloadedFile(tempFilePath, title, deviceId);

                entry.resolve({
                    success: true,
                    outputPath: finalPath,
                    tempPath: tempPath,
                    processId
                });
            } else {
                throw new Error('Downloaded file not found');
            }
        } catch (err) {
            if (this._logger) {
                this._logger.error(`Failed to move file: ${err.message}`);
            }
            entry.reject(new Error(`Download completed but file transfer failed: ${err.message}`));
        }
    }
}

module.exports = CompletionHandler;
