// src/main/infrastructure/media/YtdlpCommandBuilder.js
'use strict';

const { getProgressTemplate } = require('./YtdlpUtils');

/**
 * فئة مسؤولة عن بناء أوامر yt-dlp
 */
class YtdlpCommandBuilder {
    constructor() {
        // يمكن إضافة تكوينات إضافية هنا إذا لزم الأمر
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
        const progressTemplate = getProgressTemplate();
        
        const baseArgs = denoPath
            ? [
                '--js-runtimes', `deno:${denoPath}`,
                '--downloader', 'http:native',
                '-f', formatId,
                '-o', outputPath,
                '--newline',
                '--progress-template', progressTemplate,
                '--continue',
                url
              ]
            : [
                '--downloader', 'http:native',
                '-f', formatId,
                '-o', outputPath,
                '--newline',
                '--progress-template', progressTemplate,
                '--continue',
                url
              ];
        
        return {
            args: baseArgs
        };
    }
}

module.exports = YtdlpCommandBuilder;
