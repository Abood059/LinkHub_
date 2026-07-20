// src/cli/CommandHandler.js
'use strict';

const { COMMANDS, MESSAGES } = require('./constants');

class CommandHandler {
    constructor(cliRenderer, deviceOrchestrator, downloadOrchestrator, deviceRegistry) {
        this.cliRenderer = cliRenderer;
        this.deviceOrchestrator = deviceOrchestrator;
        this.downloadOrchestrator = downloadOrchestrator;
        this.deviceRegistry = deviceRegistry;
    }

    async handleCommand(command) {
        if (!command || command.trim() === '') return;

        const parts = command.trim().split(/\s+/);
        const cmd = parts[0].toLowerCase();
        const args = parts.slice(1);

        this.cliRenderer.log(`> ${command}`, 'info');

        try {
            switch (cmd) {
                case COMMANDS.DEVICES:
                    await this._handleDevices(args);
                    break;
                case COMMANDS.CONNECT:
                    await this._handleConnect(args);
                    break;
                case COMMANDS.PAIR:
                    await this._handlePair(args);
                    break;
                case COMMANDS.STREAM:
                    await this._handleStream(args);
                    break;
                case COMMANDS.STOP:
                    await this._handleStop(args);
                    break;
                case COMMANDS.DOWNLOADS:
                    await this._handleDownloads();
                    break;
                case COMMANDS.DOWNLOAD:
                    await this._handleDownload(args);
                    break;
                case COMMANDS.SELECT:
                    await this._handleSelect(args);
                    break;
                case COMMANDS.UNSELECT:
                    await this._handleUnselect(args);
                    break;
                case COMMANDS.STOP_DL:
                    await this._handleStopDownload(args);
                    break;
                case COMMANDS.HELP:
                    this.cliRenderer.showHelp();
                    break;
                case COMMANDS.EXIT:
                case COMMANDS.Q:
                    this.cliRenderer.emit('exit');
                    break;
                default:
                    this.cliRenderer.log(MESSAGES.INVALID_COMMAND, 'error');
            }
        } catch (error) {
            this.cliRenderer.log(`Error: ${error.message}`, 'error');
        }

        // Refocus input after command handling
        this.cliRenderer.focusInput();
    }

    async _handleDevices(args) {
        if (args.length > 0 && args[0] === 'refresh') {
            this.cliRenderer.log('Refreshing devices...', 'info');
            const connectionService = this.deviceOrchestrator._connectionService;
            await connectionService.discoverDevices();
        } else {
            // Just refresh the display
            const devices = this.deviceOrchestrator.getAllDevices();
            this.cliRenderer.updateDevices(devices);
        }
    }

    async _handleConnect(args) {
        if (args.length === 0) {
            this.cliRenderer.log('Usage: connect <target> [friendlyName]', 'warning');
            return;
        }

        const target = args[0];
        const friendlyName = args[1] || null;

        this.cliRenderer.log(MESSAGES.CONNECTING, 'info');
        const device = await this.deviceOrchestrator.connectDevice(target, friendlyName);
        this.cliRenderer.log(`Connected: ${device.deviceFriendlyName}`, 'success');
    }

    async _handlePair(args) {
        if (args.length < 2) {
            this.cliRenderer.log('Usage: pair <host:port> <pairingCode>', 'warning');
            return;
        }

        const host = args[0];
        const pairingCode = args[1];

        this.cliRenderer.log(MESSAGES.PAIRING, 'info');
        await this.deviceOrchestrator.pairDevice(host, pairingCode);
        this.cliRenderer.log(`Paired with ${host}`, 'success');
    }

    async _handleStream(args) {
        if (args.length === 0) {
            this.cliRenderer.log('Usage: stream <#>', 'warning');
            return;
        }

        const refNum = parseInt(args[0], 10);
        if (isNaN(refNum) || refNum < 1) {
            this.cliRenderer.log(MESSAGES.INVALID_NUMBER, 'error');
            return;
        }

        const device = this._getDeviceByRefNumber(refNum);
        if (!device) {
            this.cliRenderer.log(MESSAGES.DEVICE_NOT_FOUND, 'error');
            return;
        }

        this.cliRenderer.log(MESSAGES.STREAMING_START, 'info');
        await this.deviceOrchestrator.startStreaming(device.device.id);
        this.cliRenderer.log(`Streaming started for ${device.device.deviceFriendlyName}`, 'success');
    }

    async _handleStop(args) {
        if (args.length === 0) {
            this.cliRenderer.log('Usage: stop <#>', 'warning');
            return;
        }

        const refNum = parseInt(args[0], 10);
        if (isNaN(refNum) || refNum < 1) {
            this.cliRenderer.log(MESSAGES.INVALID_NUMBER, 'error');
            return;
        }

        const device = this._getDeviceByRefNumber(refNum);
        if (!device) {
            this.cliRenderer.log(MESSAGES.DEVICE_NOT_FOUND, 'error');
            return;
        }

        this.cliRenderer.log(MESSAGES.STREAMING_STOP, 'info');
        await this.deviceOrchestrator.stopStreaming(device.device.id);
        this.cliRenderer.log(`Streaming stopped for ${device.device.deviceFriendlyName}`, 'success');
    }

