// src/main/infrastructure/sync/DownloadSyncService.js
'use strict';

const path = require('path');
const fs = require('fs');

/**
 * DownloadSyncService
 *
 * خدمة مزامنة دورية مستقلة للتحميلات بين الذاكرة وقاعدة البيانات
 *
 * المبادئ:
 * - الذاكرة هي المصدر الوحيد للحقيقة: تقرأ من الذاكرة فقط، تكتب إلى قاعدة البيانات
 * - التحديث الدوري الموحد: كل 300ms لجميع التحميلات النشطة
 * - تتبع التغييرات (Dirty Tracking): تكتب فقط الحقول التي تغيرت
 * - إعادة المحاولة المحدودة: 5 محاولات مع تأخير تصاعدي عند فشل الكتابة
 * - الحذف التلقائي: التحميلات التي تختفي من الذاكرة تُحذف من قاعدة البيانات
 */
class DownloadSyncService {
    constructor(downloadManager, downloadRepository, logger) {
        if (!downloadManager) {
            throw new Error('downloadManager is required for DownloadSyncService');
        }
        if (!downloadRepository) {
            throw new Error('downloadRepository is required for DownloadSyncService');
        }

        this._downloadManager = downloadManager;
        this._downloadRepository = downloadRepository;
        this._logger = logger;

        // إعدادات الدورة الدورية
        this._interval = 300; // 300ms
        this._timer = null;
        this._isRunning = false;
        this._isSyncing = false; // لتتبع ما إذا كانت دورة المزامنة قيد التنفيذ

        // تتبع التغييرات (Dirty Tracking)
        // تخزن آخر قيمة معروفة لكل حقل لكل تحميل
        this._lastKnownValues = new Map(); // downloadId -> { percent, status, speed, downloadedBytes, eta, totalSize, retryCount }

        // لتتبع التحميلات التي كانت موجودة في الدورة السابقة
        this._previousDownloadIds = new Set();

        // إحصائيات الخدمة
        this._stats = {
            totalCycles: 0,
            successfulWrites: 0,
            failedWrites: 0,
            lastCycleTime: null
        };

        // مسار ملف سجل الأخطاء
        this._errorLogPath = path.join(process.cwd(), 'logs', 'sync-errors.log');
        this._ensureLogDirectory();
    }

    /**
     * بدء الخدمة الدورية
     */
    start() {
        if (this._isRunning) {
            console.warn('[DownloadSyncService] Service is already running');
            return;
        }

        this._isRunning = true;
        this._timer = setInterval(() => {
            this._syncCycle();
        }, this._interval);

        console.log('[DownloadSyncService] Service started with 300ms interval');
    }

    /**
     * إيقاف الخدمة الدورية
     */
    stop() {
        if (!this._isRunning) {
            return;
        }

        this._isRunning = false;
        if (this._timer) {
            clearInterval(this._timer);
            this._timer = null;
        }

        console.log('[DownloadSyncService] Service stopped');
    }

    /**
     * كتابة فورية لجميع البيانات مع مهلة
     * تُستدعى عند إغلاق التطبيق
     */
    async flush() {
        console.log('[DownloadSyncService] Flushing all data to database...');

        // 1. إيقاف المؤقت الدوري
        this.stop();

        // 2. انتظار انتهاء الدورة الحالية إذا كانت قيد التنفيذ
        if (this._isSyncing) {
            console.log('[DownloadSyncService] Waiting for current sync cycle to complete...');
            try {
                await this._waitForSyncComplete(2000); // مهلة 2 ثانية
            } catch (error) {
                console.warn('[DownloadSyncService] Timeout waiting for sync cycle:', error.message);
            }
        }

        // 3. كتابة جميع البيانات (تجاهل تتبع التغييرات)
        try {
            await this._flushAllDataWithRetry(3000); // مهلة 3 ثوانٍ
            console.log('[DownloadSyncService] Flush completed successfully');
            return true;
        } catch (error) {
            this._logError('Flush failed', error);
            console.error('[DownloadSyncService] Flush failed:', error);
            return false;
        }
    }

