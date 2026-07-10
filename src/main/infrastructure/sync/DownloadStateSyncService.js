// src/main/infrastructure/sync/DownloadStateSyncService.js
'use strict';

/**
 * DownloadStateSyncService
 * 
 * خدمة تجميع حالة التحميلات وإرسالها للواجهة بشكل منفصل
 * يقلل الضغط على IPC عن طريق تجميع التغييرات وإرسالها بشكل دوري
 */
class DownloadStateSyncService {
    constructor(windowManager, options = {}) {
        if (!windowManager) {
            throw new Error('WindowManager is required for DownloadStateSyncService');
        }

        this._windowManager = windowManager;
        this._interval = options.interval || 300; // 300ms default
        this._timer = null;
        this._isRunning = false;

        // الحالة المجمعة
        this._state = {
            downloads: new Map(), // downloadId -> download data
            timestamp: Date.now()
        };

        // الحالة السابقة للمقارنة (لإطلاق أحداث منفصلة)
        this._previousState = {
            downloads: new Map() // downloadId -> downloadData
        };

        // Dirty flag للإشارة إلى وجود تغييرات
        this._hasChanges = false;
    }

    /**
     * بدء الخدمة
     */
    start() {
        if (this._isRunning) return;

        this._isRunning = true;
        this._timer = setInterval(() => {
            this._broadcastState();
        }, this._interval);
    }

    /**
     * إيقاف الخدمة
     */
    stop() {
        if (!this._isRunning) return;

        this._isRunning = false;
        if (this._timer) {
            clearInterval(this._timer);
            this._timer = null;
        }
    }

    /**
     * تعديل الفاصل الزمني
     */
    setInterval(ms) {
        this._interval = ms;
        if (this._isRunning) {
            this.stop();
            this.start();
        }
    }

    /**
     * الحصول على الحالة الحالية
     */
    getState() {
        return {
            downloads: Array.from(this._state.downloads.values()),
            timestamp: this._state.timestamp
        };
    }

    // ============================================================================
    // تحديثات التحميل
    // ============================================================================

    onDownloadProgress(data) {
        if (!data || !data.downloadId) return;

        const download = this._state.downloads.get(data.downloadId) || {
            downloadId: data.downloadId,
            url: data.url || null,
            title: data.title || null,
            status: 'downloading',
            error: null,
            deviceId: data.deviceId || null,
            outputPath: null,
            totalSize: null,
            downloadedBytes: null
        };

        download.percent = data.percent;
        download.speed = data.speed || null;
        download.size = data.size || null;
        download.eta = data.eta || null;
        download.elapsed = data.elapsed || null;
        download.status = 'downloading';
        download.deviceId = data.deviceId || download.deviceId;
        download.url = data.url || download.url;
        download.title = data.title || download.title;
        download.totalSize = data.totalSize || download.totalSize;
        download.downloadedBytes = data.downloadedBytes || download.downloadedBytes;

        this._state.downloads.set(data.downloadId, download);
        this._hasChanges = true;
    }

    onDownloadComplete(data) {
        if (!data || !data.downloadId) return;

        const download = this._state.downloads.get(data.downloadId) || {
            downloadId: data.downloadId,
            url: data.url || null,
            title: data.title || null,
            status: 'completed',
            error: null,
            deviceId: data.deviceId || null,
            outputPath: null
        };

        download.status = 'completed';
        download.outputPath = data.outputPath || null;
        download.deviceId = data.deviceId || download.deviceId;
        download.url = data.url || download.url;
        download.title = data.title || download.title;
        download.percent = 100;

        this._state.downloads.set(data.downloadId, download);
        this._hasChanges = true;
    }

    onDownloadError(data) {
        if (!data || !data.downloadId) return;

        const download = this._state.downloads.get(data.downloadId) || {
            downloadId: data.downloadId,
            url: data.url || null,
            title: data.title || null,
            status: 'failed',
            error: null,
            deviceId: data.deviceId || null,
            outputPath: null
        };

        download.status = 'failed';
        download.error = data.error || null;
        download.deviceId = data.deviceId || download.deviceId;
        download.url = data.url || download.url;
        download.title = data.title || download.title;

        this._state.downloads.set(data.downloadId, download);
        this._hasChanges = true;
    }

    onDownloadStopped(data) {
        if (!data || !data.downloadId) return;

        const download = this._state.downloads.get(data.downloadId);
        if (download) {
            download.status = 'stopped';
            this._state.downloads.set(data.downloadId, download);
            this._hasChanges = true;
        }
    }

    onDownloadRetrying(data) {
        if (!data || !data.downloadId) return;

        const download = this._state.downloads.get(data.downloadId) || {
            downloadId: data.downloadId,
            url: data.url || null,
            title: data.title || null,
            status: 'retrying',
            error: null,
            deviceId: data.deviceId || null,
            outputPath: null
        };

        download.status = 'retrying';
        download.retryCount = data.retryCount;
        download.maxRetries = data.maxRetries;
        download.deviceId = data.deviceId || download.deviceId;
        download.url = data.url || download.url;
        download.title = data.title || download.title;

        this._state.downloads.set(data.downloadId, download);
        this._hasChanges = true;
    }

    // ============================================================================
    // Internal methods
    // ============================================================================

    /**
     * إرسال الحالة للواجهة
     */
    _broadcastState() {
        if (!this._hasChanges) {
            return;
        }

        const currentState = this.getState();
        
        // إرسال الحالة الموحدة
        this._windowManager.broadcast('download:state:update', currentState);
        
        // مقارنة وإطلاق أحداث منفصلة
        this._diffAndEmitDownloads(currentState.downloads);
        
        this._hasChanges = false;
        this._state.timestamp = Date.now();
        
        // تحديث الحالة السابقة
        this._updatePreviousState(currentState);
    }

    // ============================================================================
    // Diffing methods لإطلاق أحداث منفصلة
    // ============================================================================

    /**
     * مقارنة حالة التحميلات وإطلاق أحداث منفصلة
     */
    _diffAndEmitDownloads(currentDownloads) {
        const currentMap = new Map();
        currentDownloads.forEach(d => currentMap.set(d.downloadId, d));
        
        for (const [downloadId, download] of currentMap) {
            const prev = this._previousState.downloads.get(downloadId);
            
            if (!prev) {
                // تحميل جديد - أرسل حدث للإشارة إلى بداية التحميل
                this._windowManager.broadcast('download:started', { downloadId, url: download.url, title: download.title });
                continue;
            }
            
            if (download.status !== prev.status) {
                if (download.status === 'completed') {
                    this._windowManager.broadcast('download:complete', { downloadId });
                } else if (download.status === 'failed') {
                    const errorData = { 
                        downloadId, 
                        error: download.error 
                    };
                    this._windowManager.broadcast('download:error', errorData);
                } else if (download.status === 'stopped') {
                    this._windowManager.broadcast('download:stopped', { downloadId });
                }
            }
            
            if (download.status === 'downloading' && download.percent !== prev.percent) {
                const progressData = {
                    downloadId,
                    percent: download.percent,
                    speed: download.speed || null,
                    size: download.size || null
                };
                this._windowManager.broadcast('download:progress', progressData);
            }
        }
    }

    /**
     * تحديث الحالة السابقة
     */
    _updatePreviousState(currentState) {
        this._previousState.downloads.clear();
        currentState.downloads.forEach(d => {
            this._previousState.downloads.set(d.downloadId, JSON.parse(JSON.stringify(d)));
        });
    }
}

module.exports = DownloadStateSyncService;
