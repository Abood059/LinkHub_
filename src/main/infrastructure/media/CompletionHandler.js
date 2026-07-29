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
    async handleDownloadSuccess(entry, processId, finalOutputPath, deviceId, url, title, actualFilename = null) {
        if (!entry) return;

        // اكتمال التحميل يُحدد بخروج العملية بنجاح (exit 0) + وجود الملف لاحقاً.
        // نسبة التقدم مقياس عرض من الخلفية وليست شرط إكمال.
        entry.status = 'completed';
        entry.percent = 100;
        if (entry.totalSize && entry.downloadedBytes < entry.totalSize) {
            entry.downloadedBytes = entry.totalSize;
        }
        entry.completedAt = new Date().toISOString();

        try {
            let tempFilePath;

            // إذا تم توفير اسم الملف الفعلي من yt-dlp (--print filename)، استخدمه مباشرة
            if (actualFilename) {
                // التحقق من وجود الملف
                try {
                    const fileStats = await fs.stat(actualFilename);
                    if (fileStats.isFile()) {
                        tempFilePath = actualFilename;
                        if (this._logger) {
                            this._logger.info(`Using actual filename from yt-dlp: ${actualFilename}`);
                        }
                    } else {
                        if (this._logger) {
                            this._logger.warn(`Actual filename exists but is not a file: ${actualFilename}`);
                        }
                        // السقوط إلى منطق البحث
                        tempFilePath = await this._findFileBySearch(finalOutputPath, title);
                    }
                } catch (err) {
                    if (this._logger) {
                        this._logger.warn(`Actual filename not found, falling back to search: ${actualFilename}`);
                    }
                    // السقوط إلى منطق البحث
                    tempFilePath = await this._findFileBySearch(finalOutputPath, title);
                }
            } else {
                // استخدام منطق البحث التقليدي
                tempFilePath = await this._findFileBySearch(finalOutputPath, title);
            }

            if (!tempFilePath) {
                throw new Error(`No downloaded file found. yt-dlp may have failed to create the file.`);
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

    /**
     * البحث عن الملف المحمل باستخدام منطق البحث التقليدي
     */
    async _findFileBySearch(finalOutputPath, title) {
        try {
            // التحقق مما إذا كان المسار مجلداً (الحالة الجديدة) أو ملفاً (الحالة القديمة)
            const stats = await fs.stat(finalOutputPath);
            
            if (stats.isDirectory()) {
                // المسار هو مجلد - البحث عن الملف النهائي باستخدام عنوان الفيديو
                // yt-dlp يسمي الملف النهائي بناءً على عنوان الفيديو ويحذف الملفات المؤقتة تلقائياً
                const files = await fs.readdir(finalOutputPath);
                
                if (this._logger) {
                    this._logger.info(`Searching in directory: ${finalOutputPath}, found ${files.length} items`);
                }
                
                // التحقق من وجود أي ملفات
                if (files.length === 0) {
                    if (this._logger) {
                        this._logger.error(`Directory is empty: ${finalOutputPath}`);
                    }
                    return null;
                }
                
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
                        // تطبيع اسم الملف الفعلي لاستبدال المسافات بـ underscores مثل sanitizeFileName
                        const normalizedFileName = fileNameWithoutExt.replace(/\s+/g, '_');
                        // استخدام مطابقة جزئية للتعامل مع الأحرف الخاصة والاختلافات في التنسيق
                        if (normalizedFileName === sanitizedTitle || 
                            normalizedFileName.includes(sanitizedTitle) ||
                            sanitizedTitle.includes(normalizedFileName)) {
                            finalFile = filePath;
                            break;
                        }
                    }
                }
                
                // إذا لم يتم العثور على الملف في المجلد المحدد، ابحث في المجلد الأب
                // yt-dlp قد يضع الملف المدموج في المجلد الأب عند الدمج
                if (!finalFile) {
                    const parentDir = path.dirname(finalOutputPath);
                    try {
                        const parentFiles = await fs.readdir(parentDir);
                        if (this._logger) {
                            this._logger.info(`Searching in parent directory: ${parentDir}, found ${parentFiles.length} items`);
                        }
                        for (const file of parentFiles) {
                            const filePath = path.join(parentDir, file);
                            const fileStats = await fs.stat(filePath);
                            
                            if (fileStats.isFile()) {
                                const fileNameWithoutExt = path.basename(file, path.extname(file));
                                // تطبيع اسم الملف الفعلي لاستبدال المسافات بـ underscores مثل sanitizeFileName
                                const normalizedFileName = fileNameWithoutExt.replace(/\s+/g, '_');
                                // استخدام مطابقة جزئية للتعامل مع الأحرف الخاصة والاختلافات في التنسيق
                                if (normalizedFileName === sanitizedTitle || 
                                    normalizedFileName.includes(sanitizedTitle) ||
                                    sanitizedTitle.includes(normalizedFileName)) {
                                    finalFile = filePath;
                                    break;
                                }
                            }
                        }
                    } catch (err) {
                        if (this._logger) {
                            this._logger.error(`Error searching in parent directory: ${err.message}`);
                        }
                    }
                }
                
                if (!finalFile) {
                    if (this._logger) {
                        this._logger.error(`No downloaded file found matching title: ${sanitizedTitle}`);
                    }
                    return null;
                }
                
                return finalFile;
            } else {
                // المسار هو ملف - استخدامه مباشرة (للتوافق مع الحالة القديمة)
                return finalOutputPath;
            }
        } catch (err) {
            if (this._logger) {
                this._logger.error(`Error in _findFileBySearch: ${err.message}`);
            }
            return null;
        }
    }
}

module.exports = CompletionHandler;
