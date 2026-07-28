// src/main/infrastructure/media/YtdlpUtils.js
'use strict';

const path = require('path');
const fs = require('fs').promises;
const os = require('os');

/**
 * تنظيف اسم الملف من أحرف غير صالحة
 */
function sanitizeFileName(fileName) {
    if (!fileName) return 'download';
    // إزالة أو استبدال الأحرف غير الصالحة لأسماء الملفات
    return fileName
        .replace(/[<>:"/\\|?*]/g, '_')  // استبدال الأحرف المحظورة
        .replace(/\s+/g, '_')           // استبدال المسافات بـ underscore
        .substring(0, 200);             // تحديد طول أقصى 200 حرف
}

/**
 * تنسيق البايتات إلى وحدة مقروءة
 */
function formatBytes(bytes) {
    if (bytes === 0) return '0B';
    const k = 1024;
    const sizes = ['B', 'KiB', 'MiB', 'GiB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + sizes[i];
}

/**
 * حساب الحجم الكلي للتحميل المركب
 */
function calculateTotalSize(formatId, formatsData) {
    if (!formatId.includes('+') || !formatsData || !formatsData.formats) {
        return { totalSize: null, hasSizeInfo: false };
    }
    
    const formatIds = formatId.split('+');
    let totalSize = 0;
    let hasValidSize = false;
    
    for (const fid of formatIds) {
        const format = formatsData.formats.find(f => f.formatId === fid);
        if (format && format.filesize) {
            totalSize += format.filesize;
            hasValidSize = true;
        }
    }
    
    // إذا كان لدينا حجم واحد فقط، ضربه في 2 كتقدير
    if (hasValidSize && formatIds.length === 2) {
        const sizes = formatIds.map(fid => {
            const format = formatsData.formats.find(f => f.formatId === fid);
            return format && format.filesize ? format.filesize : 0;
        }).filter(s => s > 0);
        
        if (sizes.length === 1) {
            totalSize = sizes[0] * 2;
        }
    }
    
    return { totalSize: hasValidSize ? totalSize : null, hasSizeInfo: hasValidSize };
}

/**
 * تعديل نسبة التقدم للتحميلات المركبة (فيديو+صوت متتابعان عبر aria2c)
 *
 * aria2c يبلّغ عن كل ملف على حدة، لذلك نجمّع:
 *   completedBytes (ملفات انتهت) + downloadedBytes للملف الحالي
 *
 * إشارات انتقال الملف التالي من المخرجات الفعلية:
 *   1) سطر yt-dlp: [download] 100% of X.XXiB ...
 *   2) تغيّر معرّف aria2c (GID) بين [#c817a5 ...] و [#99fd6f ...]
 */
function adjustProgressForCombinedDownload(currentPercent, currentSize, entry, progressData) {
    if (!entry.hasSizeInfo || !entry.totalSize) {
        return { percent: currentPercent, size: currentSize };
    }

    if (entry.completedBytes == null) entry.completedBytes = 0;
    if (entry.lastFileDownloadedBytes == null) entry.lastFileDownloadedBytes = 0;
    if (entry.lastFileTotalBytes == null) entry.lastFileTotalBytes = 0;

    const toDisplay = (downloaded) => ({
        percent: Math.min((downloaded / entry.totalSize) * 100, 100),
        size: `${formatBytes(downloaded)}/${formatBytes(entry.totalSize)}`
    });

    // اكتمال ملف من ملخص yt-dlp — أضف حجمه للملفات المكتملة
    if (progressData.fileComplete && progressData.totalBytes > 0) {
        entry.completedBytes += progressData.totalBytes;
        entry.lastAriaGid = null;
        entry.lastFileDownloadedBytes = 0;
        entry.lastFileTotalBytes = 0;
        entry.currentFileIndex = (entry.currentFileIndex || 0) + 1;
        entry.downloadedBytes = entry.completedBytes;
        entry.lastPercent = 100;
        return toDisplay(entry.downloadedBytes);
    }

    const hasByteProgress = progressData.downloadedBytes != null
        && progressData.totalBytes > 0;

    if (hasByteProgress) {
        const gid = progressData.gid || null;

        // ملف جديد عبر تغيّر GID (fallback إذا فاتنا سطر 100%)
        if (gid && entry.lastAriaGid && gid !== entry.lastAriaGid) {
            const finishedBytes = entry.lastFileTotalBytes || entry.lastFileDownloadedBytes || 0;
            entry.completedBytes += finishedBytes;
            entry.currentFileIndex = (entry.currentFileIndex || 0) + 1;
        }

        if (gid) entry.lastAriaGid = gid;
        entry.lastFileDownloadedBytes = progressData.downloadedBytes;
        entry.lastFileTotalBytes = progressData.totalBytes;
        entry.lastPercent = currentPercent;

        entry.downloadedBytes = entry.completedBytes + progressData.downloadedBytes;
        return toDisplay(entry.downloadedBytes);
    }

    // fallback أخير: تقدير بالنسب عند غياب البايتات
    if (!entry.currentFileIndex) entry.currentFileIndex = 0;

    if (entry.lastPercent && currentPercent < entry.lastPercent - 10) {
        entry.currentFileIndex++;
    }
    entry.lastPercent = currentPercent;

    const fileCount = 2;
    const totalPercent = (entry.currentFileIndex * (100 / fileCount)) + (currentPercent / fileCount);
    entry.downloadedBytes = Math.floor((Math.min(totalPercent, 100) / 100) * entry.totalSize);

    return {
        percent: Math.min(totalPercent, 100),
        size: `${formatBytes(entry.downloadedBytes)}/${formatBytes(entry.totalSize)}`
    };
}

/**
 * إنشاء مجلد مؤقت للتحميلات
 */
async function createTempDirectory(pathService = null) {
    let tempDir;
    if (pathService && typeof pathService.getDownloadsTempDir === 'function') {
        tempDir = pathService.getDownloadsTempDir();
    } else {
        // Fallback to process.cwd() if pathService is not available
        tempDir = path.join(process.cwd(), 'temp', 'downloads');
    }
    try {
        await fs.mkdir(tempDir, { recursive: true });
        return tempDir;
    } catch (err) {
        throw new Error(`Failed to create temp directory: ${err.message}`);
    }
}

/**
 * الحصول على قالب التقدم المتوافق بصيغة JSON الموحدة
 * يستخدم متغيرات yt-dlp الصحيحة لاستخراج بيانات الحجم الفعلي
 */
function getProgressTemplate() {
    return JSON.stringify({
        progress: '%(progress._percent_str)s',
        speed: '%(speed)s',
        downloaded_bytes: '%(downloaded_bytes)s',
        total_bytes: '%(total_bytes)s',
        eta: '%(eta)s',
        elapsed: '%(elapsed)s'
    });
}

/**
 * نقل الملف المحمل إلى مجلد التنزيلات
 */
async function moveDownloadedFile(tempFilePath, title, deviceId) {
    const downloadsDir = path.join(os.homedir(), 'Downloads');
    
    try {
        await fs.mkdir(downloadsDir, { recursive: true });
        
        // استخراج الامتداد من الملف المحمل
        const fileExt = path.extname(tempFilePath);
        
        // إنشاء اسم الملف الجديد باستخدام title
        let newFileName = sanitizeFileName(title) || path.basename(tempFilePath);
        
        // إضافة الامتداد إذا لم يكن موجوداً
        if (!newFileName.endsWith(fileExt)) {
            newFileName += fileExt;
        }
        
        const finalFilePath = path.join(downloadsDir, newFileName);
        
        await fs.copyFile(tempFilePath, finalFilePath);
        
        // إذا لم يكن هناك deviceId، يتم مسح الملف المؤقت فوراً
        if (!deviceId) {
            await fs.unlink(tempFilePath);
        }
        
        return {
            finalPath: finalFilePath,
            tempPath: deviceId ? tempFilePath : null
        };
    } catch (err) {
        throw new Error(`Failed to move file: ${err.message}`);
    }
}

module.exports = {
    sanitizeFileName,
    calculateTotalSize,
    adjustProgressForCombinedDownload,
    createTempDirectory,
    getProgressTemplate,
    moveDownloadedFile,
    formatBytes
};