    /**
     * الحصول على حالة الخدمة
     */
    getStatus() {
        return {
            isRunning: this._isRunning,
            isSyncing: this._isSyncing,
            interval: this._interval,
            stats: { ...this._stats },
            trackedDownloads: this._lastKnownValues.size
        };
    }

    // ============================================================================
    // Internal methods
    // ============================================================================

    /**
     * الدورة الدورية للمزامنة
     */
    async _syncCycle() {
        if (this._isSyncing) {
            // إذا كانت الدورة السابقة لم تكتمل، تخطي هذه الدورة
            return;
        }

        this._isSyncing = true;
        const cycleStartTime = Date.now();

        try {
            // قراءة التحميلات النشطة من الذاكرة
            const activeDownloads = this._downloadManager.getActiveDownloads();
            const currentDownloadIds = new Set(activeDownloads.keys());
            console.log(`[DownloadSyncService] 🔁 SYNC CYCLE START - Active downloads: ${activeDownloads.size}, IDs: [${Array.from(currentDownloadIds).join(', ')}]`);

            // معالجة التحميلات المحذوفة
            await this._handleDeletedDownloads(currentDownloadIds);

            // معالجة التحميلات الموجودة
            await this._processActiveDownloads(activeDownloads);
            console.log(`[DownloadSyncService] ✅ SYNC CYCLE COMPLETED - Duration: ${Date.now() - cycleStartTime}ms`);

            // تحديث قائمة المعرفات السابقة
            this._previousDownloadIds = currentDownloadIds;

            // تحديث الإحصائيات
            this._stats.totalCycles++;
            this._stats.lastCycleTime = Date.now() - cycleStartTime;

        } catch (error) {
            this._stats.failedWrites++;
            this._logError('Sync cycle failed', error);
            console.error('[DownloadSyncService] Sync cycle failed:', error);
        } finally {
            this._isSyncing = false;
        }
    }

    /**
     * معالجة التحميلات المحذوفة من الذاكرة
     */
    async _handleDeletedDownloads(currentDownloadIds) {
        const deletedIds = [];

        // البحث عن المعرفات التي كانت موجودة سابقاً وليست موجودة الآن
        for (const downloadId of this._previousDownloadIds) {
            if (!currentDownloadIds.has(downloadId)) {
                deletedIds.push(downloadId);
            }
        }

        if (deletedIds.length > 0) {
            console.log(`[DownloadSyncService] 🗑️  DELETED DOWNLOADS DETECTED - IDs: [${deletedIds.join(', ')}]`);
        }

        // حذف التحميلات المحذوفة من قاعدة البيانات
        for (const downloadId of deletedIds) {
            try {
                console.log(`[DownloadSyncService] 🗑️  DELETING from database: ${downloadId}`);
                this._downloadRepository.deleteDownload(downloadId);
                this._lastKnownValues.delete(downloadId);
                console.log(`[DownloadSyncService] ✅ Successfully deleted from database: ${downloadId}`);
            } catch (error) {
                this._logError(`Failed to delete download ${downloadId}`, error);
                console.error(`[DownloadSyncService] ❌ Failed to delete download ${downloadId}:`, error);
            }
        }
    }

    /**
     * معالجة التحميلات النشطة
     */
    async _processActiveDownloads(activeDownloads) {
        console.log(`[DownloadSyncService] 📊 PROCESSING ${activeDownloads.size} active downloads`);
        for (const [downloadId, entry] of activeDownloads.entries()) {
            try {
                console.log(`[DownloadSyncService] 🔍 Processing download ${downloadId} - Status: ${entry.status}, Progress: ${entry.percent}%`);
                // كشف التغييرات
                const changes = this._detectChanges(downloadId, entry);

                if (Object.keys(changes).length > 0) {
                    console.log(`[DownloadSyncService] 📝 CHANGES DETECTED for ${downloadId}:`, JSON.stringify(changes, null, 2));
                    // كتابة التغييرات إلى قاعدة البيانات
                    await this._writeChangesWithRetry(downloadId, changes);
                    
                    // تحديث القيم المخزنة
                    this._updateLastKnownValues(downloadId, entry);
                } else {
                    console.log(`[DownloadSyncService] ⏭️  No changes for ${downloadId}, skipping write`);
                }
            } catch (error) {
                this._logError(`Failed to process download ${downloadId}`, error);
                console.error(`[DownloadSyncService] ❌ Failed to process download ${downloadId}:`, error);
            }
        }
    }

