// downloadManager.js - إدارة جدول التحميلات
import { escapeHtml } from '../core/utils.js';
import { showToast } from '../core/utils.js';
import { stopDownload, resumeDownload, deleteDownload } from '../services/downloadService.js';

let downloadsTbody = null;
let recentDownloadsTbody = null;
const MAX_RECENT_DOWNLOADS = 4;

// الحالة المحلية الموحدة لأزرار الإيقاف/الاستئناف
// هذا هو المصدر الوحيد للحقيقة لحالة الأزرار
const buttonStates = new Map(); // downloadId -> { status, disabled, text, background }

/**
 * تحويل البايتات إلى صيغة مقروءة
 */
function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '--';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * تحليل حجم التحميل من السلسلة النصية
 */
function parseSizeString(sizeStr) {
    if (!sizeStr) return { downloaded: null, total: null };
    const match = sizeStr.match(/(\d+)\/(\d+)/);
    if (match) {
        return {
            downloaded: parseInt(match[1]),
            total: parseInt(match[2])
        };
    }
    return { downloaded: null, total: null };
}

export function initDownloadTable(tbodyElement) {
    downloadsTbody = tbodyElement;
}

export function initRecentDownloadsTable(tbodyElement) {
    recentDownloadsTbody = tbodyElement;
}

