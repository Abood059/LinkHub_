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
const DownloadSyncService = require('../infrastructure/sync/DownloadSyncService');
const DeviceOrchestrator = require('../application/orchestrators/DeviceOrchestrator');
const DownloadOrchestrator = require('../application/orchestrators/DownloadOrchestrator');
const FileTransferService = require('../application/services/FileTransferService');
const ToolPathResolver = require('../infrastructure/tools/ToolPathResolver');
const PathService = require('../infrastructure/path/PathService');
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

        // Initialize PathService first
        const pathService = new PathService({
            logger: errorCentralService
        });

        // تهيئة الـ logger أولاً (هام جداً)
        errorCentralService.init({
            pathService: pathService
        });

        const processRegistry = new ProcessRegistry();
        const processSupervisor = new ProcessSupervisor({
            processManager: ProcessManager,
            processRegistry,
            logger: errorCentralService
        });

        const databaseManager = new DatabaseManager({
            pathService: pathService
        });
        const deviceRegistry = new DeviceRegistry({ deviceRepository: null }); // Will be set after DB init

        const toolPathResolver = new ToolPathResolver({
            logger: errorCentralService,
            appRoot: pathService.getAppRoot()
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
            toolPathResolver: toolPathResolver,
            pathService: pathService
        });

        const deviceOrchestrator = new DeviceOrchestrator({
            deviceRegistry,
            connectionService,
            scrcpyAdapter,
            deviceRepository: null, // Will be set after DB init
            logger: errorCentralService
        });

        const fileTransferService = new FileTransferService({
            adbExecutor: adbCommandExecutor,
            logger: errorCentralService
        });

        const downloadOrchestrator = new DownloadOrchestrator({
            ytdlpAdapter,
            downloadManager: ytdlpAdapter._downloadManager,
            deviceRegistry,
            fileTransferService,
            logger: errorCentralService
        });


        // ==================== تسجيل الخدمات ====================
        this._services.set('errorCentralService', errorCentralService);
        this._services.set('pathService', pathService);
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

        // DownloadStateSyncService - تحديث كل 0.3 ثانية من الذاكرة
        const ytdlpAdapter = this._services.get('ytdlpAdapter');
        const downloadManager = ytdlpAdapter ? ytdlpAdapter._downloadManager : null;
        this._downloadStateSyncService = new DownloadStateSyncService(windowManager, downloadManager, { interval: 300 });
        this._downloadStateSyncService.start();

        // تمرير DeviceStateSyncService لـ DeviceEventHandler
        const deviceEventHandler = this._services.get('deviceEventHandler');
        if (deviceEventHandler && typeof deviceEventHandler.setStateSyncService === 'function') {
            deviceEventHandler.setStateSyncService(this._deviceStateSyncService);
        }

        // ملاحظة: تم إزالة الاشتراك في أحداث YtdlpAdapter
        // DownloadStateSyncService هو المصدر الوحيد للحقيقة لمزامنة الحالة
        // DownloadStateSyncService يقرأ الحالة من الذاكرة (DownloadManager._activeDownloads) دورياً كل 300ms

        // تسجيل الخدمات المنفصلة
        this._services.set('deviceStateSyncService', this._deviceStateSyncService);
        this._services.set('downloadStateSyncService', this._downloadStateSyncService);
    }

    /**
     * Set repositories after database initialization
     * This is called after databaseManager.initDb() completes
     */
    setRepositories() {
        const databaseManager = this._services.get('databaseManager');
        if (!databaseManager || !databaseManager.isInitialized()) {
            console.warn('[Container] Database not initialized, cannot set repositories');
            return;
        }

        const deviceRepository = databaseManager.devices;
        const downloadRepository = databaseManager.downloads;

        // Update DeviceRegistry with repository
        const deviceRegistry = this._services.get('deviceRegistry');
        if (deviceRegistry) {
            deviceRegistry._deviceRepository = deviceRepository;
        }

        // Update DeviceOrchestrator with repository
        const deviceOrchestrator = this._services.get('deviceOrchestrator');
        if (deviceOrchestrator) {
            deviceOrchestrator._deviceRepository = deviceRepository;
        }

        // ==================== تهيئة DownloadSyncService ====================
        // خدمة مزامنة دورية مستقلة للتحميلات بين الذاكرة وقاعدة البيانات
        // تقرأ الذاكرة كل 300ms وتكتب التغييرات فقط إلى قاعدة البيانات
        const ytdlpAdapter = this._services.get('ytdlpAdapter');
        const pathService = this._services.get('pathService');
        const downloadSyncService = new DownloadSyncService(
            ytdlpAdapter._downloadManager,
            downloadRepository,
            errorCentralService,
            pathService
        );
        downloadSyncService.start();
        this._services.set('downloadSyncService', downloadSyncService);

        console.log('[Container] Repositories set successfully');
    }

    getWindowManager() {
        return this._windowManager;
    }
}

module.exports = new BootstrapContainer();