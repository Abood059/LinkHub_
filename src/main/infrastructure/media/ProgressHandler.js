// src/main/infrastructure/media/ProgressHandler.js
'use strict';

const { adjustProgressForCombinedDownload } = require('./YtdlpUtils');
const YtdlpResponseParser = require('./YtdlpResponseParser');

/**
 * فئة مسؤولة عن معالجة بيانات التقدم من البث وحساب النسب المئوية
 */
class ProgressHandler {
    constructor() {
        this._responseParser = new YtdlpResponseParser();
    }

    /**
     * معالجة بيانات التقدم من البث
     */
    handleProgressData(chunk, streamType, entry, onProgress, formatId) {
        if (!entry) return;

        // تحويل المدخلات القادمة إلى نص
        const text = typeof chunk === 'string' ? chunk : chunk.toString();

        // تجميع أخطاء النظام فقط إذا كان البث قادماً من stderr
        if (streamType === 'stderr') {
            entry.stderrBuffer += text;
        }

        // معالجة السطر
        const progressData = this._responseParser.parseProgressLine(text);

        if (progressData) {
            let percent = progressData.percent;
            let size = progressData.size;

            // تعديل النسبة والحجم للتحميلات المركبة
            if (formatId.includes('+')) {
                const adjustedProgress = adjustProgressForCombinedDownload(
                    percent,
                    size,
                    entry,
                    progressData
                );
                percent = adjustedProgress.percent;
                size = adjustedProgress.size;
            }

            // تحديث downloadedBytes بناءً على النسبة المئوية والحجم الكلي
            if (entry.totalSize && percent) {
                entry.downloadedBytes = Math.floor((percent / 100) * entry.totalSize);
            }

            // تحديث بيانات التقدم في الذاكرة
            entry.percent = percent;
            entry.speed = progressData.speed;
            entry.size = size;
            entry.eta = progressData.eta;
            entry.elapsed = progressData.elapsed;

            // تحديث الواجهة عبر دالة التغذية الراجعة
            if (onProgress) {
                onProgress({
                    percent,
                    raw: progressData.raw,
                    speed: progressData.speed,
                    size: size,
                    eta: progressData.eta,
                    elapsed: progressData.elapsed
                });
            }

            return {
                percent,
                speed: progressData.speed,
                downloaded_bytes: entry.downloadedBytes,
                eta: progressData.eta
            };
        }

        return null;
    }
}

module.exports = ProgressHandler;