export function addDownloadRow(downloadId, fileName, targetDeviceName, url, formatId = null, deviceId = null, title = null, appendMode = false) {
    if (!downloadsTbody) return;
    const row = document.createElement('tr');
    row.setAttribute('data-download-id', downloadId);
    row.setAttribute('data-url', url);
    row.setAttribute('data-device-name', targetDeviceName);
    row.setAttribute('data-format-id', formatId || '');
    row.setAttribute('data-device-id', deviceId || '');
    row.setAttribute('data-title', title || '');
    row.innerHTML = `
        <td class="file-name">${escapeHtml(fileName)}</td>
        <td>
            <div class="progress-wrapper">
                <div class="progress-track">
                    <div class="progress-fill" style="width: 0%;"></div>
                </div>
                <span class="progress-percentage">0%</span>
            </div>
        </td>
        <td class="file-size">--</td>
        <td class="download-speed">--</td>
        <td><span class="device-tag">${escapeHtml(targetDeviceName)}</span></td>
        <td class="transfer-status">--</td>
        <td>
            <button class="btn-stop-download" data-url="${escapeHtml(url)}" data-download-id="${downloadId}" data-status="active" style="background: #D32F2F; border: none; color: white; padding: 4px 12px; border-radius: 20px; cursor: pointer; font-size: 0.7rem;">إيقاف</button>
            <button class="btn-transfer-device" data-download-id="${downloadId}" style="background: #1e6fd9; border: none; color: white; padding: 4px 12px; border-radius: 20px; cursor: pointer; font-size: 0.7rem; display: none;">نقل للجهاز</button>
            <button class="btn-delete-download" data-download-id="${downloadId}" style="background: #757575; border: none; color: white; padding: 4px 12px; border-radius: 20px; cursor: pointer; font-size: 0.7rem; margin-left: 4px; display: none;">حذف</button>
        </td>
    `;
    const emptyRow = downloadsTbody.querySelector('.empty-row');
    if (emptyRow) emptyRow.remove();
    // استخدام append للحفاظ على الترتيب عند التحميل من قاعدة البيانات، prepend للتحميلات الجديدة
    if (appendMode) {
        downloadsTbody.appendChild(row);
    } else {
        downloadsTbody.prepend(row);
    }

    const stopBtn = row.querySelector('.btn-stop-download');
    if (stopBtn) {
        stopBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            console.log('[downloadManager] === ضغط زر الإيقاف/الاستئناف (الجدول الرئيسي) ===');
            const targetUrl = stopBtn.getAttribute('data-url');
            const targetDownloadId = stopBtn.getAttribute('data-download-id');
            const currentStatus = stopBtn.getAttribute('data-status');
            const targetFormatId = row.getAttribute('data-format-id');
            const targetDeviceId = row.getAttribute('data-device-id');
            const targetTitle = row.getAttribute('data-title');
            console.log('[downloadManager] targetUrl:', targetUrl);
            console.log('[downloadManager] targetDownloadId:', targetDownloadId);
            console.log('[downloadManager] currentStatus:', currentStatus);
            console.log('[downloadManager] targetFormatId:', targetFormatId);
            console.log('[downloadManager] targetDeviceId:', targetDeviceId);
            console.log('[downloadManager] targetTitle:', targetTitle);
            
            if (currentStatus === 'active') {
                console.log('[downloadManager] الحالة: active - إيقاف التحميل');
                if (targetUrl && confirm('هل تريد إيقاف هذا التحميل؟')) {
                    try {
                        console.log('[downloadManager] استدعاء stopDownload');
                        await stopDownload(targetDownloadId);
                        showToast(`تم إيقاف التحميل: ${fileName}`);
                        syncStopButtonState(targetDownloadId, 'استئناف', 'stopped', '#388E3C');
                    } catch (err) {
                        console.log('[downloadManager] خطأ في إيقاف التحميل:', err.message);
                        showToast(`فشل إيقاف التحميل: ${err.message}`, true);
                    }
                }
            } else if (currentStatus === 'failed') {
                console.log('[downloadManager] الحالة: failed - إعادة محاولة التحميل');
                // إعادة محاولة التحميل الفاشل
                if (targetUrl && targetFormatId) {
                    try {
                        console.log('[downloadManager] استدعاء resumeDownload لإعادة المحاولة');
                        syncStopButtonState(targetDownloadId, 'جاري إعادة المحاولة...', 'active', '#FF9800', true);
                        await resumeDownload(targetDownloadId, targetUrl, targetFormatId, targetDeviceId, { title: targetTitle });
                        showToast(`جاري إعادة محاولة التحميل: ${fileName}`);
                    } catch (err) {
                        console.log('[downloadManager] خطأ في إعادة المحاولة:', err.message);
                        showToast(`فشل إعادة المحاولة: ${err.message}`, true);
                        syncStopButtonState(targetDownloadId, 'إعادة المحاولة', 'failed', '#D32F2F');
                    }
                }
            } else if (currentStatus === 'stopped') {
                console.log('[downloadManager] الحالة: stopped - استئناف التحميل');
                // استئناف التحميل - السماح للباك إند بالبحث عن التحميل المتطابق
                if (targetUrl && targetFormatId) {
                    try {
                        console.log('[downloadManager] استدعاء resumeDownload للاستئناف');
                        console.log('[downloadManager] تمرير null كـ processId للسماح للباك إند بالبحث');
                        syncStopButtonState(targetDownloadId, 'إيقاف', 'active', '#D32F2F', false);
                        // تمرير null كـ processId للسماح للباك إند بالبحث عن التحميل المتطابق
                        await resumeDownload(null, targetUrl, targetFormatId, targetDeviceId, { title: targetTitle });
                        showToast(`جاري استئناف التحميل: ${fileName}`);
                        // سيتم تغيير الحالة إلى "إيقاف" عند أول تحديث للتقدم في updateDownloadProgress
                    } catch (err) {
                        console.log('[downloadManager] خطأ في استئناف التحميل:', err.message);
                        showToast(`فشل استئناف التحميل: ${err.message}`, true);
                        syncStopButtonState(targetDownloadId, 'استئناف', 'stopped', '#388E3C');
                    }
                } else {
                    console.error('[downloadManager] Missing data for resume:', { targetUrl, targetFormatId, targetDownloadId, rowAttributes: Array.from(row.attributes).map(a => ({name: a.name, value: a.value})) });
                    showToast('لا يمكن استئناف التحميل - بيانات غير كافية', true);
                }
            }
        });
    }

    const transferBtn = row.querySelector('.btn-transfer-device');
    if (transferBtn) {
        transferBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const dlId = transferBtn.getAttribute('data-download-id');
            const deviceName = row.getAttribute('data-device-name');
            if (confirm(`هل تريد نقل الملف للجهاز ${deviceName}؟`)) {
                try {
                    transferBtn.textContent = 'جاري النقل...';
                    transferBtn.disabled = true;
                    // TODO: تنفيذ النقل اليدوي
                    showToast('جاري نقل الملف للجهاز...');
                } catch (err) {
                    showToast(`فشل النقل: ${err.message}`, true);
                    transferBtn.textContent = 'نقل للجهاز';
                    transferBtn.disabled = false;
                }
            }
        });
    }

    const deleteBtn = row.querySelector('.btn-delete-download');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const dlId = deleteBtn.getAttribute('data-download-id');
            if (confirm('هل تريد حذف هذا التحميل من السجل؟')) {
                try {
                    await deleteDownload(dlId);
                    row.remove();
                    showToast('تم حذف التحميل من السجل');
                } catch (err) {
                    showToast(`فشل الحذف: ${err.message}`, true);
                }
            }
        });
    }

    // إضافة للجدول المصغر أيضاً
    addRecentDownloadRow(downloadId, fileName, targetDeviceName, url, formatId, deviceId, title);

    return row;
}

