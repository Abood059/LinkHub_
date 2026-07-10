// src/main/infrastructure/media/DownloadManager.js
'use strict';

const EventEmitter = require('events');
const { adjustProgressForCombinedDownload, moveDownloadedFile } = require('./YtdlpUtils');
const YtdlpResponseParser = require('./YtdlpResponseParser');

/**
 * فئة مسؤولة عن إدارة التحميلات الشاملة
 * تشمل: إدارة الحالة، معالجة التقدم، إعادة المحاولة، عمليات الملفات
 */
class DownloadManager extends EventEmitter {
    constructor({ logger = null } = {}) {
        super();
        this._logger = logger;
        this._activeDownloads = new Map(); // processId -> { resolve, reject, process, status, ... }
        this._responseParser = new YtdlpResponseParser();
    }

    /**
     * إنشاء إدخال تحميل جديد
     */
    createDownloadEntry(processId, data) {
        const entry = {
            resolve: data.resolve,
            reject: data.reject,
            process: null,
            status: 'starting',
            url: data.url,
            formatId: data.formatId,
            outputPath: data.outputPath,
            deviceId: data.deviceId,
            title: data.title,
            stderrBuffer: '',
            totalSize: data.totalSize,
            hasSizeInfo: data.hasSizeInfo,
            currentFileIndex: 0,
            downloadedBytes: 0,
            retryCount: 0,
            maxRetries: 3
        };
        
        this._activeDownloads.set(processId, entry);
        return entry;
    }

    /**
     * الحصول على إدخال التحميل
     */
    getDownloadEntry(processId) {
        return this._activeDownloads.get(processId);
    }

    /**
     * تحديث حالة التحميل
     */
    updateDownloadStatus(processId, status) {
        const entry = this._activeDownloads.get(processId);
        if (entry) {
            entry.status = status;
        }
    }

    /**
     * تحديث مرجع العملية
     */
    updateDownloadProcess(processId, process) {
        const entry = this._activeDownloads.get(processId);
        if (entry) {
            entry.process = process;
        }
    }

    /**
     * إزالة إدخال التحميل
     */
    removeDownloadEntry(processId) {
        this._activeDownloads.delete(processId);
    }

    /**
     * الحصول على حالة التحميل
     */
    getDownloadStatus(processId) {
        const entry = this._activeDownloads.get(processId);
        return entry ? entry.status : null;
    }

    /**
     * معالجة بيانات التقدم من البث
     */
    handleProgressData(chunk, streamType, processId, onProgress, formatId) {
        const entry = this._activeDownloads.get(processId);
        if (!entry) return;

        // تحويل المدخلات القادمة إلى نص
        const text = typeof chunk === 'string' ? chunk : chunk.toString();
        
        // تجميع أخطاء النظام فقط إذا كان البث قادماً من stderr
        if (streamType === 'stderr') {
            entry.stderrBuffer += text;
        }
        
        // معالجة السطر
        const progressData = this._responseParser.parseProgressLine(text);
        
        if (progressData) {
            let percent = progressData.percent;
            let size = progressData.size;
            
            // تعديل النسبة والحجم للتحميلات المركبة
            if (formatId.includes('+')) {
                const adjustedProgress = adjustProgressForCombinedDownload(
                    percent,
                    size,
                    entry,
                    progressData
                );
                percent = adjustedProgress.percent;
                size = adjustedProgress.size;
            }
            
            // 1. تحديث الواجهة عبر دالة التغذية الراجعة
            if (onProgress) {
                onProgress({ 
                    percent, 
                    raw: progressData.raw, 
                    speed: progressData.speed, 
                    size: size, 
                    eta: progressData.eta, 
                    elapsed: progressData.elapsed 
                });
            }
            
            // 2. بث الحدث للنظام
            const eventData = {
                downloadId: processId,
                percent: percent,
                speed: progressData.speed,
                size: size,
                eta: progressData.eta,
                elapsed: progressData.elapsed,
                deviceId: entry.deviceId,
                url: entry.url,
                title: entry.title,
                totalSize: entry.totalSize,
                downloadedBytes: entry.downloadedBytes
            };
            this.emit('downloadProgress', eventData);
        }
    }

