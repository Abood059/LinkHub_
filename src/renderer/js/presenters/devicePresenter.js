// devicePresenter.js - طبقة العارض للأجهزة (Device Presenter)
'use strict';

import store from '../store/appStore.js';

/**
 * DevicePresenter - طبقة العارض للأجهزة
 * تحول البيانات الخام من المخزن إلى ViewModel جاهز للعرض
 */
class DevicePresenter {
    constructor() {
        this._unsubscribe = null;
        this._listeners = [];
    }

    // ===== Subscription =====

    /**
     * الاستماع لتغيرات المخزن
     * @param {Function} callback - دالة تستدعى عند تغير البيانات
     * @returns {Function} دالة إلغاء الاشتراك
     */
    subscribe(callback) {
        if (typeof callback !== 'function') {
            throw new Error('Callback must be a function');
        }

        this._listeners.push(callback);

        // إذا لم يكن هناك اشتراك في المخزن، قم بالاشتراك
        if (!this._unsubscribe) {
            this._unsubscribe = store.subscribe((state) => {
                const viewModel = this.buildViewModel(state);
                this._listeners.forEach(fn => {
                    try { 
                        fn(viewModel); 
                    } catch (e) {
                        console.error('[DevicePresenter] Listener error:', e);
                    }
                });
            });
        }

        // إرجاع دالة إلغاء الاشتراك
        return () => {
            const index = this._listeners.indexOf(callback);
            if (index !== -1) {
                this._listeners.splice(index, 1);
            }
            if (this._listeners.length === 0 && this._unsubscribe) {
                this._unsubscribe();
                this._unsubscribe = null;
            }
        };
    }

    /**
     * إلغاء الاشتراك من المخزن وتنظيف الموارد
     */
    unsubscribe() {
        if (this._unsubscribe) {
            this._unsubscribe();
            this._unsubscribe = null;
        }
        this._listeners = [];
    }

    // ===== ViewModel Builder =====

    /**
     * بناء ViewModel من البيانات الخام للمخزن
     * @param {Object} state - الحالة من المخزن
     * @returns {Object} ViewModel جاهز للعرض
     */
    buildViewModel(state) {
        const devices = state.devices || [];
        const selectedIds = state.selectedDeviceIds || new Set();

        // تصنيف الأجهزة
        const registeredDevices = [];
        const discoveredDevices = [];
        const connectedDevices = [];
        const offlineDevices = [];

        devices.forEach(deviceData => {
            const device = deviceData.device;
            const runtimeState = deviceData.runtimeState || {};
            const status = runtimeState.status || 'offline';

            // إضافة معلومات إضافية للجهاز
            const enrichedDevice = {
                ...deviceData,
                isSelected: selectedIds.has(device.id),
                status: status,
                isConnected: status === 'connected',
                isOffline: status === 'offline' || status === 'unknown',
                isDiscovered: device.isNew === true,
                displayName: device.deviceFriendlyName || device.model || device.id,
                statusText: status === 'connected' ? 'متصل' : (status === 'offline' ? 'غير متصل' : status)
            };

            // التصنيف
            if (device.isNew) {
                discoveredDevices.push(enrichedDevice);
            } else {
                registeredDevices.push(enrichedDevice);
            }

            if (status === 'connected') {
                connectedDevices.push(enrichedDevice);
            } else {
                offlineDevices.push(enrichedDevice);
            }
        });

        // تحديد الجهاز المحدد الأول (للتحديد الفردي)
        let firstSelectedDevice = null;
        for (const device of devices) {
            if (selectedIds.has(device.device.id)) {
                firstSelectedDevice = device;
                break;
            }
        }

        return {
            allDevices: devices,
            registeredDevices,
            discoveredDevices,
            connectedDevices,
            offlineDevices,
            firstSelectedDevice,
            selectedCount: selectedIds.size,
            hasSelection: selectedIds.size > 0,
            hasRegisteredDevices: registeredDevices.length > 0,
            hasDiscoveredDevices: discoveredDevices.length > 0,
            hasConnectedDevices: connectedDevices.length > 0,
            isLoading: state.isLoading || false,
            error: state.error || null,
            lastUpdate: state.lastUpdate || null
        };
    }

    // ===== Helper Methods =====

    /**
     * إرجاع جهاز واحد بواسطة معرفه
     * @param {string} deviceId - معرف الجهاز
     * @returns {Object|null} الجهاز أو null إذا لم يوجد
     */
    getDeviceById(deviceId) {
        const state = store.getState();
        return state.devices.find(d => d.device.id === deviceId) || null;
    }

    /**
     * إرجاع الأجهزة المتصلة فقط
     * @returns {Array} قائمة الأجهزة المتصلة
     */
    getConnectedDevices() {
        const state = store.getState();
        return state.devices.filter(d => d.runtimeState?.status === 'connected');
    }

    /**
     * إرجاع الأجهزة المحددة فقط
     * @returns {Array} قائمة الأجهزة المحددة
     */
    getSelectedDevices() {
        const state = store.getState();
        return state.devices.filter(d => state.selectedDeviceIds.has(d.device.id));
    }

    /**
     * التحقق مما إذا كان جهاز محدداً
     * @param {string} deviceId - معرف الجهاز
     * @returns {boolean} هل الجهاز محدد؟
     */
    isDeviceSelected(deviceId) {
        const state = store.getState();
        return state.selectedDeviceIds.has(deviceId);
    }
}

// تصدير Singleton واحد
export default new DevicePresenter();
