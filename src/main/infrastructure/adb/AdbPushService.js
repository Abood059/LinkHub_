// src/main/infrastructure/adb/AdbPushService.js
'use strict';

const path = require('path');
const fs = require('fs').promises;
const EventEmitter = require('events');

class AdbPushService extends EventEmitter {
    constructor({ adbExecutor, logger = null }) {
        super();
        this._adbExecutor = adbExecutor;
        this._logger = logger;
    }

    /**
     * نقل ملف للجهاز مع تتبع التقدم
     * @param {string} localPath - المسار المحلي للملف
     * @param {string} deviceId - معرف الجهاز
     * @param {string} remotePath - المسار الهدف على الجهاز (اختياري)
     * @param {boolean} deleteAfterTransfer - حذف الملف بعد النقل (اختياري)
     * @returns {Promise<{success: boolean, message: string, progress: number}>}
     */
    async pushFile(localPath, deviceId, remotePath = null, deleteAfterTransfer = false) {
        // التحقق من اتصال الجهاز
        const isConnected = await this._adbExecutor.isDeviceConnected(deviceId);
        if (!isConnected) {
            return {
                success: false,
                message: 'Device is not connected',
                progress: 0
            };
        }

        // التحقق من وجود الملف
        try {
            await fs.access(localPath);
        } catch (err) {
            return {
                success: false,
                message: `File not found: ${localPath}`,
                progress: 0
            };
        }

        // الحصول على حجم الملف الأصلي
        const originalSize = await this._getFileSize(localPath);

        // تحديد المسار الهدف على الجهاز
        const fileName = path.basename(localPath);
        const targetRemotePath = remotePath || `/sdcard/Download/${fileName}`;

        // إرسال حدث بدء النقل
        this.emit('transferStarted', {
            localPath,
            remotePath: targetRemotePath,
            deviceId,
            totalSize: originalSize
        });

        // نقل الملف
        const result = await this._adbExecutor.pushFile(deviceId, localPath, targetRemotePath);

        if (result.success) {
            // حساب التقدم بعد النقل
            const progress = await this._calculateProgress(deviceId, targetRemotePath, originalSize);
            
            // حذف الملف المؤقت بعد النقل الناجح
            if (deleteAfterTransfer) {
                try {
                    await fs.unlink(localPath);
                    if (this._logger) {
                        this._logger.info(`Deleted temp file: ${localPath}`);
                    }
                } catch (err) {
                    if (this._logger) {
                        this._logger.warn(`Failed to delete temp file: ${err.message}`);
                    }
                }
            }

            this.emit('transferComplete', {
                localPath,
                remotePath: targetRemotePath,
                deviceId,
                progress
            });

            return {
                success: true,
                message: `File transferred successfully to ${targetRemotePath}`,
                progress
            };
        } else {
            this.emit('transferFailed', {
                localPath,
                remotePath: targetRemotePath,
                deviceId,
                error: result.message
            });

            return {
                success: false,
                message: result.message,
                progress: 0
            };
        }
    }

    /**
     * نقل مجموعة ملفات للجهاز
     * @param {Array<string>} localPaths - مصفوفة المسارات المحلية للملفات
     * @param {string} deviceId - معرف الجهاز
     * @param {string} remoteDir - المسار الهدف على الجهاز (اختياري)
     * @param {boolean} deleteAfterTransfer - حذف الملفات بعد النقل (اختياري)
     * @returns {Promise<Array<{success: boolean, message: string, progress: number, file: string}>>}
     */
    async pushFiles(localPaths, deviceId, remoteDir = null, deleteAfterTransfer = false) {
        const results = [];
        const targetRemoteDir = remoteDir || '/sdcard/Download/';

        for (const localPath of localPaths) {
            const fileName = path.basename(localPath);
            const remotePath = path.join(targetRemoteDir, fileName);
            
            const result = await this.pushFile(localPath, deviceId, remotePath, deleteAfterTransfer);
            results.push({
                ...result,
                file: localPath
            });
        }

        return results;
    }

    /**
     * حساب نسبة اكتمال النقل بناءً على حجم الملف على الهاتف مقسوم على الحجم الأصلي
     * @param {string} deviceId - معرف الجهاز
     * @param {string} remotePath - المسار على الجهاز
     * @param {number} originalSize - الحجم الأصلي للملف بالبايت
     * @returns {Promise<number>} - نسبة التقدم بين 0 و 1
     */
    async _calculateProgress(deviceId, remotePath, originalSize) {
        try {
            const remoteSize = await this._getRemoteFileSize(deviceId, remotePath);
            
            if (originalSize <= 0) {
                return 1; // إذا كان الحجم الأصلي 0، نعتبر النقل مكتمل
            }

            const progress = Math.min(remoteSize / originalSize, 1);
            
            this.emit('progressUpdate', {
                deviceId,
                remotePath,
                progress,
                transferredBytes: remoteSize,
                totalBytes: originalSize
            });

            return progress;
        } catch (error) {
            if (this._logger) {
                this._logger.warn(`Failed to calculate progress: ${error.message}`);
            }
            return 1; // في حالة الخطأ، نعتبر النقل مكتمل
        }
    }

    /**
     * الحصول على حجم الملف المحلي
     * @param {string} filePath - مسار الملف
     * @returns {Promise<number>} - الحجم بالبايت
     */
    async _getFileSize(filePath) {
        try {
            const stats = await fs.stat(filePath);
            return stats.size;
        } catch (error) {
            if (this._logger) {
                this._logger.error(`Failed to get file size: ${error.message}`);
            }
            return 0;
        }
    }

    /**
     * الحصول على حجم الملف على الجهاز البعيد
     * @param {string} deviceId - معرف الجهاز
     * @param {string} remotePath - المسار على الجهاز
     * @returns {Promise<number>} - الحجم بالبايت
     */
    async _getRemoteFileSize(deviceId, remotePath) {
        try {
            const sanitizedSerial = this._adbExecutor._sanitizeSerialOrTarget ? 
                this._adbExecutor._sanitizeSerialOrTarget(deviceId) : deviceId;
            
            // استخدام أمر shell للحصول على حجم الملف
            const sizeCommand = ['stat', '-c', '%s', remotePath];
            const sizeOutput = await this._adbExecutor._executeShellCommand(sanitizedSerial, sizeCommand);
            
            const size = parseInt(sizeOutput.trim());
            return isNaN(size) ? 0 : size;
        } catch (error) {
            if (this._logger) {
                this._logger.warn(`Failed to get remote file size: ${error.message}`);
            }
            return 0;
        }
    }

    /**
     * نقل ملف للجهاز وحذفه بعد النقل (للملفات المؤقتة)
     * @param {string} localPath - المسار المحلي للملف
     * @param {string} deviceId - معرف الجهاز
     * @returns {Promise<{success: boolean, message: string, progress: number}>}
     */
    async pushAndDelete(localPath, deviceId) {
        return this.pushFile(localPath, deviceId, null, true);
    }

    /**
     * نقل ملف من مجلد التحميلات للجهاز (بدون حذف)
     * @param {string} localPath - المسار المحلي للملف
     * @param {string} deviceId - معرف الجهاز
     * @returns {Promise<{success: boolean, message: string, progress: number}>}
     */
    async pushFromDownloads(localPath, deviceId) {
        return this.pushFile(localPath, deviceId, null, false);
    }
}

module.exports = AdbPushService;
