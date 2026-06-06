// src/main/bootstrap/container.js
'use strict';

// استيراد الـ instance بدلاً من الكلاس
const { errorCentralService } = require('../infrastructure/logging');

const ProcessManager = require('../infrastructure/process');
const DatabaseManager = require('../infrastructure/persistence/DatabaseManager');
const AdbCommandExecutor = require('../infrastructure/adb/AdbCommandExecutor');
const ConnectionService = require('../infrastructure/adb/ConnectionService');
const ProcessRegistry = require('../runtime/processes/ProcessRegistry');
const ProcessSupervisor = require('../runtime/processes/ProcessSupervisor');
const DeviceRegistry = require('../runtime/devices/DeviceRegistry');
const ScrcpyAdapter = require('../infrastructure/streaming/ScrcpyAdapter');
const YtdlpAdapter = require('../infrastructure/media/YtdlpAdapter');
const DeviceOrchestrator = require('../application/orchestrators/DeviceOrchestrator');
const DownloadOrchestrator = require('../application/orchestrators/DownloadOrchestrator');
const ToolPathResolver = require('../infrastructure/tools/ToolPathResolver');
const Device = require('../domain/entities/Device');

class BootstrapContainer {
    constructor() {
        this._services = new Map();
        this._initialized = false;
        this._windowManager = null;
    }

    initialize() {
        if (this._initialized) {
            return this;
        }

        // تهيئة الـ logger أولاً (هام جداً)
        errorCentralService.init();

        const processRegistry = new ProcessRegistry();
        const processSupervisor = new ProcessSupervisor({
            processManager: ProcessManager,
            processRegistry,
            logger: errorCentralService
        });

        const deviceRegistry = new DeviceRegistry();
        const databaseManager = new DatabaseManager();

        const toolPathResolver = new ToolPathResolver({
            logger: errorCentralService
        });

        const adbCommandExecutor = new AdbCommandExecutor({
            processSupervisor,
            logger: errorCentralService,
            toolPathResolver: toolPathResolver
        });

        const connectionService = new ConnectionService({
            adbExecutor: adbCommandExecutor,
            logger: errorCentralService
        });

        // ==================== معالج ADB Devices المتقدم ====================
        connectionService.on('adbDevices', devices => {
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
                if (!deviceRegistry.hasDevice(deviceId)) {
                    const newDevice = new Device({
                        id: deviceId,
                        deviceFriendlyName: device.serial,
                        model: 'Unknown',
                        version: 'Unknown',
                        arch: 'Unknown',
                        isNew: true
                    });
                    deviceRegistry.registerDevice(newDevice);
                }

                // تحديث الحالة التشغيلية (متصل)
                const newStatus = (device.state === 'device') ? 'connected' : (device.state || 'unknown');
                deviceRegistry.updateState(deviceId, {
                    status: newStatus,
                    adbTarget: device.serial,
                    connectionType: device.serial.includes(':') ? 'TCPIP' : 'USB',
                    lastSeen: new Date()
                });

                if (this._windowManager) {
                    this._windowManager.broadcast('device:stateChanged', {
                        deviceId: deviceId,
                        state: newStatus,
                        adbTarget: device.serial
                    });
                }
            }

            // 3. معالجة الأجهزة المفقودة (غير موجودة في القائمة الحالية)
            const allDevices = deviceRegistry.getAllDevices();
            for (const registeredDevice of allDevices) {
                const deviceId = registeredDevice.id;
                const runtimeState = deviceRegistry.getRuntimeState(deviceId);
                
                // إذا كان الجهاز غير موجود في الـ serials الحالية
                if (!currentSerials.has(deviceId)) {
                    // الجهاز غير مسجل (isNew = true) => إزالته بالكامل من السجل
                    if (registeredDevice.isNew === true) {
                        deviceRegistry.removeDevice(deviceId);
                        if (this._windowManager) {
                            this._windowManager.broadcast('device:removed', { deviceId });
                        }
                    } 
                    // الجهاز مسجل (isNew = false) => تحديث حالته إلى offline
                    else if (runtimeState && runtimeState.status !== 'offline') {
                        deviceRegistry.updateState(deviceId, { status: 'offline', lastSeen: new Date() });
                        if (this._windowManager) {
                            this._windowManager.broadcast('device:stateChanged', {
                                deviceId: deviceId,
                                state: 'offline',
                                adbTarget: deviceId
                            });
                        }
                    }
                }
            }
        });

        // ==================== معالج اكتشاف الأجهزة اللاسلكية ====================
        connectionService.on('wirelessServiceFound', (service) => {
            if (!service?.host || !service?.port) return;
            const adbTarget = `${service.host}:${service.port}`;
            let deviceId = deviceRegistry.findDeviceIdByAdbTarget(adbTarget);

            if (!deviceId) {
                deviceId = `wireless-${adbTarget.replace(/:/g, '-')}`;
                if (!deviceRegistry.hasDevice(deviceId)) {
                    const newDevice = new Device({
                        id: deviceId,
                        deviceFriendlyName: service.name || adbTarget,
                        model: 'Unknown',
                        version: 'Unknown',
                        arch: 'Unknown',
                        isNew: true
                    });
                    deviceRegistry.registerDevice(newDevice);
                }
            }

            deviceRegistry.updateState(deviceId, {
                status: 'discovered',
                adbTarget: adbTarget,
                ip: service.host,
                port: service.port,
                connectionType: 'WIRELESS_DISCOVERED',
                lastSeen: new Date()
            });

            if (this._windowManager) {
                this._windowManager.broadcast('device:stateChanged', {
                    deviceId: deviceId,
                    state: 'discovered',
                    adbTarget: adbTarget
                });
            }
        });

