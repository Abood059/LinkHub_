'use strict';

const { spawn } = require('child_process');

const ProcessEntity = require('./ProcessEntity');

const {
    PROCESS_TIMEOUTS,
    PROCESS_SIGNALS
} = require('./process.constants');

const errorService = require(
    '../logging/ErrorCentralService'
);

class ProcessManager {
    constructor() {
        this.activeProcesses = new Map();
    }

    execute(
        id,
        binPath,
        args = [],
        type = 'generic',
        onData = null,
        maxBufferSize = 100
    ) {
        if (!id) {
            throw new Error(
                'Process id is required'
            );
        }

        if (this.activeProcesses.has(id)) {
            this.terminate(id);
        }

        let child;

        try {
            child = spawn(
                binPath,
                Array.isArray(args)
                    ? args
                    : []
            );
        } catch (error) {
            errorService.report({
                type: 'PROCESS',
                severity: 'HIGH',
                id,
                message:
                    `Failed to spawn process: ${error.message}`
            });

            throw error;
        }

        const entity =
            new ProcessEntity({
                pid: child.pid,
                type,
                serial: id,
                maxBufferSize
            });

        const processRecord = {
            instance: child,
            data: entity,
            type,
            startedAt: Date.now(),
            finishedAt: null
        };

        this.activeProcesses.set(
            id,
            processRecord
        );

        const feed =
            (chunk, streamType) => {
                const text =
                    chunk.toString();

                entity.addLog(
                    text,
                    streamType
                );

                if (
                    typeof onData !==
                    'function'
                ) {
                    return;
                }

                try {
                    onData(
                        text,
                        streamType
                    );
                } catch (error) {
                    errorService.report({
                        type: 'PROCESS',
                        severity: 'LOW',
                        id,
                        message:
                            `Consumer callback failed: ${error.message}`
                    });
                }
            };

        child.stdout?.on(
            'data',
            data =>
                feed(
                    data,
                    'stdout'
                )
        );

        child.stderr?.on(
            'data',
            data =>
                feed(
                    data,
                    'stderr'
                )
        );

        child.once(
            'error',
            error => {
                entity.markAsFailed(
                    error.message
                );

                processRecord.instance =
                    null;

                processRecord.finishedAt =
                    Date.now();

                errorService.report({
                    type: 'PROCESS',
                    severity: 'HIGH',
                    id,
                    message:
                        `Process error: ${error.message}`
                });
            }
        );

        child.once(
            'exit',
            code => {
                entity.markAsExited(
                    code
                );

                processRecord.instance =
                    null;

                processRecord.finishedAt =
                    Date.now();

                errorService.report({
                    type: 'PROCESS',
                    severity: 'INFO',
                    id,
                    message:
                        `Process exited with code ${code}`
                });
            }
        );

        return child;
    }

    executeAndWatch(
        id,
        binPath,
        args,
        successSentinel,
        timeoutMs =
            PROCESS_TIMEOUTS.WATCH_DEFAULT_TIMEOUT_MS
    ) {
        return new Promise(
            (
                resolve,
                reject
            ) => {
                let child;
                let resolved = false;

                let output = '';

                try {
                    child = spawn(
                        binPath,
                        Array.isArray(args)
                            ? args
                            : []
                    );
                } catch (error) {
                    reject(error);
                    return;
                }

                const safeResolve =
                    result => {
                        if (resolved) {
                            return;
                        }

                        resolved = true;

                        clearTimeout(
                            timeout
                        );

                        resolve(
                            result
                        );
                    };

                const timeout =
                    setTimeout(
                        () => {
                            try {
                                child.kill(
                                    PROCESS_SIGNALS.GRACEFUL
                                );
                            } catch { }

                            safeResolve({
                                success: false,
                                output:
                                    output +
                                    '\n[Timeout]'
                            });
                        },
                        timeoutMs
                    );

                const handleData =
                    chunk => {
                        const text =
                            chunk.toString();

                        if (
                            output.length <
                            PROCESS_TIMEOUTS.MAX_WATCH_OUTPUT_SIZE
                        ) {
                            output += text;

                            if (
                                output.length >
                                PROCESS_TIMEOUTS.MAX_WATCH_OUTPUT_SIZE
                            ) {
                                output =
                                    output.substring(
                                        0,
                                        PROCESS_TIMEOUTS.MAX_WATCH_OUTPUT_SIZE
                                    );
                            }
                        }

                        if (
                            text.includes(
                                successSentinel
                            )
                        ) {
                            try {
                                child.kill(
                                    PROCESS_SIGNALS.GRACEFUL
                                );
                            } catch { }

                            safeResolve({
                                success: true,
                                output
                            });
                        }
                    };

                child.stdout?.on(
                    'data',
                    handleData
                );

                child.stderr?.on(
                    'data',
                    handleData
                );

                child.once(
                    'error',
                    error => {
                        if (
                            resolved
                        ) {
                            return;
                        }

                        clearTimeout(
                            timeout
                        );

                        reject(
                            error
                        );
                    }
                );

                child.once(
                    'exit',
                    code => {
                        safeResolve({
                            success:
                                code ===
                                0,
                            output
                        });
                    }
                );
            }
        );
    }

