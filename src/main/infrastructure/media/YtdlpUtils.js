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
 * تعديل نسبة التقدم للتحميلات المركبة
 */
function adjustProgressForCombinedDownload(currentPercent, currentSize, entry, progressData) {
    if (!entry.hasSizeInfo) {
        // إذا لم يتوفر حجم، ثبت عند 99% حتى الانتهاء
        return {
            percent: currentPercent > 0 ? Math.min(currentPercent, 99) : 0,
            size: currentSize
        };
    }
    
    // تحليل حجم التحميل الحالي
    const sizeMatch = currentSize ? currentSize.match(/(\d+)\/(\d+)/) : null;
    if (sizeMatch) {
        const downloaded = parseInt(sizeMatch[1]) || 0;
        const total = parseInt(sizeMatch[2]) || 0;
        
        // تحديث إجمالي البايتات المحملة
        if (entry.currentFileIndex === 0) {
            entry.downloadedBytes = downloaded;
        } else {
            entry.downloadedBytes += downloaded;
        }
        
        // حساب النسبة الكلية
        const totalPercent = (entry.downloadedBytes / entry.totalSize) * 100;
        
        // تحديث حجم العرض
        const displaySize = `${entry.downloadedBytes}/${entry.totalSize}`;
        
        return {
            percent: Math.min(totalPercent, 100),
            size: displaySize
        };
    }
    
    // إذا لم نتمكن من تحليل الحجم، استخدم النسبة المباشرة مع تعديل
    if (entry.currentFileIndex === 0) {
        return {
            percent: currentPercent / 2,
            size: currentSize
        };
    } else {
        return {
            percent: 50 + (currentPercent / 2),
            size: currentSize
        };
    }
}

/**
 * إنشاء مجلد مؤقت للتحميلات
 */
async function createTempDirectory() {
    const tempDir = path.join(process.cwd(), 'temp', 'downloads');
    try {
        await fs.mkdir(tempDir, { recursive: true });
        return tempDir;
    } catch (err) {
        throw new Error(`Failed to create temp directory: ${err.message}`);
    }
}

/**
 * الحصول على قالب التقدم المتوافق بصيغة JSON الموحدة
 */
function getProgressTemplate() {
    return JSON.stringify({
        progress: '%(progress._percent_str)s',
        speed: '%(speed)s',
        size: '%(downloaded_bytes)s/%(total_bytes)s',
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
    moveDownloadedFile
};
