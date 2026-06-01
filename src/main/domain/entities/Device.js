const BaseNode = require('./BaseNode');

/**
 * Pure device entity.
 * Contains only immutable definitional data.
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

        // Freeze after construction
        Object.freeze(this);
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
            deviceFriendlyName:
                data.deviceFriendlyName || data.friendly_name,
            model: data.model,
            version: data.version,
            arch: data.arch,
            isNew: data.isNew
        });
    }
}

module.exports = Device;