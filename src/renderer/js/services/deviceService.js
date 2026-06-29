// deviceService.js - التعامل مع أجهزة linkhub
import store from '../store/appStore.js';

export async function getAllDevices() {
    return await linkhub.devices.getAll();
}

export async function loadDevices() {
    store.setLoading(true);
    try {
        const devices = await getAllDevices();
        store.setDevices(devices);
        store.setLoading(false);
        return devices;
    } catch (error) {
        store.setError(error);
        store.setLoading(false);
        throw error;
    }
}

export async function startStream(deviceId) {
    return await linkhub.devices.stream.start(deviceId, { fullscreen: false });
}

export async function pairDevice(host, code) {
    return await linkhub.devices.pair(host, code);
}

export async function disconnectDevice(adbTarget) {
    if (typeof linkhub.devices.disconnect !== 'function') {
        throw new Error('وظيفة قطع الاتصال غير متوفرة بعد، يرجى إضافة IPC handlers.');
    }
    return await linkhub.devices.disconnect(adbTarget);
}