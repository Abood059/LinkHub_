// src/main/infrastructure/streaming/ScrcpyAdapter.js
'use strict';

/**
 * ScrcpyAdapter
 * مسؤول فقط عن تشغيل وإيقاف انعكاس الشاشة عبر scrcpy
 * بدون أي منطق أعمال أو إدارة أجهزة
 */
class ScrcpyAdapter {
    constructor({
        processSupervisor,
        scrcpyPath = null,
        toolPathResolver = null,   // <-- جديد: محلل المسار الموحد
        logger = null
    }) {
        this._processSupervisor = processSupervisor;
        this._logger = logger;
        this._toolPathResolver = toolPathResolver;

        // تحديد مسار scrcpy (الأولوية: scrcpyPath المُمرر > toolPathResolver > القيمة الاحتياطية)
        this._scrcpyPath = this._resolveScrcpyPath(scrcpyPath);

        this._activeProcesses = new Map();
    }

    /**
     * Resolves scrcpy binary path with proper priority.
     * @param {string|null} explicitPath - Direct override from constructor
     * @returns {string}
     * @throws {Error} if no valid path found
     */
    _resolveScrcpyPath(explicitPath) {
        if (explicitPath) {
            return explicitPath;
        }

        if (this._toolPathResolver) {
            return this._toolPathResolver.getScrcpyPath();
        }

        // Fallback: assume 'scrcpy' is in PATH (development convenience)
        const fallbackPath = 'scrcpy';
        if (this._logger) {
            this._logger.warn(`ScrcpyAdapter: No toolPathResolver provided, using fallback: ${fallbackPath}`);
        }
        return fallbackPath;
    }

    startMirroring(deviceId, options = {}) {
        if (!deviceId) {
            throw new Error('deviceId is required');
        }

        const processId = `scrcpy:${deviceId}`;

        const args = [
            '-s',
            deviceId,
            ...(options.fullscreen ? ['--fullscreen'] : []),
            ...(options.bitrate ? ['--bit-rate', String(options.bitrate)] : [])
        ];

        this._processSupervisor.startManagedProcess({
            processId,
            binPath: this._scrcpyPath,
            args,
            type: 'scrcpy',
            metadata: {
                deviceId
            }
        });

        this._activeProcesses.set(deviceId, processId);

        return processId;
    }

    stopMirroring(deviceId) {
        const processId = this._activeProcesses.get(deviceId);

        if (!processId) {
            return false;
        }

        this._processSupervisor.stopManagedProcess(processId);
        this._activeProcesses.delete(deviceId);

        return true;
    }
}

module.exports = ScrcpyAdapter;