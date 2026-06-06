// modalManager.js - التحكم بنافذة معلومات الجهاز
import { startStream, disconnectDevice } from '../services/deviceService.js';
import { showToast } from '../core/utils.js';
import { loadDevices } from '../main.js'; // سنقوم بتصدير loadDevices من main

let modalElement = null;
let currentDevice = null;

// عناصر DOM
let modalClose, modalOverlay, modalDeviceName, modalDeviceModel, modalDeviceVersion, modalDeviceArch, modalDeviceStatus, modalDeviceAdb, modalStreamBtn, modalDisconnectBtn;

export function initModal(modalDom, closeBtn, overlay, nameEl, modelEl, versionEl, archEl, statusEl, adbEl, streamBtn, disconnectBtn) {
    modalElement = modalDom;
    modalClose = closeBtn;
    modalOverlay = overlay;
    modalDeviceName = nameEl;
    modalDeviceModel = modelEl;
    modalDeviceVersion = versionEl;
    modalDeviceArch = archEl;
    modalDeviceStatus = statusEl;
    modalDeviceAdb = adbEl;
    modalStreamBtn = streamBtn;
    modalDisconnectBtn = disconnectBtn;

    modalClose.addEventListener('click', hideModal);
    modalOverlay.addEventListener('click', hideModal);
    modalStreamBtn.addEventListener('click', onStreamClick);
    modalDisconnectBtn.addEventListener('click', onDisconnectClick);
}

export function showDeviceModal(deviceData) {
    const device = deviceData.device;
    const runtime = deviceData.runtimeState || {};
    const status = runtime.status || 'offline';
    const adbTarget = runtime.adbTarget || device.id;

    currentDevice = { device, runtime, deviceData };

    modalDeviceName.textContent = device.deviceFriendlyName || device.model || device.id;
    modalDeviceModel.textContent = (device.model && device.model !== 'Unknown') ? device.model : 'غير معروف';
    modalDeviceVersion.textContent = (device.version && device.version !== 'Unknown') ? device.version : 'غير معروف';
    modalDeviceArch.textContent = (device.arch && device.arch !== 'Unknown') ? device.arch : 'غير معروف';
    modalDeviceAdb.textContent = adbTarget;

    let statusText = '', statusClass = '';
    if (status === 'connected') { statusText = 'متصل'; statusClass = 'connected'; }
    else if (status === 'offline') { statusText = 'غير متصل'; statusClass = 'offline'; }
    else if (status === 'discovered') { statusText = 'مكتشف'; statusClass = 'discovered'; }
    else { statusText = status; statusClass = ''; }
    modalDeviceStatus.textContent = statusText;
    modalDeviceStatus.className = `detail-value status-badge-modal ${statusClass}`;

    const isConnected = status === 'connected';
    modalStreamBtn.disabled = !isConnected;
    modalStreamBtn.style.opacity = isConnected ? '1' : '0.5';
    modalStreamBtn.style.cursor = isConnected ? 'pointer' : 'not-allowed';

    modalElement.style.display = 'flex';
}

export function hideModal() {
    if (modalElement) modalElement.style.display = 'none';
    currentDevice = null;
}

async function onStreamClick() {
    if (!currentDevice) return;
    const deviceId = currentDevice.device.id;
    const status = currentDevice.runtime.status;
    if (status !== 'connected') {
        showToast('الجهاز غير متصل حالياً', true);
        return;
    }
    try {
        await startStream(deviceId);
        showToast(`بدأ بث الشاشة للجهاز ${currentDevice.device.deviceFriendlyName}`);
        hideModal();
    } catch (err) {
        showToast(`فشل بدء البث: ${err.message}`, true);
    }
}

async function onDisconnectClick() {
    if (!currentDevice) return;
    const adbTarget = currentDevice.runtime.adbTarget || currentDevice.device.id;
    try {
        await disconnectDevice(adbTarget);
        showToast(`تم قطع الاتصال عن الجهاز`);
        hideModal();
        setTimeout(() => {
            if (typeof loadDevices === 'function') loadDevices();
        }, 1000);
    } catch (err) {
        showToast(`فشل قطع الاتصال: ${err.message}`, true);
    }
}