function addRecentDownloadRow(downloadId, fileName, targetDeviceName, url, formatId = null, deviceId = null, title = null) {
    if (!recentDownloadsTbody) return;
    
    // التحقق من عدد التحميلات الحالية
    const currentRows = recentDownloadsTbody.querySelectorAll('tr:not(.empty-row)');
    if (currentRows.length >= MAX_RECENT_DOWNLOADS) {
        // إزالة أقدم تحميل
        currentRows[currentRows.length - 1].remove();
    }
    
    const row = document.createElement('tr');
    row.setAttribute('data-download-id', downloadId);
    row.setAttribute('data-url', url);
    row.setAttribute('data-device-name', targetDeviceName);
    row.setAttribute('data-format-id', formatId || '');
    row.setAttribute('data-device-id', deviceId || '');
    row.setAttribute('data-title', title || '');
    row.innerHTML = `
        <td class="file-name">${escapeHtml(fileName)}</td>
        <td>
            <div class="progress-wrapper">
                <div class="progress-track">
                    <div class="progress-fill" style="width: 0%;"></div>
                </div>
                <span class="progress-percentage">0%</span>
            </div>
        </td>
        <td class="file-size">--</td>
        <td class="download-speed">--</td>
        <td>
            <button class="btn-stop-download" data-url="${escapeHtml(url)}" data-download-id="${downloadId}" data-status="active" style="background: #D32F2F; border: none; color: white; padding: 4px 12px; border-radius: 20px; cursor: pointer; font-size: 0.7rem;">إيقاف</button>
        </td>
    `;
    
    const emptyRow = recentDownloadsTbody.querySelector('.empty-row');
    if (emptyRow) emptyRow.remove();
    recentDownloadsTbody.prepend(row);

    const stopBtn = row.querySelector('.btn-stop-download');
    if (stopBtn) {
        stopBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            console.log('[downloadManager] === ضغط زر الإيقاف/الاستئناف (الجدول المصغر) ===');
            const targetUrl = stopBtn.getAttribute('data-url');
            const targetDownloadId = stopBtn.getAttribute('data-download-id');
            const currentStatus = stopBtn.getAttribute('data-status');
            const targetFormatId = row.getAttribute('data-format-id');
            const targetDeviceId = row.getAttribute('data-device-id');
            const targetTitle = row.getAttribute('data-title');
            console.log('[downloadManager] targetUrl:', targetUrl);
            console.log('[downloadManager] targetDownloadId:', targetDownloadId);
            console.log('[downloadManager] currentStatus:', currentStatus);
            console.log('[downloadManager] targetFormatId:', targetFormatId);
            console.log('[downloadManager] targetDeviceId:', targetDeviceId);
            console.log('[downloadManager] targetTitle:', targetTitle);
            
            if (currentStatus === 'active') {
                console.log('[downloadManager] الحالة: active - إيقاف التحميل');
                if (targetUrl && confirm('هل تريد إيقاف هذا التحميل؟')) {
                    try {
                        console.log('[downloadManager] استدعاء stopDownload');
                        await stopDownload(targetDownloadId);
                        showToast(`تم إيقاف التحميل: ${fileName}`);
                        syncStopButtonState(targetDownloadId, 'استئناف', 'stopped', '#388E3C');
                    } catch (err) {
                        console.log('[downloadManager] خطأ في إيقاف التحميل:', err.message);
                        showToast(`فشل إيقاف التحميل: ${err.message}`, true);
                    }
                }
            } else if (currentStatus === 'failed') {
                console.log('[downloadManager] الحالة: failed - إعادة محاولة التحميل');
                // إعادة محاولة التحميل الفاشل
                if (targetUrl && targetFormatId) {
                    try {
                        console.log('[downloadManager] استدعاء resumeDownload لإعادة المحاولة');
                        syncStopButtonState(targetDownloadId, 'جاري إعادة المحاولة...', 'active', '#FF9800', true);
                        await resumeDownload(targetDownloadId, targetUrl, targetFormatId, targetDeviceId, { title: targetTitle });
                        showToast(`جاري إعادة محاولة التحميل: ${fileName}`);
                    } catch (err) {
                        console.log('[downloadManager] خطأ في إعادة المحاولة:', err.message);
                        showToast(`فشل إعادة المحاولة: ${err.message}`, true);
                        syncStopButtonState(targetDownloadId, 'إعادة المحاولة', 'failed', '#D32F2F');
                    }
                }
            } else if (currentStatus === 'stopped') {
                console.log('[downloadManager] الحالة: stopped - استئناف التحميل');
                // استئناف التحميل - السماح للباك إند بالبحث عن التحميل المتطابق
                if (targetUrl && targetFormatId) {
                    try {
                        console.log('[downloadManager] استدعاء resumeDownload للاستئناف');
                        console.log('[downloadManager] تمرير null كـ processId للسماح للباك إند بالبحث');
                        syncStopButtonState(targetDownloadId, 'إيقاف', 'active', '#D32F2F', false);
                        // تمرير null كـ processId للسماح للباك إند بالبحث عن التحميل المتطابق
                        await resumeDownload(null, targetUrl, targetFormatId, targetDeviceId, { title: targetTitle });
                        showToast(`جاري استئناف التحميل: ${fileName}`);
                        // سيتم تغيير الحالة إلى "إيقاف" عند أول تحديث للتقدم في updateDownloadProgress
                    } catch (err) {
                        console.log('[downloadManager] خطأ في استئناف التحميل:', err.message);
                        showToast(`فشل استئناف التحميل: ${err.message}`, true);
                        syncStopButtonState(targetDownloadId, 'استئناف', 'stopped', '#388E3C');
                    }
                } else {
                    console.error('[downloadManager] Missing data for resume:', { targetUrl, targetFormatId, targetDownloadId, rowAttributes: Array.from(row.attributes).map(a => ({name: a.name, value: a.value})) });
                    showToast('لا يمكن استئناف التحميل - بيانات غير كافية', true);
                }
            }
        });
    }
}

