// src/cli/CliRenderer.js
'use strict';

const blessed = require('neo-blessed');
const chalk = require('chalk');
const { COLORS, LAYOUT, MESSAGES } = require('./constants');

class CliRenderer {
    constructor() {
        this.screen = blessed.screen({
            smartCSR: true,
            title: 'LinkHub CLI',
            fullUnicode: true
        });

        this.devices = [];
        this.downloads = new Map(); // downloadId -> download info
        this.selectedDevices = new Set();
        this.inputBuffer = '';

        this._setupLayout();
        this._setupKeyBindings();
    }

    _setupLayout() {
        // Devices table (top)
        this.devicesBox = blessed.box({
            top: 0,
            left: 0,
            width: '100%',
            height: LAYOUT.DEVICES_HEIGHT,
            label: ' {bold}Devices{/bold} ',
            border: { type: 'line' },
            style: {
                border: { fg: COLORS.INFO },
                label: { fg: COLORS.INFO }
            }
        });
        this.screen.append(this.devicesBox);

        // Downloads table (middle)
        this.downloadsBox = blessed.box({
            top: LAYOUT.DEVICES_HEIGHT,
            left: 0,
            width: '100%',
            height: LAYOUT.DOWNLOADS_HEIGHT,
            label: ' {bold}Downloads{/bold} ',
            border: { type: 'line' },
            style: {
                border: { fg: COLORS.DOWNLOADING },
                label: { fg: COLORS.DOWNLOADING }
            }
        });
        this.screen.append(this.downloadsBox);

        // Log area (bottom-middle)
        this.logBox = blessed.box({
            top: `${parseInt(LAYOUT.DEVICES_HEIGHT) + parseInt(LAYOUT.DOWNLOADS_HEIGHT)}%`,
            left: 0,
            width: '100%',
            height: LAYOUT.LOG_HEIGHT,
            label: ' {bold}Log{/bold} ',
            border: { type: 'line' },
            scrollable: true,
            alwaysScroll: true,
            style: {
                border: { fg: 'white' },
                label: { fg: 'white' }
            }
        });
        this.screen.append(this.logBox);

        // Input area (bottom)
        this.inputBox = blessed.box({
            bottom: 0,
            left: 0,
            width: '100%',
            height: LAYOUT.INPUT_HEIGHT,
            label: ' {bold}Command{/bold} ',
            border: { type: 'line' },
            style: {
                border: { fg: COLORS.SUCCESS },
                label: { fg: COLORS.SUCCESS }
            }
        });
        this.screen.append(this.inputBox);
        this._updateInputDisplay();

        this.log(MESSAGES.INITIALIZING);
    }

    _setupKeyBindings() {
        this.screen.key(['escape', 'q', 'C-c'], () => {
            this.emit('exit');
        });

        // Manual input handling using screen keypress
        this.screen.on('keypress', (ch, key) => {
            if (!key) return;

            // Enter: submit command
            if (key.name === 'enter') {
                const command = this.inputBuffer;
                this.inputBuffer = '';
                this._updateInputDisplay();
                this.emit('command', command);
                return;
            }

            // Backspace: delete last character
            if (key.name === 'backspace' || key.name === 'delete') {
                this.inputBuffer = this.inputBuffer.slice(0, -1);
                this._updateInputDisplay();
                return;
            }

            // Ignore control and meta keys
            if (key.ctrl || key.meta) {
                return;
            }

            // Add printable characters
            if (ch && ch.length === 1 && ch >= ' ' && ch <= '~') {
                this.inputBuffer += ch;
                this._updateInputDisplay();
            }
        });
    }

    _updateInputDisplay() {
        const displayText = '> ' + this.inputBuffer + '█';
        this.inputBox.setContent(displayText);
        this.screen.render();
    }

    updateDevices(devices) {
        this.devices = devices;
        this._renderDevices();
    }

