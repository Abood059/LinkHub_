'use strict';

const ErrorCentralService =
    require(
        '../infrastructure/logging'
    );

const ProcessManager =
    require(
        '../infrastructure/process'
    );

const DatabaseManager =
    require(
        '../infrastructure/persistence/DatabaseManager'
    );

const AdbCommandExecutor =
    require(
        '../infrastructure/adb/AdbCommandExecutor'
    );

const ConnectionService =
    require(
        '../infrastructure/adb/ConnectionService'
    );

const ProcessRegistry =
    require(
        '../runtime/processes/ProcessRegistry'
    );

const ProcessSupervisor =
    require(
        '../runtime/processes/ProcessSupervisor'
    );

const DeviceRegistry =
    require(
        '../runtime/devices/DeviceRegistry'
    );

// --- المكونات الجديدة للمرحلة الخامسة ---
const ScrcpyAdapter =
    require(
        '../infrastructure/streaming/ScrcpyAdapter'
    );

const YtdlpAdapter =
    require(
        '../infrastructure/media/YtdlpAdapter'
    );

const DeviceOrchestrator =
    require(
        '../application/orchestrators/DeviceOrchestrator'
    );

const DownloadOrchestrator =
    require(
        '../application/orchestrators/DownloadOrchestrator'
    );

class BootstrapContainer {
    constructor() {
        this._services =
            new Map();

        this._initialized =
            false;
    }