export function updateDownloadProgress(downloadId, percent, speed, size, totalSize = null, downloadedBytes = null) {
    // تحديث الجدول الكامل
    if (!downloadsTbody) return;
    let row = downloadsTbody.querySelector(`tr[data-download-id="${downloadId}"]`);
    // Fallback: try to find row by URL if downloadId not found
    if (!row) {
        row = downloadsTbody.querySelector(`tr[data-url="${downloadId}"]`);
        if (row) {
            row.setAttribute('data-download-id', downloadId);
        }
    }
    if (!row) {
        return;
    }
    const fill = row.querySelector('.progress-fill');
    const percentSpan = row.querySelector('.progress-percentage');
    const speedSpan = row.querySelector('.download-speed');
    const sizeSpan = row.querySelector('.file-size');
    if (fill) fill.style.width = `${percent}%`;
    if (percentSpan) percentSpan.textContent = `${percent}%`;
    if (speedSpan && speed) speedSpan.textContent = speed;
    
    // تحديث عرض الحجم مع دعم الحجم الكلي
    if (sizeSpan) {
        if (totalSize && downloadedBytes !== null) {
            // عرض الحجم الكلي والمحمل
            sizeSpan.textContent = `${formatBytes(downloadedBytes)} / ${formatBytes(totalSize)}`;
        } else if (size) {
            // استخدام القيمة الأصلية إذا لم يتوفر الحجم الكلي
            const parsed = parseSizeString(size);
            if (parsed.downloaded && parsed.total) {
                sizeSpan.textContent = `${formatBytes(parsed.downloaded)} / ${formatBytes(parsed.total)}`;
            } else {
                sizeSpan.textContent = size;
            }
        } else {
            sizeSpan.textContent = '--';
        }
    }
    
    if (fill) {
        const hue = 210 - (percent / 100) * 90;
        fill.style.backgroundColor = `hsl(${hue}, 70%, 55%)`;
    }

    // تحديث الجدول المصغر أيضاً
    updateRecentDownloadProgress(downloadId, percent, speed, size, totalSize, downloadedBytes);
}

