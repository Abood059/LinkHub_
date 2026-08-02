#!/usr/bin/env node

/**
 * اختبار تكامل يحاكي التحميل الكامل كما يحدث في التطبيق
 * للتحقق من استخراج اسم الملف من --print filename
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const YtdlpResponseParser = require('./src/main/infrastructure/media/YtdlpResponseParser');
const ProgressHandler = require('./src/main/infrastructure/media/ProgressHandler');
const CompletionHandler = require('./src/main/infrastructure/media/CompletionHandler');

const url = 'https://youtu.be/YBzGKgIf8FI?si=X6gH8njrM2JcUyGv';
const formatId = '395+249';
const title = 'ثبتت نظام زورين واختبرته في 10 مهام! | تجارب لينكس #1';
const tempDir = '/home/abood/.config/linkhub_/temp/downloads';
fs.mkdirSync(tempDir, { recursive: true });

// استخدام الأمر المبسط النهائي من YtdlpCommandBuilder
const denoPath = path.join(process.cwd(), 'resources', 'bin', 'linux', 'deno');
const outputTemplate = '%(title)s.%(ext)s';
const ytdlpArgs = [
    '--js-runtimes', `deno:${denoPath}`,
    '--ignore-config',
    '-f', formatId,
    '-o', outputTemplate,
    '--newline',
    url
];

console.log('=== Integration Test: Full Download Simulation ===');
console.log('URL:', url);
console.log('Format ID:', formatId);
console.log('Title:', title);
console.log('Output Dir:', tempDir);
console.log('Command: yt-dlp', ytdlpArgs.join(' '));
console.log('');

const ytdlp = spawn('yt-dlp', ytdlpArgs, { cwd: tempDir });
let lineBuffer = '';
let actualFilename = null;
let progressCount = 0;

const flushProgressLines = (streamType, flushRemainder = false) => {
    const normalized = lineBuffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = normalized.split('\n');

    if (flushRemainder) {
        lineBuffer = '';
        for (const line of lines) {
            if (line.trim()) {
                // استخراج اسم الملف من --print filename (سطر منفصل بدون بادئة)
                if (!line.includes('[') && !line.includes('WARNING') && !line.includes('ERROR')) {
                    actualFilename = line.trim();
                    console.log('[FILENAME] Extracted from --print filename:', actualFilename);
                }
                // استخراج اسم الملف من سطر [Merger]
                const mergerMatch = line.match(/\[Merger\]\s+Merging formats into\s+"([^"]+)"/);
                if (mergerMatch) {
                    actualFilename = mergerMatch[1];
                    console.log('[FILENAME] Extracted from Merger:', actualFilename);
                }
                console.log('[LINE]', line);
            }
        }
        return;
    }

    lineBuffer = lines.pop() || '';
    for (const line of lines) {
        if (!line.includes('[') && !line.includes('WARNING') && !line.includes('ERROR')) {
            actualFilename = line.trim();
            console.log('[FILENAME] Extracted from --print filename:', actualFilename);
        }
        const mergerMatch = line.match(/\[Merger\]\s+Merging formats into\s+"([^"]+)"/);
        if (mergerMatch) {
            actualFilename = mergerMatch[1];
            console.log('[FILENAME] Extracted from Merger:', actualFilename);
        }
        console.log('[LINE]', line);
    }
};

ytdlp.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    lineBuffer += text;
    flushProgressLines('stdout', false);
});

ytdlp.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    lineBuffer += text;
    flushProgressLines('stderr', false);
    // طباعة stderr للتحقق من الأخطاء
    process.stderr.write(chunk);
});

ytdlp.on('exit', async (code) => {
    console.log('');
    console.log('=== Process Exit ===');
    console.log('Exit code:', code);
    
    // تفريغ أي سطر متبقٍ
    if (lineBuffer.trim()) {
        flushProgressLines('stdout', true);
    }
    
    console.log('');
    console.log('=== Results ===');
    console.log('Actual filename extracted:', actualFilename);
    
    // التحقق من وجود الملف
    const files = fs.readdirSync(tempDir);
    console.log('Files in directory:', files);
    console.log('Number of files:', files.length);
    
    // طباعة تفاصيل كل ملف
    for (const file of files) {
        const filePath = path.join(tempDir, file);
        const stats = fs.statSync(filePath);
        console.log(`  - ${file}: ${stats.size} bytes, modified: ${stats.mtime}`);
    }
    
    if (actualFilename) {
        try {
            const stats = fs.statSync(actualFilename);
            console.log('File exists:', actualFilename, '- Size:', stats.size);
        } catch (err) {
            console.log('File does NOT exist:', actualFilename, '- Error:', err.message);
        }
    }
    
    // محاولة البحث عن الملف باستخدام CompletionHandler
    const completionHandler = new CompletionHandler();
    console.log('');
    console.log('=== Testing CompletionHandler ===');
    
    const { sanitizeFileName } = require('./src/main/infrastructure/media/YtdlpUtils');
    const sanitizedTitle = sanitizeFileName(title);
    console.log('Sanitized title:', sanitizedTitle);
    
    // فحص الملفات الفعلية
    const dirFiles = fs.readdirSync(tempDir);
    console.log('Actual files in directory:');
    for (const file of dirFiles) {
        const filePath = path.join(tempDir, file);
        const stats = fs.statSync(filePath);
        if (stats.isFile()) {
            const fileNameWithoutExt = path.basename(file, path.extname(file));
            const normalizedFileName = fileNameWithoutExt.replace(/\s+/g, '_');
            console.log(`  - File: "${file}"`);
            console.log(`    - Without ext: "${fileNameWithoutExt}"`);
            console.log(`    - Normalized: "${normalizedFileName}"`);
            console.log(`    - Match sanitized: ${normalizedFileName === sanitizedTitle}`);
            console.log(`    - Contains sanitized: ${normalizedFileName.includes(sanitizedTitle) || sanitizedTitle.includes(normalizedFileName)}`);
        }
    }
    
    try {
        const foundFile = await completionHandler._findFileBySearch(tempDir, title);
        console.log('Found file via search:', foundFile);
    } catch (err) {
        console.log('Search failed:', err.message);
    }
    
    process.exit(code === 0 ? 0 : 1);
});

ytdlp.on('error', (err) => {
    console.error('Process error:', err);
    process.exit(1);
});
