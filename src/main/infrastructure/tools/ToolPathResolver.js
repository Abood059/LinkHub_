// src/main/infrastructure/tools/ToolPathResolver.js
'use strict';

const path = require('path');
const fs = require('fs');
const { sanitizePath } = require('../../utils/pathSanitizer');

class ToolPathResolver {
    constructor(options = {}) {
        this._logger = options.logger || null;
        this._appRoot = this._resolveAppRoot(options.appRoot);
        this._platform = process.platform;
        this._binSubDir = this._getBinSubDir();
    }

    _resolveAppRoot(explicitRoot) {
        if (explicitRoot) {
            return explicitRoot;
        }
        try {
            const { app } = require('electron');
            if (app && typeof app.getAppPath === 'function') {
                return app.getAppPath();
            }
        } catch (err) {
            if (this._logger) {
                this._logger.warn('ToolPathResolver: Electron app not available, using cwd');
            }
        }
        return process.cwd();
    }

    _getBinSubDir() {
        switch (this._platform) {
            case 'win32': return 'win';
            case 'linux': return 'linux';
            case 'darwin': return 'macos';
            default: throw new Error(`Unsupported platform: ${this._platform}`);
        }
    }

    _getDefaultPath(binaryName) {
        let finalBinaryName = binaryName;
        if (this._platform === 'win32' && !finalBinaryName.toLowerCase().endsWith('.exe')) {
            finalBinaryName += '.exe';
        }
        return path.join(this._appRoot, 'resources', 'bin', this._binSubDir, finalBinaryName);
    }

    _getPath(envVarName, binaryName) {
        const envPath = process.env[envVarName];
        if (envPath && typeof envPath === 'string' && envPath.trim()) {
            const sanitizedPath = sanitizePath(this._appRoot, envPath, this._logger);
            if (sanitizedPath && fs.existsSync(sanitizedPath)) {
                return sanitizedPath;
            }
            if (this._logger) {
                this._logger.warn(`ToolPathResolver: Environment override ${envVarName} points to non-existent or invalid file.`);
            }
            return null;
        }
    
        const defaultPath = this._getDefaultPath(binaryName);
        if (fs.existsSync(defaultPath)) {
            return defaultPath;
        }
    
        if (this._logger) {
            this._logger.warn(`ToolPathResolver: Optional binary "${binaryName}" not found at ${defaultPath}.`);
        }
        return null; 
    }

    getAdbPath() {
        return this._getPath('LINKHUB_ADB_PATH', 'adb');
    }

    getScrcpyPath() {
        return this._getPath('LINKHUB_SCRCPY_PATH', 'scrcpy');
    }

    getYtDlpPath() {
        return this._getPath('LINKHUB_YTDLP_PATH', 'yt-dlp');
    }

    getDenoPath() {
        return this._getPath('LINKHUB_DENO_PATH', 'deno');
    }

    verifyAll() {
        const result = { adb: false, scrcpy: false, ytdlp: false };
        try { result.adb = !!this.getAdbPath(); } catch (e) { /* ignore */ }
        try { result.scrcpy = !!this.getScrcpyPath(); } catch (e) { /* ignore */ }
        try { result.ytdlp = !!this.getYtDlpPath(); } catch (e) { /* ignore */ }
        return result;
    }
}

module.exports = ToolPathResolver;