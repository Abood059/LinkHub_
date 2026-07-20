// test_download.js - ملف اختبار CLI لعملية التحميل
const DatabaseManager = require('./src/main/infrastructure/persistence/DatabaseManager');
const DownloadOrchestrator = require('./src/main/application/orchestrators/DownloadOrchestrator');
const YtdlpAdapter = require('./src/main/infrastructure/media/YtdlpAdapter');
const ProcessSupervisor = require('./src/main/runtime/processes/ProcessSupervisor');
const ToolPathResolver = require('./src/main/infrastructure/tools/ToolPathResolver');
const LoggerContext = require('./src/main/infrastructure/logging/LoggerContext');

async function runTest() {
    console.log('[Test] Initializing test environment...');
    
    try {
        // تهيئة قاعدة البيانات
        const dbManager = new DatabaseManager();
        await dbManager.initDb();
        console.log('[Test] Database initialized');

        // تهيئة المسجل
        const logger = new LoggerContext();
        await logger.init();

        // تهيئة أدوات النظام
        const toolPathResolver = new ToolPathResolver();
        const processSupervisor = new ProcessSupervisor({ logger });

        // تهيئة YtdlpAdapter
        const ytdlpAdapter = new YtdlpAdapter({
            processSupervisor,
            toolPathResolver,
            downloadRepository: dbManager.downloads,
            logger
        });

        // تهيئة DownloadOrchestrator
        const downloadOrchestrator = new DownloadOrchestrator({
            ytdlpAdapter,
            logger
        });

        // إعداد مستمعي الأحداث
        ytdlpAdapter.on('downloadProgress', (data) => {
            console.log(`[Test] Progress: ${data.percent}% - Speed: ${data.speed} - Size: ${data.size}`);
        });

        ytdlpAdapter.on('downloadComplete', (data) => {
            console.log('[Test] Download completed:', data);
        });

        ytdlpAdapter.on('downloadError', (data) => {
            console.error('[Test] Download error:', data.error);
        });

        ytdlpAdapter.on('downloadStopped', (data) => {
            console.log('[Test] Download stopped:', data.downloadId);
        });

        // بدء الاختبار
        const testUrl = 'https://youtu.be/t_TfkRSFdNs?si=c2LLd-en8k3Iwy7U';
        const formatId = '137'; // 1080p
        
        console.log('[Test] Starting download with URL:', testUrl);
        console.log('[Test] Format ID:', formatId);

        // الحصول على المعلومات أولاً
        console.log('[Test] Fetching video metadata...');
        const metadata = await downloadOrchestrator.getMetadata(testUrl);
        console.log('[Test] Video title:', metadata.title);
        console.log('[Test] Available formats:', metadata.formats?.length || 0);

        // بدء التحميل
        console.log('[Test] Starting download...');
        const downloadResult = await downloadOrchestrator.startDownload(
            testUrl,
            formatId,
            null,
            { title: metadata.title }
        );

        console.log('[Test] Download started successfully:', downloadResult);

        // الانتظار قليلاً ثم إيقاف التحميل للاختبار
        console.log('[Test] Waiting 5 seconds before stopping...');
        await new Promise(resolve => setTimeout(resolve, 5000));

        const processId = downloadResult.processId || 'ytdlp-dl-' + Date.now();
        console.log('[Test] Stopping download:', processId);
        await downloadOrchestrator.stopDownload(processId);

        console.log('[Test] Test completed successfully');

        // إغلاق قاعدة البيانات
        await dbManager.close();

    } catch (error) {
        console.error('[Test] Test failed:', error);
        process.exit(1);
    }
}

// تشغيل الاختبار
runTest().then(() => {
    console.log('[Test] Exiting...');
    process.exit(0);
}).catch((error) => {
    console.error('[Test] Fatal error:', error);
    process.exit(1);
});
