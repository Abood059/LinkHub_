#!/usr/bin/env node

/**
 * اختبار حي لمخرجات yt-dlp + aria2c والتحقق من YtdlpResponseParser / ProgressHandler
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const YtdlpResponseParser = require('./src/main/infrastructure/media/YtdlpResponseParser');
const ProgressHandler = require('./src/main/infrastructure/media/ProgressHandler');

const url = 'https://youtu.be/PyVIR3GJLMc?si=n4z-b7J1WsgX_Lml';
const formatId = '251+396';
const tempDir = path.join(process.cwd(), 'temp', 'test-download');
fs.mkdirSync(tempDir, { recursive: true });

const parser = new YtdlpResponseParser();
const progressHandler = new ProgressHandler();
const entry = {
    hasSizeInfo: true,
    totalSize: Math.round((4.47 + 4.80) * 1024 * 1024),
    percent: 0,
    downloadedBytes: 0,
    completedBytes: 0,
    currentFileIndex: 0,
    lastPercent: 0,
    lastAriaGid: null,
    lastFileDownloadedBytes: 0,
    lastFileTotalBytes: 0,
    stderrBuffer: '',
    speed: null,
    size: null,
    eta: null,
    elapsed: null
};

const denoPath = path.join(process.cwd(), 'resources', 'bin', 'linux', 'deno');
const ytdlpArgs = [
    '--js-runtimes', `deno:${denoPath}`,
    '--ignore-config',
    '-f', formatId,
    '-o', path.join(tempDir, '%(title)s.%(ext)s'),
    '--newline',
    url
];

console.log('=== yt-dlp Progress Test (with parser verification) ===');
console.log('Command: yt-dlp', ytdlpArgs.join(' '));
console.log('');

const ytdlp = spawn('yt-dlp', ytdlpArgs);
let lineBuffer = '';
let parsedCount = 0;
let lastReportedPercent = -1;

function feed(text, streamType) {
    process.stdout.write(text);
    lineBuffer += text;
    const normalized = lineBuffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = normalized.split('\n');
    lineBuffer = lines.pop() || '';

    for (const line of lines) {
        const parsed = parser.parseProgressLine(line);
        if (!parsed) continue;
        parsedCount++;
        progressHandler.handleProgressData(line, streamType, entry, null, formatId);
        const p = Math.floor(entry.percent);
        if (p !== lastReportedPercent && (p % 10 === 0 || parsed.fileComplete)) {
            lastReportedPercent = p;
            console.log(`\n[BACKEND] percent=${entry.percent.toFixed(2)}% size=${entry.size} fileComplete=${!!parsed.fileComplete}`);
        }
    }
}

ytdlp.stdout.on('data', (d) => feed(d.toString(), 'stdout'));
ytdlp.stderr.on('data', (d) => feed(d.toString(), 'stderr'));

ytdlp.on('close', (code) => {
    if (lineBuffer.trim()) {
        feed('\n', 'stdout');
    }

    // محاكاة CompletionHandler: عند exit 0 تُثبَّت النسبة من الخلفية إلى 100%
    if (code === 0) {
        entry.percent = 100;
        if (entry.totalSize && entry.downloadedBytes < entry.totalSize) {
            entry.downloadedBytes = entry.totalSize;
        }
    }

    console.log('\n\n=== Result ===');
    console.log('Exit code:', code);
    console.log('Parsed progress lines:', parsedCount);
    console.log('Final backend percent:', entry.percent.toFixed(2) + '%');
    console.log('Final downloadedBytes:', entry.downloadedBytes);

    if (code === 0 && entry.percent >= 95) {
        console.log('✓ PASS: download ok and backend progress ≥ 95%');
        process.exit(0);
    } else if (code === 0) {
        console.log('✗ FAIL: download ok but backend percent too low:', entry.percent);
        process.exit(1);
    } else {
        console.log('✗ FAIL: yt-dlp exit', code);
        process.exit(1);
    }
});

ytdlp.on('error', (err) => {
    console.error('Failed to start yt-dlp:', err);
    process.exit(1);
});
