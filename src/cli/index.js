// src/cli/index.js
'use strict';

const container = require('../main/bootstrap/container');
const CliRenderer = require('./CliRenderer');
const CommandHandler = require('./CommandHandler');
const EventBridge = require('./EventBridge');
const { MESSAGES, ADB_MONITOR_INTERVAL } = require('./constants');

class LinkHubCLI {
    constructor() {
        this.cliRenderer = null;
        this.commandHandler = null;
        this.eventBridge = null;
        this.connectionService = null;
        this.isShuttingDown = false;
    }

    async start() {
        try {
            // Initialize container (backend services)
            container.initialize();

            // Set WindowManager to null (no Electron dependency)
            container._windowManager = null;
            container._stateSyncService = null;

            // Resolve required services
            const deviceOrchestrator = container.resolve('deviceOrchestrator');
            const downloadOrchestrator = container.resolve('downloadOrchestrator');
            const connectionService = container.resolve('connectionService');
            const deviceRegistry = container.resolve('deviceRegistry');
            const processManager = container.resolve('processManager');
            const ytdlpAdapter = container.resolve('ytdlpAdapter');
            const databaseManager = container.resolve('databaseManager');

            if (!deviceOrchestrator || !downloadOrchestrator || !connectionService || !deviceRegistry) {
                throw new Error('Failed to resolve required services from container');
            }

            this.connectionService = connectionService;
            this.processManager = processManager;
            this.databaseManager = databaseManager;

            // Initialize CLI components
            this.cliRenderer = new CliRenderer();
            this.commandHandler = new CommandHandler(
                this.cliRenderer,
                deviceOrchestrator,
                downloadOrchestrator,
                deviceRegistry
            );
            this.eventBridge = new EventBridge(
                this.cliRenderer,
                connectionService,
                ytdlpAdapter
            );
            this.eventBridge.setDeviceRegistry(deviceRegistry);

            // Wire up command handler
            this.cliRenderer.on('command', (command) => {
                this.commandHandler.handleCommand(command);
            });

            // Wire up exit handler
            this.cliRenderer.on('exit', () => {
                this.shutdown();
            });

            // Start event bridge
            this.eventBridge.start();

            // Start ADB monitoring
            connectionService.startAdbMonitoring(ADB_MONITOR_INTERVAL);

            // Initial device discovery
            try {
                await connectionService.discoverDevices();
            } catch (error) {
                this.cliRenderer.log(`Initial device discovery failed: ${error.message}`, 'warning');
            }

            // Ready message
            this.cliRenderer.log(MESSAGES.READY, 'success');
            this.cliRenderer.showHelp();

            // Focus input and render
            this.cliRenderer.focusInput();
            this.cliRenderer.render();

        } catch (error) {
            console.error('Failed to start LinkHub CLI:', error);
            process.exit(1);
        }
    }

    async shutdown() {
        if (this.isShuttingDown) return;
        this.isShuttingDown = true;

        this.cliRenderer.log(MESSAGES.EXITING, 'warning');

        try {
            // Stop ADB monitoring
            if (this.connectionService) {
                this.connectionService.stopAdbMonitoring();
                this.connectionService.dispose();
            }

            // Stop event bridge
            if (this.eventBridge) {
                this.eventBridge.stop();
            }

            // Terminate all processes
            if (this.processManager) {
                await this.processManager.terminateAll();
            }

            // Close database
            if (this.databaseManager) {
                await this.databaseManager.close();
            }

            this.cliRenderer.log('Shutdown complete.', 'success');
        } catch (error) {
            console.error('Error during shutdown:', error);
        }

        // Exit after a short delay to allow logs to be seen
        setTimeout(() => {
            process.exit(0);
        }, 500);
    }
}

// Handle Ctrl+C gracefully
const cli = new LinkHubCLI();

process.on('SIGINT', () => {
    cli.shutdown();
});

process.on('SIGTERM', () => {
    cli.shutdown();
});

// Start the CLI
cli.start().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
