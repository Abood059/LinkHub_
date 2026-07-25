'use strict';

/**
 * DownloadOrchestrator
 * مسؤول عن تنسيق عمليات التحميل واتخاذ قرارات منطق الأعمال
 * المبادئ:
 * - الذاكرة هي المصدر الوحيد للحقيقة أثناء التشغيل
 * - لا يصل إلى قاعدة البيانات نهائياً
 * - يتحقق من وجود تحميل في الذاكرة ويقرر: بدء جديد، استئناف موجود، أم منع التكرار
 */
class DownloadOrchestrator {
    constructor({
        ytdlpAdapter,
        downloadManager,
        deviceRegistry = null,
        fileTransferService = null,
        logger = null
    }) {
        this._ytdlpAdapter = ytdlpAdapter;
        this._downloadManager = downloadManager;
        this._deviceRegistry = deviceRegistry;
        this._fileTransferService = fileTransferService;
        this._logger = logger;
    }

    async inspectLink(url) {
        if (!url) {
            throw new Error('URL is required');
        }
        return this._ytdlpAdapter.inspectFormats(url);
    }

    async getMetadata(url) {
        if (!url) {
            throw new Error('URL is required');
        }
        return this._ytdlpAdapter.extractMetadata(url);
    }

    async startDownload(url, formatId, deviceId = null, options = {}) {
        console.log('[DownloadOrchestrator] === بدء startDownload ===');
        console.log('[DownloadOrchestrator] url:', url);
        console.log('[DownloadOrchestrator] formatId:', formatId);
        console.log('[DownloadOrchestrator] deviceId:', deviceId);
        console.log('[DownloadOrchestrator] options:', options);
        if (!url || !formatId) {
            console.log('[DownloadOrchestrator] خطأ: url أو formatId مفقود');
            throw new Error('url and formatId are required');
        }

        // إذا كان هناك processId، فهو استئناف - نتجاوز فحص التكرار
        if (options.processId) {
            console.log('[DownloadOrchestrator] processId موجود - استئناف، تجاوز فحص التكرار');
            const adapterOptions = { ...options, deviceId, formatsData: options.formatsData };
            console.log('[DownloadOrchestrator] adapterOptions:', adapterOptions);
            const result = this._ytdlpAdapter.startDownload(url, formatId, adapterOptions);
            console.log('[DownloadOrchestrator] نتيجة startDownload من adapter:', result);
            return result;
        }

        // البحث في الذاكرة عن تحميل نشط لنفس الرابط والجودة
        const activeProcessId = this._ytdlpAdapter.findActiveDownload(url, formatId);
        console.log('[DownloadOrchestrator] البحث عن تحميل نشط في الذاكرة');
        console.log('[DownloadOrchestrator] activeProcessId:', activeProcessId);
        if (activeProcessId) {
            // تحميل موجود في الذاكرة - منع التكرار
            console.log('[DownloadOrchestrator] تحميل موجود في الذاكرة');
            const entry = this._ytdlpAdapter.getDownloadEntry(activeProcessId);
            console.log('[DownloadOrchestrator] entry:', entry);
            const result = {
                existing: true,
                downloadId: activeProcessId,
                status: entry ? entry.status : 'unknown',
                title: entry ? entry.title : options.title || 'Unknown'
            };
            console.log('[DownloadOrchestrator] إرجاع نتيجة تحميل موجود:', result);
            return result;
        }

        // لا يوجد تحميل في الذاكرة - بدء تحميل جديد
        console.log('[DownloadOrchestrator] لا يوجد تحميل في الذاكرة - بدء تحميل جديد');
        const adapterOptions = { ...options, deviceId, formatsData: options.formatsData };
        console.log('[DownloadOrchestrator] adapterOptions:', adapterOptions);
        const result = this._ytdlpAdapter.startDownload(url, formatId, adapterOptions);
        console.log('[DownloadOrchestrator] نتيجة startDownload من adapter:', result);
        return result;
    }

