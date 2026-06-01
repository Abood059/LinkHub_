'use strict';

const fs =
    require('fs/promises');

const path =
    require('path');

/**
 * DatabaseManager
 *
 * Responsible only for persistence.
 *
 * No ADB logic.
 * No runtime logic.
 * No business logic.
 */
class DatabaseManager {
    constructor({
        databasePath
    } = {}) {
        this._databasePath =
            databasePath ||
            path.join(
                process.cwd(),
                'data',
                'devices.json'
            );
    }

    async loadDevices() {
        try {
            const content =
                await fs.readFile(
                    this._databasePath,
                    'utf8'
                );

            const parsed =
                JSON.parse(content);

            return Array.isArray(
                parsed
            )
                ? parsed
                : [];
        } catch (error) {
            if (
                error.code ===
                'ENOENT'
            ) {
                return [];
            }

            throw error;
        }
    }

    async saveDevices(
        devices = []
    ) {
        await this._ensureDirectory();

        await fs.writeFile(
            this._databasePath,
            JSON.stringify(
                devices,
                null,
                4
            ),
            'utf8'
        );
    }

    async insertDevice(
        device
    ) {
        const devices =
            await this.loadDevices();

        devices.push(device);

        await this.saveDevices(
            devices
        );

        return device;
    }

    async updateDevice(
        deviceId,
        updater
    ) {
        const devices =
            await this.loadDevices();

        const index =
            devices.findIndex(
                device =>
                    device.id ===
                    deviceId
            );

        if (index === -1) {
            return null;
        }

        const current =
            devices[index];

        devices[index] =
            typeof updater ===
            'function'
                ? updater(current)
                : {
                      ...current,
                      ...updater
                  };

        await this.saveDevices(
            devices
        );

        return devices[index];
    }

    async deleteDevice(
        deviceId
    ) {
        const devices =
            await this.loadDevices();

        const filtered =
            devices.filter(
                device =>
                    device.id !==
                    deviceId
            );

        await this.saveDevices(
            filtered
        );
    }

    async _ensureDirectory() {
        const directory =
            path.dirname(
                this._databasePath
            );

        await fs.mkdir(
            directory,
            {
                recursive: true
            }
        );
    }
}

module.exports =
    DatabaseManager;