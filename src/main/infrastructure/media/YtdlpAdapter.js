// src/main/infrastructure/media/YtdlpAdapter.js
'use strict';

const EventEmitter = require('events');

const YTDlpWrap = require('yt-dlp-wrap-plus').default;
const DownloadManager = require('./DownloadManager');
const NetworkChecker = require('./NetworkChecker');
const MetadataExtractor = require('./MetadataExtractor');
const DownloadEventHandler = require('./DownloadEventHandler');
const ProcessManager = require('./ProcessManager');
const { createTempDirectory, calculateTotalSize } = require('./YtdlpUtils');

/**
 * YtdlpAdapter
 * مسؤول عن تنسيق عمليات التحميل باستخدام yt-dlp-wrap-plus
 * المبادئ:
 * - ينسق بين المكونات المختلفة (NetworkChecker, MetadataExtractor, ProcessManager, DownloadEventHandler)
 * - يدير دورة حياة التحميل الكاملة
 * - يستخدم DownloadManager لإدارة الحالة في الذاكرة
 * - لا يصل إلى قاعدة البيانات مباشرة
 */
class YtdlpAdapter extends EventEmitter {
    constructor({
        processSupervisor,
        ytdlpPath = null,
        toolPathResolver = null,
        logger = null,
        pathService = null,
        adbPushService = null
    }) {
        super();
        this._logger = logger;
        this._pathService = pathService;
        this._windowManager = null;

        // Initialize yt-dlp-wrap-plus
        this._ytDlpWrap = new YTDlpWrap(ytdlpPath || 'yt-dlp');

        // Initialize helper modules
        this._downloadManager = new DownloadManager({ logger, pathService, adbPushService });
        this._networkChecker = new NetworkChecker(logger);
        this._metadataExtractor = new MetadataExtractor(this._ytDlpWrap, this._networkChecker, logger);
        this._processManager = new ProcessManager(processSupervisor, toolPathResolver, logger);
        this._eventHandler = new DownloadEventHandler(this._downloadManager, logger, null);

        // ملاحظة: تم إزالة forward events من DownloadManager
        // DownloadStateSyncService هو المصدر الوحيد للحقيقة لمزامنة الحالة
        // جميع الأحداث تُرسل دورياً عبر DownloadStateSyncService كل 300ms
    }

    setWindowManager(windowManager) {
        this._windowManager = windowManager;
        this._eventHandler.setWindowManager(windowManager);
    }

    /**
     * التحقق من الاتصال بالإنترنت
     * @param {number} timeout - مهلة التحقق بالميلي ثانية (الافتراضي 5000)
     * @returns {Promise<boolean>} true إذا كان هناك اتصال، false إذا لم يكن
     */
    async checkInternetConnection(timeout = 5000) {
        return this._networkChecker.checkInternetConnection(timeout);
    }

    /**
     * فحص التنسيقات المتاحة للفيديو
     * @param {string} url - رابط الفيديو
     * @returns {Promise<Object>} معلومات التنسيقات
     */
    async inspectFormats(url) {
        return this._metadataExtractor.inspectFormats(url);
    }

    /**
     * استخراج المعلومات الأساسية للفيديو
     * @param {string} url - رابط الفيديو
     * @returns {Promise<Object>} معلومات الفيديو
     */
    async extractMetadata(url) {
        return this._metadataExtractor.extractMetadata(url);
    }

