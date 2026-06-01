'use strict';

class ProcessSupervisor {
    constructor({
        processManager,
        processRegistry,
        logger = null
    }) {
        this._processManager =
            processManager;

        this._processRegistry =
            processRegistry;

        this._logger =
            logger;
    }

    startManagedProcess(
        processConfig = {}
    ) {
        const {
            processId,
            binPath,
            args = [],
            type = 'generic',
            metadata = {},
            onData = null,
            maxBufferSize = 100
        } = processConfig;

        if (!processId) {
            throw new Error(
                'processId is required'
            );
        }

        if (!binPath) {
            throw new Error(
                'binPath is required'
            );
        }

        this._processRegistry.register(
            processId,
            {
                id: processId,
                type,
                metadata,
                status: 'STARTING',
                startedAt:
                    Date.now()
            }
        );

        try {
            const result =
                this._processManager.execute(
                    processId,
                    binPath,
                    args,
                    type,
                    onData,
                    maxBufferSize
                );

            this._processRegistry
                .updateStatus(
                    processId,
                    'RUNNING'
                );

            return result;
        } catch (error) {
            this._processRegistry
                .updateStatus(
                    processId,
                    'FAILED'
                );

            throw error;
        }
    }

    stopManagedProcess(
        processId
    ) {
        const process =
            this._processRegistry.get(
                processId
            );

        if (!process) {
            return false;
        }

        return this._processManager
            .terminate(
                processId
            );
    }

    getProcessStatus(
        processId
    ) {
        const runtimeState =
            this._processRegistry.get(
                processId
            );

        if (!runtimeState) {
            return null;
        }

        const processStatus =
            this._processManager
                .getProcessStatus(
                    processId
                );

        return {
            ...runtimeState,

            status:
                processStatus?.status ??
                runtimeState.status,

            process:
                processStatus
        };
    }
}

module.exports =
    ProcessSupervisor;