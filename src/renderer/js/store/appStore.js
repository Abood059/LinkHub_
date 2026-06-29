// appStore.js - المخزن المركزي لإدارة حالة التطبيق
'use strict';

/**
 * AppStore - مخزن مركزي لإدارة حالة التطبيق (Single Source of Truth)
 * يتبع نمط Flux/Redux بدون إطار عمل إضافي
 */
class AppStore {
    constructor() {
        this._state = {
            devices: [],
            downloads: [],
            selectedDeviceIds: new Set(),
            isLoading: false,
            error: null,
            lastUpdate: null
        };
        this._listeners = [];
        this._isDispatching = false;
    }

    // ===== Getters =====

    /**
     * إرجاع نسخة مجمدة من الحالة الحالية
     * @returns {Object} نسخة جديدة من الحالة (Immutable)
     */
    getState() {
        return {
            devices: [...this._state.devices],
            downloads: [...this._state.downloads],
            selectedDeviceIds: new Set(this._state.selectedDeviceIds),
            isLoading: this._state.isLoading,
            error: this._state.error,
            lastUpdate: this._state.lastUpdate
        };
    }

    // ===== Mutations =====

    /**
     * تحديث قائمة الأجهزة
     * @param {Array} devices - قائمة الأجهزة الجديدة
     */
    setDevices(devices) {
        this._state.devices = devices;
        this._state.lastUpdate = Date.now();
        this._notify();
    }

    /**
     * تحديث قائمة التحميلات
     * @param {Array} downloads - قائمة التحميلات الجديدة
     */
    setDownloads(downloads) {
        this._state.downloads = downloads;
        this._state.lastUpdate = Date.now();
        this._notify();
    }

    /**
     * تحديث جهاز واحد فقط
     * @param {string} deviceId - معرف الجهاز
     * @param {Object} updates - التحديثات المطلوبة
     */
    updateDevice(deviceId, updates) {
        const index = this._state.devices.findIndex(d => d.device.id === deviceId);
        if (index !== -1) {
            this._state.devices[index] = { ...this._state.devices[index], ...updates };
            this._state.lastUpdate = Date.now();
            this._notify();
        }
    }

    /**
     * تحديث تحميل واحد فقط
     * @param {string} downloadId - معرف التحميل
     * @param {Object} updates - التحديثات المطلوبة
     */
    updateDownload(downloadId, updates) {
        const index = this._state.downloads.findIndex(d => d.downloadId === downloadId);
        if (index !== -1) {
            this._state.downloads[index] = { ...this._state.downloads[index], ...updates };
            this._state.lastUpdate = Date.now();
            this._notify();
        }
    }

    /**
     * إضافة أو إزالة جهاز من المحددين
     * @param {string} deviceId - معرف الجهاز
     */
    toggleSelection(deviceId) {
        if (this._state.selectedDeviceIds.has(deviceId)) {
            this._state.selectedDeviceIds.delete(deviceId);
        } else {
            this._state.selectedDeviceIds.add(deviceId);
        }
        this._state.lastUpdate = Date.now();
        this._notify();
    }

    /**
     * إزالة جميع التحديدات
     */
    clearSelection() {
        this._state.selectedDeviceIds.clear();
        this._state.lastUpdate = Date.now();
        this._notify();
    }

    /**
     * إضافة جهاز إلى المحددين
     * @param {string} deviceId - معرف الجهاز
     */
    addSelection(deviceId) {
        if (!this._state.selectedDeviceIds.has(deviceId)) {
            this._state.selectedDeviceIds.add(deviceId);
            this._state.lastUpdate = Date.now();
            this._notify();
        }
    }

    /**
     * إزالة جهاز من المحددين
     * @param {string} deviceId - معرف الجهاز
     */
    removeSelection(deviceId) {
        if (this._state.selectedDeviceIds.has(deviceId)) {
            this._state.selectedDeviceIds.delete(deviceId);
            this._state.lastUpdate = Date.now();
            this._notify();
        }
    }

    /**
     * تحديث حالة التحميل
     * @param {boolean} isLoading - حالة التحميل
     */
    setLoading(isLoading) {
        this._state.isLoading = isLoading;
        this._state.lastUpdate = Date.now();
        this._notify();
    }

    /**
     * تحديث الخطأ
     * @param {Error|string} error - الخطأ
     */
    setError(error) {
        this._state.error = error;
        this._state.lastUpdate = Date.now();
        this._notify();
    }

    /**
     * مسح الخطأ
     */
    clearError() {
        this._state.error = null;
        this._state.lastUpdate = Date.now();
        this._notify();
    }

    /**
     * تحديث الحالة من بيانات الخلفية
     * @param {Object} backendState - الحالة من الخلفية
     */
    updateFromBackend(backendState) {
        if (!backendState) return;
        
        if (backendState.devices) {
            this._state.devices = backendState.devices;
        }
        if (backendState.downloads) {
            this._state.downloads = backendState.downloads;
        }
        this._state.lastUpdate = Date.now();
        this._notify();
    }

    // ===== Subscription =====

    /**
     * إضافة مستمع لتغييرات الحالة
     * @param {Function} listener - دالة تستدعى عند كل تغيير
     * @returns {Function} دالة لإلغاء الاشتراك
     */
    subscribe(listener) {
        if (typeof listener !== 'function') {
            throw new Error('Listener must be a function');
        }
        this._listeners.push(listener);
        
        return () => {
            const index = this._listeners.indexOf(listener);
            if (index !== -1) {
                this._listeners.splice(index, 1);
            }
        };
    }

    /**
     * إشعار جميع المستمعين بالتغييرات (دالة خاصة)
     */
    _notify() {
        if (this._isDispatching) return;
        
        this._isDispatching = true;
        const state = this.getState();
        
        this._listeners.forEach(fn => {
            try {
                fn(state);
            } catch (e) {
                console.error('[AppStore] Listener error:', e);
            }
        });
        
        this._isDispatching = false;
    }
}

// تصدير Singleton واحد
export default new AppStore();
