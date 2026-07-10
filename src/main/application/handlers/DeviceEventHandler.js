// src/main/application/handlers/DeviceEventHandler.js
'use strict';

const Device = require('../../domain/entities/Device');

/**
 * DeviceEventHandler
 * مسؤول عن معالجة جميع أحداث ConnectionService وإدارة حالة الأجهزة
 * 
 * المسؤوليات:
 * - معالجة أحداث ADB (adbDevices, wirelessServiceFound, pairSuccess, connectSuccess, disconnect)
 * - إنشاء كيانات Device وتسجيلها في DeviceRegistry
 * - تحديث حالة الأجهزة في DeviceRegistry
 * - إشعار StateSyncService بشكل موحد
 */
class DeviceEventHandler {
    constructor({ deviceRegistry, stateSyncService, logger = null }) {
        this._deviceRegistry = deviceRegistry;
        this._stateSyncService = stateSyncService;
        this._logger = logger;
    }

    /**
     * إعداد معالجات الأحداث على ConnectionService
     */
    setup(connectionService) {
        connectionService.on('adbDevices', this._handleAdbDevices.bind(this));
        connectionService.on('wirelessServiceFound', this._handleWirelessFound.bind(this));
        connectionService.on('pairSuccess', this._handlePairSuccess.bind(this));
        connectionService.on('connectSuccess', this._handleConnectSuccess.bind(this));
        connectionService.on('disconnect', this._handleDisconnect.bind(this));
    }

    /**
     * تعيين StateSyncService (يتم استدعاؤه بعد إنشاء WindowManager)
     */
    setStateSyncService(stateSyncService) {
        this._stateSyncService = stateSyncService;
    }

    // ============================================================================
    // معالجات الأحداث
    // ============================================================================

    /**
     * معالجة قائمة الأجهزة من ADB
     */
    _handleAdbDevices(devices) {
        if (!Array.isArray(devices)) return;

        // 1. جمع الـ serials الحالية من ADB
        const currentSerials = new Set();
        for (const device of devices) {
            if (device?.serial) currentSerials.add(device.serial);
        }

        // 2. معالجة الأجهزة الموجودة حالياً
        for (const device of devices) {
            if (!device?.serial) continue;
            const deviceId = device.serial;

            // إنشاء كيان الجهاز إذا لم يكن موجوداً
            if (!this._deviceRegistry.hasDevice(deviceId)) {
                const newDevice = new Device({
                    id: deviceId,
                    deviceFriendlyName: device.serial,
                    model: 'Unknown',
                    version: 'Unknown',
                    arch: 'Unknown',
                    isNew: false
                });
                this._deviceRegistry.registerDevice(newDevice);
            }

            // تحديث الحالة التشغيلية (متصل)
            const newStatus = (device.state === 'device') ? 'connected' : (device.state || 'unknown');
            this._deviceRegistry.updateState(deviceId, {
                status: newStatus,
                adbTarget: device.serial,
                connectionType: device.serial.includes(':') ? 'TCPIP' : 'USB',
                lastSeen: new Date()
            });

            this._notifyStateSync('deviceStateChanged', {
                deviceId: deviceId,
                state: newStatus,
                adbTarget: device.serial
            });
        }

        // 3. معالجة الأجهزة المفقودة (غير موجودة في القائمة الحالية)
        const allDevices = this._deviceRegistry.getAllDevices();
        for (const registeredDevice of allDevices) {
            const deviceId = registeredDevice.id;
            const runtimeState = this._deviceRegistry.getRuntimeState(deviceId);
            
            // إذا كان الجهاز غير موجود في الـ serials الحالية
            if (!currentSerials.has(deviceId)) {
                // الجهاز غير مسجل (isNew = true) => إزالته بالكامل من السجل
                if (registeredDevice.isNew === true) {
                    this._deviceRegistry.removeDevice(deviceId);
                    this._notifyStateSync('deviceRemoved', { deviceId });
                } 
                // الجهاز مسجل (isNew = false) => تحديث حالته إلى offline
                else if (runtimeState && runtimeState.status !== 'offline') {
                    this._deviceRegistry.updateState(deviceId, { status: 'offline', lastSeen: new Date() });
                    this._notifyStateSync('deviceStateChanged', {
                        deviceId: deviceId,
                        state: 'offline',
                        adbTarget: deviceId
                    });
                }
            }
        }
    }