function updateRecentDownloadProgress(downloadId, percent, speed, size, totalSize = null, downloadedBytes = null) {
    if (!recentDownloadsTbody) return;
    let row = recentDownloadsTbody.querySelector(`tr[data-download-id="${downloadId}"]`);
    if (!row) {
        row = recentDownloadsTbody.querySelector(`tr[data-url="${downloadId}"]`);
        if (row) {
            row.setAttribute('data-download-id', downloadId);
        }
    }
    if (!row) return;
    
    const fill = row.querySelector('.progress-fill');
    const percentSpan = row.querySelector('.progress-percentage');
    const speedSpan = row.querySelector('.download-speed');
    const sizeSpan = row.querySelector('.file-size');
    if (fill) fill.style.width = `${percent}%`;
    if (percentSpan) percentSpan.textContent = `${percent}%`;
    if (speedSpan && speed) speedSpan.textContent = speed;
    
    if (sizeSpan) {
        if (totalSize && downloadedBytes !== null) {
            sizeSpan.textContent = `${formatBytes(downloadedBytes)} / ${formatBytes(totalSize)}`;
        } else if (size) {
            const parsed = parseSizeString(size);
            if (parsed.downloaded && parsed.total) {
                sizeSpan.textContent = `${formatBytes(parsed.downloaded)} / ${formatBytes(parsed.total)}`;
            } else {
                sizeSpan.textContent = size;
            }
        } else {
            sizeSpan.textContent = '--';
        }
    }
    
    if (fill) {
        const hue = 210 - (percent / 100) * 90;
        fill.style.backgroundColor = `hsl(${hue}, 70%, 55%)`;
    }

}

export function markDownloadComplete(downloadId) {
    if (!downloadsTbody) return;
    const row = downloadsTbody.querySelector(`tr[data-download-id="${downloadId}"]`);
    if (!row) {
        return;
    }
    const fill = row.querySelector('.progress-fill');
    const percentSpan = row.querySelector('.progress-percentage');
    const speedSpan = row.querySelector('.download-speed');
    if (fill) fill.style.width = '100%';
    if (percentSpan) percentSpan.textContent = '100%';
    if (speedSpan) speedSpan.textContent = '0 MB/s';
    if (fill) fill.style.backgroundColor = 'hsl(120, 70%, 55%)';
    
    // تحديث حالة الزر باستخدام الحالة المحلية الموحدة
    updateButtonState(downloadId, 'completed', true);
    
    const deleteBtn = row.querySelector('.btn-delete-download');
    if (deleteBtn) {
        deleteBtn.style.display = 'inline-block';
    }
}

