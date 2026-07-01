// src/cli/download.js
'use strict';

const container = require('../main/bootstrap/container');
const { MESSAGES } = require('./constants');

async function downloadVideo(url, quality) {
    try {
        // Initialize container
        container.initialize();
        container._windowManager = null;
        container._stateSyncService = null;

        // Resolve required services
        const downloadOrchestrator = container.resolve('downloadOrchestrator');
        const databaseManager = container.resolve('databaseManager');

        console.log(`Starting local download...`);
        console.log(`URL: ${url}`);
        console.log(`Quality: ${quality || 'best'}`);

        // Start download locally (without device)
        try {
            const result = await downloadOrchestrator.startDownload(url, quality || 'best', null);
            console.log(`✓ Download started: ${result.processId}`);
        } catch (error) {
            console.error(`✗ Failed to start download: ${error.message}`);
            process.exit(1);
        }

        // Close database
        await databaseManager.close();

        console.log('Download process initiated successfully.');
        process.exit(0);

    } catch (error) {
        console.error('Fatal error:', error.message);
        process.exit(1);
    }
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length < 1) {
    console.log('Usage: npm run download <url> [quality]');
    console.log('Example: npm run download https://youtube.com/watch?v=xxx 720');
    console.log('Example: npm run download https://youtube.com/watch?v=xxx best');
    process.exit(1);
}

const url = args[0];
const quality = args[1] || 'best';

downloadVideo(url, quality);
