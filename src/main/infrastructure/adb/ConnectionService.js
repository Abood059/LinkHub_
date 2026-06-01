'use strict';

const EventEmitter =
    require('events');

const {
    Bonjour
} = require(
    'bonjour-service'
);

class ConnectionService
    extends EventEmitter {

    constructor({
        adbExecutor,
        logger = null
    }) {
        super();

        this._adbExecutor =
            adbExecutor;

        this._logger =
            logger;

        this._bonjour =
            new Bonjour();

        this._adbMonitor =
            null;

        this._browser =
            null;
    }

    async discoverDevices() {
        try {
            const devices =
                await this
                    ._adbExecutor
                    .getDevices();

            this.emit(
                'devicesDiscovered',
                devices
            );

            return devices;
        } catch (error) {
            this.emit(
                'error',
                error
            );

            throw error;
        }
    }

    startAdbMonitoring(
        intervalMs = 5000
    ) {
        if (
            this._adbMonitor
        ) {
            return;
        }

        this._adbMonitor =
            setInterval(
                async () => {
                    try {
                        const devices =
                            await this
                                ._adbExecutor
                                .getDevices();

                        this.emit(
                            'adbDevices',
                            devices
                        );
                    } catch (
                        error
                    ) {
                        this.emit(
                            'error',
                            error
                        );
                    }
                },
                intervalMs
            );
    }

    stopAdbMonitoring() {
        if (
            !this._adbMonitor
        ) {
            return;
        }

        clearInterval(
            this._adbMonitor
        );

        this._adbMonitor =
            null;
    }

    startWirelessDiscovery() {
        if (
            this._browser
        ) {
            return;
        }

        this._browser =
            this._bonjour.find(
                {
                    type: 'adb-tls-connect'
                },
                (service) => {
                    this.emit(
                        'wirelessServiceFound',
                        {
                            name:
                                service.name,
                            host:
                                service.host,
                            port:
                                service.port,
                            addresses:
                                service.addresses
                        }
                    );
                }
            );
    }

    stopWirelessDiscovery() {
        if (
            !this._browser
        ) {
            return;
        }

        this._browser.stop();

        this._browser =
            null;
    }

    dispose() {
        this.stopAdbMonitoring();
        this.stopWirelessDiscovery();

        this._bonjour.destroy();
    }
}

module.exports =
    ConnectionService;