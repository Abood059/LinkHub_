// src/main/infrastructure/sync/StateSyncService.js
'use strict';

/**
 * StateSyncService
 * 
 * خدمة تجميع الحالة من مصادر متعددة وإرسال حدث موحد للواجهة
 * يقلل الضغط على IPC عن طريق تجميع التغييرات وإرسالها بشكل دوري
 */
class StateSyncService {
    constructor(windowManager, deviceRegistry, options = {}) {
        if (!windowManager) {
            throw new Error('WindowManager is required for StateSyncService');
        }
        if (!deviceRegistry) {
            throw new Error('DeviceRegistry is required for StateSyncService');
        }

        this._windowManager = windowManager;
        this._deviceRegistry = deviceRegistry;
        this._interval = options.interval || 100; // 100ms = 10 updates/sec
        this._timer = null;
        this._isRunning = false;

        // الحالة المجمعة
        this._state = {
            devices: [],
            downloads: new Map(), // downloadId -> download data
            timestamp: Date.now()
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

        // تحميل الحالة الأولية
        this._loadInitialDeviceState();
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
            devices: this._state.devices,
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
            status: 'downloading',
            error: null,
            deviceId: data.deviceId || null,
            outputPath: null
        };

        download.percent = data.percent;
        download.status = 'downloading';
        download.deviceId = data.deviceId || download.deviceId;
        download.url = data.url || download.url;

        this._state.downloads.set(data.downloadId, download);
        this._hasChanges = true;
    }

    onDownloadComplete(data) {
        if (!data || !data.downloadId) return;

        const download = this._state.downloads.get(data.downloadId) || {
            downloadId: data.downloadId,
            url: data.url || null,
            status: 'completed',
            error: null,
            deviceId: data.deviceId || null,
            outputPath: null
        };

        download.status = 'completed';
        download.outputPath = data.outputPath || null;
        download.deviceId = data.deviceId || download.deviceId;
        download.url = data.url || download.url;
        download.percent = 100;

        this._state.downloads.set(data.downloadId, download);
        this._hasChanges = true;
    }

    onDownloadError(data) {
        if (!data || !data.downloadId) return;

        const download = this._state.downloads.get(data.downloadId) || {
            downloadId: data.downloadId,
            url: data.url || null,
            status: 'failed',
            error: null,
            deviceId: data.deviceId || null,
            outputPath: null
        };

        download.status = 'failed';
        download.error = data.error || null;
        download.deviceId = data.deviceId || download.deviceId;
        download.url = data.url || download.url;

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

    // ============================================================================
    // تحديثات الأجهزة
    // ============================================================================

    onDeviceStateChanged(data) {
        // تحديث الحالة من DeviceRegistry مباشرة
        this._loadDeviceState();
        this._hasChanges = true;
    }

    onDevicePaired(data) {
        // تحديث الحالة من DeviceRegistry مباشرة
        this._loadDeviceState();
        this._hasChanges = true;
    }

    onDeviceRemoved(data) {
        // تحديث الحالة من DeviceRegistry مباشرة
        this._loadDeviceState();
        this._hasChanges = true;
    }

    // ============================================================================
    // Internal methods
    // ============================================================================

    /**
     * تحميل الحالة الأولية للأجهزة من DeviceRegistry
     */
    _loadInitialDeviceState() {
        this._loadDeviceState();
        this._hasChanges = true;
    }

    /**
     * تحميل حالة الأجهزة من DeviceRegistry
     */
    _loadDeviceState() {
        const devices = this._deviceRegistry.getAllDevices();
        this._state.devices = devices.map(device => {
            const runtimeState = this._deviceRegistry.getRuntimeState(device.id);
            return {
                device: device,
                runtimeState: runtimeState || {}
            };
        });
    }

    /**
     * إرسال الحالة للواجهة
     */
    _broadcastState() {
        if (!this._hasChanges) return;

        const state = this.getState();
        this._windowManager.broadcast('state:update', state);
        
        this._hasChanges = false;
        this._state.timestamp = Date.now();
    }
}

module.exports = StateSyncService;