    initialize() {
        if (
            this._initialized
        ) {
            return this;
        }

        const processRegistry =
            new ProcessRegistry();

        const processSupervisor =
            new ProcessSupervisor({
                processManager:
                    ProcessManager,
                processRegistry,
                logger:
                    ErrorCentralService
            });

        const deviceRegistry =
            new DeviceRegistry();

        const databaseManager =
            new DatabaseManager();

        const adbCommandExecutor =
            new AdbCommandExecutor({
                processSupervisor,
                logger:
                    ErrorCentralService
            });

        const connectionService =
            new ConnectionService({
                adbExecutor:
                    adbCommandExecutor,
                logger:
                    ErrorCentralService
            });

        // --- ربط أحداث ConnectionService مع DeviceRegistry (المهمة 0) ---

        // 1. حدث الأجهزة المكتشفة عبر ADB (USB أو TCP/IP المتصل)
        connectionService.on(
            'adbDevices',
            devices => {
                if (
                    !Array.isArray(
                        devices
                    )
                ) {
                    return;
                }

                for (
                    const device of devices
                ) {
                    if (
                        !device ||
                        !device.serial
                    ) {
                        continue;
                    }

                    deviceRegistry
                        .updateState(
                            device.serial,
                            {
                                status:
                                    device.state ||
                                    'unknown',
                                adbTarget:
                                    device.serial,
                                lastSeen:
                                    new Date()
                            }
                        );
                }
            }
        );

        // 2. حدث اكتشاف جهاز لاسلكي عبر mDNS (قبل الاقتران)
        connectionService.on('wirelessServiceFound', (service) => {
            if (!service || !service.host || !service.port) return;

            const adbTarget = `${service.host}:${service.port}`;
            // نبحث عن جهاز موجود بنفس الهدف
            let deviceId = deviceRegistry.findDeviceIdByAdbTarget(adbTarget);

            if (!deviceId) {
                // جهاز جديد غير مسجل بعد – لا ننشئ Device كامل هنا، فقط نحدث الحالة التشغيلية
                // سنستخدم عنوان الهدف كمعرف مؤقت لحين الاقتران الفعلي
                deviceId = `wireless-${adbTarget.replace(/:/g, '-')}`;
                // تسجيل حالة تشغيلية فقط (بدون Device entity) لتظهر في الواجهة كجهاز مكتشف
                deviceRegistry.updateState(deviceId, {
                    status: 'discovered',
                    adbTarget: adbTarget,
                    ip: service.host,
                    port: service.port,
                    connectionType: 'WIRELESS_DISCOVERED',
                    lastSeen: new Date()
                });
                // ملاحظة: لم يتم استدعاء registerDevice، لذلك هذا الجهاز لن يظهر في getAllDevices()
                // إلا إذا أردنا ذلك. لكن يمكن للواجهة عرض runtimeStates مباشرة إذا احتاجت.
                // لتجنب التعقيد، سنكتفي بتحديث الحالة فقط.
            } else {
                deviceRegistry.updateState(deviceId, {
                    status: 'discovered',
                    ip: service.host,
                    port: service.port,
                    lastSeen: new Date()
                });
            }
        });

        // 3. حدث نجاح الاقتران (pair)
        connectionService.on('pairSuccess', ({ host, pairingCode }) => {
            if (!host) return;
            // host مثال "192.168.1.10:37000" – قد لا يكون هو هدف الاتصال النهائي
            // نقوم بتحديث الحالة لأي جهاز له adbTarget يبدأ بنفس المضيف (بدون منفذ الاقتران)
            const baseHost = host.split(':')[0];
            // نبحث في runtimeStates عن أي جهاز adbTarget يبدأ بـ baseHost
            // هذا تقريبي، لكن الأفضل انتظار حدث connectSuccess الذي يعطي الهدف النهائي.
            // نكتفي بتسجيل الاقتران كملاحظة:
            console.log(`[Container] Pair success for ${host}`);
        });

        // 4. حدث نجاح الاتصال (connect) – بعد الاقتران أو الاتصال المباشر
        connectionService.on('connectSuccess', ({ target }) => {
            if (!target) return;
            // target مثال "192.168.1.10:5555"
            let deviceId = deviceRegistry.findDeviceIdByAdbTarget(target);
            if (!deviceId) {
                // جهاز غير مسجل بعد – ننشئ معرف مؤقت
                deviceId = `device-${target.replace(/:/g, '-')}-${Date.now()}`;
                // نقوم بتحديث الحالة فقط، بدون كيان Device. سيتم إنشاء Device حقيقي
                // عندما يقوم DeviceOrchestrator.connectDevice باستدعاء registerDevice.
                // هنا نحن ننبه الـ registry أن هذا الجهاز أصبح متصلاً.
            }
            deviceRegistry.updateState(deviceId, {
                status: 'connected',
                adbTarget: target,
                connectionType: 'TCPIP',
                lastSeen: new Date()
            });
        });

        // 5. حدث قطع الاتصال
        connectionService.on('disconnect', ({ target }) => {
            if (!target || target === 'all') {
                // قطع كل الأجهزة – نبحث عن كل الأجهزة المتصلة ونحدثها
                for (const deviceId of deviceRegistry.getAllDevices().map(d => d.id)) {
                    const state = deviceRegistry.getRuntimeState(deviceId);
                    if (state && state.status === 'connected') {
                        deviceRegistry.updateState(deviceId, { status: 'offline' });
                    }
                }
                return;
            }
            const deviceId = deviceRegistry.findDeviceIdByAdbTarget(target);
            if (deviceId) {
                deviceRegistry.updateState(deviceId, { status: 'offline' });
            }
        });

        // --- إنشاء محولات Infrastructure ---
        const scrcpyAdapter = new ScrcpyAdapter({
            processSupervisor,
            scrcpyPath: 'scrcpy',
            logger: ErrorCentralService
        });

        const ytdlpAdapter = new YtdlpAdapter({
            processSupervisor,
            ytDlpPath: 'yt-dlp',
            logger: ErrorCentralService
        });

        // --- إنشاء الـ Orchestrators (طبقة Application) ---
        const deviceOrchestrator = new DeviceOrchestrator({
            deviceRegistry,
            connectionService,
            scrcpyAdapter,
            logger: ErrorCentralService
        });

        const downloadOrchestrator = new DownloadOrchestrator({
            ytdlpAdapter,
            deviceRegistry,
            logger: ErrorCentralService
        });

        // --- تسجيل طبقة IPC الرقيقة (المرحلة 6) ---
        const { registerIpcHandlers } = require('../infrastructure/ipc');
        registerIpcHandlers(deviceOrchestrator, downloadOrchestrator);

        // --- تسجيل جميع الخدمات في الخريطة ---
        this._services.set(
            'errorCentralService',
            ErrorCentralService
        );

        this._services.set(
            'processManager',
            ProcessManager
        );

        this._services.set(
            'processRegistry',
            processRegistry
        );

        this._services.set(
            'processSupervisor',
            processSupervisor
        );

        this._services.set(
            'deviceRegistry',
            deviceRegistry
        );

        this._services.set(
            'databaseManager',
            databaseManager
        );

        this._services.set(
            'adbCommandExecutor',
            adbCommandExecutor
        );

        this._services.set(
            'connectionService',
            connectionService
        );

        // --- تسجيل المكونات الجديدة ---
        this._services.set(
            'scrcpyAdapter',
            scrcpyAdapter
        );

        this._services.set(
            'ytdlpAdapter',
            ytdlpAdapter
        );

        this._services.set(
            'deviceOrchestrator',
            deviceOrchestrator
        );

        this._services.set(
            'downloadOrchestrator',
            downloadOrchestrator
        );

        this._initialized =
            true;

        return this;
    }

    resolve(name) {
        return (
            this._services.get(
                name
            ) || null
        );
    }
}

module.exports =
    new BootstrapContainer();