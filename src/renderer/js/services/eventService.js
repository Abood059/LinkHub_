// eventService.js - تسجيل أحداث IPC باستخدام الحالة المجمعة
'use strict';

import stateSyncService from './stateSyncService.js';
import store from '../store/appStore.js';

let _unsubscribe = null;

/**
 * إعداد مستمعي الأحداث من الخلفية
 * @param {Object} handlers - معالجات إضافية (اختياري، للتوافق)
 * @param {Object} containers - حاويات DOM (اختياري، للتوافق)
 * @returns {Function} دالة تنظيف
 */
export function setupEventListeners(handlers = {}, containers = {}) {
    if (!stateSyncService) {
        console.warn('[EventService] stateSyncService not available');
        return null;
    }

    stateSyncService.start();

    // الاشتراك في تحديثات الحالة من الخلفية
    _unsubscribe = stateSyncService.onUpdate((state) => {
        if (!state) return;

        // تحديث المخزن المركزي
        if (state.devices) {
            store.setDevices(state.devices);
        }
        if (state.downloads) {
            store.setDownloads(state.downloads);
        }
    });

    // إرجاع دالة تنظيف
    return () => {
        cleanup();
    };
}

export function cleanup() {
    if (_unsubscribe) {
        _unsubscribe();
        _unsubscribe = null;
    }
    stateSyncService.stop();
}