    _renderDevices() {
        let content = '';
        
        if (this.devices.length === 0) {
            content = chalk.yellow(MESSAGES.NO_DEVICES);
        } else {
            // Header
            content += chalk.bold('  #  | ID                | Name              | Status    | Type   | Model\n');
            content += chalk.gray('-----+-------------------+-------------------+-----------+--------+----------\n');
            
            // Rows
            this.devices.forEach((item, index) => {
                const device = item.device;
                const runtimeState = item.runtimeState;
                const status = runtimeState?.status || 'unknown';
                const refNum = index + 1;
                
                // Color based on status
                let statusColor = COLORS.OFFLINE;
                if (status === 'connected') statusColor = COLORS.CONNECTED;
                else if (status === 'streaming') statusColor = COLORS.DOWNLOADING;
                
                const selected = this.selectedDevices.has(device.id) ? '*' : ' ';
                const statusText = chalk[statusColor](status.padEnd(9));
                
                content += ` ${selected} ${chalk.bold(refNum.toString().padEnd(2))} | ${device.id.substring(0, 17).padEnd(17)} | ${device.deviceFriendlyName.substring(0, 17).padEnd(17)} | ${statusText} | ${(runtimeState?.connectionType || 'N/A').padEnd(6)} | ${device.model.padEnd(8)}\n`;
            });
        }
        
        this.devicesBox.setContent(content);
        this.screen.render();
    }

    updateDownload(downloadData) {
        const { downloadId, percent, deviceId, url, status } = downloadData;
        
        this.downloads.set(downloadId, {
            downloadId,
            percent: percent || 0,
            deviceId,
            url,
            status: status || 'downloading'
        });
        
        this._renderDownloads();
    }

    _renderDownloads() {
        let content = '';
        
        if (this.downloads.size === 0) {
            content = chalk.yellow(MESSAGES.NO_DOWNLOADS);
        } else {
            // Header
            content += chalk.bold('  #  | Download ID       | Progress | Device            | URL\n');
            content += chalk.gray('-----+-------------------+----------+-------------------+----------------------------------------\n');
            
            // Rows
            let index = 1;
            for (const [downloadId, info] of this.downloads.entries()) {
                const refNum = index++;
                const progress = Math.round(info.percent).toString().padEnd(8);
                
                // Progress bar
                const barWidth = 20;
                const filled = Math.floor((info.percent / 100) * barWidth);
                const empty = barWidth - filled;
                const progressBar = '[' + chalk.green('#'.repeat(filled)) + '.'.repeat(empty) + ']';
                
                const statusColor = info.status === 'completed' ? COLORS.COMPLETED :
                                   info.status === 'failed' ? COLORS.FAILED :
                                   info.status === 'stopped' ? COLORS.STOPPED :
                                   COLORS.DOWNLOADING;
                
                const deviceId = info.deviceId || 'N/A';
                const urlShort = info.url.length > 40 ? info.url.substring(0, 37) + '...' : info.url;
                
                content += ` ${chalk.bold(refNum.toString().padEnd(2))} | ${downloadId.substring(0, 17).padEnd(17)} | ${progressBar} ${chalk[statusColor](progress)}% | ${deviceId.substring(0, 17).padEnd(17)} | ${urlShort}\n`;
            }
        }
        
        this.downloadsBox.setContent(content);
        this.screen.render();
    }

    removeDownload(downloadId) {
        this.downloads.delete(downloadId);
        this._renderDownloads();
    }

    selectDevice(deviceId) {
        this.selectedDevices.add(deviceId);
        this._renderDevices();
    }

    unselectDevice(deviceId) {
        this.selectedDevices.delete(deviceId);
        this._renderDevices();
    }

    log(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        let color = 'white';
        if (type === 'error') color = COLORS.ERROR;
        else if (type === 'success') color = COLORS.SUCCESS;
        else if (type === 'warning') color = COLORS.WARNING;
        
        const logMessage = chalk.gray(`[${timestamp}]`) + ' ' + chalk[color](message) + '\n';
        this.logBox.pushLine(logMessage);
        this.logBox.setScrollPerc(100);
        this.screen.render();
    }

    showHelp() {
        const { HELP_TEXT } = require('./constants');
        this.log(HELP_TEXT, 'info');
    }

    focusInput() {
        // Input is always ready, no need to focus
        this.screen.render();
    }

    render() {
        this.screen.render();
    }

    // EventEmitter methods
    on(event, callback) {
        this.screen.on(event, callback);
    }

    emit(event, data) {
        this.screen.emit(event, data);
    }
}

module.exports = CliRenderer;
