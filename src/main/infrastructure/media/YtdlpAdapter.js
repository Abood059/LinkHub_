// src/main/infrastructure/media/YtdlpAdapter.js
'use strict';

const EventEmitter = require('events');
const path = require('path');

const YtdlpCommandBuilder = require('./YtdlpCommandBuilder');
const YtdlpResponseParser = require('./YtdlpResponseParser');
const DownloadManager = require('./DownloadManager');
const { createTempDirectory, calculateTotalSize } = require('./YtdlpUtils');

class YtdlpAdapter extends EventEmitter {
    constructor({
        processSupervisor,
        ytdlpPath = null,
        toolPathResolver = null,
        logger = null
    }) {
        super();
        this._processSupervisor = processSupervisor;
        this._logger = logger;
        this._toolPathResolver = toolPathResolver;
        this._ytdlpPath = this._resolveYtdlpPath(ytdlpPath);
        this._windowManager = null;
        
        // Initialize helper modules
        this._commandBuilder = new YtdlpCommandBuilder();
        this._responseParser = new YtdlpResponseParser();
        this._downloadManager = new DownloadManager({ logger });
        
        // Forward events from download manager
        this._downloadManager.on('downloadProgress', (data) => this.emit('downloadProgress', data));
        this._downloadManager.on('downloadComplete', (data) => this.emit('downloadComplete', data));
        this._downloadManager.on('downloadError', (data) => this.emit('downloadError', data));
        this._downloadManager.on('downloadRetrying', (data) => this.emit('downloadRetrying', data));
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
        
        const { outputPath, onProgress, deviceId, title, formatsData } = options;
        let finalOutputPath = outputPath;
        
        // إنشاء مجلد مؤقت داخل المشروع إذا لم يتم تمرير مسار مخصص
        if (!finalOutputPath) {
            const timestamp = Date.now();
            const tempDir = await createTempDirectory();
            finalOutputPath = path.join(tempDir, `linkhub_${timestamp}_${formatId}.%(ext)s`);
        }

        const processId = `ytdlp-dl-${Date.now()}`;
        const denoPath = this._toolPathResolver ? this._toolPathResolver.getDenoPath() : null;
        
        // حساب الحجم الكلي للتحميل المركب
        const { totalSize, hasSizeInfo } = calculateTotalSize(formatId, formatsData);
        
        // إنشاء إدخال التحميل في DownloadManager
        this._downloadManager.createDownloadEntry(processId, {
            resolve: null, // سيتم تعيينها لاحقاً
            reject: null,  // سيتم تعيينها لاحقاً
            url,
            formatId,
            outputPath: finalOutputPath,
            deviceId,
            title,
            totalSize,
            hasSizeInfo
        });

        // بناء أمر التحميل
        const command = this._commandBuilder.buildDownloadCommand(url, formatId, finalOutputPath, denoPath);

        let lineBuffer = '';
        
        return new Promise((resolve, reject) => {
            // تحديث resolve/reject في إدخال التحميل
            const entry = this._downloadManager.getDownloadEntry(processId);
            if (entry) {
                entry.resolve = resolve;
                entry.reject = reject;
            }

            const downloadProcess = this._processSupervisor.startManagedProcess({
                processId,
                binPath: this._ytdlpPath,
                args: command.args,
                type: 'ytdlp-download',
                metadata: { url, formatId, outputPath: finalOutputPath, deviceId },
                onData: (chunk, streamType) => {
                    const text = typeof chunk === 'string' ? chunk : chunk.toString();
                    
                    // دمج النص الجديد مع المتبقي من المرة السابقة لمعالجته بشكل آمن
                    lineBuffer += text;
                    
                    // تقسيم البث الحي إلى أسطر بناءً على رمز السطر الجديد
                    const lines = lineBuffer.split('\n');
                    
                    // إخراج السطر الأخير والاحتفاظ به مؤقتاً لأنه قد يكون غير مكتمل
                    lineBuffer = lines.pop();
                    
                    // معالجة الأسطر المكتملة فقط
                    for (const line of lines) {
                        this._downloadManager.handleProgressData(line, streamType, processId, onProgress, formatId);
                    }
                }
            });

            // تحديث مرجع العملية وحالتها
            this._downloadManager.updateDownloadProcess(processId, downloadProcess);
            this._downloadManager.updateDownloadStatus(processId, 'downloading');

            // تسجيل معالجات انتهاء العملية
            if (downloadProcess && downloadProcess.once) {
                downloadProcess.once('exit', async (code) => {
                    const entry = this._downloadManager.getDownloadEntry(processId);
                    if (!entry) return;
                    
                    if (code === 0) {
                        await this._downloadManager.handleDownloadSuccess(processId, finalOutputPath, deviceId, url, title);
                    } else {
                        if (this._downloadManager.shouldRetry(entry, code)) {
                            this._downloadManager.handleRetry(entry, processId, url, formatId, options, this.startDownload.bind(this), code);
                            return;
                        } else {
                            this._downloadManager.handleDownloadFailure(processId, code, deviceId, url, title);
                        }
                    }
                    this._downloadManager.removeDownloadEntry(processId);
                });
                
                downloadProcess.once('error', (err) => {
                    const entry = this._downloadManager.getDownloadEntry(processId);
                    if (entry) {
                        this._downloadManager.handleProcessError(processId, err, deviceId, url);
                        this._downloadManager.removeDownloadEntry(processId);
                    }
                });
            } else {
                reject(new Error('Failed to start process'));
            }
        });
    }

    stopDownload(processId) {
        if (!processId) return false;
        const entry = this._downloadManager.getDownloadEntry(processId);
        if (!entry) return false;
        
        this._downloadManager.updateDownloadStatus(processId, 'stopped');
        const stopped = this._processSupervisor.stopManagedProcess(processId);
        if (stopped) {
            // الاحتفاظ بالإدخال لفترة قصيرة للسماح بالاستئناف
            // سيتم إزالته عند بدء تحميل جديد أو بعد فترة زمنية
            setTimeout(() => {
                this._downloadManager.removeDownloadEntry(processId);
            }, 5000); // 5 ثواني
            
            this.emit('downloadStopped', {
                downloadId: processId,
                url: entry.url,
                formatId: entry.formatId,
                deviceId: entry.deviceId,
                title: entry.title
            });
        }
        return stopped;
    }

    getDownloadStatus(processId) {
        return this._downloadManager.getDownloadStatus(processId);
    }
}

module.exports = YtdlpAdapter;