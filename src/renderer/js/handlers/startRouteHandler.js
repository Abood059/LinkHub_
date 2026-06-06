// startRouteHandler.js - معالج زر بدء التوجيه والتحميل
import { showToast } from '../core/utils.js';
import { inspectUrl, startDownload } from '../services/downloadService.js';
import { getSelectedDeviceIds } from '../ui/selectionManager.js';
import { addDownloadRow } from '../ui/downloadManager.js';

let registeredDevices = []; // سيتم ربطها من main

export function setRegisteredDevicesGetter(getterFn) {
    registeredDevices = getterFn;
}

export async function handleStartRoute(url, urlInputElement) {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
        showToast('الرجاء إدخال رابط الوسائط', true);
        return false;
    }

    const selectedIds = getSelectedDeviceIds();
    if (selectedIds.size === 0) {
        showToast('الرجاء تحديد جهاز واحد أو أكثر أولاً.', true);
        return false;
    }

    let inspection;
    try {
        inspection = await inspectUrl(trimmedUrl);
        if (!inspection || !inspection.formats || inspection.formats.length === 0) {
            showToast('لا توجد صيغ متاحة للتحميل من هذا الرابط.', true);
            return false;
        }
    } catch (err) {
        showToast(`فشل فحص الرابط: ${err.message}`, true);
        return false;
    }

    let bestFormat = inspection.formats.find(f => f.vcodec && f.vcodec !== 'none' && f.resolution);
    if (!bestFormat) bestFormat = inspection.formats.find(f => f.acodec && f.acodec !== 'none');
    if (!bestFormat) bestFormat = inspection.formats[0];
    const formatId = bestFormat.formatId;
    const title = inspection.title || (() => {
        try {
            const lastSegment = new URL(trimmedUrl).pathname.split('/').pop();
            return (lastSegment && lastSegment.includes('.')) ? lastSegment : 'media_' + Date.now();
        } catch(e) { return 'media_' + Date.now(); }
    })();

    const devicesList = (typeof registeredDevices === 'function') ? registeredDevices() : registeredDevices;
    for (const deviceId of selectedIds) {
        const deviceData = devicesList.find(d => d.device.id === deviceId);
        if (!deviceData) continue;
        const deviceName = deviceData.device.deviceFriendlyName || deviceData.device.model || deviceId;
        try {
            const result = await startDownload(trimmedUrl, formatId, deviceId);
            const downloadId = result.processId;
            addDownloadRow(downloadId, title, deviceName, trimmedUrl);
        } catch (err) {
            showToast(`فشل التحميل على الجهاز ${deviceName}: ${err.message}`, true);
        }
    }

    if (urlInputElement) urlInputElement.value = '';
    return true;
}