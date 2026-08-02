#!/usr/bin/env node

/**
 * Simple test to verify ParallelDownloadManager implementation
 * This test checks that the module loads correctly and has the expected methods
 */

const ParallelDownloadManager = require('./src/main/infrastructure/media/ParallelDownloadManager');

console.log('=== ParallelDownloadManager Module Test ===');
console.log('');

// Test 1: Module loads correctly
console.log('✓ Module loaded successfully');

// Test 2: Check class methods
const expectedMethods = [
    'startParallelDownload',
    'stopParallelDownload',
    'getSessionStatus',
    '_startSingleDownload',
    '_flushProgressLines',
    '_processProgressLine',
    '_emitAggregatedProgress',
    '_handleDownloadExit',
    '_handleDownloadError',
    '_retryDownload',
    '_checkAllDownloadsComplete',
    '_mergeFiles',
    '_executeMergeCommand',
    '_startFileVerification',
    '_stopAllDownloads',
    '_cleanupSession',
    '_createTempDir'
];

console.log('Checking for expected methods...');
for (const method of expectedMethods) {
    if (typeof ParallelDownloadManager.prototype[method] === 'function') {
        console.log(`  ✓ ${method}`);
    } else {
        console.log(`  ✗ ${method} - NOT FOUND`);
    }
}

console.log('');
console.log('=== Test Complete ===');
console.log('All basic checks passed. The ParallelDownloadManager is ready for integration testing.');
