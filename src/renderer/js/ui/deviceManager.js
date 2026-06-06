// deviceManager.js - إنشاء وعرض عناصر الأجهزة
import { escapeHtml } from '../core/utils.js';
import { showToast } from '../core/utils.js';
import { startStream } from '../services/deviceService.js';
import { getSelectedDeviceIds, toggleSelectedDevice, updateElementSelection } from './selectionManager.js';

let currentShowModalCallback = null; // سيتم ربطه من main.js

export function setShowModalCallback(callback) {
    currentShowModalCallback = callback;
}

export function createDeviceElement(deviceData, isRegistered) {
    const device = deviceData.device;
    const runtime = deviceData.runtimeState || {};
    const status = runtime.status || 'offline';
    const deviceId = device.id;
    const displayName = device.deviceFriendlyName || device.model || device.id;
    const model = (device.model && device.model !== 'Unknown') ? device.model : '';
    const version = (device.version && device.version !== 'Unknown') ? device.version : '';
    const detailsText = model && version ? `${model} (${version})` : (model || version || '');

    const div = document.createElement('div');
    div.className = `device-item ${status === 'connected' ? 'status-connected' : 'status-offline'}`;
    div.setAttribute('data-device-id', deviceId);
    div.setAttribute('data-device-name', displayName);
    if (detailsText) div.setAttribute('title', detailsText);

    const selectedSet = getSelectedDeviceIds();
    if (isRegistered && selectedSet.has(deviceId)) {
        div.classList.add('selected');
    }

    div.innerHTML = `
        <div class="device-circle">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect>
                <line x1="12" y1="18" x2="12.01" y2="18"></line>
            </svg>
        </div>
        <div class="device-info">
            <h3 class="device-name">${escapeHtml(displayName)}</h3>
            ${detailsText ? `<div class="device-detail">${escapeHtml(detailsText)}</div>` : ''}
        </div>
        <span class="status-badge">${status === 'connected' ? 'متصل' : (status === 'offline' ? 'غير متصل' : status)}</span>
        <button class="stream-btn" data-device-id="${deviceId}" style="background: none; border: none; cursor: pointer; margin-right: 8px;" title="بدء البث">📺</button>
    `;

    // فتح النافذة عند النقر على الجهاز (ليس على زر البث)
    div.addEventListener('click', (e) => {
        if (e.target.classList?.contains('stream-btn') || e.target.closest('.stream-btn')) return;
        e.stopPropagation();
        if (currentShowModalCallback) currentShowModalCallback(deviceData);
    });

    // زر البث المباشر
    const streamBtn = div.querySelector('.stream-btn');
    if (streamBtn) {
        streamBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (status !== 'connected') {
                showToast('الجهاز غير متصل حالياً، لا يمكن بدء البث.', true);
                return;
            }
            try {
                await startStream(deviceId);
                showToast(`بدأ بث الشاشة للجهاز ${displayName}`);
            } catch (err) {
                showToast(`فشل بدء البث: ${err.message}`, true);
            }
        });
    }

    // دعم النقر المزدوج أيضاً
    div.addEventListener('dblclick', async (e) => {
        e.stopPropagation();
        if (status !== 'connected') {
            showToast('الجهاز غير متصل حالياً، لا يمكن بدء البث.', true);
            return;
        }
        try {
            await startStream(deviceId);
            showToast(`بدأ بث الشاشة للجهاز ${displayName}`);
        } catch (err) {
            showToast(`فشل بدء البث: ${err.message}`, true);
        }
    });

    // إضافة منطق التحديد (للأجهزة المسجلة فقط)
    if (isRegistered && status === 'connected') {
        div.addEventListener('click', (e) => {
            if (e.target.classList?.contains('stream-btn') || e.target.closest('.stream-btn')) return;
            e.stopPropagation();
            const nowSelected = toggleSelectedDevice(deviceId);
            updateElementSelection(div, deviceId, nowSelected);
        });
    }

    return div;
}

export function renderDevices(registeredDevices, registeredContainer, discoveredContainer) {
    if (registeredContainer) {
        if (!registeredDevices || registeredDevices.length === 0) {
            registeredContainer.innerHTML = '<div class="placeholder-text">لا توجد أجهزة مسجلة</div>';
        } else {
            registeredContainer.innerHTML = '';
            registeredDevices.forEach(deviceData => {
                const el = createDeviceElement(deviceData, true);
                registeredContainer.appendChild(el);
            });
        }
    }
    if (discoveredContainer) {
        const newDevices = registeredDevices.filter(d => d.device.isNew === true);
        if (newDevices.length === 0) {
            discoveredContainer.innerHTML = '<div class="placeholder-text">لا توجد أجهزة جديدة مكتشفة</div>';
        } else {
            discoveredContainer.innerHTML = '';
            newDevices.forEach(deviceData => {
                const el = createDeviceElement(deviceData, false);
                discoveredContainer.appendChild(el);
            });
        }
    }
}