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
const DeviceStateSyncService = require('../infrastructure/sync/DeviceStateSyncService');
const DownloadStateSyncService = require('../infrastructure/sync/DownloadStateSyncService');
const DeviceOrchestrator = require('../application/orchestrators/DeviceOrchestrator');
const DownloadOrchestrator = require('../application/orchestrators/DownloadOrchestrator');
const FileTransferService = require('../application/services/FileTransferService');
const ToolPathResolver = require('../infrastructure/tools/ToolPathResolver');
const DeviceEventHandler = require('../application/handlers/DeviceEventHandler');

class BootstrapContainer {
    constructor() {
        this._services = new Map();
        this._initialized = false;
        this._windowManager = null;
        this._stateSyncService = null;
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

        // ==================== تهيئة DeviceEventHandler ====================
        const deviceEventHandler = new DeviceEventHandler({
            deviceRegistry,
            stateSyncService: null, // سيتم تعيينه لاحقاً في setWindowManager
            logger: errorCentralService
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

        const fileTransferService = new FileTransferService({
            adbExecutor: adbCommandExecutor,
            logger: errorCentralService
        });

        const downloadOrchestrator = new DownloadOrchestrator({
            ytdlpAdapter,
            deviceRegistry,
            fileTransferService,
            logger: errorCentralService
        });


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
        this._services.set('fileTransferService', fileTransferService);
        this._services.set('toolPathResolver', toolPathResolver);
        this._services.set('deviceEventHandler', deviceEventHandler);

        this._initialized = true;
        return this;
    }

    resolve(name) {
        return this._services.get(name) || null;
    }

    setWindowManager(windowManager) {
        this._windowManager = windowManager;
        
        // إنشاء الخدمات المنفصلة
        const deviceRegistry = this._services.get('deviceRegistry');
        
        // DeviceStateSyncService - تحديث عند التغييرات فقط
        this._deviceStateSyncService = new DeviceStateSyncService(windowManager, deviceRegistry, { interval: 1000 });
        this._deviceStateSyncService.start();
        
        // DownloadStateSyncService - تحديث كل 0.3 ثانية
        this._downloadStateSyncService = new DownloadStateSyncService(windowManager, { interval: 300 });
        this._downloadStateSyncService.start();
        
        // تمرير DeviceStateSyncService لـ DeviceEventHandler
        const deviceEventHandler = this._services.get('deviceEventHandler');
        if (deviceEventHandler && typeof deviceEventHandler.setStateSyncService === 'function') {
            deviceEventHandler.setStateSyncService(this._deviceStateSyncService);
        }
        
        // الاشتراك في أحداث YtdlpAdapter مع DownloadStateSyncService
        const ytdlpAdapter = this._services.get('ytdlpAdapter');
        if (ytdlpAdapter) {
            ytdlpAdapter.on('downloadProgress', (data) => {
                this._downloadStateSyncService.onDownloadProgress(data);
            });
            ytdlpAdapter.on('downloadComplete', (data) => {
                this._downloadStateSyncService.onDownloadComplete(data);
            });
            ytdlpAdapter.on('downloadError', (data) => {
                this._downloadStateSyncService.onDownloadError(data);
            });
            ytdlpAdapter.on('downloadStopped', (data) => {
                this._downloadStateSyncService.onDownloadStopped(data);
            });
        }
        
        // تسجيل الخدمات المنفصلة
        this._services.set('deviceStateSyncService', this._deviceStateSyncService);
        this._services.set('downloadStateSyncService', this._downloadStateSyncService);
    }

    getWindowManager() {
        return this._windowManager;
    }
}

module.exports = new BootstrapContainer();