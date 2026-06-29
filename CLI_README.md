# LinkHub CLI

A standalone terminal-based interface (TUI) for LinkHub that allows you to manage Android devices and downloads without the Electron GUI.

## Features

- **Device Management**: Connect, pair, and monitor Android devices via ADB
- **Screen Mirroring**: Start/stop scrcpy streaming for connected devices
- **Media Downloads**: Download videos/audio using yt-dlp to connected devices
- **Real-time Updates**: Automatic device and download status updates
- **Reference Numbers**: Use simple numbers (#) to reference devices and downloads in commands

## Installation

The CLI is included with LinkHub. First, install the dependencies:

```bash
npm install
```

## Usage

Start the CLI:

```bash
npm run cli
```

## Interface Layout

The CLI interface is divided into 4 sections:

1. **Devices Table (Top)**: Shows connected devices with status, connection type, and model
2. **Downloads Table (Middle)**: Shows active downloads with progress bars
3. **Log Area (Bottom-Middle)**: Displays system messages and command feedback
4. **Command Input (Bottom)**: Where you type commands

## Commands

### Device Management

```
devices              - List all connected devices
devices refresh      - Refresh device list from ADB
connect <target>     - Connect to device (e.g., 192.168.1.10:5555)
pair <host> <code>   - Pair with wireless device (e.g., 192.168.1.10:37000 123456)
```

### Streaming

```
stream <#>           - Start screen mirroring for device # (from table)
stop <#>             - Stop screen mirroring for device #
```

### Downloads

```
downloads            - List active downloads
download <url> [fmt] - Download from URL (optional format ID, defaults to 'best')
select <#>           - Select device # for downloads
unselect <#>         - Deselect device #
stop-dl <#>          - Stop download # (from downloads table)
```

### General

```
help                 - Show this help message
exit / q             - Exit the CLI
```

## Reference Numbers

Each device and download in the tables has a reference number (#) in the first column. Use these numbers to quickly reference items in commands:

- `stream 1` - Start streaming for device #1
- `stop 2` - Stop streaming for device #2
- `select 1` - Select device #1 for downloads
- `stop-dl 1` - Stop download #1

## Examples

### Connect to a wireless device

```
pair 192.168.1.10:37000 123456
connect 192.168.1.10:5555
```

### Start screen mirroring

```
stream 1
```

### Download a video

```
download https://youtube.com/watch?v=xyz 137
```

Or with default format:

```
download https://youtube.com/watch?v=xyz
```

### Download to specific devices

```
select 1
select 2
download https://youtube.com/watch?v=xyz
```

## Device Selection

By default, downloads are sent to all connected devices. To target specific devices:

1. Use `select <#>` to mark devices (marked with `*` in the table)
2. Use `unselect <#>` to deselect devices
3. Downloads will only go to selected devices

## Status Colors

- **Green**: Connected / Completed
- **Red**: Offline / Failed
- **Yellow**: Downloading / Streaming
- **Grey**: Stopped

## Keyboard Shortcuts

- `Enter` - Execute command
- `Escape` / `q` - Exit CLI
- `Ctrl+C` - Graceful shutdown

## Cleanup

When you exit the CLI, it automatically:
- Stops ADB monitoring
- Terminates all running processes (scrcpy, yt-dlp)
- Closes the database connection

## Architecture

The CLI reuses the same backend services as the Electron GUI:

- `DeviceOrchestrator` - Device operations
- `DownloadOrchestrator` - Download management
- `ConnectionService` - ADB connections
- `DeviceRegistry` - Device state management
- `YtdlpAdapter` - yt-dlp integration
- `ScrcpyAdapter` - scrcpy integration

The CLI is completely independent of the Electron renderer and preload scripts.

## Troubleshooting

### CLI won't start

Ensure all dependencies are installed:

```bash
npm install
```

### Devices not showing

Try refreshing:

```
devices refresh
```

### Downloads not starting

- Ensure devices are connected and selected
- Check that yt-dlp is installed and accessible
- Verify the URL is valid

### Process cleanup issues

If processes don't terminate properly, manually kill them:

```bash
pkill scrcpy
pkill yt-dlp
```

## Development

The CLI source code is in `src/cli/`:

- `index.js` - Entry point and lifecycle management
- `CliRenderer.js` - TUI rendering with neo-blessed
- `CommandHandler.js` - Command parsing and execution
- `EventBridge.js` - Backend event to TUI bridge
- `constants.js` - Commands, colors, and messages
