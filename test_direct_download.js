// test_direct_download.js
'use strict';

const path = require('path');
const fs = require('fs').promises;
const YTDlpWrap = require('yt-dlp-wrap-plus').default;

async function testDirectDownload() {
    console.log('=== Direct yt-dlp Download Test ===\n');

    const testDir = path.join(__dirname, 'test-direct-download');
    await fs.mkdir(testDir, { recursive: true });
    console.log('📁 Output directory:', testDir);
    console.log('📁 Absolute path:', path.resolve(testDir));

    try {
        await fs.access(testDir, fs.constants.W_OK);
        console.log('✅ Output path is writable\n');
    } catch (err) {
        console.error('❌ Cannot write to output path:', err.message);
        process.exit(1);
    }

    const ytDlpWrap = new YTDlpWrap('yt-dlp');
    const controller = new AbortController();

    const testUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    const formatId = 'worst';

    console.log('=== Test Configuration ===');
    console.log('URL:', testUrl);
    console.log('Format:', formatId);
    console.log('Timeout: 90 seconds\n');

    const outputTemplate = path.join(testDir, '%(title)s.%(ext)s');
    console.log('Output template:', outputTemplate);

    const args = [
        '--ignore-config',
        '--print', 'after_move:filepath',
        '-f', formatId,
        '-o', outputTemplate,
        '--newline',
        testUrl
    ];

    console.log('Args:', args);
    console.log('\nStarting download...\n');

    let actualFilePath = null;
    let stderrOutput = [];

    try {
        const emitter = ytDlpWrap.exec(args, {}, controller.signal);

        emitter.on('ytDlpEvent', (type, data) => {
            if (type === 'print') {
                actualFilePath = data.trim();
                console.log('📄 Actual file path:', actualFilePath);
            }
            if (type === 'stderr') {
                stderrOutput.push(data);
                console.log('⚠ STDERR:', data);
            }
        });

        const result = await new Promise((resolve, reject) => {
            let timeoutId;
            
            emitter.on('close', async (code) => {
                if (timeoutId) clearTimeout(timeoutId);
                
                try {
                    const files = await fs.readdir(testDir);
                    console.log('\nFiles in directory:', files);
                    
                    for (const file of files) {
                        const filePath = path.join(testDir, file);
                        const stats = await fs.stat(filePath);
                        console.log(`  - ${file}: ${stats.size} bytes`);
                    }
                    
                    controller.abort();
                    resolve({ code, files, actualFilePath });
                } catch (err) {
                    controller.abort();
                    resolve({ code, files: [], actualFilePath });
                }
            });

            emitter.on('error', (err) => {
                if (timeoutId) clearTimeout(timeoutId);
                controller.abort();
                reject(err);
            });

            timeoutId = setTimeout(() => {
                controller.abort();
                resolve({ code: 'timeout', files: [], actualFilePath });
            }, 90000);
        });

        console.log('\n=== Results ===');
        console.log('Exit code:', result.code);
        console.log('Files found:', result.files.length);
        console.log('Files:', result.files);

        if (result.files.length > 0) {
            console.log('\n✅ SUCCESS: Files downloaded');
        } else {
            console.log('\n❌ FAILURE: No files found');
        }

    } catch (err) {
        console.error('❌ Test failed:', err);
        process.exit(1);
    } finally {
        controller.abort();
    }
}

testDirectDownload().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