    executeQuickTaskArray(
        binPath,
        args = [],
        options = {}
    ) {
        return new Promise(
            (
                resolve,
                reject
            ) => {
                let child;

                try {
                    child = spawn(
                        binPath,
                        Array.isArray(args)
                            ? args
                            : []
                    );
                } catch (error) {
                    reject(error);
                    return;
                }

                let stdout = '';
                let stderr = '';

                const timeout =
                    setTimeout(
                        () => {
                            try {
                                child.kill(
                                    PROCESS_SIGNALS.GRACEFUL
                                );
                            } catch { }

                            reject({
                                error:
                                    new Error(
                                        'Command timeout'
                                    ),
                                stderr:
                                    'Timeout'
                            });
                        },
                        options.timeout ??
                        PROCESS_TIMEOUTS.QUICK_TASK_TIMEOUT_MS
                    );

                child.stdout?.on(
                    'data',
                    chunk => {
                        stdout +=
                            chunk.toString();
                    }
                );

                child.stderr?.on(
                    'data',
                    chunk => {
                        stderr +=
                            chunk.toString();
                    }
                );

                child.once(
                    'error',
                    error => {
                        clearTimeout(
                            timeout
                        );

                        reject({
                            error,
                            stderr
                        });
                    }
                );

                child.once(
                    'exit',
                    code => {
                        clearTimeout(
                            timeout
                        );

                        if (
                            code === 0
                        ) {
                            resolve(
                                stdout.trim()
                            );
                            return;
                        }

                        if (
                            stdout
                        ) {
                            resolve(
                                stdout.trim()
                            );
                            return;
                        }

                        reject({
                            error:
                                new Error(
                                    `Process exited with code ${code}`
                                ),
                            stderr
                        });
                    }
                );
            }
        );
    }

    terminate(id) {
        const entry =
            this.activeProcesses.get(
                id
            );

        if (
            !entry ||
            !entry.instance
        ) {
            return false;
        }

        const child =
            entry.instance;

        entry.data?.markAsExited(
            -1
        );

        try {
            child.kill(
                PROCESS_SIGNALS.GRACEFUL
            );
        } catch (
        error
        ) {
            errorService.report({
                type: 'PROCESS',
                severity: 'LOW',
                id,
                message:
                    `SIGTERM failed: ${error.message}`
            });

            return false;
        }

        setTimeout(
            () => {
                if (
                    child.exitCode ===
                    null
                ) {
                    try {
                        child.kill(
                            PROCESS_SIGNALS.FORCE
                        );
                    } catch { }
                }
            },
            PROCESS_TIMEOUTS.GRACEFUL_TERMINATION_MS
        );

        return true;
    }

    async terminateAll() {
        const entries =
            Array.from(
                this.activeProcesses.entries()
            );

        for (const [
            id,
            entry
        ] of entries) {
            try {
                entry.data?.markAsExited(
                    -1
                );

                entry.instance?.kill(
                    PROCESS_SIGNALS.GRACEFUL
                );
            } catch (
            error
            ) {
                errorService.report({
                    type: 'PROCESS',
                    severity: 'LOW',
                    id,
                    message:
                        error.message
                });
            }
        }

        await new Promise(
            resolve =>
                setTimeout(
                    resolve,
                    PROCESS_TIMEOUTS.GRACEFUL_TERMINATION_MS
                )
        );

        for (const [
            ,
            entry
        ] of entries) {
            const child =
                entry.instance;

            if (
                child &&
                child.exitCode ===
                null
            ) {
                try {
                    child.kill(
                        PROCESS_SIGNALS.FORCE
                    );
                } catch { }
            }
        }
    }

    getLogs(id) {
        return (
            this.activeProcesses
                .get(id)
                ?.data
                ?.getLogs?.() ??
            null
        );
    }

    getProcessInfo(id) {
        return (
            this.activeProcesses
                .get(id)
                ?.data ?? null
        );
    }

    getProcessStatus(id) {
        const entry =
            this.activeProcesses.get(id);

        if (!entry) {
            return null;
        }

        const entity = entry.data;

        return {
            pid: entity.pid,
            type: entity.type,
            serial: entity.serial,
            status: entity.status,
            exitCode: entity.exitCode,
            startedAt: entry.startedAt ?? null,
            finishedAt: entry.finishedAt ?? null
        };
    }
}

module.exports =
    new ProcessManager();