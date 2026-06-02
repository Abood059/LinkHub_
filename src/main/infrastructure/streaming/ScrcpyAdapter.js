'use strict';

/**
 * ScrcpyAdapter
 * مسؤول فقط عن تشغيل وإيقاف انعكاس الشاشة عبر scrcpy
 * بدون أي منطق أعمال أو إدارة أجهزة
 */
class ScrcpyAdapter {
    constructor({
        processSupervisor,
        scrcpyPath,
        logger = null
    }) {
        this._processSupervisor = processSupervisor;
        this._scrcpyPath = scrcpyPath;
        this._logger = logger;

        this._activeProcesses = new Map();
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