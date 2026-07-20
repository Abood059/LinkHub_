// src/main/bootstrap/IpcBootstrap.js
'use strict';

/**
 * IpcBootstrap
 * مسؤول عن تسجيل IPC handlers
 * 
 * يفصل تكامل IPC عن DI Container
 */
class IpcBootstrap {
    /**
     * تسجيل IPC handlers من الخدمات المسجلة في container
     * @param {BootstrapContainer} container - حاوية الخدمات
     */
    static register(container) {
        const deviceOrchestrator = container.resolve('deviceOrchestrator');
        const downloadOrchestrator = container.resolve('downloadOrchestrator');

        if (!deviceOrchestrator || !downloadOrchestrator) {
            throw new Error('deviceOrchestrator and downloadOrchestrator are required for IPC registration');
        }

        const { registerIpcHandlers } = require('../infrastructure/ipc');
        registerIpcHandlers(deviceOrchestrator, downloadOrchestrator);
    }
}

module.exports = IpcBootstrap;