        // ==================== باقي معالجات الأحداث ====================
        connectionService.on('pairSuccess', ({ host, pairingCode }) => {
            if (!host) return;
            errorCentralService.info(`Pair success for ${host}`, { source: 'Container' });
            if (this._windowManager) {
                this._windowManager.broadcast('device:paired', { host, pairingCode });
            }
        });

        connectionService.on('connectSuccess', ({ target }) => {
            if (!target) return;
            let deviceId = deviceRegistry.findDeviceIdByAdbTarget(target);
            
            if (!deviceId) {
                deviceId = `device-${target.replace(/:/g, '-')}-${Date.now()}`;
                if (!deviceRegistry.hasDevice(deviceId)) {
                    const newDevice = new Device({
                        id: deviceId,
                        deviceFriendlyName: target,
                        model: 'Unknown',
                        version: 'Unknown',
                        arch: 'Unknown',
                        isNew: true
                    });
                    deviceRegistry.registerDevice(newDevice);
                }
            }
            
            deviceRegistry.updateState(deviceId, {
                status: 'connected',
                adbTarget: target,
                connectionType: 'TCPIP',
                lastSeen: new Date()
            });
            
            if (this._windowManager) {
                this._windowManager.broadcast('device:stateChanged', {
                    deviceId: deviceId,
                    state: 'connected',
                    adbTarget: target
                });
            }
        });

        connectionService.on('disconnect', ({ target }) => {
            if (!target || target === 'all') {
                for (const deviceId of deviceRegistry.getAllDevices().map(d => d.id)) {
                    const state = deviceRegistry.getRuntimeState(deviceId);
                    if (state && state.status === 'connected') {
                        deviceRegistry.updateState(deviceId, { status: 'offline', lastSeen: new Date() });
                        if (this._windowManager) {
                            this._windowManager.broadcast('device:stateChanged', {
                                deviceId: deviceId,
                                state: 'offline'
                            });
                        }
                    }
                }
                return;
            }
            const deviceId = deviceRegistry.findDeviceIdByAdbTarget(target);
            if (deviceId) {
                deviceRegistry.updateState(deviceId, { status: 'offline', lastSeen: new Date() });
                if (this._windowManager) {
                    this._windowManager.broadcast('device:stateChanged', {
                        deviceId: deviceId,
                        state: 'offline',
                        adbTarget: target
                    });
                }
            }
        });

        // ==================== تهيئة المحولات والمنسقين ====================
        const scrcpyAdapter = new ScrcpyAdapter({
            processSupervisor,
            logger: errorCentralService,
            toolPathResolver: toolPathResolver
        });

        const ytdlpAdapter = new YtdlpAdapter({
            processSupervisor,
            logger: errorCentralService,
            toolPathResolver: toolPathResolver
        });

        const deviceOrchestrator = new DeviceOrchestrator({
            deviceRegistry,
            connectionService,
            scrcpyAdapter,
            logger: errorCentralService
        });

        const downloadOrchestrator = new DownloadOrchestrator({
            ytdlpAdapter,
            deviceRegistry,
            logger: errorCentralService
        });

        const { registerIpcHandlers } = require('../infrastructure/ipc');
        registerIpcHandlers(deviceOrchestrator, downloadOrchestrator);

        // ==================== تسجيل الخدمات ====================
        this._services.set('errorCentralService', errorCentralService);
        this._services.set('processManager', ProcessManager);
        this._services.set('processRegistry', processRegistry);
        this._services.set('processSupervisor', processSupervisor);
        this._services.set('deviceRegistry', deviceRegistry);
        this._services.set('databaseManager', databaseManager);
        this._services.set('adbCommandExecutor', adbCommandExecutor);
        this._services.set('connectionService', connectionService);
        this._services.set('scrcpyAdapter', scrcpyAdapter);
        this._services.set('ytdlpAdapter', ytdlpAdapter);
        this._services.set('deviceOrchestrator', deviceOrchestrator);
        this._services.set('downloadOrchestrator', downloadOrchestrator);
        this._services.set('toolPathResolver', toolPathResolver);

        this._initialized = true;
        return this;
    }

    resolve(name) {
        return this._services.get(name) || null;
    }

    setWindowManager(windowManager) {
        this._windowManager = windowManager;
        const ytdlpAdapter = this._services.get('ytdlpAdapter');
        if (ytdlpAdapter && typeof ytdlpAdapter.setWindowManager === 'function') {
            ytdlpAdapter.setWindowManager(windowManager);
        }
    }

    getWindowManager() {
        return this._windowManager;
    }
}

module.exports = new BootstrapContainer();