    /**
     * إيقاف عملية التحميل
     * @param {string} fileId - معرف الملف/العملية
     * @returns {Object} كائن نتيجة يوضح حالة الإيقاف من YtdlpAdapter
     */
    stopDownload(fileId) {
        console.log('[DownloadOrchestrator] === بدء stopDownload ===');
        console.log('[DownloadOrchestrator] fileId:', fileId);
        if (!fileId) {
            console.log('[DownloadOrchestrator] خطأ: fileId مفقود');
            throw new Error('fileId is required');
        }
        const result = this._ytdlpAdapter.stopDownload(fileId);
        console.log('[DownloadOrchestrator] نتيجة stopDownload:', result);
        return result;
    }

    async resumeDownload(processId, url, formatId, deviceId = null, options = {}) {
        console.log('[DownloadOrchestrator] === بدء resumeDownload ===');
        console.log('[DownloadOrchestrator] processId:', processId);
        console.log('[DownloadOrchestrator] url:', url);
        console.log('[DownloadOrchestrator] formatId:', formatId);
        console.log('[DownloadOrchestrator] deviceId:', deviceId);
        console.log('[DownloadOrchestrator] options:', options);
        if (!url || !formatId) {
            console.log('[DownloadOrchestrator] خطأ: url أو formatId مفقود');
            throw new Error('url and formatId are required');
        }

        // إذا لم يتم تمرير processId، ابحث عن تحميل متطابق في الذاكرة
        if (!processId) {
            console.log('[DownloadOrchestrator] processId null - البحث عن تحميل متطابق');
            processId = this._ytdlpAdapter.findActiveDownload(url, formatId);
            console.log('[DownloadOrchestrator] processId الموجود:', processId);
            if (!processId) {
                console.log('[DownloadOrchestrator] خطأ: لم يتم العثور على تحميل نشط');
                throw new Error('لم يتم العثور على تحميل نشط لهذا الرابط والجودة');
            }
        }

        // التحقق من وجود الإدخال في الذاكرة
        const entry = this._ytdlpAdapter.getDownloadEntry(processId);
        console.log('[DownloadOrchestrator] entry:', entry);
        if (!entry) {
            console.log('[DownloadOrchestrator] خطأ: لم يتم العثور على إدخال');
            throw new Error('لم يتم العثور على تحميل نشط لهذا الرابط والجودة');
        }

        // التحقق من حالة العملية قبل الاستئناف
        const isRunning = this._ytdlpAdapter.isProcessRunning(processId);
        console.log('[DownloadOrchestrator] isProcessRunning:', isRunning);

        if (isRunning) {
            // العملية قيد التشغيل - إنهاء العملية الحالية فقط دون تغيير الحالة في الذاكرة
            console.log('[DownloadOrchestrator] العملية قيد التشغيل - إنهاء العملية الحالية');
            const stopResult = this._ytdlpAdapter.stopProcessOnly(processId);
            console.log('[DownloadOrchestrator] stopProcessOnly result:', stopResult);
            if (this._logger) {
                this._logger.info(`resumeDownload: Stopped running process ${processId}`, stopResult);
            }
        }

        // بدء التحميل الجديد
        console.log('[DownloadOrchestrator] بدء التحميل الجديد');
        const result = this.startDownload(url, formatId, deviceId, { ...options, processId });
        console.log('[DownloadOrchestrator] نتيجة startDownload:', result);
        return result;
    }

    /**
     * الحصول على حالة التحميل النشط
     * @param {string} processId - معرف العملية
     * @returns {string|null} حالة التحميل أو null إذا لم يكن موجوداً
     */
    getDownloadStatus(processId) {
        return this._ytdlpAdapter.getDownloadStatus(processId);
    }