    async startDownload(url, formatId, options = {}) {
        if (!formatId || typeof formatId !== 'string' || formatId.trim() === '') {
            throw new Error('formatId is required and must be a non-empty string');
        }

        // التحقق من صحة formatId لحماية النظام
        if (!/^[a-zA-Z0-9+\-]+$/.test(formatId.trim())) {
            throw new Error(`Invalid formatId: ${formatId}. Format ID must contain only letters, numbers, +, or -`);
        }

        // التحقق من الاتصال بالإنترنت
        const isConnected = await this.checkInternetConnection();
        if (!isConnected) {
            throw new Error('No internet connection. Please check your network connection and try again.');
        }

        const { outputPath, onProgress, deviceId, title, formatsData, processId: existingProcessId } = options;

        // استخدام processId الموجود للاستئناف، أو إنشاء جديد للتحميل الجديد
        const processId = existingProcessId || `ytdlp-dl-${Date.now()}`;
        const isResuming = !!existingProcessId;

        let finalOutputPath = outputPath;

        // عند الاستئناف، استخدام المسار الفعلي المخزن في الإدخال
        if (isResuming) {
            const existingEntry = this._downloadManager.getDownloadEntry(processId);
            if (existingEntry && existingEntry.outputPath) {
                finalOutputPath = existingEntry.outputPath;
            }
        }

        // إنشاء مجلد مؤقت داخل المشروع إذا لم يتم تمرير مسار مخصص
        if (!finalOutputPath) {
            const tempDir = await createTempDirectory(this._pathService);
            finalOutputPath = tempDir;
        }

        // التحقق من أن المسار موجود وقابل للكتابة
        try {
            const fs = require('fs').promises;
            await fs.access(finalOutputPath, fs.constants.W_OK);
            if (this._logger) {
                this._logger.info(`Output path is writable: ${finalOutputPath}`);
            }
        } catch (err) {
            const error = new Error(`Cannot write to output path: ${finalOutputPath}. Error: ${err.message}`);
            if (this._logger) {
                this._logger.error(error.message);
            }
            throw error;
        }

        // حساب الحجم الكلي للتحميل
        let { totalSize, hasSizeInfo } = calculateTotalSize(formatId, formatsData);

        // بناء الوسائط مباشرة (بدون YtdlpCommandBuilder)
        // استخدام مسار مطلق في -o بدلاً من الاعتماد على cwd
        const outputTemplate = require('path').join(finalOutputPath, '%(title)s.%(ext)s');
        const args = [
            '--ignore-config',
            '-f', formatId,
            '-o', outputTemplate,
            '--newline',
            url
        ];

        // إنشاء AbortController للإيقاف
        const controller = new AbortController();

        try {
            // تنفيذ التحميل باستخدام yt-dlp-wrap-plus
            // لا حاجة لـ cwd عند استخدام مسار مطلق في -o
            const emitter = this._ytDlpWrap.exec(args, {}, controller.signal);

            // تسجيل العملية في ProcessSupervisor
            this._processManager.registerProcessWithSupervisor(processId, emitter.ytDlpProcess, controller, {
                url, formatId, outputPath: finalOutputPath, deviceId
            });

            // إنشاء إدخال في DownloadManager
            this._downloadManager.upsertDownloadEntry(processId, {
                resolve: null,
                reject: null,
                url,
                formatId,
                outputPath: finalOutputPath,
                controller,
                process: emitter.ytDlpProcess,
                deviceId,
                title,
                totalSize,
                hasSizeInfo
            }, isResuming);

            // تحديث حالة التحميل
            this._downloadManager.updateDownloadStatus(processId, 'downloading');

            // ربط الأحداث
            emitter.on('progress', (progress) => {
                this._eventHandler.handleProgress(processId, progress, onProgress);
            });

            emitter.on('ytDlpEvent', (eventType, eventData) => {
                if (eventType === 'download') {
                    const match = eventData.match(/Destination: (.+)$/);
                    if (match) {
                        this._eventHandler.handleFilename(processId, match[1]);
                    }
                }
            });

            emitter.on('close', (code) => {
                this._eventHandler.handleClose(processId, finalOutputPath, code, deviceId, url, title, this.startDownload.bind(this));
            });

            emitter.on('error', (err) => {
                this._eventHandler.handleError(processId, err, deviceId, url);
            });

            return new Promise((resolve, reject) => {
                const entry = this._downloadManager.getDownloadEntry(processId);
                if (entry) {
                    entry.resolve = resolve;
                    entry.reject = reject;
                } else {
                    reject(new Error('Download entry not found after process start'));
                }
            });

        } catch (error) {
            // في حالة فشل بدء العملية، تنظيف أي إدخال عالق
            if (this._downloadManager.getDownloadEntry(processId)) {
                this._downloadManager.cleanupOrphanedEntry(processId);
            }
            throw error;
        }
    }

    /**
     * إيقاف عملية التحميل بشكل آمن مع التحقق من الحالات الحدية
     * @param {string} processId - معرف العملية
     * @returns {Object} كائن نتيجة يوضح حالة الإيقاف:
     *   - { success: true, wasRunning: true } - تم إيقاف عملية حية
     *   - { success: true, wasRunning: false } - العملية لم تكن حية (تم التسجيل فقط)
     *   - { success: false, reason: 'entry_not_found', processId } - الإدخال غير موجود
     *   - { success: false, reason: 'invalid_processId' } - processId غير صالح
     */
    stopDownload(processId) {
        // التحقق من صحة processId
        if (!processId) {
            if (this._logger) {
                this._logger.warn('stopDownload: Invalid processId (null or empty)');
            }
            return { success: false, reason: 'invalid_processId' };
        }

        // التحقق من وجود الإدخال في الذاكرة
        const entry = this._downloadManager.getDownloadEntry(processId);
        if (!entry) {
            if (this._logger) {
                this._logger.warn(`stopDownload: Entry not found for processId: ${processId}`);
            }
            return { success: false, reason: 'entry_not_found', processId };
        }

        // تعيين علامة التوقف اليدوي لمنع إعادة المحاولة
        entry.manuallyStopped = true;

        // إيقاف من المكتبة عبر AbortController
        if (entry.controller) {
            entry.controller.abort();
        }

        // إيقاف من ProcessManager
        this._processManager.stopProcess(processId, entry);

        // تحديث حالة التحميل إلى متوقف
        this._downloadManager.updateDownloadStatus(processId, 'stopped');

        // الاحتفاظ بالإدخال في الذاكرة للسماح بالاستئناف
        return { success: true, wasRunning: true };
    }

