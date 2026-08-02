// src/main/infrastructure/media/CompletionHandler.js
'use strict';

const { moveDownloadedFile, sanitizeFileName } = require('./YtdlpUtils');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

/**
 * فئة مسؤولة عن معالجة اكتمال التحميل بنجاح ونقل الملفات
 */
class CompletionHandler {
    constructor(pathService, logger = null, adbPushService = null) {
        this._pathService = pathService;
        this._logger = logger;
        this._adbPushService = adbPushService;
    }

    /**
     * معالجة اكتمال التحميل بنجاح
     */
    async handleDownloadSuccess(entry, processId, finalOutputPath, deviceId, url, title, actualFilename = null) {
        if (!entry) return;

        // اكتمال التحميل يُحدد بخروج العملية بنجاح (exit 0)
        entry.percent = 100;
        if (entry.totalSize && entry.downloadedBytes < entry.totalSize) {
            entry.downloadedBytes = entry.totalSize;
        }
        entry.completedAt = new Date().toISOString();

        try {
            let tempFilePath;

            // استخدام actualFilename من حدث ytDlpEvent أولاً
            if (actualFilename) {
                // التحقق من وجود الملف مع إعادة محاولة قصيرة
                let fileExists = false;
                for (let i = 0; i < 5; i++) {
                    try {
                        const fileStats = await fs.stat(actualFilename);
                        if (fileStats.isFile()) {
                            tempFilePath = actualFilename;
                            fileExists = true;
                            if (this._logger && typeof this._logger.info === 'function') {
                                this._logger.info(`Using actualFilename from ytDlpEvent: ${actualFilename}`);
                            }
                            break;
                        }
                    } catch (err) {
                        if (i < 4) {
                            await new Promise(resolve => setTimeout(resolve, 100));
                        }
                    }
                }

                if (!fileExists) {
                    if (this._logger && typeof this._logger.warn === 'function') {
                        this._logger.warn(`actualFilename not found after retries, falling back to search: ${actualFilename}`);
                    }
                    tempFilePath = await this._findFileBySearch(finalOutputPath, title);
                }
            } else {
                // استخدام منطق البحث التقليدي كـ fallback
                tempFilePath = await this._findFileBySearch(finalOutputPath, title);
            }

            if (!tempFilePath) {
                throw new Error(`No downloaded file found. yt-dlp exited with code 0 but failed to create the file.`);
            }

            // نقل الملف إلى مجلد التنزيلات النهائي (ديناميكي يعمل على جميع الأنظمة)
            const downloadsDir = path.join(os.homedir(), 'Downloads');
            const { finalPath, tempPath } = await moveDownloadedFile(tempFilePath, title, deviceId, downloadsDir);

            entry.status = 'completed';
            entry.outputPath = finalPath;

            // النقل التلقائي للجهاز إذا تم تحديده
            let transferResult = null;
            if (this._logger) {
                this._logger.info(`[CompletionHandler] Checking automatic transfer - deviceId: ${deviceId}, adbPushService: ${!!this._adbPushService}`);
            }
            if (deviceId && this._adbPushService) {
                try {
                    // التحقق من اتصال الجهاز قبل النقل
                    const adbExecutor = this._adbPushService._adbExecutor;
                    if (adbExecutor && typeof adbExecutor.isDeviceConnected === 'function') {
                        const isConnected = await adbExecutor.isDeviceConnected(deviceId);
                        if (isConnected) {
                            // نقل الملف من مجلد التنزيلات إلى الجهاز
                            transferResult = await this._adbPushService.pushFromDownloads(finalPath, deviceId);
                            
                            if (transferResult.success) {
                                if (this._logger) {
                                    this._logger.info(`File transferred successfully to device ${deviceId}`);
                                }
                            } else {
                                if (this._logger) {
                                    this._logger.warn(`File transfer to device ${deviceId} failed: ${transferResult.message}`);
                                }
                            }
                        } else {
                            if (this._logger) {
                                this._logger.warn(`Device ${deviceId} is not connected, skipping transfer`);
                            }
                            transferResult = { success: false, message: 'Device not connected' };
                        }
                    } else {
                        if (this._logger) {
                            this._logger.warn(`ADB executor not available, skipping transfer`);
                        }
                        transferResult = { success: false, message: 'ADB executor not available' };
                    }
                } catch (err) {
                    if (this._logger) {
                        this._logger.error(`Error during automatic transfer to device ${deviceId}: ${err.message}`);
                    }
                    transferResult = { success: false, message: err.message };
                }
            }

            if (entry.resolve) {
                entry.resolve({
                    success: true,
                    outputPath: finalPath,
                    tempPath: tempPath,
                    processId,
                    transferResult
                });
            }
        } catch (err) {
            if (this._logger && typeof this._logger.error === 'function') {
                this._logger.error(`Failed to move file: ${err.message}`);
            }
            entry.status = 'failed';
            if (entry.reject) {
                entry.reject(new Error(`Download completed but file transfer failed: ${err.message}`));
            }
        }
    }