    /**
     * البحث عن تحميل نشط في الذاكرة بناءً على الرابط ومعرف التنسيق
     * @param {string} url - رابط التحميل
     * @param {string} formatId - معرف التنسيق
     * @returns {string|null} processId إذا وجد، null إذا لم يوجد
     */
    findActiveDownload(url, formatId) {
        return this._ytdlpAdapter.findActiveDownload(url, formatId);
    }

    /**
     * معالجة اكتمال التحميل ونقل الملف للجهاز إذا لزم الأمر
     * @param {string} downloadId - معرف التحميل
     * @param {string} tempPath - المسار المؤقت للملف
     * @param {string} deviceId - معرف الجهاز (اختياري)
     */
    async handleDownloadComplete(downloadId, tempPath, deviceId = null) {
        if (!tempPath) {
            if (this._logger) {
                this._logger.warn(`No temp path provided for download ${downloadId}`);
            }
            return;
        }

        if (!deviceId || !this._fileTransferService) {
            // لا يوجد جهاز للنقل، الملف تم نقله بالفعل لمجلد التحميلات
            return;
        }

        try {
            // نقل الملف للجهاز
            const result = await this._fileTransferService.transferToDevice(tempPath, deviceId);
            
            if (result.success) {
                if (this._logger) {
                    this._logger.info(`File transferred successfully to device ${deviceId}`);
                }
                // إرسال إشعار للواجهة
                this._ytdlpAdapter.emit('transferComplete', {
                    downloadId,
                    deviceId,
                    message: result.message
                });
            } else {
                if (this._logger) {
                    this._logger.error(`Failed to transfer file to device: ${result.message}`);
                }
                // إرسال إشعار بالفشل
                this._ytdlpAdapter.emit('transferError', {
                    downloadId,
                    deviceId,
                    error: result.message
                });
            }
        } catch (err) {
            if (this._logger) {
                this._logger.error(`Error during file transfer: ${err.message}`);
            }
            this._ytdlpAdapter.emit('transferError', {
                downloadId,
                deviceId,
                error: err.message
            });
        }
    }

    /**
     * الحصول على خريطة التحميلات النشطة من الذاكرة
     * @returns {Object} خريطة التحميلات النشطة
     */
    getActiveDownloads() {
        return this._ytdlpAdapter.getActiveDownloads();
    }

    /**
     * نقل ملف موجود إلى جهاز
     * @param {string} localPath - المسار المحلي للملف
     * @param {string} deviceId - معرف الجهاز
     * @returns {Promise<Object>} نتيجة النقل
     */
    async transferFileToDevice(localPath, deviceId) {
        if (!localPath) {
            throw new Error('Local path is required');
        }
        if (!deviceId) {
            throw new Error('Device ID is required');
        }
        if (!this._fileTransferService) {
            throw new Error('FileTransferService not available');
        }
        return this._fileTransferService.transferFromDownloads(localPath, deviceId);
    }


    /**
     * الحصول على السجل التاريخي للتحميلات
     * @returns {Array} قائمة جميع التحميلات
     */
    getDownloadHistory() {
        return this._downloadManager.getAllDownloads();
    }

    /**
     * حذف تحميل من الذاكرة فقط (دون حذف من قاعدة البيانات)
     * @param {string} processId - معرف العملية
     * @returns {Object} كائن نتيجة يوضح حالة الحذف
     */
    deleteDownloadFromMemory(processId) {
        console.log('[DownloadOrchestrator] === بدء deleteDownloadFromMemory ===');
        console.log('[DownloadOrchestrator] processId:', processId);
        if (!processId) {
            console.log('[DownloadOrchestrator] خطأ: processId مفقود');
            throw new Error('processId is required');
        }

        const result = this._ytdlpAdapter.removeDownloadEntry(processId);
        console.log('[DownloadOrchestrator] نتيجة deleteDownloadFromMemory:', result);
        return result;
    }

}

module.exports = DownloadOrchestrator;