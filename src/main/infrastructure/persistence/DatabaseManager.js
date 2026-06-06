// src/main/infrastructure/persistence/DatabaseManager.js
'use strict';

const fs = require('fs/promises');
const path = require('path');

/**
 * DatabaseManager
 *
 * Responsible only for persistence of devices (and possibly other data).
 * 
 * Features:
 * - Initialize database directory and file
 * - Load all devices
 * - Save all devices
 * - Insert/update/delete individual devices
 * - Close (placeholder for future DB upgrades)
 * 
 * No ADB logic. No runtime logic. No business logic.
 */
class DatabaseManager {
    constructor({ databasePath } = {}) {
        this._databasePath = databasePath || path.join(process.cwd(), 'data', 'devices.json');
        this._initialized = false;
    }

    /**
     * Initialize the database: ensure directory exists and create empty JSON file if missing.
     * Should be called once during application startup.
     */
    async initDb() {
        try {
            await this._ensureDirectory();
            await this._ensureFile();
            this._initialized = true;
            console.log('[DatabaseManager] Initialized successfully at', this._databasePath);
        } catch (error) {
            console.error('[DatabaseManager] Failed to initialize:', error);
            throw error;
        }
    }

    /**
     * Ensure the directory for the database file exists.
     */
    async _ensureDirectory() {
        const directory = path.dirname(this._databasePath);
        await fs.mkdir(directory, { recursive: true });
    }

    /**
     * Ensure the database file exists; if not, create it with an empty array.
     */
    async _ensureFile() {
        try {
            await fs.access(this._databasePath);
        } catch (err) {
            if (err.code === 'ENOENT') {
                // File does not exist, create with empty array
                await fs.writeFile(this._databasePath, JSON.stringify([], null, 4), 'utf8');
                console.log('[DatabaseManager] Created new database file');
            } else {
                throw err;
            }
        }
    }

    /**
     * Load all devices from the JSON file.
     * @returns {Promise<Array>} Array of device objects
     */
    async loadDevices() {
        await this._ensureInitialized();
        try {
            const content = await fs.readFile(this._databasePath, 'utf8');
            const parsed = JSON.parse(content);
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            if (error.code === 'ENOENT') {
                return [];
            }
            console.error('[DatabaseManager] Failed to load devices:', error);
            throw error;
        }
    }

    /**
     * Save all devices to the JSON file.
     * @param {Array} devices - Array of device objects
     */
    async saveDevices(devices = []) {
        await this._ensureInitialized();
        await this._ensureDirectory();
        await fs.writeFile(this._databasePath, JSON.stringify(devices, null, 4), 'utf8');
    }

    /**
     * Insert a new device into the database.
     * @param {Object} device - Device object to insert
     * @returns {Promise<Object>} The inserted device
     */
    async insertDevice(device) {
        const devices = await this.loadDevices();
        devices.push(device);
        await this.saveDevices(devices);
        return device;
    }

    /**
     * Update an existing device by ID.
     * @param {string} deviceId - ID of the device to update
     * @param {Object|Function} updater - Either a partial object or a function that receives current and returns updated
     * @returns {Promise<Object|null>} Updated device or null if not found
     */
    async updateDevice(deviceId, updater) {
        const devices = await this.loadDevices();
        const index = devices.findIndex(device => device.id === deviceId);
        if (index === -1) return null;

        const current = devices[index];
        const updated = typeof updater === 'function' ? updater(current) : { ...current, ...updater };
        devices[index] = updated;
        await this.saveDevices(devices);
        return updated;
    }

    /**
     * Delete a device by ID.
     * @param {string} deviceId - ID of the device to delete
     * @returns {Promise<boolean>} True if deleted, false if not found
     */
    async deleteDevice(deviceId) {
        const devices = await this.loadDevices();
        const filtered = devices.filter(device => device.id !== deviceId);
        if (filtered.length === devices.length) return false;
        await this.saveDevices(filtered);
        return true;
    }

    /**
     * Close the database connection (placeholder for future enhancements like using better-sqlite3).
     * Currently no-op but kept for API compatibility.
     */
    async close() {
        // Future implementation: close DB connection if using SQLite
        console.log('[DatabaseManager] Closed (no-op)');
    }

    /**
     * Ensure that initDb has been called before any operation.
     * @private
     */
    async _ensureInitialized() {
        if (!this._initialized) {
            await this.initDb();
        }
    }
}

module.exports = DatabaseManager;