    /**
     * التحقق من حالة عملية التحميل
     * @param {string} processId - معرف العملية
     * @returns {boolean} true إذا كانت العملية قيد التشغيل، false إذا كانت متوقفة
     */
    isProcessRunning(processId) {
        const entry = this._downloadManager.getDownloadEntry(processId);
        return this._processManager.isProcessRunning(processId, entry);
    }

    getDownloadStatus(processId) {
        return this._downloadManager.getDownloadStatus(processId);
    }

    /**
     * البحث عن تحميل نشط في الذاكرة بناءً على الرابط ومعرف التنسيق
     * @param {string} url - رابط التحميل
     * @param {string} formatId - معرف التنسيق
     * @returns {string|null} processId إذا وجد، null إذا لم يوجد
     */
    findActiveDownload(url, formatId) {
        return this._downloadManager.findActiveDownload(url, formatId);
    }

    /**
     * الحصول على إدخال التحميل الكامل من الذاكرة
     * @param {string} processId - معرف العملية
     * @returns {Object|null} إدخال التحميل أو null إذا لم يوجد
     */
    getDownloadEntry(processId) {
        return this._downloadManager.getDownloadEntry(processId);
    }

    /**
     * تحديث حالة التحميل في الذاكرة
     * @param {string} processId - معرف العملية
     * @param {string} status - الحالة الجديدة
     */
    updateDownloadStatus(processId, status) {
        return this._downloadManager.updateDownloadStatus(processId, status);
    }

    /**
     * إيقاف عملية التحميل فقط دون تغيير الحالة في الذاكرة
     * @param {string} processId - معرف العملية
     * @returns {Object} كائن نتيجة يوضح حالة الإيقاف
     */
    stopProcessOnly(processId) {
        // التحقق من صحة processId
        if (!processId) {
            if (this._logger && typeof this._logger.warn === 'function') {
                this._logger.warn('stopProcessOnly: Invalid processId (null or empty)');
            }
            return { success: false, reason: 'invalid_processId' };
        }

        // التحقق من وجود الإدخال في الذاكرة
        const entry = this._downloadManager.getDownloadEntry(processId);
        if (!entry) {
            if (this._logger && typeof this._logger.warn === 'function') {
                this._logger.warn(`stopProcessOnly: Entry not found for processId: ${processId}`);
            }
            return { success: false, reason: 'entry_not_found', processId };
        }

        // إيقاف من ProcessManager
        return this._processManager.stopProcess(processId, entry, false);
    }

    /**
     * الحصول على خريطة التحميلات النشطة من الذاكرة
     * @returns {Object} خريطة التحميلات النشطة
     */
    getActiveDownloads() {
        return this._downloadManager.getActiveDownloads();
    }

    /**
     * حذف إدخال التحميل من الذاكرة فقط
     * @param {string} processId - معرف العملية
     * @returns {Object} كائن نتيجة يوضح حالة الحذف
     */
    removeDownloadEntry(processId) {
        // التحقق من صحة processId
        if (!processId) {
            if (this._logger && typeof this._logger.warn === 'function') {
                this._logger.warn('removeDownloadEntry: Invalid processId (null or empty)');
            }
            return { success: false, reason: 'invalid_processId' };
        }

        // التحقق من وجود الإدخال في الذاكرة
        const entry = this._downloadManager.getDownloadEntry(processId);
        if (!entry) {
            if (this._logger && typeof this._logger.warn === 'function') {
                this._logger.warn(`removeDownloadEntry: Entry not found for processId: ${processId}`);
            }
            return { success: false, reason: 'entry_not_found', processId };
        }

        // إيقاف العملية إذا كانت قيد التشغيل
        this._processManager.stopProcess(processId, entry, false);

        // حذف الإدخال من الذاكرة
        this._downloadManager.removeDownloadEntry(processId);

        return { success: true, processId };
    }
}

module.exports = YtdlpAdapter;