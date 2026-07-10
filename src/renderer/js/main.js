// main.js - نقطة الدخول للتطبيق
import { DOM_IDS } from './core/constants.js';
import { showToast } from './core/utils.js';
import { getAllDevices } from './services/deviceService.js';
import { setupEventListeners } from './services/eventService.js';
import { initDownloadTable, initRecentDownloadsTable, addDownloadRow, updateDownloadProgress, markDownloadComplete, markDownloadError, markDownloadRetrying, updateTransferStatus, markTransferComplete, markTransferError, showTransferButton } from './ui/downloadManager.js';
import { renderDevices, setShowModalCallback } from './ui/deviceManager.js';
import { initModal, showDeviceModal } from './ui/modalManager.js';
import { initTabs, switchTab } from './ui/tabManager.js';
import { getSelectedDeviceIds, clearSelected } from './ui/selectionManager.js';
import { handleStartRoute } from './handlers/startRouteHandler.js';
import { handlePairDevice } from './handlers/pairHandler.js';
import { initFormatSelectionModal, resetStartButtonState } from './ui/formatSelectionModal.js';

// التحقق من وصول linkhub
let registeredDevices = [];

// ربط عناصر DOM
const navItems = document.querySelectorAll(DOM_IDS.navItems);
const sections = {
    home: document.getElementById(DOM_IDS.homeSection),
    downloads: document.getElementById(DOM_IDS.downloadsSection),
    settings: document.getElementById(DOM_IDS.settingsSection)
};
const registeredContainer = document.getElementById(DOM_IDS.registeredContainer);
const discoveredContainer = document.getElementById(DOM_IDS.discoveredContainer);
const downloadsTbody = document.getElementById(DOM_IDS.downloadsTbody);
const recentDownloadsTbody = document.getElementById(DOM_IDS.recentDownloadsTbody);
const btnStart = document.getElementById(DOM_IDS.btnStart);
const urlInput = document.getElementById(DOM_IDS.mediaUrl);
const btnStartDownloads = document.getElementById(DOM_IDS.btnStartDownloads);
const urlInputDownloads = document.getElementById(DOM_IDS.mediaUrlDownloads);
const refreshBtn = document.getElementById(DOM_IDS.refreshDevices);
const pairBtn = document.getElementById(DOM_IDS.pairDevice);

// عناصر المودال
const modal = document.getElementById(DOM_IDS.deviceModal);
const modalClose = document.querySelector(DOM_IDS.modalClose);
const modalOverlay = document.querySelector(DOM_IDS.modalOverlay);
const modalDeviceName = document.getElementById(DOM_IDS.modalDeviceName);
const modalDeviceModel = document.getElementById(DOM_IDS.modalDeviceModel);
const modalDeviceVersion = document.getElementById(DOM_IDS.modalDeviceVersion);
const modalDeviceArch = document.getElementById(DOM_IDS.modalDeviceArch);
const modalDeviceStatus = document.getElementById(DOM_IDS.modalDeviceStatus);
const modalDeviceAdb = document.getElementById(DOM_IDS.modalDeviceAdb);
const modalStreamBtn = document.getElementById(DOM_IDS.modalStreamBtn);
const modalDisconnectBtn = document.getElementById(DOM_IDS.modalDisconnectBtn);

// تهيئة المودال وربط callback
initModal(modal, modalClose, modalOverlay, modalDeviceName, modalDeviceModel, modalDeviceVersion, modalDeviceArch, modalDeviceStatus, modalDeviceAdb, modalStreamBtn, modalDisconnectBtn);
setShowModalCallback(showDeviceModal);

// تهيئة جدول التحميلات
initDownloadTable(downloadsTbody);

// تهيئة جدول التحميلات المصغر
if (recentDownloadsTbody) {
    initRecentDownloadsTable(recentDownloadsTbody);
}

// تهيئة نافذة اختيار الجودة
initFormatSelectionModal();

// دالة تحميل الأجهزة
export async function loadDevices() {
    try {
        const devices = await getAllDevices();
        registeredDevices = devices;
        renderDevices(registeredDevices, registeredContainer, discoveredContainer);
    } catch (err) {
        if (registeredContainer) registeredContainer.innerHTML = '<div class="placeholder-text">خطأ في تحميل الأجهزة</div>';
    }
}

// ربط handlers الأحداث
setupEventListeners({
    onProgress: (downloadId, percent, speed, size, totalSize, downloadedBytes) => updateDownloadProgress(downloadId, percent, speed, size, totalSize, downloadedBytes),
    onRetrying: (downloadId, retryCount, maxRetries) => markDownloadRetrying(downloadId, retryCount, maxRetries),
    onComplete: (downloadId) => markDownloadComplete(downloadId),
    onError: (downloadId, error) => markDownloadError(downloadId, error),
    onStopped: (downloadId) => showToast('تم إيقاف التحميل'),
    onDownloadStarted: (downloadId, url, title) => {
        // إنشاء row للتحميل الجديد باستخدام عنوان الفيديو من yt-dlp
        const fileName = title || (() => {
            try {
                const urlObj = new URL(url);
                return urlObj.pathname.split('/').pop() || 'media_' + downloadId;
            } catch (e) {
                return 'media_' + downloadId;
            }
        })();
        // ملاحظة: حالياً لا نملك formatId و deviceId عند استلام الحدث
        // سيتم تحديث هذا لاحقاً إذا كانت هناك حاجة
        addDownloadRow(downloadId, fileName, 'الجهاز المحلي', url, null, null, title);
        
        // استعادة حالة أزرار بدأ التحميل
        if (btnStart) {
            btnStart.textContent = 'بدأ التحميل';
            btnStart.disabled = false;
            btnStart.style.opacity = '1';
            btnStart.style.cursor = 'pointer';
        }
        if (btnStartDownloads) {
            btnStartDownloads.textContent = 'بدأ التحميل';
            btnStartDownloads.disabled = false;
            btnStartDownloads.style.opacity = '1';
            btnStartDownloads.style.cursor = 'pointer';
        }
        // استعادة حالة زر المودال
        resetStartButtonState();
    },
    onDeviceStateChanged: () => loadDevices(),
    onDevicePaired: () => loadDevices(),
    onDeviceRemoved: () => loadDevices(),
    onTransferProgress: (downloadId, percent) => updateTransferStatus(downloadId, `جاري النقل ${percent}%`),
    onTransferComplete: (downloadId, message) => markTransferComplete(downloadId, message),
    onTransferError: (downloadId, error) => markTransferError(downloadId, error)
});

// التبويبات
initTabs(navItems, sections);
switchTab('home', navItems, sections);

// زر بدء التوجيه
btnStart.addEventListener('click', async () => {
    const url = urlInput.value;
    const success = await handleStartRoute(url, urlInput, btnStart);
    if (success) urlInput.focus();
});

// زر بدء التوجيه في صفحة التحميلات
if (btnStartDownloads && urlInputDownloads) {
    btnStartDownloads.addEventListener('click', async () => {
        const url = urlInputDownloads.value;
        const success = await handleStartRoute(url, urlInputDownloads, btnStartDownloads);
        if (success) urlInputDownloads.focus();
    });
}

// تحديث الأجهزة
if (refreshBtn) refreshBtn.addEventListener('click', () => loadDevices());
// إقران جهاز
if (pairBtn) pairBtn.addEventListener('click', () => handlePairDevice(loadDevices));

// تحميل أولي
loadDevices();