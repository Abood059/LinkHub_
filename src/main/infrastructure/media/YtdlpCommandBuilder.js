// src/main/infrastructure/media/YtdlpCommandBuilder.js
'use strict';

const path = require('path');

/**
 * فئة مسؤولة عن بناء أوامر yt-dlp
 */
class YtdlpCommandBuilder {
    constructor(pathService = null) {
        this._pathService = pathService;
    }

    /**
     * بناء أمر فحص التنسيقات
     */
    buildInspectCommand(url, denoPath = null) {
        const baseArgs = denoPath 
            ? ['--js-runtimes', `deno:${denoPath}`, '-j', url]
            : ['-j', url];
        
        return {
            args: baseArgs,
            timeout: 30000
        };
    }

    /**
     * بناء أمر استخراج البيانات الوصفية
     */
    buildMetadataCommand(url, denoPath = null) {
        const baseArgs = denoPath
            ? ['--js-runtimes', `deno:${denoPath}`, '-j', '--flat-playlist', url]
            : ['-j', '--flat-playlist', url];
        
        return {
            args: baseArgs,
            timeout: 15000
        };
    }

    /**
     * بناء أمر التحميل
     */
    buildDownloadCommand(url, formatId, outputPath, denoPath = null) {
        // استخدام اسم ملف بسيط فقط (بدون مسار كامل)
        // المسار سيتم تحديده عبر cwd عند تشغيل العملية
        const outputTemplate = '%(title)s.%(ext)s';

        const baseArgs = [
            '--ignore-config',
            '-f', formatId,
            '-o', outputTemplate,
            '--newline',
            '--print', 'filename',
            url
        ];

        return {
            args: baseArgs,
            outputPath: outputPath // نحتاج هذا لتمريره كـ cwd
        };
    }
}

module.exports = YtdlpCommandBuilder;
