// src/main/infrastructure/sync/DeviceStateSyncService.js
'use strict';

/**
 * DeviceStateSyncService
 * 
 * خدمة تجميع حالة الأجهزة وإرسالها للواجهة بشكل منفصل
 * يقلل الضغط على IPC عن طريق تجميع التغييرات وإرسالها بشكل دوري
 */
class DeviceStateSyncService {
    constructor(windowManager, deviceRegistry, options = {}) {
        if (!windowManager) {
            throw new Error('WindowManager is required for DeviceStateSyncService');
        }
        if (!deviceRegistry) {
            throw new Error('DeviceRegistry is required for DeviceStateSyncService');
        }

        this._windowManager = windowManager;
        this._deviceRegistry = deviceRegistry;
        this._interval = options.interval || 1000; // 1 second default
        this._timer = null;
        this._isRunning = false;

        // الحالة المجمعة
        this._state = {
            devices: [],
            timestamp: Date.now()
        };

        // الحالة السابقة للمقارنة (لإطلاق أحداث منفصلة)
        this._previousState = {
            devices: new Map() // deviceId -> deviceData
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

        // تحميل الحالة الأولية وإرسالها فوراً
        this._loadInitialDeviceState();
        this._broadcastState();

        // بدء المؤقت الدوري للإرسال
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
     * الحصول على الحالة الحالية
     */
    getState() {
        return {
            devices: this._state.devices,
            timestamp: this._state.timestamp
        };
    }

    // ============================================================================
    // تحديثات الأجهزة
    // ============================================================================

    onDeviceStateChanged(data) {
        // تحديث الحالة من DeviceRegistry مع التحقق من التغييرات
        this._loadDeviceState();
        // الإرسال يتم دورياً عبر setInterval
    }

    onDevicePaired(data) {
        // تحديث الحالة من DeviceRegistry مع التحقق من التغييرات
        this._loadDeviceState();
        // الإرسال يتم دورياً عبر setInterval
    }

    onDeviceRemoved(data) {
        // تحديث الحالة من DeviceRegistry مع التحقق من التغييرات
        this._loadDeviceState();
        // الإرسال يتم دورياً عبر setInterval
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
     * تحميل حالة الأجهزة من DeviceRegistry مع التحقق من التغييرات
     */
    _loadDeviceState() {
        const devices = this._deviceRegistry.getAllDevices();
        const newDevices = devices.map(device => {
            const runtimeState = this._deviceRegistry.getRuntimeState(device.id);
            return {
                device: device,
                runtimeState: runtimeState || {}
            };
        });

        // التحقق من وجود تغييرات
        if (this._hasStateChanged(newDevices)) {
            this._state.devices = newDevices;
            this._hasChanges = true;
        }
    }

    /**
     * التحقق من تغير حالة الأجهزة
     */
    _hasStateChanged(newDevices) {
        // إذا كان العدد مختلف، فهناك تغيير
        if (newDevices.length !== this._state.devices.length) {
            return true;
        }

        // مقارنة كل جهاز
        for (let i = 0; i < newDevices.length; i++) {
            const newDevice = newDevices[i];
            const oldDevice = this._state.devices[i];

            // التحقق من معرف الجهاز
            if (newDevice.device.id !== oldDevice.device.id) {
                return true;
            }

            // التحقق من الحالة التشغيلية
            const newRuntime = newDevice.runtimeState || {};
            const oldRuntime = oldDevice.runtimeState || {};

            if (newRuntime.status !== oldRuntime.status ||
                newRuntime.adbTarget !== oldRuntime.adbTarget) {
                return true;
            }
        }

        return false;
    }

    /**
     * إرسال الحالة للواجهة
     */
    _broadcastState() {
        if (!this._hasChanges) return;

        const currentState = this.getState();
        
        // إرسال الحالة الموحدة
        this._windowManager.broadcast('device:state:update', currentState);
        
        // مقارنة وإطلاق أحداث منفصلة
        this._diffAndEmitDevices(currentState.devices);
        
        this._hasChanges = false;
        this._state.timestamp = Date.now();
        
        // تحديث الحالة السابقة
        this._updatePreviousState(currentState);
    }

    // ============================================================================
    // Diffing methods لإطلاق أحداث منفصلة
    // ============================================================================

    /**
     * مقارنة حالة الأجهزة وإطلاق أحداث منفصلة
     */
    _diffAndEmitDevices(currentDevices) {
        const currentMap = new Map();
        currentDevices.forEach(d => currentMap.set(d.device.id, d));
        
        // أجهزة جديدة
        for (const [id, deviceData] of currentMap) {
            if (!this._previousState.devices.has(id)) {
                this._windowManager.broadcast('device:added', deviceData);
            }
        }
        
        // أجهزة محذوفة
        for (const id of this._previousState.devices.keys()) {
            if (!currentMap.has(id)) {
                this._windowManager.broadcast('device:removed', { deviceId: id });
            }
        }
        
        // أجهزة تغيرت حالتها
        for (const [id, deviceData] of currentMap) {
            const prev = this._previousState.devices.get(id);
            if (prev && this._deviceStateChanged(prev, deviceData)) {
                this._windowManager.broadcast('device:stateChanged', deviceData);
            }
        }
    }

    /**
     * التحقق من تغيير حالة جهاز
     */
    _deviceStateChanged(prev, current) {
        const prevRuntime = prev.runtimeState || {};
        const currRuntime = current.runtimeState || {};
        
        return prevRuntime.status !== currRuntime.status ||
               prevRuntime.adbTarget !== currRuntime.adbTarget;
    }

    /**
     * تحديث الحالة السابقة
     */
    _updatePreviousState(currentState) {
        this._previousState.devices.clear();
        currentState.devices.forEach(d => {
            this._previousState.devices.set(d.device.id, JSON.parse(JSON.stringify(d)));
        });
    }
}

module.exports = DeviceStateSyncService;
