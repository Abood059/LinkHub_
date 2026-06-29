// src/main/infrastructure/media/YtdlpAdapter.js
'use strict';

const os = require('os');
const path = require('path');
const EventEmitter = require('events');

class YtdlpAdapter extends EventEmitter {
    constructor({
        processSupervisor,
        ytdlpPath = null,
        toolPathResolver = null,
        logger = null
    }) {
        super();
        this._processSupervisor = processSupervisor;
        this._logger = logger;
        this._toolPathResolver = toolPathResolver;
        this._ytdlpPath = this._resolveYtdlpPath(ytdlpPath);
        this._activeDownloads = new Map(); // processId -> { resolve, reject, process, status }
        this._windowManager = null;
    }

    setWindowManager(windowManager) {
        this._windowManager = windowManager;
    }

    _resolveYtdlpPath(explicitPath) {
        if (explicitPath) return explicitPath;
        if (this._toolPathResolver) return this._toolPathResolver.getYtDlpPath();
        const fallbackPath = 'yt-dlp';
        if (this._logger) {
            this._logger.warn(`YtdlpAdapter: No toolPathResolver provided, using fallback: ${fallbackPath}`);
        }
        return fallbackPath;
    }

    /**
     * إصلاح دالة inspectFormats لاستخدام -j (JSON واحد) بدلاً من -F --print-json
     */
    async inspectFormats(url) {
        if (!url) {
            throw new Error('URL is required');
        }

        const args = ['-j', url];  // استخراج JSON كامل يحتوي على الميتاداتا والتنسيقات
        const output = await this._processSupervisor.executeQuickTaskArray(
            this._ytdlpPath,
            args,
            { timeout: 30000 }
        );

        const data = JSON.parse(output);
        
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

    async extractMetadata(url) {
        if (!url) {
            throw new Error('URL is required');
        }

        const args = ['-j', '--flat-playlist', url];
        const output = await this._processSupervisor.executeQuickTaskArray(
            this._ytdlpPath,
            args,
            { timeout: 15000 }
        );

        const data = JSON.parse(output);
        return {
            id: data.id,
            title: data.title,
            duration: data.duration,
            thumbnail: data.thumbnail,
            uploader: data.uploader,
            webpageUrl: data.webpage_url
        };
    }

    async startDownload(url, formatId, options = {}) {
        if (!formatId || typeof formatId !== 'string' || formatId.trim() === '') {
            throw new Error('formatId is required and must be a non-empty string');
        }
        
        return new Promise((resolve, reject) => {
            const { outputPath, onProgress, deviceId } = options;
            let finalOutputPath = outputPath;
            if (!finalOutputPath) {
                const timestamp = Date.now();
                const defaultDir = path.join(os.homedir(), 'Downloads');
                finalOutputPath = path.join(defaultDir, `linkhub_${timestamp}_${formatId}.%(ext)s`);
            }

            const processId = `ytdlp-dl-${Date.now()}`;
            const args = [
                '-f', formatId,
                '-o', finalOutputPath,
                '--newline',
                '--progress',
                url
            ];

            const process = this._processSupervisor.startManagedProcess({
                processId,
                binPath: this._ytdlpPath,
                args,
                type: 'ytdlp-download',
                metadata: { url, formatId, outputPath: finalOutputPath, deviceId },
                onData: (chunk, streamType) => {
                    if (streamType !== 'stderr') return;
                    const text = chunk.toString();
                    const match = text.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
                    if (match) {
                        const percent = parseFloat(match[1]);
                        if (onProgress) onProgress({ percent, raw: text });
                        this.emit('downloadProgress', {
                            downloadId: processId,
                            percent: percent,
                            deviceId: deviceId,
                            url: url
                        });
                    }
                }
            });

            // تخزين حالة التحميل
            this._activeDownloads.set(processId, {
                resolve,
                reject,
                process,
                status: 'downloading',
                url,
                formatId,
                outputPath: finalOutputPath,
                deviceId
            });

            if (process && process.once) {
                process.once('exit', (code) => {
                    const entry = this._activeDownloads.get(processId);
                    if (!entry) return;
                    
                    if (code === 0) {
                        entry.status = 'completed';
                        this.emit('downloadComplete', {
                            downloadId: processId,
                            outputPath: finalOutputPath,
                            deviceId: deviceId,
                            url: url
                        });
                        entry.resolve({ success: true, outputPath: finalOutputPath, processId });
                    } else {
                        entry.status = 'failed';
                        this.emit('downloadError', {
                            downloadId: processId,
                            error: `Exit code ${code}`,
                            deviceId: deviceId,
                            url: url
                        });
                        entry.reject(new Error(`Download failed with exit code ${code}`));
                    }
                    this._activeDownloads.delete(processId);
                });
                
                process.once('error', (err) => {
                    const entry = this._activeDownloads.get(processId);
                    if (entry) {
                        entry.status = 'failed';
                        this.emit('downloadError', {
                            downloadId: processId,
                            error: err.message,
                            deviceId: deviceId,
                            url: url
                        });
                        entry.reject(err);
                        this._activeDownloads.delete(processId);
                    }
                });
            } else {
                reject(new Error('Failed to start process'));
            }
        });
    }

    stopDownload(processId) {
        if (!processId) return false;
        const entry = this._activeDownloads.get(processId);
        if (!entry) return false;
        
        entry.status = 'stopped';
        const stopped = this._processSupervisor.stopManagedProcess(processId);
        if (stopped) {
            this._activeDownloads.delete(processId);
            this.emit('downloadStopped', {
                downloadId: processId,
                url: entry.url
            });
        }
        return stopped;
    }
    
    /**
     * الحصول على حالة التحميل (للاستخدام الداخلي)
     */
    getDownloadStatus(processId) {
        const entry = this._activeDownloads.get(processId);
        return entry ? entry.status : null;
    }
}

module.exports = YtdlpAdapter;