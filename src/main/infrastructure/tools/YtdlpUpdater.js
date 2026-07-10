// src/main/infrastructure/tools/YtdlpUpdater.js
'use strict';

const fs = require('fs').promises;
const path = require('path');

class YtdlpUpdater {
    constructor(options = {}) {
        this._logger = options.logger || null;
        this._ytdlpPath = options.ytdlpPath || 'yt-dlp';
        this._toolPathResolver = options.toolPathResolver || null;
        this._processSupervisor = options.processSupervisor || null;
    }

    _resolveYtdlpPath() {
        if (this._toolPathResolver) {
            return this._toolPathResolver.getYtDlpPath();
        }
        return this._ytdlpPath;
    }

    /**
     * التحقق من وجود تحديث لـ yt-dlp
     * @returns {Promise<{hasUpdate: boolean, currentVersion: string, latestVersion: string}>}
     */
    async checkForUpdates() {
        const ytdlpPath = this._resolveYtdlpPath();
        
        if (!this._processSupervisor) {
            throw new Error('ProcessSupervisor is required for YtdlpUpdater');
        }
        
        try {
            const output = await this._processSupervisor.executeQuickTaskArray(
                ytdlpPath,
                ['--version'],
                { timeout: 10000 }
            );
            
            const currentVersion = output.trim();
            return {
                hasUpdate: true, // yt-dlp -U سيقوم بالتحقق تلقائياً
                currentVersion,
                latestVersion: 'unknown'
            };
        } catch (err) {
            if (this._logger) {
                this._logger.error(`Failed to check yt-dlp version: ${err.message}`);
            }
            throw new Error(`Failed to check version: ${err.message}`);
        }
    }

    /**
     * تحديث yt-dlp باستخدام yt-dlp -U
     * @returns {Promise<{success: boolean, message: string}>}
     */
    async update() {
        const ytdlpPath = this._resolveYtdlpPath();
        
        if (!this._processSupervisor) {
            throw new Error('ProcessSupervisor is required for YtdlpUpdater');
        }
        
        try {
            const output = await this._processSupervisor.executeQuickTaskArray(
                ytdlpPath,
                ['-U'],
                { timeout: 60000 }
            );
            
            // yt-dlp -U يرجع 0 حتى إذا لم يكن هناك تحديث
            if (output.includes('Already up-to-date')) {
                if (this._logger) {
                    this._logger.info('yt-dlp is already up-to-date');
                }
                return {
                    success: true,
                    message: 'yt-dlp is already up-to-date',
                    updated: false
                };
            } else if (output.includes('Updated')) {
                if (this._logger) {
                    this._logger.info('yt-dlp updated successfully');
                }
                return {
                    success: true,
                    message: 'yt-dlp updated successfully',
                    updated: true
                };
            } else {
                // قد يكون محدثاً بدون رسالة واضحة
                return {
                    success: true,
                    message: 'Update check completed',
                    updated: false
                };
            }
        } catch (err) {
            if (this._logger) {
                this._logger.error(`Failed to update yt-dlp: ${err.message}`);
            }
            throw new Error(`Update failed: ${err.message}`);
        }
    }

    /**
     * التحقق من صلاحيات الكتابة على ملف yt-dlp
     * @returns {Promise<boolean>}
     */
    async checkWritePermissions() {
        const ytdlpPath = this._resolveYtdlpPath();
        
        try {
            await fs.access(ytdlpPath, fs.constants.W_OK);
            return true;
        } catch (err) {
            if (this._logger) {
                this._logger.warn(`No write permissions for yt-dlp at ${ytdlpPath}`);
            }
            return false;
        }
    }

    /**
     * التحقق من أن yt-dlp ليس حزمة (unpacked)
     * yt-dlp لا يدعم التحديث التلقائي للحزم المفكوكة
     * @returns {Promise<boolean>}
     */
    async isUnpacked() {
        const ytdlpPath = this._resolveYtdlpPath();
        
        try {
            // التحقق من حجم الملف - الحزم المفكوكة عادة أكبر
            const stats = await fs.stat(ytdlpPath);
            const fileSizeMB = stats.size / (1024 * 1024);
            
            // yt-dlp المفكوك عادة أكبر من 50MB
            if (fileSizeMB > 50) {
                if (this._logger) {
                    this._logger.warn('yt-dlp appears to be unpacked (large file size)');
                }
                return true;
            }
            
            return false;
        } catch (err) {
            if (this._logger) {
                this._logger.error(`Failed to check if yt-dlp is unpacked: ${err.message}`);
            }
            return false;
        }
    }

    /**
     * تحديث تلقائي مع التحقق من الشروط
     * @returns {Promise<{success: boolean, message: string, updated: boolean}>}
     */
    async autoUpdate() {
        try {
            // التحقق من الصلاحيات
            const hasWritePermission = await this.checkWritePermissions();
            if (!hasWritePermission) {
                return {
                    success: false,
                    message: 'No write permissions for yt-dlp',
                    updated: false
                };
            }

            // التحقق من الحزمة المفكوكة
            const unpacked = await this.isUnpacked();
            if (unpacked) {
                return {
                    success: false,
                    message: 'yt-dlp is unpacked, auto-update not supported. Please download the latest release manually.',
                    updated: false
                };
            }

            // تنفيذ التحديث
            const result = await this.update();
            return result;
        } catch (err) {
            if (this._logger) {
                this._logger.error(`Auto-update failed: ${err.message}`);
            }
            return {
                success: false,
                message: err.message,
                updated: false
            };
        }
    }
}

module.exports = YtdlpUpdater;
