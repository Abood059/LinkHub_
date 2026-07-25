// src/main/infrastructure/media/CompletionHandler.js
'use strict';

const { moveDownloadedFile, sanitizeFileName } = require('./YtdlpUtils');
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
                // المسار هو مجلد - البحث عن الملف النهائي باستخدام عنوان الفيديو
                // yt-dlp يسمي الملف النهائي بناءً على عنوان الفيديو ويحذف الملفات المؤقتة تلقائياً
                const files = await fs.readdir(finalOutputPath);
                
                // تنظيف عنوان الفيديو لمطابقة اسم الملف الذي أنشأه yt-dlp
                const sanitizedTitle = sanitizeFileName(title);
                
                // البحث عن الملف الذي يبدأ بالعنوان المنظف
                let finalFile = null;
                
                for (const file of files) {
                    const filePath = path.join(finalOutputPath, file);
                    const fileStats = await fs.stat(filePath);
                    
                    if (fileStats.isFile()) {
                        // التحقق مما إذا كان اسم الملف يبدأ بالعنوان المنظف
                        const fileNameWithoutExt = path.basename(file, path.extname(file));
                        if (fileNameWithoutExt === sanitizedTitle) {
                            finalFile = filePath;
                            break;
                        }
                    }
                }
                
                if (!finalFile) {
                    throw new Error(`No downloaded file found matching title: ${sanitizedTitle}`);
                }
                
                tempFilePath = finalFile;
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