    /**
     * كشف التغييرات بين القيمة الحالية والقيمة المخزنة
     */
    _detectChanges(downloadId, entry) {
        const lastKnown = this._lastKnownValues.get(downloadId) || {};
        const changes = {};

        // الحقول المراقبة للتغييرات
        const fieldsToTrack = [
            'percent', 'status', 'speed', 'downloadedBytes', 
            'eta', 'totalSize', 'retryCount', 'completedAt', 'failedAt'
        ];

        console.log(`[DownloadSyncService] 🔬 DETECTING CHANGES for ${downloadId} - Last known:`, JSON.stringify(lastKnown, null, 2));
        console.log(`[DownloadSyncService] 🔬 DETECTING CHANGES for ${downloadId} - Current:`, JSON.stringify({
            percent: entry.percent,
            status: entry.status,
            speed: entry.speed,
            downloadedBytes: entry.downloadedBytes,
            eta: entry.eta,
            totalSize: entry.totalSize,
            retryCount: entry.retryCount,
            completedAt: entry.completedAt,
            failedAt: entry.failedAt
        }, null, 2));

        for (const field of fieldsToTrack) {
            const currentValue = entry[field];
            const lastValue = lastKnown[field];

            // إذا كانت القيمة غير موجودة سابقاً أو تغيرت
            if (lastValue === undefined || currentValue !== lastValue) {
                changes[field] = currentValue;
                console.log(`[DownloadSyncService] 📌 FIELD CHANGED: ${field} - Old: ${lastValue}, New: ${currentValue}`);
            }
        }

        return changes;
    }

    /**
     * تحديث القيم المخزنة
     */
    _updateLastKnownValues(downloadId, entry) {
        this._lastKnownValues.set(downloadId, {
            percent: entry.percent,
            status: entry.status,
            speed: entry.speed,
            downloadedBytes: entry.downloadedBytes,
            eta: entry.eta,
            totalSize: entry.totalSize,
            retryCount: entry.retryCount,
            completedAt: entry.completedAt,
            failedAt: entry.failedAt
        });
    }

    /**
     * تحويل أسماء الحقول من camelCase إلى snake_case لقاعدة البيانات
     */
    _mapToDatabaseColumns(data) {
        const columnMapping = {
            downloadedBytes: 'downloaded_bytes',
            totalSize: 'total_size',
            retryCount: 'retry_count',
            completedAt: 'completed_at',
            failedAt: 'failed_at',
            formatId: 'format_id',
            deviceId: 'device_id',
            outputPath: 'output_path',
            maxRetries: 'max_retries',
            hasSizeInfo: 'has_size_info',
            currentFileIndex: 'current_file_index',
            manuallyStopped: 'manually_stopped',
            retryDelays: 'retry_delays',
            errorMessage: 'error_message',
            exitCode: 'exit_code',
            startedAt: 'started_at'
        };

        const mappedData = {};
        for (const [key, value] of Object.entries(data)) {
            const dbKey = columnMapping[key] || key;
            mappedData[dbKey] = value;
        }
        return mappedData;
    }

    /**
     * تحضير البيانات الكاملة للإدراج من entry في الذاكرة
     * @param {string} downloadId - Download ID
     * @param {Object} entry - Download entry from memory
     * @param {Object} changes - Detected changes (optional, for partial updates)
     * @returns {Object} Complete data ready for database upsert
     */
    _prepareDownloadData(downloadId, entry, changes = null) {
        // If changes provided, use them for partial update
        // Otherwise, prepare complete data for insert
        if (changes) {
            return this._mapToDatabaseColumns(changes);
        }

        // Prepare complete data for insert
        const completeData = {
            id: downloadId,
            url: entry.url,
            format_id: entry.formatId,
            output_path: entry.outputPath,
            device_id: entry.deviceId,
            title: entry.title,
            status: entry.status,
            percent: entry.percent || 0,
            speed: entry.speed || null,
            downloaded_bytes: entry.downloadedBytes || 0,
            eta: entry.eta || null,
            total_size: entry.totalSize || 0,
            retry_count: entry.retryCount || 0,
            max_retries: entry.maxRetries || 3,
            completed_at: entry.completedAt || null,
            failed_at: entry.failedAt || null,
            error_message: null,
            exit_code: null
        };

        return this._mapToDatabaseColumns(completeData);
    }

