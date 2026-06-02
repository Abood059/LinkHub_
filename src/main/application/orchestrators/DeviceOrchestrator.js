'use strict';

const Device = require('../../domain/entities/Device');

/**
 * DeviceOrchestrator
 * مسؤول عن تنسيق عمليات الأجهزة:
 * - الاقتران والاتصال
 * - إدارة الحالة في DeviceRegistry
 * - تشغيل وإيقاف انعكاس الشاشة
 * 
 * لا يحتوي على أي منطق تنفيذ تقني (لا spawn، لا child_process، لا ADB مباشر)
 */
class DeviceOrchestrator {
    constructor({ deviceRegistry, connectionService, scrcpyAdapter, logger = null }) {
        this._deviceRegistry = deviceRegistry;
        this._connectionService = connectionService;
        this._scrcpyAdapter = scrcpyAdapter;
        this._logger = logger;
    }

    /**
     * الاقتران بجهاز لاسلكي باستخدام رمز الاقتران
     * @param {string} host - العنوان والمنفذ مثلاً "192.168.1.10:37000"
     * @param {string} pairingCode - رمز من 6 أرقام
     */
    async pairDevice(host, pairingCode) {
        if (!host || !pairingCode) {
            throw new Error('Host and pairing code are required');
        }
        return this._connectionService.pair(host, pairingCode);
    }

    /**
     * الاتصال بجهاز (USB أو TCP/IP)
     * @param {string} target - serial لـ USB أو host:port لـ TCP/IP
     * @param {string} friendlyName - اسم ودي اختياري
     */
    async connectDevice(target, friendlyName = null) {
        if (!target) {
            throw new Error('Target is required');
        }

        // تحديد نوع الاتصال
        const connectionType = target.includes(':') ? 'TCPIP' : 'USB';
        
        // إذا كان TCP/IP، ننفذ أمر الاتصال عبر ADB
        if (connectionType === 'TCPIP') {
            await this._connectionService.connect(target);
        }

        // إنشاء كيان الجهاز
        const deviceId = `device-${target.replace(/:/g, '-')}-${Date.now()}`;
        const device = new Device({
            id: deviceId,
            deviceFriendlyName: friendlyName || target,
            model: 'Unknown',
            version: 'Unknown',
            arch: 'Unknown',
            isNew: !this._deviceRegistry.hasDevice(deviceId)
        });

        // تسجيل الجهاز في الـ Registry
        this._deviceRegistry.registerDevice(device);
        
        // تحديث الحالة التشغيلية
        this._deviceRegistry.updateState(device.id, {
            status: 'connected',
            adbTarget: target,
            connectionType,
            lastSeen: new Date()
        });

        return device;
    }

    /**
     * بدء انعكاس الشاشة لجهاز معين
     * @param {string} deviceId - معرف الجهاز المسجل في الـ Registry
     * @param {Object} options - إعدادات إضافية (fullscreen, bitrate, etc.)
     */
    startStreaming(deviceId, options = {}) {
        const device = this._deviceRegistry.getDevice(deviceId);
        if (!device) {
            throw new Error(`Device ${deviceId} not found`);
        }

        const runtimeState = this._deviceRegistry.getRuntimeState(deviceId);
        const adbTarget = runtimeState?.adbTarget || device.id;

        return this._scrcpyAdapter.startMirroring(adbTarget, options);
    }

    /**
     * إيقاف انعكاس الشاشة لجهاز معين
     * @param {string} deviceId - معرف الجهاز
     */
    stopStreaming(deviceId) {
        return this._scrcpyAdapter.stopMirroring(deviceId);
    }

    /**
     * الحصول على جهاز مسجل
     */
    getDevice(deviceId) {
        return this._deviceRegistry.getDevice(deviceId);
    }

    /**
     * الحصول على جميع الأجهزة المسجلة مع حالتها
     */
    getAllDevices() {
        return this._deviceRegistry.getAllDevices().map(device => ({
            device: device.toJSON(),
            runtimeState: this._deviceRegistry.getRuntimeState(device.id)?.toJSON() || null
        }));
    }
}

module.exports = DeviceOrchestrator;