    /**
     * التحقق مما إذا كان يجب إعادة المحاولة
     */
    shouldRetry(entry, exitCode) {
        if (exitCode === 0) return false;
        
        entry.retryCount = (entry.retryCount || 0) + 1;
        return entry.retryCount <= entry.maxRetries;
    }

    /**
     * معالجة إعادة المحاولة
     */
    handleRetry(entry, processId, url, formatId, options, startDownloadCallback, exitCode) {
        entry.status = 'retrying';
        entry.exitCode = exitCode;
        
        if (this._logger) {
            this._logger.warn(`Download failed (attempt ${entry.retryCount}/${entry.maxRetries}), retrying... Exit code: ${exitCode}`);
        }
        
        const retryData = {
            downloadId: processId,
            retryCount: entry.retryCount,
            maxRetries: entry.maxRetries,
            deviceId: entry.deviceId,
            url: entry.url,
            title: entry.title
        };
        this.emit('downloadRetrying', retryData);
        
        // إعادة تعيين الحالة
        entry.status = 'starting';
        entry.downloadedBytes = 0;
        entry.currentFileIndex = 0;
        entry.stderrBuffer = '';
        
        // إعادة بدء التحميل بعد تأخير بسيط
        setTimeout(async () => {
            try {
                await startDownloadCallback(url, formatId, options);
            } catch (retryErr) {
                if (this._logger) {
                    this._logger.error(`Retry attempt ${entry.retryCount} failed: ${retryErr.message}`);
                }
            }
        }, 2000);
    }

    /**
     * معالجة اكتمال التحميل بنجاح
     */
    async handleDownloadSuccess(processId, finalOutputPath, deviceId, url, title) {
        const entry = this._activeDownloads.get(processId);
        if (!entry) return;

        entry.status = 'completed';
        
        try {
            // استخراج المسار الفعلي للملف النهائي
            const actualOutputPath = finalOutputPath.replace('.%(ext)s', '');
            
            // البحث عن الملف المحمل الفعلي داخل المجلد المؤقت
            const fs = require('fs').promises;
            const path = require('path');
            const tempDir = path.dirname(actualOutputPath);
            const files = await fs.readdir(tempDir);
            const downloadedFile = files.find(f => f.startsWith(path.basename(actualOutputPath)));
            
            if (downloadedFile) {
                const tempFilePath = path.join(tempDir, downloadedFile);
                
                // نقل الملف إلى مجلد التنزيلات
                const { finalPath, tempPath } = await moveDownloadedFile(tempFilePath, title, deviceId);
                
                const completeData = {
                    downloadId: processId,
                    outputPath: finalPath,
                    tempPath: tempPath,
                    deviceId: deviceId,
                    url: url,
                    title: title
                };
                this.emit('downloadComplete', completeData);
                
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

    /**
     * معالجة فشل التحميل
     */
    handleDownloadFailure(processId, exitCode, deviceId, url, title) {
        const entry = this._activeDownloads.get(processId);
        if (!entry) return;

        entry.status = 'failed';
        entry.exitCode = exitCode;
        
        const stderrOutput = entry.stderrBuffer || '';
        if (this._logger) {
            this._logger.error(`yt-dlp failed after ${entry.maxRetries} retries. Exit code: ${exitCode}. stderr: ${stderrOutput}`);
        }
        
        const errorMsg = stderrOutput.includes('ERROR:') 
            ? stderrOutput.match(/ERROR:.*/)?.[0] || stderrOutput
            : stderrOutput || `Exit code ${exitCode}`;
            
        const errorData = {
            downloadId: processId,
            error: errorMsg,
            deviceId: deviceId,
            url: url,
            title: title
        };
        this.emit('downloadError', errorData);
        entry.reject(new Error(`Download failed after ${entry.maxRetries} retries: ${errorMsg}`));
    }

    /**
     * معالجة خطأ العملية
     */
    handleProcessError(processId, err, deviceId, url) {
        const entry = this._activeDownloads.get(processId);
        if (!entry) return;

        entry.status = 'failed';
        const errorData = {
            downloadId: processId,
            error: err.message,
            deviceId: deviceId,
            url: url
        };
        this.emit('downloadError', errorData);
        entry.reject(err);
    }
}

module.exports = DownloadManager;
