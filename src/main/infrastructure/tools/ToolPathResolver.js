// src/main/infrastructure/tools/ToolPathResolver.js
'use strict';

const path = require('path');
const fs = require('fs');

/**
 * ToolPathResolver
 * Unified path resolver for external binaries (adb, scrcpy, yt-dlp).
 * 
 * Supports:
 * - Environment variable overrides (LINKHUB_ADB_PATH, LINKHUB_SCRCPY_PATH, LINKHUB_YTDLP_PATH)
 * - Platform-specific subdirectories (win, linux, darwin)
 * - Fallback to resources/bin relative to Electron app root
 * 
 * This class does NOT:
 * - Spawn processes
 * - Implement business logic
 * - Depend on other services except Node.js core and electron (optional)
 */
class ToolPathResolver {
    /**
     * @param {Object} options
     * @param {string} [options.appRoot] - Override app root path (default: resolve using Electron app or cwd)
     * @param {Function} [options.logger] - Optional logger (e.g., ErrorCentralService)
     */
    constructor(options = {}) {
        this._logger = options.logger || null;
        this._appRoot = this._resolveAppRoot(options.appRoot);
        this._platform = process.platform;
        this._binSubDir = this._getBinSubDir();
    }

    /**
     * Resolves the application root directory where `resources/bin` is located.
     * Prioritizes Electron app path if available, otherwise falls back to cwd.
     */
    _resolveAppRoot(explicitRoot) {
        if (explicitRoot) {
            return explicitRoot;
        }

        // Try to use Electron's app.getAppPath() if available
        try {
            const { app } = require('electron');
            if (app && typeof app.getAppPath === 'function') {
                // getAppPath returns the path to the app's root (where package.json is)
                return app.getAppPath();
            }
        } catch (err) {
            // Electron not available or not ready yet
            if (this._logger) {
                this._logger.warn('ToolPathResolver: Electron app not available, using cwd');
            }
        }

        // Fallback to current working directory (development mode)
        return process.cwd();
    }

    /**
     * Returns platform-specific binary subdirectory name.
     */
    _getBinSubDir() {
        switch (this._platform) {
            case 'win32':
                return 'win';
            case 'linux':
                return 'linux';
            case 'darwin':
                return 'macos'; // أو 'darwin' حسب هيكل مجلداتك، نختار 'macos'
            default:
                throw new Error(`Unsupported platform: ${this._platform}`);
        }
    }

    /**
     * Builds the full path to a binary inside resources/bin.
     * @param {string} binaryName - e.g., 'adb', 'scrcpy', 'yt-dlp'
     * @returns {string}
     */
    _getDefaultPath(binaryName) {
        // On Windows, ensure .exe extension if not present
        let finalBinaryName = binaryName;
        if (this._platform === 'win32' && !finalBinaryName.toLowerCase().endsWith('.exe')) {
            finalBinaryName += '.exe';
        }
        return path.join(this._appRoot, 'resources', 'bin', this._binSubDir, finalBinaryName);
    }

    /**
     * Generic getter with environment variable override and existence check.
     * @param {string} envVarName
     * @param {string} binaryName
     * @returns {string}
     * @throws {Error} if binary not found
     */
    _getPath(envVarName, binaryName) {
        // 1. Check environment variable
        const envPath = process.env[envVarName];
        if (envPath && typeof envPath === 'string' && envPath.trim()) {
            if (fs.existsSync(envPath)) {
                return envPath;
            }
            const msg = `ToolPathResolver: Environment override ${envVarName}=${envPath} points to non-existent file.`;
            if (this._logger) {
                this._logger.error(msg);
            }
            throw new Error(msg);
        }

        // 2. Default path inside resources/bin
        const defaultPath = this._getDefaultPath(binaryName);
        if (fs.existsSync(defaultPath)) {
            return defaultPath;
        }

        // 3. Not found
        const msg = `ToolPathResolver: Required binary "${binaryName}" not found at ${defaultPath}. Set ${envVarName} to override.`;
        if (this._logger) {
            this._logger.error(msg);
        }
        throw new Error(msg);
    }

    /**
     * Returns full path to ADB executable.
     * Override via LINKHUB_ADB_PATH environment variable.
     */
    getAdbPath() {
        return this._getPath('LINKHUB_ADB_PATH', 'adb');
    }

    /**
     * Returns full path to scrcpy executable.
     * Override via LINKHUB_SCRCPY_PATH environment variable.
     */
    getScrcpyPath() {
        return this._getPath('LINKHUB_SCRCPY_PATH', 'scrcpy');
    }

    /**
     * Returns full path to yt-dlp executable.
     * Override via LINKHUB_YTDLP_PATH environment variable.
     */
    getYtDlpPath() {
        return this._getPath('LINKHUB_YTDLP_PATH', 'yt-dlp');
    }

    /**
     * Optional: Verify all required tools exist at once.
     * @returns {Object} { adb: boolean, scrcpy: boolean, ytdlp: boolean }
     */
    verifyAll() {
        const result = {
            adb: false,
            scrcpy: false,
            ytdlp: false
        };
        try {
            result.adb = !!this.getAdbPath();
        } catch (e) { /* ignore */ }
        try {
            result.scrcpy = !!this.getScrcpyPath();
        } catch (e) { /* ignore */ }
        try {
            result.ytdlp = !!this.getYtDlpPath();
        } catch (e) { /* ignore */ }
        return result;
    }
}

module.exports = ToolPathResolver;