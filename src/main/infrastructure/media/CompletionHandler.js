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
            let tempFilePath;

            // التحقق مما إذا كان المسار مجلداً (الحالة الجديدة) أو ملفاً (الحالة القديمة)
            const stats = await fs.stat(finalOutputPath);
            
            if (stats.isDirectory()) {
                // المسار هو مجلد - البحث عن الملف المحمل داخله
                const files = await fs.readdir(finalOutputPath);
                
                // البحث عن ملف تم إنشاؤه مؤخراً (خلال آخر 60 ثانية)
                let newestFile = null;
                let newestMtime = 0;
                
                for (const file of files) {
                    const filePath = path.join(finalOutputPath, file);
                    const fileStats = await fs.stat(filePath);
                    
                    if (fileStats.isFile() && fileStats.mtimeMs > newestMtime) {
                        newestFile = filePath;
                        newestMtime = fileStats.mtimeMs;
                    }
                }
                
                if (!newestFile) {
                    throw new Error('No downloaded file found in temp directory');
                }
                
                tempFilePath = newestFile;
            } else {
                // المسار هو ملف - استخدامه مباشرة (للتوافق مع الحالة القديمة)
                tempFilePath = finalOutputPath;
            }

            // نقل الملف إلى مجلد التنزيلات
            const { finalPath, tempPath } = await moveDownloadedFile(tempFilePath, title, deviceId);

            entry.resolve({
                success: true,
                outputPath: finalPath,
                tempPath: tempPath,
                processId
            });
        } catch (err) {
            if (this._logger) {
                this._logger.error(`Failed to move file: ${err.message}`);
            }
            entry.reject(new Error(`Download completed but file transfer failed: ${err.message}`));
        }
    }
}

module.exports = CompletionHandler;
