// startRouteHandler.js - معالج زر بدء التوجيه والتحميل
'use strict';

import { showToast } from '../core/utils.js';
import { inspectUrl, startDownload } from '../services/downloadService.js';
import store from '../store/appStore.js';

export async function handleStartRoute(url, urlInputElement) {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
        showToast('الرجاء إدخال رابط الوسائط', true);
        return false;
    }

    const state = store.getState();
    const selectedIds = state.selectedDeviceIds || new Set();

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

    // إذا لم يتم تحديد أي جهاز، قم بالتحميل محلياً
    if (selectedIds.size === 0) {
        try {
            await startDownload(trimmedUrl, formatId, null);
            showToast('بدأ التحميل محلياً', false);
        } catch (err) {
            showToast(`فشل التحميل: ${err.message}`, true);
            return false;
        }
    } else {
        // إذا تم تحديد أجهزة، قم بالتحميل على كل جهاز
        const devices = store.getState().devices;
        for (const deviceId of selectedIds) {
            const deviceData = devices.find(d => d.device.id === deviceId);
            if (!deviceData) continue;
            const deviceName = deviceData.device.deviceFriendlyName || deviceData.device.model || deviceId;
            try {
                await startDownload(trimmedUrl, formatId, deviceId);
            } catch (err) {
                showToast(`فشل التحميل على الجهاز ${deviceName}: ${err.message}`, true);
            }
        }
    }

    if (urlInputElement) urlInputElement.value = '';
    return true;
}