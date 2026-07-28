// src/main/infrastructure/media/YtdlpResponseParser.js
'use strict';

/**
 * فئة مسؤولة عن تحليل استجابات yt-dlp
 */
class YtdlpResponseParser {
    constructor() {
        // يمكن إضافة تكوينات إضافية هنا إذا لزم الأمر
    }

    /**
     * تحليل استجابة التنسيقات
     */
    parseFormats(jsonOutput) {
        const data = JSON.parse(jsonOutput);
        
        // تحويل التنسيقات إلى صيغة مبسطة للواجهة
        const formats = (data.formats || []).map(f => ({
            formatId: f.format_id,
            ext: f.ext,
            resolution: f.resolution || null,
            fps: f.fps || null,
            acodec: f.acodec,
            vcodec: f.vcodec,
            filesize: f.filesize,
            formatNote: f.format_note
        }));

        return {
            title: data.title,
            duration: data.duration,
            thumbnail: data.thumbnail,
            formats: formats
        };
    }

    /**
     * تحليل استجابة البيانات الوصفية
     */
    parseMetadata(jsonOutput) {
        const data = JSON.parse(jsonOutput);
        return {
            id: data.id,
            title: data.title,
            duration: data.duration,
            thumbnail: data.thumbnail,
            uploader: data.uploader,
            webpageUrl: data.webpage_url
        };
    }

    /**
     * تحويل وحدة aria2c/yt-dlp إلى بايت
     */
    _unitToBytes(value, unit) {
        const units = {
            B: 1,
            KiB: 1024,
            MiB: 1024 ** 2,
            GiB: 1024 ** 3,
            TiB: 1024 ** 4,
            PiB: 1024 ** 5
        };
        return value * (units[unit] || 1);
    }

    /**
     * تحليل سطر تقدم aria2c
     * النمط الفعلي مع --newline:
     *   [#c817a5 48KiB/4.4MiB(1%) CN:5 DL:60KiB ETA:1m14s]
     *   [#c817a5 4.4MiB/4.4MiB(98%) CN:1 DL:116KiB]   ← بدون ETA أحياناً
     * عند وجود عدة تطابقات في نفس السطر نأخذ الأخير (الأحدث).
     */
    _parseAria2cProgress(trimmedLine) {
        const aria2cRegex = /\[#(\w+)\s+([0-9.]+)([KMGTP]?iB)\/([0-9.]+)([KMGTP]?iB)\((\d+)%\)\s+CN:\d+\s+DL:([0-9.]+)([KMGTP]?iB)(?:\s+ETA:([0-9mhs]+))?\]/g;
        let lastMatch = null;
        let match;
        while ((match = aria2cRegex.exec(trimmedLine)) !== null) {
            lastMatch = match;
        }
        if (!lastMatch) return null;

        const gid = lastMatch[1];
        const downloadedSize = parseFloat(lastMatch[2]);
        const downloadedUnit = lastMatch[3];
        const totalSize = parseFloat(lastMatch[4]);
        const totalUnit = lastMatch[5];
        const percent = parseFloat(lastMatch[6]);
        const speed = parseFloat(lastMatch[7]);
        const speedUnit = lastMatch[8];
        const eta = lastMatch[9] || null;

        const downloadedBytes = this._unitToBytes(downloadedSize, downloadedUnit);
        const totalBytes = this._unitToBytes(totalSize, totalUnit);
        const speedBytes = this._unitToBytes(speed, speedUnit);

        return {
            percent,
            size: `${downloadedSize}${downloadedUnit}/${totalSize}${totalUnit}`,
            downloadedBytes,
            totalBytes,
            speed: `${speed}${speedUnit}`,
            speedBytes,
            eta,
            elapsed: null,
            gid,
            fileComplete: false,
            raw: trimmedLine
        };
    }

    /**
     * تحليل ملخص اكتمال ملف من yt-dlp بعد انتهاء aria2c
     * النمط: [download] 100% of    4.47MiB in 00:00:41 at 110.24KiB/s
     */
    _parseYtdlpDownloadSummary(trimmedLine) {
        const summaryMatch = trimmedLine.match(
            /\[download\]\s+([\d.]+)%\s+of\s+([\d.]+)\s*([KMGTP]?iB)(?:\s+in\s+(\S+))?(?:\s+at\s+(\S+))?/i
        );
        if (!summaryMatch) return null;

        const percent = parseFloat(summaryMatch[1]);
        const totalSize = parseFloat(summaryMatch[2]);
        const totalUnit = summaryMatch[3];
        const elapsed = summaryMatch[4] || null;
        const speed = summaryMatch[5] || null;
        const totalBytes = this._unitToBytes(totalSize, totalUnit);

        return {
            percent,
            size: `${totalSize}${totalUnit}/${totalSize}${totalUnit}`,
            downloadedBytes: totalBytes,
            totalBytes,
            speed,
            speedBytes: null,
            eta: null,
            elapsed,
            gid: null,
            fileComplete: percent >= 100,
            raw: trimmedLine
        };
    }

    /**
     * تحليل سطر التقدم من البث
     */
    parseProgressLine(line) {
        const trimmedLine = line.trim();
        if (!trimmedLine) return null;

        // أولاً: تنسيق aria2c (المستخدم مع --downloader aria2c --newline)
        const aria2cProgress = this._parseAria2cProgress(trimmedLine);
        if (aria2cProgress) return aria2cProgress;

        // ثانياً: ملخص اكتمال الملف من yt-dlp
        const downloadSummary = this._parseYtdlpDownloadSummary(trimmedLine);
        if (downloadSummary) return downloadSummary;

        // ثالثاً: تنسيق JSON القديم (للتوافق)
        const jsonMatch = trimmedLine.match(/\{[^}]+\}/);
        if (jsonMatch) {
            try {
                const progressData = JSON.parse(jsonMatch[0]);
                let percent = parseFloat(progressData.progress) || 0;
                
                const downloadedBytes = parseFloat(progressData.downloaded_bytes) || 0;
                const totalBytes = parseFloat(progressData.total_bytes) || 0;
                
                const size = totalBytes > 0 ? `${downloadedBytes}/${totalBytes}` : progressData.size || 'NA/NA';
                
                return {
                    percent,
                    size,
                    downloadedBytes,
                    totalBytes,
                    speed: progressData.speed,
                    eta: progressData.eta,
                    elapsed: progressData.elapsed,
                    gid: null,
                    fileComplete: percent >= 100,
                    raw: trimmedLine
                };
            } catch (err) {
                return null;
            }
        }
        
        return null;
    }
}

module.exports = YtdlpResponseParser;
