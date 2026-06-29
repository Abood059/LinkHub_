// src/cli/constants.js
'use strict';

module.exports = {
    // Commands
    COMMANDS: {
        DEVICES: 'devices',
        DEVICES_REFRESH: 'devices refresh',
        CONNECT: 'connect',
        PAIR: 'pair',
        STREAM: 'stream',
        STOP: 'stop',
        DOWNLOADS: 'downloads',
        DOWNLOAD: 'download',
        SELECT: 'select',
        UNSELECT: 'unselect',
        STOP_DL: 'stop-dl',
        HELP: 'help',
        EXIT: 'exit',
        Q: 'q'
    },

    // Color schemes for terminal
    COLORS: {
        CONNECTED: 'green',
        OFFLINE: 'red',
        DOWNLOADING: 'yellow',
        COMPLETED: 'green',
        FAILED: 'red',
        STOPPED: 'grey',
        INFO: 'blue',
        ERROR: 'red',
        SUCCESS: 'green',
        WARNING: 'yellow'
    },

    // Help text
    HELP_TEXT: `
LinkHub CLI Commands:
=====================

Device Management:
  devices              - List all connected devices
  devices refresh      - Refresh device list from ADB
  connect <target>     - Connect to device (e.g., 192.168.1.10:5555)
  pair <host> <code>   - Pair with wireless device (e.g., 192.168.1.10:37000 123456)

Streaming:
  stream <#>           - Start screen mirroring for device # (from table)
  stop <#>             - Stop screen mirroring for device #

Downloads:
  downloads            - List active downloads
  download <url> [fmt] - Download from URL (optional format ID, defaults to 'best')
  select <#>           - Select device # for downloads
  unselect <#>         - Deselect device #
  stop-dl <#>          - Stop download # (from downloads table)

General:
  help                 - Show this help message
  exit / q             - Exit the CLI

Examples:
  connect 192.168.1.10:5555
  stream 1
  download https://youtube.com/watch?v=xyz 137
  select 1
  stop-dl 1
`,

    // Messages
    MESSAGES: {
        INITIALIZING: 'Initializing LinkHub CLI...',
        READY: 'LinkHub CLI ready. Type "help" for commands.',
        EXITING: 'Shutting down gracefully...',
        INVALID_COMMAND: 'Invalid command. Type "help" for available commands.',
        DEVICE_NOT_FOUND: 'Device not found. Check the device table.',
        DOWNLOAD_NOT_FOUND: 'Download not found. Check the downloads table.',
        INVALID_NUMBER: 'Invalid number. Must be a positive integer.',
        CONNECTING: 'Connecting to device...',
        PAIRING: 'Pairing with device...',
        STREAMING_START: 'Starting screen mirroring...',
        STREAMING_STOP: 'Stopping screen mirroring...',
        DOWNLOAD_START: 'Starting download...',
        DOWNLOAD_STOP: 'Stopping download...',
        DEVICE_SELECTED: 'Device selected.',
        DEVICE_UNSELECTED: 'Device deselected.',
        NO_DEVICES: 'No devices connected.',
        NO_DOWNLOADS: 'No active downloads.'
    },

    // TUI Layout
    LAYOUT: {
        DEVICES_HEIGHT: '35%',
        DOWNLOADS_HEIGHT: '35%',
        LOG_HEIGHT: '15%',
        INPUT_HEIGHT: '15%'
    },

    // ADB monitoring interval (ms)
    ADB_MONITOR_INTERVAL: 500
};
