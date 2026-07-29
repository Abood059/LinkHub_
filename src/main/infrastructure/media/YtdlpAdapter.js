// src/main/infrastructure/media/YtdlpAdapter.js
'use strict';

const EventEmitter = require('events');
const path = require('path');
const fs = require('fs').promises;

const YtdlpCommandBuilder = require('./YtdlpCommandBuilder');
const YtdlpResponseParser = require('./YtdlpResponseParser');
const DownloadManager = require('./DownloadManager');
const { createTempDirectory, calculateTotalSize } = require('./YtdlpUtils');

/**
 * YtdlpAdapter
 * مسؤول عن تنفيذ عمليات التحميل باستخدام yt-dlp
 * المبادئ:
 * - ينفذ العمليات التقنية فقط (بدء العملية، معالجة المخرجات)
 * - يضمن ذرية العملية: إما نجاح كامل (إدخال صحيح) أو فشل كامل (بدون إدخال)
 * - يستخدم DownloadManager لإدارة الحالة في الذاكرة
 * - لا يصل إلى قاعدة البيانات مباشرة
 */
class YtdlpAdapter extends EventEmitter {
    constructor({
        processSupervisor,
        ytdlpPath = null,
        toolPathResolver = null,
        logger = null,
        pathService = null
    }) {
        super();
        this._processSupervisor = processSupervisor;
        this._logger = logger;
        this._toolPathResolver = toolPathResolver;
        this._pathService = pathService;
        this._ytdlpPath = this._resolveYtdlpPath(ytdlpPath);
        this._windowManager = null;

        // Initialize helper modules
        this._commandBuilder = new YtdlpCommandBuilder(this._pathService);
        this._responseParser = new YtdlpResponseParser();
        this._downloadManager = new DownloadManager({ logger });

        // ملاحظة: تم إزالة forward events من DownloadManager
        // DownloadStateSyncService هو المصدر الوحيد للحقيقة لمزامنة الحالة
        // جميع الأحداث تُرسل دورياً عبر DownloadStateSyncService كل 300ms
    }

    setWindowManager(windowManager) {
        this._windowManager = windowManager;
    }

    _resolveYtdlpPath(explicitPath) {
        if (explicitPath) return explicitPath;
        if (this._toolPathResolver) return this._toolPathResolver.getYtDlpPath();
        const fallbackPath = 'yt-dlp';
        if (this._logger) {
            this._logger.warn(`YtdlpAdapter: No toolPathResolver provided, using fallback: ${fallbackPath}`);
        }
        return fallbackPath;
    }

    async inspectFormats(url) {
        if (!url) {
            throw new Error('URL is required');
        }

        const denoPath = this._toolPathResolver ? this._toolPathResolver.getDenoPath() : null;
        const command = this._commandBuilder.buildInspectCommand(url, denoPath);
        
        const output = await this._processSupervisor.executeQuickTaskArray(
            this._ytdlpPath,
            command.args,
            { timeout: command.timeout }
        );

        return this._responseParser.parseFormats(output);
    }

    async extractMetadata(url) {
        if (!url) {
            throw new Error('URL is required');
        }

        const denoPath = this._toolPathResolver ? this._toolPathResolver.getDenoPath() : null;
        const command = this._commandBuilder.buildMetadataCommand(url, denoPath);
        
        const output = await this._processSupervisor.executeQuickTaskArray(
            this._ytdlpPath,
            command.args,
            { timeout: command.timeout }
        );

        return this._responseParser.parseMetadata(output);
    }