export function markDownloadStopped(downloadId, data = null) {
    if (!downloadsTbody) return;
    const row = downloadsTbody.querySelector(`tr[data-download-id="${downloadId}"]`);
    if (!row) {
        return;
    }
    
    // تحديث البيانات إذا توفرت
    if (data) {
        if (data.formatId) {
            row.setAttribute('data-format-id', data.formatId);
        }
        if (data.deviceId) {
            row.setAttribute('data-device-id', data.deviceId);
        }
        if (data.title) {
            row.setAttribute('data-title', data.title);
        }
    }
    
    // تحديث حالة الزر باستخدام الحالة المحلية الموحدة
    updateButtonState(downloadId, 'stopped', false);
    
    // تحديث الجدول المصغر أيضاً
    updateRecentDownloadStopped(downloadId, data);
}

function updateRecentDownloadStopped(downloadId, data = null) {
    if (!recentDownloadsTbody) return;
    const row = recentDownloadsTbody.querySelector(`tr[data-download-id="${downloadId}"]`);
    if (!row) return;
    
    // تحديث البيانات إذا توفرت
    if (data) {
        if (data.formatId) {
            row.setAttribute('data-format-id', data.formatId);
        }
        if (data.deviceId) {
            row.setAttribute('data-device-id', data.deviceId);
        }
        if (data.title) {
            row.setAttribute('data-title', data.title);
        }
    }
    
    // تحديث حالة الزر باستخدام الحالة المحلية الموحدة
    updateButtonState(downloadId, 'stopped', false);
}

/**
 * دالة موحدة لتحديث حالة زر الإيقاف/الاستئناف في كلا الجدولين
 * تعتمد على الحالة المحلية الموحدة كمصدر للحقيقة
 */
function updateButtonState(downloadId, status, disabled = false) {
    // تحديد النص واللون بناءً على الحالة
    let text, background;
    switch (status) {
        case 'active':
            text = 'إيقاف';
            background = '#D32F2F';
            break;
        case 'stopped':
            text = 'استئناف';
            background = '#388E3C';
            break;
        case 'completed':
            text = 'مكتمل';
            background = '#388E3C';
            break;
        case 'failed':
            text = 'إعادة المحاولة';
            background = '#D32F2F';
            break;
        default:
            text = 'إيقاف';
            background = '#D32F2F';
    }

    // تحديث الحالة المحلية
    buttonStates.set(downloadId, { status, disabled, text, background });

    // دالة مساعدة للتحقق من حالة الزر والتحديث
    const updateButton = (row) => {
        const stopBtn = row.querySelector('.btn-stop-download');
        if (!stopBtn) return;

        stopBtn.textContent = text;
        stopBtn.setAttribute('data-status', status);
        stopBtn.style.background = background;
        stopBtn.disabled = disabled;
    };

    // تحديث الجدول الكامل
    if (downloadsTbody) {
        const row = downloadsTbody.querySelector(`tr[data-download-id="${downloadId}"]`);
        if (row) {
            updateButton(row);
        }
    }

    // تحديث الجدول المصغر
    if (recentDownloadsTbody) {
        const row = recentDownloadsTbody.querySelector(`tr[data-download-id="${downloadId}"]`);
        if (row) {
            updateButton(row);
        }
    }
}

/**
 * دالة موحدة لتحديث حالة زر الإيقاف/الاستئناف في كلا الجدولين
 * (محتفظ بها للتوافق مع الكود القديم)
 */
function syncStopButtonState(downloadId, text, status, background, disabled = false) {
    updateButtonState(downloadId, status, disabled);
}

export { syncStopButtonState };

export function markDownloadError(downloadId, errorMsg) {
    if (!downloadsTbody) return;
    const row = downloadsTbody.querySelector(`tr[data-download-id="${downloadId}"]`);
    if (!row) {
        return;
    }
    const percentSpan = row.querySelector('.progress-percentage');
    if (percentSpan) percentSpan.textContent = 'فشل';
    
    // تحديث حالة الزر باستخدام الحالة المحلية الموحدة
    updateButtonState(downloadId, 'failed', true);
    
    showToast(`فشل التحميل: ${errorMsg}`, true);
}

