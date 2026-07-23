// startRouteHandler.js - معالج زر بدء التوجيه والتحميل
import { showToast } from '../core/utils.js';
import { inspectUrl, startDownload, resumeDownload } from '../services/downloadService.js';
import { addDownloadRow } from '../ui/downloadManager.js';

let registeredDevices = []; // سيتم ربطها من main
let currentInspectionData = null;
let currentUrl = null;

/**
 * دالة مساعدة لإعادة تعيين حالة زر بدء التحميل
 */
function resetButtonState(buttonElement) {
    if (buttonElement) {
        buttonElement.textContent = 'بدأ التحميل';
        buttonElement.disabled = false;
        buttonElement.style.opacity = '1';
        buttonElement.style.cursor = 'pointer';
    }
}

export function setRegisteredDevicesGetter(getterFn) {
    registeredDevices = getterFn;
}

/**
 * فحص الرابط وعرض نافذة اختيار الجودة
 */
export async function handleUrlInspection(url, urlInputElement, buttonElement) {
    console.log('[startRouteHandler] === بدء فحص الرابط ===');
    console.log('[startRouteHandler] الرابط المدخل:', url);
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
        console.log('[startRouteHandler] خطأ: الرابط فارغ');
        showToast('الرجاء إدخال رابط الوسائط', true);
        return false;
    }

    // تغيير حالة الزر إلى "جاري فحص الرابط" وتعطيله
    if (buttonElement) {
        console.log('[startRouteHandler] تغيير حالة الزر إلى "جاري فحص الرابط..."');
        buttonElement.textContent = 'جاري فحص الرابط...';
        buttonElement.disabled = true;
        buttonElement.style.opacity = '0.6';
        buttonElement.style.cursor = 'not-allowed';
    }

    let inspection;
    try {
        console.log('[startRouteHandler] استدعاء inspectUrl للرابط:', trimmedUrl);
        inspection = await inspectUrl(trimmedUrl);
        console.log('[startRouteHandler] نتيجة فحص الرابط:', inspection ? 'نجح' : 'فشل');
        if (!inspection || !inspection.formats || inspection.formats.length === 0) {
            console.log('[startRouteHandler] خطأ: لا توجد صيغ متاحة');
            showToast('لا توجد صيغ متاحة للتحميل من هذا الرابط.', true);
            resetButtonState(buttonElement);
            return false;
        }
    } catch (err) {
        console.log('[startRouteHandler] خطأ في فحص الرابط:', err.message);
        showToast(`فشل فحص الرابط: ${err.message}`, true);
        resetButtonState(buttonElement);
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
        console.log('[startRouteHandler] === اختيار المستخدم للجودة ===');
        console.log('[startRouteHandler] videoFormatId:', videoFormatId);
        console.log('[startRouteHandler] audioFormatId:', audioFormatId);
        console.log('[startRouteHandler] deviceId:', deviceId);
        await handleDownloadStart(trimmedUrl, videoFormatId, audioFormatId, deviceId, urlInputElement, buttonElement, inspection);
    });

    // إعادة الزر إلى حالته الأصلية بعد عرض النافذة
    resetButtonState(buttonElement);

    return true;
}

/**
 * بدء التحميل بعد اختيار الجودة والجهاز
 */
export async function handleDownloadStart(url, videoFormatId, audioFormatId, deviceId, urlInputElement, buttonElement, inspectionData) {
    console.log('[startRouteHandler] === بدء التحميل ===');
    console.log('[startRouteHandler] url:', url);
    console.log('[startRouteHandler] videoFormatId:', videoFormatId);
    console.log('[startRouteHandler] audioFormatId:', audioFormatId);
    console.log('[startRouteHandler] deviceId:', deviceId);
    // استخدام title فقط للعرض في الواجهة
    const title = inspectionData?.title || 'Unknown Video';
    console.log('[startRouteHandler] title:', title);

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
            console.log('[startRouteHandler] خطأ: يجب اختيار جودة واحدة على الأقل');
            throw new Error('يجب اختيار جودة واحدة على الأقل');
        }
        console.log('[startRouteHandler] formatId النهائي:', formatId);

        // تغيير حالة الزر إلى "جاري بدأ التحميل" وتعطيله
        if (buttonElement) {
            buttonElement.textContent = 'جاري بدأ التحميل';
            buttonElement.disabled = true;
            buttonElement.style.opacity = '0.6';
            buttonElement.style.cursor = 'not-allowed';
        }

        console.log('[startRouteHandler] استدعاء startDownload IPC');
        console.log('[startRouteHandler] البيانات المرسلة:', { url, formatId, deviceId, title });
        const result = await startDownload(url, formatId, deviceId, { title, formatsData: inspectionData });
        console.log('[startRouteHandler] نتيجة startDownload:', result);

        // التحقق مما إذا كان الباك إند قد وجد تحميلاً موجوداً
        if (result.existing) {
            console.log('[startRouteHandler] تحميل موجود مسبقاً');
            console.log('[startRouteHandler] حالة التحميل الموجود:', result.status);
            // حالات الاستئناف التلقائي
            if (result.status === 'stopped' || result.status === 'pending' || 
                result.status === 'cancelled' || result.status === 'failed') {
                // استئناف التحميل الموجود تلقائياً
                console.log('[startRouteHandler] استئناف تلقائي للتحميل الموجود');
                console.log('[startRouteHandler] downloadId:', result.downloadId);
                resetButtonState(buttonElement);
                showToast('التحميل موجود مسبقاً، جاري استئنافه...', false);
                await resumeDownload(result.downloadId, url, formatId, deviceId, { title, formatsData: inspectionData });
                return;
            }
            // حالات عرض الرسالة فقط - التحميل قيد التشغيل
            else if (result.status === 'downloading' || result.status === 'in_progress') {
                console.log('[startRouteHandler] التحميل قيد التشغيل بالفعل');
                resetButtonState(buttonElement);
                showToast('التحميل قيد التشغيل بالفعل', false);
                return;
            }
            // حالة التحميل المكتمل
            else if (result.status === 'completed') {
                console.log('[startRouteHandler] التحميل مكتمل مسبقاً');
                resetButtonState(buttonElement);
                showToast('التحميل مكتمل مسبقاً', true);
                return;
            }
        }

        const downloadId = result.processId;
        console.log('[startRouteHandler] downloadId الجديد:', downloadId);

        // الـ row سيتم إنشاؤه تلقائياً عند استقبال حدث download:started من الباك إند
        // الزر سيتم استعادته عند استلام حدث download:started

        if (urlInputElement) urlInputElement.value = '';
    } catch (err) {
        showToast(`فشل التحميل: ${err.message}`, true);
        // استعادة حالة الزر في حالة الفشل
        resetButtonState(buttonElement);
    }
}

/**
 * الدالة القديمة للتوافق - يمكن إزالتها لاحقاً
 */
export async function handleStartRoute(url, urlInputElement, buttonElement) {
    return handleUrlInspection(url, urlInputElement, buttonElement);
}