    async startDownload(url, formatId, options = {}) {
        if (!formatId || typeof formatId !== 'string' || formatId.trim() === '') {
            throw new Error('formatId is required and must be a non-empty string');
        }

        // التحقق من صحة formatId لحماية النظام
        if (!/^[a-zA-Z0-9+\-]+$/.test(formatId.trim())) {
            throw new Error(`Invalid formatId: ${formatId}. Format ID must contain only letters, numbers, +, or -`);
        }

        const { outputPath, onProgress, deviceId, title, formatsData, processId: existingProcessId } = options;
        let finalOutputPath = outputPath;

        // استخدام processId الموجود للإستئناف، أو إنشاء جديد للتحميل الجديد
        const processId = existingProcessId || `ytdlp-dl-${Date.now()}`;
        const isResuming = !!existingProcessId;

        // عند الاستئناف، استخدام المسار الفعلي المخزن في الإدخال
        if (isResuming) {
            const existingEntry = this._downloadManager.getDownloadEntry(processId);
            if (existingEntry && existingEntry.outputPath) {
                finalOutputPath = existingEntry.outputPath;
            }
        }

        // إنشاء مجلد مؤقت داخل المشروع إذا لم يتم تمرير مسار مخصص
        // استخدام المجلد فقط (بدون قالب) لضمان الاستئناف الصحيح
        if (!finalOutputPath) {
            const tempDir = await createTempDirectory(this._pathService);
            finalOutputPath = tempDir;
        }
        const denoPath = this._toolPathResolver ? this._toolPathResolver.getDenoPath() : null;

        // حساب الحجم الكلي للتحميل المركب
        let { totalSize, hasSizeInfo } = calculateTotalSize(formatId, formatsData);

        // بناء أمر التحميل
        const command = this._commandBuilder.buildDownloadCommand(url, formatId, finalOutputPath, denoPath);

        let lineBuffer = '';
        let downloadProcess = null;
        let actualFilename = null; // لتخزين اسم الملف الفعلي من --print filename

        const flushProgressLines = (streamType, flushRemainder = false) => {
            // تطبيع \r و \r\n إلى \n — مع --newline تصل أسطر كاملة بـ \n
            const normalized = lineBuffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
            const lines = normalized.split('\n');

            if (flushRemainder) {
                lineBuffer = '';
                for (const line of lines) {
                    if (line.trim()) {
                        // التحقق مما إذا كان السطر يحتوي على اسم الملف من --print filename
                        // --print filename يطبع المسار الكامل للملف النهائي
                        if (line.trim() && !line.includes('[download]') && !line.includes('[#') && !line.includes('{')) {
                            // هذا السطر قد يكون اسم الملف
                            actualFilename = line.trim();
                        }
                        this._downloadManager.handleProgressData(line, streamType, processId, onProgress, formatId);
                    }
                }
                return;
            }

            lineBuffer = lines.pop() || '';
            for (const line of lines) {
                if (line.trim() && !line.includes('[download]') && !line.includes('[#') && !line.includes('{')) {
                    actualFilename = line.trim();
                }
                this._downloadManager.handleProgressData(line, streamType, processId, onProgress, formatId);
            }
        };

        try {
            // الخطوة 1: بدء العملية أولاً (قبل إنشاء الإدخال في الذاكرة)
            // هذا يضمن ذرية العملية: إما نجاح كامل أو فشل كامل
            downloadProcess = this._processSupervisor.startManagedProcess({
                processId,
                binPath: this._ytdlpPath,
                args: command.args,
                type: 'ytdlp-download',
                metadata: { url, formatId, outputPath: finalOutputPath, deviceId },
                onData: (chunk, streamType) => {
                    const text = typeof chunk === 'string' ? chunk : chunk.toString();
                    lineBuffer += text;
                    flushProgressLines(streamType, false);
                }
            });

            // التحقق من نجاح بدء العملية
            if (!downloadProcess) {
                throw new Error('Failed to start process: processSupervisor returned null');
            }

            // الخطوة 2: إنشاء أو تحديث إدخال التحميل في DownloadManager
            // يتم هذا بعد نجاح بدء العملية
            this._downloadManager.upsertDownloadEntry(processId, {
                resolve: null, // سيتم تعيينها لاحقاً
                reject: null,  // سيتم تعيينها لاحقاً
                url,
                formatId,
                outputPath: finalOutputPath,
                deviceId,
                title,
                totalSize,
                hasSizeInfo
            }, isResuming);

            // تحديث مرجع العملية وحالتها
            this._downloadManager.updateDownloadProcess(processId, downloadProcess);
            this._downloadManager.updateDownloadStatus(processId, 'downloading');

        } catch (error) {
            // في حالة فشل بدء العملية، تنظيف أي إدخال عالق
            if (this._downloadManager.getDownloadEntry(processId)) {
                this._downloadManager.cleanupOrphanedEntry(processId);
            }
            throw error;
        }

        return new Promise((resolve, reject) => {
            try {
                // تحديث resolve/reject في إدخال التحميل
                const entry = this._downloadManager.getDownloadEntry(processId);
                if (entry) {
                    entry.resolve = resolve;
                    entry.reject = reject;
                } else {
                    reject(new Error('Download entry not found after process start'));
                    return;
                }

                // تسجيل معالجات انتهاء العملية
                if (downloadProcess && downloadProcess.once) {
                    downloadProcess.once('exit', async (code) => {
                        // تفريغ أي سطر تقدم متبقٍ في الـ buffer قبل تقييم الإكمال
                        if (lineBuffer.trim()) {
                            flushProgressLines('stdout', true);
                        }

                        const entry = this._downloadManager.getDownloadEntry(processId);
                        if (!entry) return;

                        // التعامل مع الإيقاف اليدوي - لا ترسل خطأ
                        if (entry.manuallyStopped) {
                            this._downloadManager.updateDownloadStatus(processId, 'stopped');
                            // الاحتفاظ بالإدخال في الذاكرة للسماح بالاستئناف
                            return;
                        }

                        if (code === 0) {
                            await this._downloadManager.handleDownloadSuccess(processId, finalOutputPath, deviceId, url, title, actualFilename);
                            this._downloadManager.updateDownloadStatus(processId, 'completed');
                            // الاحتفاظ بالإدخال في الذاكرة مع الحالة completed
                        } else {
                            if (this._downloadManager.shouldRetry(entry, code)) {
                                this._downloadManager.handleRetry(entry, processId, url, formatId, options, this.startDownload.bind(this), code);
                                return;
                            } else {
                                this._downloadManager.handleDownloadFailure(processId, code, deviceId, url, title);
                                this._downloadManager.updateDownloadStatus(processId, 'failed');
                                // الاحتفاظ بالإدخال في الذاكرة مع الحالة failed
                            }
                        }
                    });

                    downloadProcess.once('error', (err) => {
                        const entry = this._downloadManager.getDownloadEntry(processId);
                        if (entry) {
                            this._downloadManager.handleProcessError(processId, err, deviceId, url);
                            this._downloadManager.removeDownloadEntry(processId);
                        }
                    });
                } else {
                    // فشل في ربط مستمعات العملية - تنظيف الإدخال
                    this._downloadManager.cleanupOrphanedEntry(processId);
                    reject(new Error('Failed to attach process event listeners'));
                }
            } catch (error) {
                // فشل في إعداد Promise - تنظيف الإدخال
                this._downloadManager.cleanupOrphanedEntry(processId);
                reject(error);
            }
        });
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
        
        // تحديث حالة التحميل إلى متوقف
        this._downloadManager.updateDownloadStatus(processId, 'stopped');

        // التحقق من وجود العملية الحية في ProcessSupervisor
        const isProcessAlive = this._processSupervisor.hasProcess(processId);

        if (isProcessAlive) {
            // العملية حية - إيقافها بشكل طبيعي
            const stopped = this._processSupervisor.stopManagedProcess(processId);
            // الاحتفاظ بالإدخال في الذاكرة للسماح بالاستئناف
            return { success: stopped, wasRunning: true };
        } else {
            // العملية ليست حية - تسجيل الحدث والعودة بنجاح (لا داعي للإيقاف)
            if (this._logger) {
                this._logger.info(`stopDownload: Process ${processId} was not alive, skipping stopManagedProcess`);
            }
            // الاحتفاظ بالإدخال في الذاكرة للسماح بالاستئناف
            return { success: true, wasRunning: false };
        }
    }