    /**
     * معالجة اكتشاف الأجهزة اللاسلكية
     */
    _handleWirelessFound(service) {
        if (!service?.host || !service?.port) return;
        const adbTarget = `${service.host}:${service.port}`;
        let deviceId = this._deviceRegistry.findDeviceIdByAdbTarget(adbTarget);

        if (!deviceId) {
            deviceId = `wireless-${adbTarget.replace(/:/g, '-')}`;
            if (!this._deviceRegistry.hasDevice(deviceId)) {
                const newDevice = new Device({
                    id: deviceId,
                    deviceFriendlyName: service.name || adbTarget,
                    model: 'Unknown',
                    version: 'Unknown',
                    arch: 'Unknown',
                    isNew: false
                });
                this._deviceRegistry.registerDevice(newDevice);
            }
        }

        this._deviceRegistry.updateState(deviceId, {
            status: 'discovered',
            adbTarget: adbTarget,
            ip: service.host,
            port: service.port,
            connectionType: 'WIRELESS_DISCOVERED',
            lastSeen: new Date()
        });

        this._notifyStateSync('deviceStateChanged', {
            deviceId: deviceId,
            state: 'discovered',
            adbTarget: adbTarget
        });
    }

    /**
     * معالجة نجاح الاقتران
     */
    _handlePairSuccess(data) {
        if (!data || !data.host) return;
        const { host, pairingCode } = data;
        this._logger?.info(`Pair success for ${host}`, { source: 'DeviceEventHandler' });
        this._notifyStateSync('devicePaired', { host, pairingCode });
    }

    /**
     * معالجة نجاح الاتصال
     */
    _handleConnectSuccess(data) {
        if (!data || !data.target) return;
        const { target } = data;
        let deviceId = this._deviceRegistry.findDeviceIdByAdbTarget(target);
        
        if (!deviceId) {
            deviceId = `device-${target.replace(/:/g, '-')}-${Date.now()}`;
            if (!this._deviceRegistry.hasDevice(deviceId)) {
                const newDevice = new Device({
                    id: deviceId,
                    deviceFriendlyName: target,
                    model: 'Unknown',
                    version: 'Unknown',
                    arch: 'Unknown',
                    isNew: false
                });
                this._deviceRegistry.registerDevice(newDevice);
            }
        }
        
        this._deviceRegistry.updateState(deviceId, {
            status: 'connected',
            adbTarget: target,
            connectionType: 'TCPIP',
            lastSeen: new Date()
        });
        
        this._notifyStateSync('deviceStateChanged', {
            deviceId: deviceId,
            state: 'connected',
            adbTarget: target
        });
    }

    /**
     * معالجة قطع الاتصال
     */
    _handleDisconnect(data) {
        const target = data?.target;
        if (!target || target === 'all') {
            for (const deviceId of this._deviceRegistry.getAllDevices().map(d => d.id)) {
                const state = this._deviceRegistry.getRuntimeState(deviceId);
                if (state && state.status === 'connected') {
                    this._deviceRegistry.updateState(deviceId, { status: 'offline', lastSeen: new Date() });
                    this._notifyStateSync('deviceStateChanged', {
                        deviceId: deviceId,
                        state: 'offline'
                    });
                }
            }
            return;
        }
        const deviceId = this._deviceRegistry.findDeviceIdByAdbTarget(target);
        if (deviceId) {
            this._deviceRegistry.updateState(deviceId, { status: 'offline', lastSeen: new Date() });
            this._notifyStateSync('deviceStateChanged', {
                deviceId: deviceId,
                state: 'offline',
                adbTarget: target
            });
        }
    }

    // ============================================================================
    // Internal methods
    // ============================================================================

    /**
     * إشعار StateSyncService بشكل موحد
     */
    _notifyStateSync(eventType, data) {
        if (!this._stateSyncService) return;

        try {
            switch (eventType) {
                case 'deviceStateChanged':
                    this._stateSyncService.onDeviceStateChanged(data);
                    break;
                case 'deviceRemoved':
                    this._stateSyncService.onDeviceRemoved(data);
                    break;
                case 'devicePaired':
                    this._stateSyncService.onDevicePaired(data);
                    break;
                default:
                    this._logger?.warn(`Unknown event type: ${eventType}`, { source: 'DeviceEventHandler' });
            }
        } catch (error) {
            this._logger?.error(`Error in _notifyStateSync for event ${eventType}:`, error, { source: 'DeviceEventHandler' });
        }
    }
}

module.exports = DeviceEventHandler;
