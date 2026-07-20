// src/cli/EventBridge.js
'use strict';

class EventBridge {
    constructor(cliRenderer, connectionService, ytdlpAdapter) {
        this.cliRenderer = cliRenderer;
        this.connectionService = connectionService;
        this.ytdlpAdapter = ytdlpAdapter;
        this.deviceRegistry = null;
    }

    setDeviceRegistry(deviceRegistry) {
        this.deviceRegistry = deviceRegistry;
    }

    start() {
        this._setupConnectionEvents();
        this._setupDownloadEvents();
    }

    _setupConnectionEvents() {
        // ADB devices updated
        this.connectionService.on('adbDevices', (devices) => {
            this._handleAdbDevices(devices);
        });

        // Device discovered
        this.connectionService.on('devicesDiscovered', (devices) => {
            this._handleAdbDevices(devices);
        });

        // Connection success
        this.connectionService.on('connectSuccess', ({ target }) => {
            this.cliRenderer.log(`Connected to ${target}`, 'success');
        });

        // Pair success
        this.connectionService.on('pairSuccess', ({ host }) => {
            this.cliRenderer.log(`Paired with ${host}`, 'success');
        });

        // Disconnect
        this.connectionService.on('disconnect', ({ target }) => {
            this.cliRenderer.log(`Disconnected from ${target}`, 'warning');
        });

        // Error
        this.connectionService.on('error', (error) => {
            this.cliRenderer.log(`Connection error: ${error.message}`, 'error');
        });

        // Wireless service found
        this.connectionService.on('wirelessServiceFound', (service) => {
            this.cliRenderer.log(`Wireless device found: ${service.name} at ${service.host}:${service.port}`, 'info');
        });
    }

    _setupDownloadEvents() {
        // Download progress
        this.ytdlpAdapter.on('downloadProgress', (data) => {
            this.cliRenderer.updateDownload(data);
        });

        // Download complete
        this.ytdlpAdapter.on('downloadComplete', (data) => {
            this.cliRenderer.updateDownload({ ...data, status: 'completed', percent: 100 });
            this.cliRenderer.log(`Download complete: ${data.outputPath}`, 'success');
        });

        // Download error
        this.ytdlpAdapter.on('downloadError', (data) => {
            this.cliRenderer.updateDownload({ ...data, status: 'failed', percent: 0 });
            this.cliRenderer.log(`Download failed: ${data.error}`, 'error');
        });

        // Download stopped
        this.ytdlpAdapter.on('downloadStopped', (data) => {
            this.cliRenderer.updateDownload({ ...data, status: 'stopped' });
            this.cliRenderer.log(`Download stopped: ${data.downloadId}`, 'warning');
        });
    }

    _handleAdbDevices(devices) {
        if (!this.deviceRegistry) return;

        // Get all devices from registry with their runtime states
        const allDevices = this.deviceRegistry.getAllDevices().map(device => ({
            device: device,
            runtimeState: this.deviceRegistry.getRuntimeState(device.id)?.toJSON() || null
        }));

        // If ADB returned devices, sync them with registry
        if (devices && devices.length > 0) {
            devices.forEach(adbDevice => {
                const deviceId = adbDevice.serial;
                const existingDevice = this.deviceRegistry.getDevice(deviceId);
                
                if (existingDevice) {
                    // Update runtime state
                    this.deviceRegistry.updateState(deviceId, {
                        status: adbDevice.state === 'device' ? 'connected' : 'offline',
                        lastSeen: new Date()
                    });
                } else {
                    // New device discovered via ADB
                    const Device = require('../main/domain/entities/Device');
                    const newDevice = new Device({
                        id: deviceId,
                        deviceFriendlyName: deviceId,
                        model: 'Unknown',
                        version: 'Unknown',
                        arch: 'Unknown',
                        isFavorite: false
                    });
                    this.deviceRegistry.registerDevice(newDevice);
                    this.deviceRegistry.updateState(deviceId, {
                        status: adbDevice.state === 'device' ? 'connected' : 'offline',
                        connectionType: 'USB',
                        adbTarget: deviceId,
                        lastSeen: new Date()
                    });
                }
            });
        }

        // Refresh the display
        const refreshedDevices = this.deviceRegistry.getAllDevices().map(device => ({
            device: device,
            runtimeState: this.deviceRegistry.getRuntimeState(device.id)?.toJSON() || null
        }));

        this.cliRenderer.updateDevices(refreshedDevices);
    }

    stop() {
        // Remove all event listeners
        this.connectionService.removeAllListeners();
        this.ytdlpAdapter.removeAllListeners();
    }
}

module.exports = EventBridge;