    /**
     * التحقق من حالة عملية التحميل
     * @param {string} processId - معرف العملية
     * @returns {boolean} true إذا كانت العملية قيد التشغيل، false إذا كانت متوقفة
     */
    isProcessRunning(processId) {
        const entry = this._downloadManager.getDownloadEntry(processId);
        if (!entry) return false;
        
        // التحقق من وجود العملية وحالتها
        if (entry.process) {
            // إذا كانت العملية موجودة، تحقق من حالتها
            return entry.status === 'downloading' || entry.status === 'starting';
        }
        
        return false;
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
     * @returns {Object} كائن نتيجة يوضح حالة الإيقاف:
     *   - { success: true, wasRunning: true } - تم إيقاف عملية حية
     *   - { success: true, wasRunning: false } - العملية لم تكن حية
     *   - { success: false, reason: 'entry_not_found', processId } - الإدخال غير موجود
     *   - { success: false, reason: 'invalid_processId' } - processId غير صالح
     */
    stopProcessOnly(processId) {
        // التحقق من صحة processId
        if (!processId) {
            if (this._logger) {
                this._logger.warn('stopProcessOnly: Invalid processId (null or empty)');
            }
            return { success: false, reason: 'invalid_processId' };
        }

        // التحقق من وجود الإدخال في الذاكرة
        const entry = this._downloadManager.getDownloadEntry(processId);
        if (!entry) {
            if (this._logger) {
                this._logger.warn(`stopProcessOnly: Entry not found for processId: ${processId}`);
            }
            return { success: false, reason: 'entry_not_found', processId };
        }

        // التحقق من وجود العملية الحية في ProcessSupervisor
        const isProcessAlive = this._processSupervisor.hasProcess(processId);

        if (isProcessAlive) {
            // العملية حية - إيقافها بشكل طبيعي
            const stopped = this._processSupervisor.stopManagedProcess(processId);
            // لا نقوم بتغيير manuallyStopped ولا حالة الإدخال
            return { success: stopped, wasRunning: true };
        } else {
            // العملية ليست حية - لا داعي للإيقاف
            if (this._logger) {
                this._logger.info(`stopProcessOnly: Process ${processId} was not alive, skipping stopManagedProcess`);
            }
            return { success: true, wasRunning: false };
        }
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
            if (this._logger) {
                this._logger.warn('removeDownloadEntry: Invalid processId (null or empty)');
            }
            return { success: false, reason: 'invalid_processId' };
        }

        // التحقق من وجود الإدخال في الذاكرة
        const entry = this._downloadManager.getDownloadEntry(processId);
        if (!entry) {
            if (this._logger) {
                this._logger.warn(`removeDownloadEntry: Entry not found for processId: ${processId}`);
            }
            return { success: false, reason: 'entry_not_found', processId };
        }

        // إيقاف العملية إذا كانت قيد التشغيل
        const isProcessAlive = this._processSupervisor.hasProcess(processId);
        if (isProcessAlive) {
            this._processSupervisor.stopManagedProcess(processId);
        }

        // حذف الإدخال من الذاكرة
        this._downloadManager.removeDownloadEntry(processId);

        return { success: true, processId };
    }
}

module.exports = YtdlpAdapter;