export function markDownloadRetrying(downloadId, retryCount, maxRetries) {
    if (!downloadsTbody) return;
    const row = downloadsTbody.querySelector(`tr[data-download-id="${downloadId}"]`);
    if (!row) {
        return;
    }
    const percentSpan = row.querySelector('.progress-percentage');
    if (percentSpan) percentSpan.textContent = `إعادة المحاولة ${retryCount}/${maxRetries}`;
    
    // تحديث حالة الزر باستخدام الحالة المحلية الموحدة
    updateButtonState(downloadId, 'active', true);
    
    showToast(`إعادة محاولة التحميل (${retryCount}/${maxRetries})...`);
}

export function updateTransferStatus(downloadId, status) {
    if (!downloadsTbody) return;
    const row = downloadsTbody.querySelector(`tr[data-download-id="${downloadId}"]`);
    if (!row) return;
    const statusCell = row.querySelector('.transfer-status');
    if (statusCell) {
        statusCell.textContent = status;
    }
}

export function markTransferComplete(downloadId, message) {
    if (!downloadsTbody) return;
    const row = downloadsTbody.querySelector(`tr[data-download-id="${downloadId}"]`);
    if (!row) return;
    const statusCell = row.querySelector('.transfer-status');
    if (statusCell) {
        statusCell.textContent = 'مكتمل';
        statusCell.style.color = '#388E3C';
    }
    const transferBtn = row.querySelector('.btn-transfer-device');
    if (transferBtn) {
        transferBtn.style.display = 'none';
    }
    showToast(message || 'تم نقل الملف للجهاز بنجاح');
}

export function markTransferError(downloadId, error) {
    if (!downloadsTbody) return;
    const row = downloadsTbody.querySelector(`tr[data-download-id="${downloadId}"]`);
    if (!row) return;
    const statusCell = row.querySelector('.transfer-status');
    if (statusCell) {
        statusCell.textContent = 'فشل';
        statusCell.style.color = '#D32F2F';
    }
    const transferBtn = row.querySelector('.btn-transfer-device');
    if (transferBtn) {
        transferBtn.textContent = 'إعادة المحاولة';
        transferBtn.disabled = false;
    }
    showToast(`فشل النقل: ${error}`, true);
}

export function showTransferButton(downloadId) {
    if (!downloadsTbody) return;
    const row = downloadsTbody.querySelector(`tr[data-download-id="${downloadId}"]`);
    if (!row) return;
    const transferBtn = row.querySelector('.btn-transfer-device');
    if (transferBtn) {
        transferBtn.style.display = 'inline-block';
    }
}

/**
 * عرض سجل التحميلات من قاعدة البيانات
 * @param {Array} downloads - قائمة التحميلات من قاعدة البيانات
 */
export async function renderDownloadHistory(downloads) {
    if (!downloads || !Array.isArray(downloads)) {
        console.warn('[downloadManager] Invalid downloads data');
        return;
    }

    // مسح الجدول الحالي
    if (downloadsTbody) {
        downloadsTbody.innerHTML = '';
    }
    if (recentDownloadsTbody) {
        recentDownloadsTbody.innerHTML = '';
    }

    // عرض كل تحميل
    for (const download of downloads) {
        const downloadId = download.id;
        const title = download.title || 'Unknown';
        const url = download.url || '';
        const deviceId = download.device_id || '';
        const formatId = download.format_id || '';
        const status = download.status || 'unknown';

        // تحديد اسم الجهاز
        const deviceName = deviceId ? deviceId : 'الجهاز المحلي';

        // إضافة الصف للجدول (باستخدام append للحفاظ على الترتيب الصحيح)
        const row = addDownloadRow(downloadId, title, deviceName, url, formatId, deviceId, title, true);

        // تحديث الحالة بناءً على البيانات المحفوظة
        if (status === 'completed') {
            markDownloadComplete(downloadId);
            // تحديث الحجم إذا كان متوفراً
            if (download.total_size) {
                const sizeSpan = row.querySelector('.file-size');
                if (sizeSpan) {
                    sizeSpan.textContent = formatBytes(download.total_size);
                }
            }
        } else if (status === 'failed') {
            markDownloadError(downloadId, download.error_message || 'فشل التحميل');
        } else if (status === 'cancelled') {
            markDownloadStopped(downloadId, {
                formatId: formatId,
                deviceId: deviceId,
                title: title
            });
        } else {
            // لأي حالة أخرى (pending, in_progress، أو غير معروف)، عرض كمتوقف
            // للتحميلات غير المكتملة، عرض آخر تقدم محفوظ
            if (download.percent) {
                updateDownloadProgress(
                    downloadId,
                    download.percent,
                    download.speed || '--',
                    download.size || '--',
                    download.total_size || null,
                    download.downloaded_bytes || null
                );
            }
            markDownloadStopped(downloadId, {
                formatId: formatId,
                deviceId: deviceId,
                title: title
            });
        }
    }
}

