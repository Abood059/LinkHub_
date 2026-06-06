// eventService.js - تسجيل أحداث IPC
export function setupEventListeners(handlers) {
    if (!linkhub.on) return;
    
    linkhub.on('download:progress', (event, data) => {
        if (data && data.downloadId && data.percent !== undefined) {
            handlers.onProgress?.(data.downloadId, data.percent, data.speed, data.size);
        }
    });
    linkhub.on('download:complete', (event, data) => {
        if (data?.downloadId) handlers.onComplete?.(data.downloadId);
    });
    linkhub.on('download:error', (event, data) => {
        if (data?.downloadId) handlers.onError?.(data.downloadId, data.error);
    });
    linkhub.on('download:stopped', (event, data) => {
        if (data?.downloadId) handlers.onStopped?.(data.downloadId);
    });
    linkhub.on('device:stateChanged', () => handlers.onDeviceStateChanged?.());
    linkhub.on('device:paired', () => handlers.onDevicePaired?.());
    linkhub.on('device:removed', () => handlers.onDeviceRemoved?.());
}