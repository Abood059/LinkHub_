// src/main/application/services/FileTransferService.js
'use strict';

const path = require('path');
const fs = require('fs').promises;

class FileTransferService {
    constructor({ adbExecutor, logger = null }) {
        this._adbExecutor = adbExecutor;
        this._logger = logger;
    }

    /**
     * نقل ملف للجهاز
     * @param {string} localPath - المسار المحلي للملف
     * @param {string} deviceId - معرف الجهاز
     * @returns {Promise<{success: boolean, message: string}>}
     */
    async transferToDevice(localPath, deviceId) {
        // التحقق من اتصال الجهاز
        const isConnected = await this._adbExecutor.isDeviceConnected(deviceId);
        if (!isConnected) {
            return {
                success: false,
                message: 'Device is not connected'
            };
        }

        // التحقق من وجود الملف
        try {
            await fs.access(localPath);
        } catch (err) {
            return {
                success: false,
                message: `File not found: ${localPath}`
            };
        }

        // تحديد المسار الهدف على الجهاز
        const fileName = path.basename(localPath);
        const remotePath = `/sdcard/Download/${fileName}`;

        // نقل الملف
        const result = await this._adbExecutor.pushFile(deviceId, localPath, remotePath);

        // حذف الملف المؤقت بعد النقل الناجح
        if (result.success) {
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

        return result;
    }

    /**
     * نقل ملف من مجلد التحميلات للجهاز (للنقل اللاحق)
     * @param {string} localPath - المسار المحلي للملف
     * @param {string} deviceId - معرف الجهاز
     * @returns {Promise<{success: boolean, message: string}>}
     */
    async transferFromDownloads(localPath, deviceId) {
        // التحقق من اتصال الجهاز
        const isConnected = await this._adbExecutor.isDeviceConnected(deviceId);
        if (!isConnected) {
            return {
                success: false,
                message: 'Device is not connected'
            };
        }

        // التحقق من وجود الملف
        try {
            await fs.access(localPath);
        } catch (err) {
            return {
                success: false,
                message: `File not found: ${localPath}`
            };
        }

        // تحديد المسار الهدف على الجهاز
        const fileName = path.basename(localPath);
        const remotePath = `/sdcard/Download/${fileName}`;

        // نقل الملف (بدون حذف الملف الأصلي)
        const result = await this._adbExecutor.pushFile(deviceId, localPath, remotePath);

        return result;
    }
}

module.exports = FileTransferService;
