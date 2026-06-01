'use strict';

const ErrorCentralService =
    require(
        '../infrastructure/logging'
    );

const ProcessManager =
    require(
        '../infrastructure/process'
    );

const ProcessRegistry =
    require(
        '../runtime/processes/ProcessRegistry'
    );

const ProcessSupervisor =
    require(
        '../runtime/processes/ProcessSupervisor'
    );

class BootstrapContainer {
    constructor() {
        this._services =
            new Map();

        this._initialized =
            false;
    }

    initialize() {
        if (
            this._initialized
        ) {
            return this;
        }

        const processRegistry =
            new ProcessRegistry();

        const processSupervisor =
            new ProcessSupervisor({
                processManager:
                    ProcessManager,
                processRegistry,
                logger:
                    ErrorCentralService
            });

        this._services.set(
            'errorCentralService',
            ErrorCentralService
        );

        this._services.set(
            'processManager',
            ProcessManager
        );

        this._services.set(
            'processRegistry',
            processRegistry
        );

        this._services.set(
            'processSupervisor',
            processSupervisor
        );

        this._initialized =
            true;

        return this;
    }

    resolve(name) {
        return (
            this._services.get(
                name
            ) || null
        );
    }
}

module.exports =
    new BootstrapContainer();