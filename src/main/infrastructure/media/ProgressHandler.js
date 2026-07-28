// src/main/infrastructure/media/ProgressHandler.js
'use strict';

const { adjustProgressForCombinedDownload } = require('./YtdlpUtils');
const YtdlpResponseParser = require('./YtdlpResponseParser');

/**
 * فئة مسؤولة عن معالجة بيانات التقدم من البث وحساب النسب المئوية
 * القيم تُحسب في الخلفية فقط — الواجهة للعرض.
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

        const text = typeof chunk === 'string' ? chunk : chunk.toString();

        if (streamType === 'stderr') {
            entry.stderrBuffer += text;
        }

        const progressData = this._responseParser.parseProgressLine(text);

        if (progressData) {
            let percent = progressData.percent;
            let size = progressData.size;

            if (formatId && formatId.includes('+')) {
                const adjustedProgress = adjustProgressForCombinedDownload(
                    percent,
                    size,
                    entry,
                    progressData
                );
                percent = adjustedProgress.percent;
                size = adjustedProgress.size;
            } else {
                if (progressData.fileComplete) {
                    percent = 100;
                    if (progressData.totalBytes > 0) {
                        entry.downloadedBytes = progressData.totalBytes;
                    }
                } else if (progressData.downloadedBytes != null) {
                    entry.downloadedBytes = progressData.downloadedBytes;
                } else if (entry.totalSize && percent) {
                    entry.downloadedBytes = Math.floor((percent / 100) * entry.totalSize);
                }
            }

            entry.percent = percent;
            entry.speed = progressData.speed;
            entry.size = size;
            entry.eta = progressData.eta;
            entry.elapsed = progressData.elapsed;

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