    async _handleDownloads() {
        this.cliRenderer.log('Active downloads:', 'info');
        // Downloads table is already updated via EventBridge
        // Just refresh the display
        this.cliRenderer.log('See downloads table above', 'info');
    }

    async _handleDownload(args) {
        if (args.length === 0) {
            this.cliRenderer.log('Usage: download <url> [formatId]', 'warning');
            return;
        }

        const url = args[0];
        const formatId = args[1] || 'best'; // Default to best format

        // Get selected devices or all connected devices
        const selectedDevices = Array.from(this.cliRenderer.selectedDevices);
        let targetDevices = selectedDevices;

        if (targetDevices.length === 0) {
            // Use all connected devices
            const allDevices = this.deviceRegistry.getAllDevices();
            targetDevices = allDevices
                .map(d => d.id)
                .filter(id => {
                    const state = this.deviceRegistry.getRuntimeState(id);
                    return state?.status === 'connected';
                });
        }

        if (targetDevices.length === 0) {
            this.cliRenderer.log('No connected devices. Use "select <#>" to select devices first.', 'warning');
            return;
        }

        this.cliRenderer.log(MESSAGES.DOWNLOAD_START, 'info');
        this.cliRenderer.log(`Starting download for ${targetDevices.length} device(s)`, 'info');

        // Start download for each device
        for (const deviceId of targetDevices) {
            try {
                const result = await this.downloadOrchestrator.startDownload(url, formatId, deviceId);
                this.cliRenderer.log(`Download started: ${result.processId}`, 'success');
            } catch (error) {
                this.cliRenderer.log(`Failed to start download for ${deviceId}: ${error.message}`, 'error');
            }
        }
    }

    async _handleSelect(args) {
        if (args.length === 0) {
            this.cliRenderer.log('Usage: select <#>', 'warning');
            return;
        }

        const refNum = parseInt(args[0], 10);
        if (isNaN(refNum) || refNum < 1) {
            this.cliRenderer.log(MESSAGES.INVALID_NUMBER, 'error');
            return;
        }

        const device = this._getDeviceByRefNumber(refNum);
        if (!device) {
            this.cliRenderer.log(MESSAGES.DEVICE_NOT_FOUND, 'error');
            return;
        }

        this.cliRenderer.selectDevice(device.device.id);
        this.cliRenderer.log(MESSAGES.DEVICE_SELECTED, 'success');
    }

    async _handleUnselect(args) {
        if (args.length === 0) {
            this.cliRenderer.log('Usage: unselect <#>', 'warning');
            return;
        }

        const refNum = parseInt(args[0], 10);
        if (isNaN(refNum) || refNum < 1) {
            this.cliRenderer.log(MESSAGES.INVALID_NUMBER, 'error');
            return;
        }

        const device = this._getDeviceByRefNumber(refNum);
        if (!device) {
            this.cliRenderer.log(MESSAGES.DEVICE_NOT_FOUND, 'error');
            return;
        }

        this.cliRenderer.unselectDevice(device.device.id);
        this.cliRenderer.log(MESSAGES.DEVICE_UNSELECTED, 'success');
    }

    async _handleStopDownload(args) {
        if (args.length === 0) {
            this.cliRenderer.log('Usage: stop-dl <#>', 'warning');
            return;
        }

        const refNum = parseInt(args[0], 10);
        if (isNaN(refNum) || refNum < 1) {
            this.cliRenderer.log(MESSAGES.INVALID_NUMBER, 'error');
            return;
        }

        const downloadId = this._getDownloadIdByRefNumber(refNum);
        if (!downloadId) {
            this.cliRenderer.log(MESSAGES.DOWNLOAD_NOT_FOUND, 'error');
            return;
        }

        this.cliRenderer.log(MESSAGES.DOWNLOAD_STOP, 'info');
        const stopResult = this.downloadOrchestrator.stopDownload(downloadId);
        
        if (stopResult.success) {
            const statusMsg = stopResult.wasRunning ? 'stopped' : 'was not running';
            this.cliRenderer.log(`Download ${statusMsg}: ${downloadId}`, 'success');
            this.cliRenderer.removeDownload(downloadId);
        } else {
            const reason = stopResult.reason || 'unknown';
            this.cliRenderer.log(`Failed to stop download: ${downloadId} (reason: ${reason})`, 'error');
        }
    }

    _getDeviceByRefNumber(refNum) {
        const devices = this.deviceOrchestrator.getAllDevices();
        const index = refNum - 1;
        if (index >= 0 && index < devices.length) {
            return devices[index];
        }
        return null;
    }

    _getDownloadIdByRefNumber(refNum) {
        const downloads = Array.from(this.cliRenderer.downloads.entries());
        const index = refNum - 1;
        if (index >= 0 && index < downloads.length) {
            return downloads[index][0]; // Return downloadId
        }
        return null;
    }
}

module.exports = CommandHandler;
