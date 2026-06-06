// src/main/domain/entities/Device.js
const BaseNode = require('./BaseNode');

/**
 * Pure device entity.
 * Contains immutable definitional data but allows controlled updates
 * for device details (model, version, arch) after connection.
 */
class Device extends BaseNode {
    constructor({
        id,
        deviceFriendlyName,
        model,
        version,
        arch,
        isNew
    }) {
        super({
            id,
            deviceFriendlyName,
            type: 'MOBILE'
        });

        this._model = model || 'Unknown';
        this._version = version || 'Unknown';
        this._arch = arch || 'Unknown';
        this._isNew = isNew ?? true;

        // No freeze - allows updateDetails
    }

    // --- Read-only getters ---
    get model() {
        return this._model;
    }

    get version() {
        return this._version;
    }

    get arch() {
        return this._arch;
    }

    get isNew() {
        return this._isNew;
    }

    /**
     * Update device details after obtaining real information from ADB.
     * @param {string} model - Device model
     * @param {string} version - Android version
     * @param {string} arch - CPU architecture
     */
    updateDetails(model, version, arch) {
        if (model && typeof model === 'string') this._model = model;
        if (version && typeof version === 'string') this._version = version;
        if (arch && typeof arch === 'string') this._arch = arch;
        // Mark as not new after first update
        if (this._isNew) this._isNew = false;
    }

    toJSON() {
        return {
            ...super.toJSON(),
            model: this._model,
            version: this._version,
            arch: this._arch,
            isNew: this._isNew
        };
    }

    static fromJSON(data) {
        return new Device({
            id: data.id,
            deviceFriendlyName: data.deviceFriendlyName || data.friendly_name,
            model: data.model,
            version: data.version,
            arch: data.arch,
            isNew: data.isNew
        });
    }
}

module.exports = Device;