export async function stopAllDownloads() {
    const rows = downloadsTbody?.querySelectorAll('tr:not(.empty-row)') || [];
    const activeDownloads = [];
    
    rows.forEach(row => {
        const downloadId = row.getAttribute('data-download-id');
        const stopBtn = row.querySelector('.btn-stop-download');
        if (stopBtn && stopBtn.getAttribute('data-status') === 'active') {
            activeDownloads.push(downloadId);
        }
    });
    
    for (const downloadId of activeDownloads) {
        try {
            await stopDownload(downloadId);
        } catch (err) {
            console.error(`Failed to stop download ${downloadId}:`, err);
        }
    }
    
    showToast(`تم إيقاف ${activeDownloads.length} تحميل`);
}

export async function resumeAllDownloads() {
    const rows = downloadsTbody?.querySelectorAll('tr:not(.empty-row)') || [];
    const stoppedDownloads = [];
    
    rows.forEach(row => {
        const downloadId = row.getAttribute('data-download-id');
        const stopBtn = row.querySelector('.btn-stop-download');
        const url = row.getAttribute('data-url');
        const formatId = row.getAttribute('data-format-id');
        const deviceId = row.getAttribute('data-device-id');
        const title = row.getAttribute('data-title');
        
        if (stopBtn && (stopBtn.getAttribute('data-status') === 'stopped' || stopBtn.getAttribute('data-status') === 'failed')) {
            stoppedDownloads.push({ downloadId, url, formatId, deviceId, title });
        }
    });
    
    for (const { downloadId, url, formatId, deviceId, title } of stoppedDownloads) {
        try {
            // تمرير null كـ processId للسماح للباك إند بالبحث عن التحميل المتطابق
            await resumeDownload(null, url, formatId, deviceId, { title });
        } catch (err) {
            console.error(`Failed to resume download ${downloadId}:`, err);
        }
    }
    
    showToast(`تم استئناف ${stoppedDownloads.length} تحميل`);
}

/**
 * دالة للتحقق من المزامنة بين الجدولين (للتطوير فقط)
 */
function verifySync() {
    if (!downloadsTbody || !recentDownloadsTbody) return;
    
    const mainRows = downloadsTbody.querySelectorAll('tr:not(.empty-row)');
    const recentRows = recentDownloadsTbody.querySelectorAll('tr:not(.empty-row)');
    
    const mainIds = new Set();
    const recentIds = new Set();
    
    mainRows.forEach(row => {
        const downloadId = row.getAttribute('data-download-id');
        if (downloadId) mainIds.add(downloadId);
    });
    
    recentRows.forEach(row => {
        const downloadId = row.getAttribute('data-download-id');
        if (downloadId) recentIds.add(downloadId);
    });
    
    // التحقق من أن كل تحميل في القائمة الرئيسية موجود في القائمة المصغرة
    for (const id of mainIds) {
        if (!recentIds.has(id)) {
            console.warn(`[verifySync] Download ${id} exists in main table but not in recent table`);
        }
    }
    
    // التحقق من أن كل تحميل في القائمة المصغرة موجود في القائمة الرئيسية
    for (const id of recentIds) {
        if (!mainIds.has(id)) {
            console.warn(`[verifySync] Download ${id} exists in recent table but not in main table`);
        }
    }
    
    console.log(`[verifySync] Main table: ${mainIds.size} downloads, Recent table: ${recentIds.size} downloads`);
}