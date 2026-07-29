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
        // استخدام pathService للحصول على مسار aria2c الصحيح
        const aria2cPath = this._pathService
            ? this._pathService.getBinaryPath('aria2c')
            : path.join(process.cwd(), 'resources', 'bin', 'linux', 'aria2c');

        // استخدام قالب اسم ملف صريح لضمان أن الملف المدموج يبقى في المجلد المحدد
        // yt-dlp عند الدمج يضع الملف المدموج في المجلد الأب إذا لم يكن هناك قالب اسم ملف
        const outputTemplate = path.join(outputPath, '%(title)s.%(ext)s');

        const baseArgs = denoPath
            ? [
                '--js-runtimes', `deno:${denoPath}`,
                '--ignore-config',
                '--downloader', aria2cPath,
                '--downloader-args', 'aria2c:-x 16 -s 16 --ca-certificate=/etc/ssl/certs/ca-certificates.crt',
                '-f', formatId,
                '-o', outputTemplate,
                '--newline',
                '--continue',
                '--print', 'filename',
                url
              ]
            : [
                '--ignore-config',
                '--downloader', aria2cPath,
                '--downloader-args', 'aria2c:-x 16 -s 16 --ca-certificate=/etc/ssl/certs/ca-certificates.crt',
                '-f', formatId,
                '-o', outputTemplate,
                '--newline',
                '--continue',
                '--print', 'filename',
                url
              ];

        return {
            args: baseArgs
        };
    }
}

module.exports = YtdlpCommandBuilder;
