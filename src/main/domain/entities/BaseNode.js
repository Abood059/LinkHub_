/**
 * Pure base entity for all nodes/devices in the system.
 * Contains only immutable identity and structural data.
 */
class BaseNode {
    constructor({ id, deviceFriendlyName, type }) {
        this._id = id;
        this._deviceFriendlyName = deviceFriendlyName;
        this._type = type;

        // Freeze instance to prevent accidental mutation
        Object.freeze(this);
    }

    // --- Read-only getters ---

    get id() {
        return this._id;
    }

    get type() {
        return this._type;
    }

    get friendlyName() {
        return this._deviceFriendlyName;
    }

    get deviceFriendlyName() {
        return this._deviceFriendlyName;
    }

    toJSON() {
        return {
            id: this._id,
            deviceFriendlyName: this._deviceFriendlyName,
            type: this._type
        };
    }
}

module.exports = BaseNode;