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