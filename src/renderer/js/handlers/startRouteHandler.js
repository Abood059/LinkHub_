// startRouteHandler.js - معالج زر بدء التوجيه والتحميل
import { showToast } from '../core/utils.js';
import { inspectUrl, startDownload, resumeDownload } from '../services/downloadService.js';
import { addDownloadRow } from '../ui/downloadManager.js';

let registeredDevices = []; // سيتم ربطها من main
let currentInspectionData = null;
let currentUrl = null;

export function setRegisteredDevicesGetter(getterFn) {
    registeredDevices = getterFn;
}

/**
 * فحص الرابط وعرض نافذة اختيار الجودة
 */
export async function handleUrlInspection(url, urlInputElement, buttonElement) {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
        showToast('الرجاء إدخال رابط الوسائط', true);
        return false;
    }

    // تغيير حالة الزر إلى "جاري فحص الرابط" وتعطيله
    if (buttonElement) {
        buttonElement.textContent = 'جاري فحص الرابط...';
        buttonElement.disabled = true;
        buttonElement.style.opacity = '0.6';
        buttonElement.style.cursor = 'not-allowed';
    }

    let inspection;
    try {
        inspection = await inspectUrl(trimmedUrl);
        if (!inspection || !inspection.formats || inspection.formats.length === 0) {
            showToast('لا توجد صيغ متاحة للتحميل من هذا الرابط.', true);
            if (buttonElement) {
                buttonElement.textContent = 'بدأ التحميل';
                buttonElement.disabled = false;
                buttonElement.style.opacity = '1';
                buttonElement.style.cursor = 'pointer';
            }
            return false;
        }
    } catch (err) {
        showToast(`فشل فحص الرابط: ${err.message}`, true);
        if (buttonElement) {
            buttonElement.textContent = 'بدأ التحميل';
            buttonElement.disabled = false;
            buttonElement.style.opacity = '1';
            buttonElement.style.cursor = 'pointer';
        }
        return false;
    }

    currentInspectionData = inspection;
    currentUrl = trimmedUrl;

    // تجهيز قائمة الأجهزة
    const devicesList = (typeof registeredDevices === 'function') ? registeredDevices() : registeredDevices;
    const connectedDevices = [];
    if (devicesList && devicesList.length > 0) {
        devicesList.forEach(deviceData => {
            if (deviceData.device && deviceData.device.connected) {
                connectedDevices.push({
                    id: deviceData.device.id,
                    name: deviceData.device.deviceFriendlyName || deviceData.device.model || deviceData.device.id,
                    connected: true
                });
            }
        });
    }

    // عرض نافذة اختيار الجودة
    const { showFormatSelectionModal, onFormatSelected } = await import('../ui/formatSelectionModal.js');
    showFormatSelectionModal(inspection, connectedDevices);

    // تسجيل callback لبدء التحميل
    onFormatSelected(async ({ videoFormatId, audioFormatId, deviceId }) => {
        await handleDownloadStart(trimmedUrl, videoFormatId, audioFormatId, deviceId, urlInputElement, buttonElement, inspection);
    });

    // إعادة الزر إلى حالته الأصلية بعد عرض النافذة
    if (buttonElement) {
        buttonElement.textContent = 'بدأ التحميل';
        buttonElement.disabled = false;
        buttonElement.style.opacity = '1';
        buttonElement.style.cursor = 'pointer';
    }

    return true;
}

/**
 * بدء التحميل بعد اختيار الجودة والجهاز
 */
export async function handleDownloadStart(url, videoFormatId, audioFormatId, deviceId, urlInputElement, buttonElement, inspectionData) {
    // استخدام title فقط للعرض في الواجهة
    const title = inspectionData?.title || 'Unknown Video';

    let deviceName = 'الجهاز المحلي';
    if (deviceId) {
        const devicesList = (typeof registeredDevices === 'function') ? registeredDevices() : registeredDevices;
        const deviceData = devicesList?.find(d => d.device.id === deviceId);
        if (deviceData) {
            deviceName = deviceData.device.deviceFriendlyName || deviceData.device.model || deviceId;
        }
    }

    try {
        // تحديد format_id للتحميل - إذا تم اختيار كلاهما، ندمجهما
        let formatId;
        if (videoFormatId && audioFormatId) {
            // دمج الفيديو والصوت
            formatId = `${videoFormatId}+${audioFormatId}`;
        } else if (videoFormatId) {
            formatId = videoFormatId;
        } else if (audioFormatId) {
            formatId = audioFormatId;
        } else {
            throw new Error('يجب اختيار جودة واحدة على الأقل');
        }

        // تغيير حالة الزر إلى "جاري بدأ التحميل" وتعطيله
        if (buttonElement) {
            buttonElement.textContent = 'جاري بدأ التحميل';
            buttonElement.disabled = true;
            buttonElement.style.opacity = '0.6';
            buttonElement.style.cursor = 'not-allowed';
        }

        const result = await startDownload(url, formatId, deviceId, { title, formatsData: inspectionData });
        
        // التحقق مما إذا كان الباك إند قد وجد تحميلاً موجوداً
        if (result.existing) {
            // تحميل موجود بنفس الرابط والجودة - فحص كل الحالات
            if (result.status === 'cancelled' || result.status === 'pending' || result.status === 'in_progress' || result.status === 'stopped') {
                // استئناف التحميل الموجود تلقائياً
                showToast('التحميل موجود مسبقاً، جاري استئنافه...', false);
                await resumeDownload(result.downloadId, url, formatId, deviceId, { title, formatsData: inspectionData });
                if (urlInputElement) urlInputElement.value = '';
                return;
            } else if (result.status === 'completed') {
                showToast('هذا الفيديو تم تحميله مسبقاً بنفس الجودة', true);
                if (buttonElement) {
                    buttonElement.textContent = 'بدأ التحميل';
                    buttonElement.disabled = false;
                    buttonElement.style.opacity = '1';
                    buttonElement.style.cursor = 'pointer';
                }
                return;
            } else if (result.status === 'failed') {
                // السماح بإعادة المحاولة للتحميلات الفاشلة
                showToast('التحميل السابق فشل، جاري إعادة المحاولة...', false);
            }
        }
        
        const downloadId = result.processId;

        // الـ row سيتم إنشاؤه تلقائياً عند استقبال حدث download:started من الباك إند
        // الزر سيتم استعادته عند استلام حدث download:started

        if (urlInputElement) urlInputElement.value = '';
    } catch (err) {
        showToast(`فشل التحميل: ${err.message}`, true);
        // استعادة حالة الزر في حالة الفشل
        if (buttonElement) {
            buttonElement.textContent = 'بدأ التحميل';
            buttonElement.disabled = false;
            buttonElement.style.opacity = '1';
            buttonElement.style.cursor = 'pointer';
        }
    }
}

/**
 * الدالة القديمة للتوافق - يمكن إزالتها لاحقاً
 */
export async function handleStartRoute(url, urlInputElement, buttonElement) {
    return handleUrlInspection(url, urlInputElement, buttonElement);
}