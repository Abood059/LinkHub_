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
     * تحليل سطر التقدم من البث
     */
    parseProgressLine(line) {
        const trimmedLine = line.trim();
        if (!trimmedLine) return null;

        // البحث عن كائن الـ JSON الخاص بالتقدم داخل السطر الحالي
        const jsonMatch = trimmedLine.match(/\{[^}]+\}/);
        if (jsonMatch) {
            try {
                const progressData = JSON.parse(jsonMatch[0]);
                let percent = parseFloat(progressData.progress) || 0;
                let size = progressData.size;
                
                return {
                    percent,
                    size,
                    speed: progressData.speed,
                    eta: progressData.eta,
                    elapsed: progressData.elapsed,
                    raw: trimmedLine
                };
            } catch (err) {
                // Failed to parse progress JSON line
                return null;
            }
        }
        
        return null;
    }
}

module.exports = YtdlpResponseParser;
