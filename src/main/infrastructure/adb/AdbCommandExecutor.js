'use strict';

const path = require('path');
const { randomUUID } = require('crypto');

class AdbCommandExecutor {
    constructor({
        processSupervisor,
        logger = null,
        adbPath = null
    }) {
        this._processSupervisor =
            processSupervisor;

        this._logger =
            logger;

        this._adbPath =
            adbPath ||
            this._resolveAdbPath();
    }

    async getDevices() {
        const lines =
            await this._executeQuickAdbCommand(
                ['devices']
            );

        return lines
            .slice(1)
            .map(
                (line) => line.trim()
            )
            .filter(Boolean)
            .map((line) => {
                const parts =
                    line.split(/\s+/);

                return {
                    serial:
                        parts[0],
                    state:
                        parts[1] ||
                        'unknown'
                };
            });
    }

    async getDeviceInfo(
        serial
    ) {
        if (!serial) {
            throw new Error(
                'serial is required'
            );
        }

        const [
            model,
            version,
            arch
        ] = await Promise.all([
            this._executeShellCommand(
                serial,
                [
                    'getprop',
                    'ro.product.model'
                ]
            ),
            this._executeShellCommand(
                serial,
                [
                    'getprop',
                    'ro.build.version.release'
                ]
            ),
            this._executeShellCommand(
                serial,
                [
                    'getprop',
                    'ro.product.cpu.abi'
                ]
            )
        ]);

        return {
            serial,
            model:
                model.trim(),
            version:
                version.trim(),
            arch:
                arch.trim()
        };
    }

    async connect(
        target
    ) {
        return this._executeQuickAdbCommand([
            'connect',
            target
        ]);
    }

    async pair(
        host,
        pairingCode
    ) {
        return this._executeQuickAdbCommand([
            'pair',
            host,
            pairingCode
        ]);
    }

    async disconnect(
        target = null
    ) {
        const args =
            target
                ? [
                      'disconnect',
                      target
                  ]
                : [
                      'disconnect'
                  ];

        return this._executeQuickAdbCommand(
            args
        );
    }

    async _executeShellCommand(
        serial,
        shellArgs
    ) {
        const result =
            await this._executeQuickAdbCommand(
                [
                    '-s',
                    serial,
                    'shell',
                    ...shellArgs
                ]
            );

        return result.join('\n');
    }

    async _executeQuickAdbCommand(
        args = []
    ) {
        return this._processSupervisor
            .executeQuickTaskArray(
                this._adbPath,
                args
            );
    }

    _resolveAdbPath() {
        const isWin =
            process.platform ===
            'win32';

        return path.join(
            process.cwd(),
            'resources',
            'bin',
            isWin
                ? 'win/adb.exe'
                : 'linux/adb'
        );
    }
}

module.exports =
    AdbCommandExecutor;