    /**
     * كتابة التغييرات مع سياسة إعادة المحاولة
     */
    async _writeChangesWithRetry(downloadId, changes) {
        const maxRetries = 5;
        const delays = [100, 200, 400, 800, 1600]; // تأخير تصاعدي

        console.log(`[DownloadSyncService] 💾 WRITING to DATABASE - Download: ${downloadId}, Changes:`, JSON.stringify(changes, null, 2));

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                // إعادة قراءة البيانات من الذاكرة لضمان كتابة أحدث البيانات
                const entry = this._downloadManager.getDownloadEntry(downloadId);
                if (!entry) {
                    console.warn(`[DownloadSyncService] ⚠️  Download ${downloadId} no longer exists in memory, skipping write`);
                    return;
                }

                // تحديث كائن التغييرات بأحدث البيانات
                const latestChanges = this._detectChanges(downloadId, entry);

                if (Object.keys(latestChanges).length === 0) {
                    // لا توجد تغييرات، لا داعي للكتابة
                    console.log(`[DownloadSyncService] ⏭️  No latest changes for ${downloadId}, skipping write`);
                    return;
                }

                // كتابة إلى قاعدة البيانات باستخدام Upsert
                // التحقق مما إذا كان التحميل جديداً
                const isNew = !this._lastKnownValues.has(downloadId);
                const dbData = isNew 
                    ? this._prepareDownloadData(downloadId, entry, null) // بيانات كاملة للتحميل الجديد
                    : this._prepareDownloadData(downloadId, entry, latestChanges); // تغييرات فقط للتحميل الموجود
                
                console.log(`[DownloadSyncService] 💾 EXECUTING DB UPSERT - Download: ${downloadId}, Is New: ${isNew}, DB Data:`, JSON.stringify(dbData, null, 2));
                this._downloadRepository.upsertDownload(downloadId, dbData);
                console.log(`[DownloadSyncService] ✅ SUCCESSFULLY WRITTEN to DATABASE - Download: ${downloadId}`);
                
                // قراءة وطباعة جميع البيانات من قاعدة البيانات للتحقق
                const allDownloads = this._downloadRepository.findAllDownloads();
                console.log(`[DownloadSyncService] 📋 ALL DOWNLOADS IN DATABASE (${allDownloads.length} total):`, JSON.stringify(allDownloads, null, 2));
                
                this._stats.successfulWrites++;
                return; // نجاح

            } catch (error) {
                if (attempt < maxRetries - 1) {
                    // انتظر قبل إعادة المحاولة
                    await this._delay(delays[attempt]);
                    console.warn(`[DownloadSyncService] ⚠️  Retry ${attempt + 1}/${maxRetries} for download ${downloadId} - Error: ${error.message}`);
                } else {
                    // فشلت جميع المحاولات
                    this._stats.failedWrites++;
                    this._logError(`Failed to write download ${downloadId} after ${maxRetries} attempts`, error);
                    console.error(`[DownloadSyncService] ❌ FAILED to write after ${maxRetries} attempts - Download: ${downloadId}, Error:`, error);
                    throw error;
                }
            }
        }
    }

    /**
     * كتابة جميع البيانات (تجاهل تتبع التغييرات) مع إعادة المحاولة
     */
    async _flushAllDataWithRetry(timeout) {
        const startTime = Date.now();
        const maxRetries = 5;
        const delays = [100, 200, 400, 800, 1600];

        const activeDownloads = this._downloadManager.getActiveDownloads();
        console.log(`[DownloadSyncService] 🚨 FLUSH ALL DATA - Total downloads to flush: ${activeDownloads.size}, Timeout: ${timeout}ms`);

        for (const [downloadId, entry] of activeDownloads.entries()) {
            // التحقق من المهلة
            if (Date.now() - startTime > timeout) {
                throw new Error('Flush timeout exceeded');
            }

            console.log(`[DownloadSyncService] 🚨 FLUSHING download ${downloadId} - Status: ${entry.status}, Progress: ${entry.percent}%`);

            for (let attempt = 0; attempt < maxRetries; attempt++) {
                try {
                    // كتابة جميع الحقول
                    const allData = {
                        percent: entry.percent,
                        status: entry.status,
                        speed: entry.speed,
                        downloadedBytes: entry.downloadedBytes,
                        eta: entry.eta,
                        totalSize: entry.totalSize,
                        retryCount: entry.retryCount,
                        completedAt: entry.completedAt,
                        failedAt: entry.failedAt
                    };

                    console.log(`[DownloadSyncService] 🚨 FLUSH DATA for ${downloadId}:`, JSON.stringify(allData, null, 2));

                    // Prepare complete data for upsert
                    const dbData = this._prepareDownloadData(downloadId, entry);
                    console.log(`[DownloadSyncService] 🚨 EXECUTING FLUSH DB UPSERT - Download: ${downloadId}, DB Data:`, JSON.stringify(dbData, null, 2));
                    this._downloadRepository.upsertDownload(downloadId, dbData);
                    console.log(`[DownloadSyncService] ✅ FLUSH SUCCESS for download ${downloadId}`);
                    
                    // قراءة وطباعة جميع البيانات من قاعدة البيانات للتحقق
                    const allDownloads = this._downloadRepository.findAllDownloads();
                    console.log(`[DownloadSyncService] 📋 ALL DOWNLOADS IN DATABASE AFTER FLUSH (${allDownloads.length} total):`, JSON.stringify(allDownloads, null, 2));
                    
                    this._stats.successfulWrites++;
                    break; // نجاح

                } catch (error) {
                    if (attempt < maxRetries - 1) {
                        await this._delay(delays[attempt]);
                        console.warn(`[DownloadSyncService] ⚠️  Flush retry ${attempt + 1}/${maxRetries} for download ${downloadId}`);
                    } else {
                        this._stats.failedWrites++;
                        this._logError(`Failed to flush download ${downloadId}`, error);
                        console.error(`[DownloadSyncService] ❌ FLUSH FAILED for download ${downloadId}:`, error);
                        // نستمر مع التحميلات التالية بدلاً من إلقاء خطأ
                    }
                }
            }
        }
        console.log(`[DownloadSyncService] 🚨 FLUSH ALL DATA COMPLETED - Total time: ${Date.now() - startTime}ms`);
    }

    /**
     * انتظار انتهاء دورة المزامنة الحالية
     */
    async _waitForSyncComplete(timeout) {
        const startTime = Date.now();
        while (this._isSyncing) {
            if (Date.now() - startTime > timeout) {
                throw new Error('Timeout waiting for sync cycle to complete');
            }
            await this._delay(50); // فحص كل 50ms
        }
    }

    /**
     * تأخير بسيط
     */
    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * تسجيل خطأ في ملف sync-errors.log
     */
    _logError(message, error) {
        try {
            const timestamp = new Date().toISOString();
            const logEntry = `[${timestamp}] ${message}: ${error.message}\n${error.stack}\n\n`;
            fs.appendFileSync(this._errorLogPath, logEntry);
        } catch (logError) {
            console.error('[DownloadSyncService] Failed to write to error log:', logError);
        }
    }

    /**
     * التأكد من وجود مجلد logs
     */
    _ensureLogDirectory() {
        try {
            const logDir = path.dirname(this._errorLogPath);
            if (!fs.existsSync(logDir)) {
                fs.mkdirSync(logDir, { recursive: true });
            }
        } catch (error) {
            console.error('[DownloadSyncService] Failed to create log directory:', error);
        }
    }
}

module.exports = DownloadSyncService;
