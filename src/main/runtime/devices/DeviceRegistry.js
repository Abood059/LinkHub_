'use strict';

const DeviceRuntimeState =
    require('./DeviceRuntimeState');

/**
 * Runtime registry responsible for:
 *
 * - Device registration
 * - Device lookup
 * - Runtime state management
 *
 * This class does NOT:
 * - Connect devices
 * - Pair devices
 * - Execute ADB commands
 * - Persist data
 * - Implement business logic
 */
class DeviceRegistry {
    constructor() {
        /**
         * Map<deviceId, Device>
         */
        this._devices =
            new Map();

        /**
         * Map<deviceId, DeviceRuntimeState>
         */
        this._runtimeStates =
            new Map();
    }

    registerDevice(device) {
        if (!device || !device.id) {
            throw new Error(
                'Device must contain a valid id'
            );
        }

        this._devices.set(
            device.id,
            device
        );

        if (
            !this._runtimeStates.has(
                device.id
            )
        ) {
            this._runtimeStates.set(
                device.id,
                new DeviceRuntimeState()
            );
        }

        return device;
    }

    removeDevice(deviceId) {
        this._devices.delete(
            deviceId
        );

        this._runtimeStates.delete(
            deviceId
        );
    }

    updateState(
        deviceId,
        state = {}
    ) {
        let runtimeState =
            this._runtimeStates.get(
                deviceId
            );

        if (!runtimeState) {
            runtimeState =
                new DeviceRuntimeState();

            this._runtimeStates.set(
                deviceId,
                runtimeState
            );
        }

        runtimeState.update({
            ...state,
            lastSeen:
                state.lastSeen ||
                new Date()
        });

        return runtimeState;
    }

    getDevice(deviceId) {
        return (
            this._devices.get(
                deviceId
            ) || null
        );
    }

    getRuntimeState(
        deviceId
    ) {
        return (
            this._runtimeStates.get(
                deviceId
            ) || null
        );
    }

    getAllDevices() {
        return Array.from(
            this._devices.values()
        );
    }

    getAllRuntimeStates() {
        return Array.from(
            this._runtimeStates.values()
        );
    }

    hasDevice(deviceId) {
        return this._devices.has(
            deviceId
        );
    }

    clear() {
        this._devices.clear();
        this._runtimeStates.clear();
    }

    /**
     * Find device ID by ADB target (serial or host:port)
     * @param {string} adbTarget - e.g., "emulator-5554" or "192.168.1.10:5555"
     * @returns {string|null} deviceId if found, else null
     */
    findDeviceIdByAdbTarget(adbTarget) {
        if (!adbTarget) return null;
        for (const [deviceId, runtimeState] of this._runtimeStates.entries()) {
            if (runtimeState.adbTarget === adbTarget) {
                return deviceId;
            }
        }
        // Also check devices without runtime state? Not needed as each device has runtime.
        return null;
    }
}

module.exports =
    DeviceRegistry;