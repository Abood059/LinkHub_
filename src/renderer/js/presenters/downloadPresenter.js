// downloadPresenter.js - طبقة العارض للتحميلات (Download Presenter)
'use strict';

import store from '../store/appStore.js';

/**
 * DownloadPresenter - طبقة العارض للتحميلات
 * تحول البيانات الخام من المخزن إلى ViewModel جاهز للعرض
 */
class DownloadPresenter {
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
                        console.error('[DownloadPresenter] Listener error:', e);
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
        const downloads = state.downloads || [];

        // تصنيف التحميلات حسب الحالة
        const activeDownloads = [];
        const completedDownloads = [];
        const failedDownloads = [];
        const stoppedDownloads = [];

        downloads.forEach(download => {
            const status = download.status || 'unknown';
            
            // إضافة معلومات إضافية للتحميل
            const enrichedDownload = {
                ...download,
                isActive: status === 'downloading' || status === 'pending',
                isCompleted: status === 'completed',
                isFailed: status === 'failed',
                isStopped: status === 'stopped',
                statusText: this._getStatusText(status)
            };

            // التصنيف حسب الحالة
            if (status === 'downloading' || status === 'pending') {
                activeDownloads.push(enrichedDownload);
            } else if (status === 'completed') {
                completedDownloads.push(enrichedDownload);
            } else if (status === 'failed') {
                failedDownloads.push(enrichedDownload);
            } else if (status === 'stopped') {
                stoppedDownloads.push(enrichedDownload);
            }
        });

        // حساب متوسط نسبة التقدم للتحميلات النشطة
        let averageProgress = 0;
        if (activeDownloads.length > 0) {
            const totalProgress = activeDownloads.reduce((sum, d) => {
                return sum + (d.percent || 0);
            }, 0);
            averageProgress = totalProgress / activeDownloads.length;
        }

        return {
            allDownloads: downloads,
            activeDownloads,
            completedDownloads,
            failedDownloads,
            stoppedDownloads,
            activeCount: activeDownloads.length,
            hasActiveDownloads: activeDownloads.length > 0,
            averageProgress: Math.round(averageProgress),
            isLoading: state.isLoading || false,
            error: state.error || null,
            lastUpdate: state.lastUpdate || null
        };
    }

    /**
     * تحويل حالة التحميل إلى نص عربي
     * @param {string} status - حالة التحميل
     * @returns {string} النص العربي للحالة
     */
    _getStatusText(status) {
        const statusMap = {
            'downloading': 'جاري التحميل',
            'pending': 'في الانتظار',
            'completed': 'مكتمل',
            'failed': 'فشل',
            'stopped': 'متوقف'
        };
        return statusMap[status] || status;
    }

    // ===== Helper Methods =====

    /**
     * إرجاع تحميل واحد بواسطة معرفه
     * @param {string} downloadId - معرف التحميل
     * @returns {Object|null} التحميل أو null إذا لم يوجد
     */
    getDownloadById(downloadId) {
        const state = store.getState();
        return state.downloads.find(d => d.downloadId === downloadId) || null;
    }

    /**
     * إرجاع تحميلات جهاز معين
     * @param {string} deviceId - معرف الجهاز
     * @returns {Array} قائمة تحميلات الجهاز
     */
    getDownloadsByDevice(deviceId) {
        const state = store.getState();
        return state.downloads.filter(d => d.deviceId === deviceId);
    }
}

// تصدير Singleton واحد
export default new DownloadPresenter();