    /**
     * البحث عن الملف المحمل باستخدام منطق البحث التقليدي
     */
    async _findFileBySearch(finalOutputPath, title) {
        try {
            // استخدام المسار الصحيح من PathService للملفات المؤقتة للتحميل
            const searchPath = this._pathService ? this._pathService.getDownloadsTempDir() : finalOutputPath;
            
            // التحقق مما إذا كان المسار مجلداً (الحالة الجديدة) أو ملفاً (الحالة القديمة)
            const stats = await fs.stat(searchPath);
            
            if (stats.isDirectory()) {
                // المسار هو مجلد - البحث عن الملف النهائي باستخدام عنوان الفيديو
                // yt-dlp يسمي الملف النهائي بناءً على عنوان الفيديو ويحذف الملفات المؤقتة تلقائياً
                const files = await fs.readdir(searchPath);
                
                if (this._logger && typeof this._logger.info === 'function') {
                    this._logger.info(`Searching in directory: ${searchPath}, found ${files.length} items`);
                }
                
                // التحقق من وجود أي ملفات
                if (files.length === 0) {
                    if (this._logger && typeof this._logger.error === 'function') {
                        this._logger.error(`Directory is empty: ${searchPath}`);
                    }
                    return null;
                }
                
                // تنظيف عنوان الفيديو لمطابقة اسم الملف الذي أنشأه yt-dlp
                const sanitizedTitle = sanitizeFileName(title);
                
                // إنشاء نسخة مبسطة من العنوان للمطابقة المرنة (fuzzy matching)
                // إزالة جميع الأحرف غير الأبجدية الرقمية للمقارنة
                const fuzzyTitle = title.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
                
                // البحث عن الملف الذي يبدأ بالعنوان المنظف
                let finalFile = null;
                
                for (const file of files) {
                    const filePath = path.join(searchPath, file);
                    const fileStats = await fs.stat(filePath);
                    
                    if (fileStats.isFile()) {
                        // التحقق مما إذا كان اسم الملف يبدأ بالعنوان المنظف
                        const fileNameWithoutExt = path.basename(file, path.extname(file));
                        // تطبيع اسم الملف الفعلي لاستبدال المسافات بـ underscores مثل sanitizeFileName
                        const normalizedFileName = fileNameWithoutExt.replace(/\s+/g, '_');
                        // إنشاء نسخة مبسطة من اسم الملف للمطابقة المرنة
                        const fuzzyFileName = fileNameWithoutExt.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
                        
                        // استخدام مطابقة جزئية للتعامل مع الأحرف الخاصة والاختلافات في التنسيق
                        if (normalizedFileName === sanitizedTitle || 
                            normalizedFileName.includes(sanitizedTitle) ||
                            sanitizedTitle.includes(normalizedFileName) ||
                            fuzzyFileName === fuzzyTitle ||
                            fuzzyFileName.includes(fuzzyTitle) ||
                            fuzzyTitle.includes(fuzzyFileName)) {
                            finalFile = filePath;
                            break;
                        }
                    }
                }
                
                // إذا لم يتم العثور على الملف في المجلد المحدد، ابحث في المجلد الأب
                // yt-dlp قد يضع الملف المدموج في المجلد الأب عند الدمج
                if (!finalFile) {
                    const parentDir = path.dirname(searchPath);
                    try {
                        const parentFiles = await fs.readdir(parentDir);
                        if (this._logger && typeof this._logger.info === 'function') {
                            this._logger.info(`Searching in parent directory: ${parentDir}, found ${parentFiles.length} items`);
                        }
                        for (const file of parentFiles) {
                            const filePath = path.join(parentDir, file);
                            const fileStats = await fs.stat(filePath);
                            
                            if (fileStats.isFile()) {
                                const fileNameWithoutExt = path.basename(file, path.extname(file));
                                // تطبيع اسم الملف الفعلي لاستبدال المسافات بـ underscores مثل sanitizeFileName
                                const normalizedFileName = fileNameWithoutExt.replace(/\s+/g, '_');
                                // إنشاء نسخة مبسطة من اسم الملف للمطابقة المرنة
                                const fuzzyFileName = fileNameWithoutExt.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
                                // استخدام مطابقة جزئية للتعامل مع الأحرف الخاصة والاختلافات في التنسيق
                                if (normalizedFileName === sanitizedTitle || 
                                    normalizedFileName.includes(sanitizedTitle) ||
                                    sanitizedTitle.includes(normalizedFileName) ||
                                    fuzzyFileName === fuzzyTitle ||
                                    fuzzyFileName.includes(fuzzyTitle) ||
                                    fuzzyTitle.includes(fuzzyFileName)) {
                                    finalFile = filePath;
                                    break;
                                }
                            }
                        }
                    } catch (err) {
                        if (this._logger && typeof this._logger.error === 'function') {
                            this._logger.error(`Error searching in parent directory: ${err.message}`);
                        }
                    }
                }
                
                if (!finalFile) {
                    if (this._logger && typeof this._logger.error === 'function') {
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
            if (this._logger && typeof this._logger.error === 'function') {
                this._logger.error(`Error in _findFileBySearch: ${err.message}`);
            }
            return null;
        }
    }
}

module.exports = CompletionHandler;
