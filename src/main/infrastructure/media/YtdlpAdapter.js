// src/main/infrastructure/media/YtdlpAdapter.js
'use strict';

class YtdlpAdapter {
    constructor({
        processSupervisor,
        ytdlpPath = null,
        toolPathResolver = null,   // <-- جديد: محلل المسار الموحد
        logger = null
    }) {
        this._processSupervisor = processSupervisor;
        this._logger = logger;
        this._toolPathResolver = toolPathResolver;

        // تحديد مسار yt-dlp (الأولوية: ytdlpPath المُمرر > toolPathResolver > القيمة الاحتياطية)
        this._ytdlpPath = this._resolveYtdlpPath(ytdlpPath);

        this._activeDownloads = new Map(); // processId -> { resolve, reject, entity }
    }

    /**
     * Resolves yt-dlp binary path with proper priority.
     * @param {string|null} explicitPath - Direct override from constructor
     * @returns {string}
     * @throws {Error} if no valid path found
     */
    _resolveYtdlpPath(explicitPath) {
        if (explicitPath) {
            return explicitPath;
        }

        if (this._toolPathResolver) {
            return this._toolPathResolver.getYtDlpPath();
        }

        // Fallback: assume 'yt-dlp' is in PATH (development convenience)
        const fallbackPath = 'yt-dlp';
        if (this._logger) {
            this._logger.warn(`YtdlpAdapter: No toolPathResolver provided, using fallback: ${fallbackPath}`);
        }
        return fallbackPath;
    }

    /**
     * Inspect available formats for a given URL without downloading.
     * @param {string} url - Video/audio URL
     * @returns {Promise<Object>} Formats and metadata
     */
    async inspectFormats(url) {
        if (!url) {
            throw new Error('URL is required');
        }

        const processId = `ytdlp-inspect-${Date.now()}`;
        const args = ['-F', '--print-json', url];

        // Use quick task to get output
        const output = await this._processSupervisor.executeQuickTaskArray(
            this._ytdlpPath,
            args,
            { timeout: 30000 }
        );

        // Parse JSON output (yt-dlp --print-json returns one JSON object per line for formats)
        const lines = output.split('\n').filter(l => l.trim());
        if (lines.length === 0) {
            throw new Error('No output from yt-dlp');
        }

        // First line is video info, subsequent lines are format entries
        const videoInfo = JSON.parse(lines[0]);
        const formats = lines.slice(1).map(line => {
            try {
                return JSON.parse(line);
            } catch (e) {
                return null;
            }
        }).filter(f => f);

        return {
            title: videoInfo.title,
            duration: videoInfo.duration,
            thumbnail: videoInfo.thumbnail,
            formats: formats.map(f => ({
                formatId: f.format_id,
                ext: f.ext,
                resolution: f.resolution || null,
                fps: f.fps || null,
                acodec: f.acodec,
                vcodec: f.vcodec,
                filesize: f.filesize,
                formatNote: f.format_note
            }))
        };
    }

    /**
     * Extract metadata for a URL without downloading.
     * @param {string} url - Video/audio URL
     * @returns {Promise<Object>} Basic metadata (title, duration, thumbnail, etc.)
     */
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

    /**
     * Start downloading a video/audio format.
     * @param {string} url - Source URL
     * @param {string} formatId - Format ID to download
     * @param {string} outputPath - Full output file path
     * @param {Function} onProgress - Callback for progress updates
     * @returns {Promise<Object>} Promise resolved when download completes
     */
    startDownload(url, formatId, outputPath, onProgress = null) {
        return new Promise((resolve, reject) => {
            const processId = `ytdlp-dl-${Date.now()}`;
            const args = [
                '-f', formatId,
                '-o', outputPath,
                '--newline',
                '--progress',
                url
            ];

            const process = this._processSupervisor.startManagedProcess({
                processId,
                binPath: this._ytdlpPath,
                args,
                type: 'ytdlp-download',
                metadata: { url, formatId, outputPath },
                onData: (chunk, streamType) => {
                    if (streamType !== 'stderr') return;
                    const text = chunk.toString();
                    // Parse progress: [download]  45.2% of 10.23MiB at 1.2Mi/s ETA 00:05
                    const match = text.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
                    if (match && onProgress) {
                        const percent = parseFloat(match[1]);
                        onProgress({ percent, raw: text });
                    }
                }
            });

            this._activeDownloads.set(processId, { resolve, reject, process });

            // Wait for process exit via monitoring? Actually startManagedProcess returns child
            // We need to listen to exit via ProcessSupervisor? Simplified: we poll or use ProcessRegistry.
            // Better: Use ProcessSupervisor to get status, but for simplicity we'll assume onData can detect completion.
            // Since this is infrastructure, we can attach a one-time listener to the child process.
            if (process && process.once) {
                process.once('exit', (code) => {
                    this._activeDownloads.delete(processId);
                    if (code === 0) {
                        resolve({ success: true, outputPath, processId });
                    } else {
                        reject(new Error(`Download failed with exit code ${code}`));
                    }
                });
                process.once('error', (err) => {
                    this._activeDownloads.delete(processId);
                    reject(err);
                });
            } else {
                reject(new Error('Failed to start process'));
            }
        });
    }

    /**
     * Stop an ongoing download.
     * @param {string} processId - ID returned from startDownload
     * @returns {boolean} True if stopped
     */
    stopDownload(processId) {
        if (!processId) return false;
        const exists = this._activeDownloads.has(processId);
        if (exists) {
            this._processSupervisor.stopManagedProcess(processId);
            this._activeDownloads.delete(processId);
            return true;
        }
        return false;
    }
}

module.exports = YtdlpAdapter;