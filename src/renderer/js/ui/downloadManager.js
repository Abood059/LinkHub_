// downloadManager.js - إدارة جدول التحميلات
import { escapeHtml } from '../core/utils.js';
import { showToast } from '../core/utils.js';
import { stopDownload, resumeDownload } from '../services/downloadService.js';

let downloadsTbody = null;
let recentDownloadsTbody = null;
const MAX_RECENT_DOWNLOADS = 4;

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

export function addDownloadRow(downloadId, fileName, targetDeviceName, url, formatId = null, deviceId = null, title = null) {
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
        </td>
    `;
    const emptyRow = downloadsTbody.querySelector('.empty-row');
    if (emptyRow) emptyRow.remove();
    downloadsTbody.prepend(row);

    const stopBtn = row.querySelector('.btn-stop-download');
    if (stopBtn) {
        stopBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const targetUrl = stopBtn.getAttribute('data-url');
            const targetDownloadId = stopBtn.getAttribute('data-download-id');
            const currentStatus = stopBtn.getAttribute('data-status');
            const targetFormatId = row.getAttribute('data-format-id');
            const targetDeviceId = row.getAttribute('data-device-id');
            const targetTitle = row.getAttribute('data-title');
            
            if (currentStatus === 'active') {
                if (targetUrl && confirm('هل تريد إيقاف هذا التحميل؟')) {
                    try {
                        await stopDownload(targetDownloadId);
                        showToast(`تم إيقاف التحميل: ${fileName}`);
                        stopBtn.textContent = 'استئناف';
                        stopBtn.setAttribute('data-status', 'stopped');
                        stopBtn.style.background = '#388E3C';
                    } catch (err) {
                        showToast(`فشل إيقاف التحميل: ${err.message}`, true);
                    }
                }
            } else if (currentStatus === 'stopped') {
                // استئناف التحميل
                if (targetUrl && targetFormatId) {
                    try {
                        stopBtn.textContent = 'جاري الاستئناف...';
                        stopBtn.disabled = true;
                        await resumeDownload(targetDownloadId, targetUrl, targetFormatId, targetDeviceId, { title: targetTitle });
                        showToast(`جاري استئناف التحميل: ${fileName}`);
                        stopBtn.textContent = 'إيقاف';
                        stopBtn.setAttribute('data-status', 'active');
                        stopBtn.style.background = '#D32F2F';
                        stopBtn.disabled = false;
                    } catch (err) {
                        showToast(`فشل استئناف التحميل: ${err.message}`, true);
                        stopBtn.textContent = 'استئناف';
                        stopBtn.disabled = false;
                    }
                } else {
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
            const targetUrl = stopBtn.getAttribute('data-url');
            const targetDownloadId = stopBtn.getAttribute('data-download-id');
            const currentStatus = stopBtn.getAttribute('data-status');
            const targetFormatId = row.getAttribute('data-format-id');
            const targetDeviceId = row.getAttribute('data-device-id');
            const targetTitle = row.getAttribute('data-title');
            
            if (currentStatus === 'active') {
                if (targetUrl && confirm('هل تريد إيقاف هذا التحميل؟')) {
                    try {
                        await stopDownload(targetDownloadId);
                        showToast(`تم إيقاف التحميل: ${fileName}`);
                        stopBtn.textContent = 'استئناف';
                        stopBtn.setAttribute('data-status', 'stopped');
                        stopBtn.style.background = '#388E3C';
                    } catch (err) {
                        showToast(`فشل إيقاف التحميل: ${err.message}`, true);
                    }
                }
            } else if (currentStatus === 'stopped') {
                // استئناف التحميل
                if (targetUrl && targetFormatId) {
                    try {
                        stopBtn.textContent = 'جاري الاستئناف...';
                        stopBtn.disabled = true;
                        await resumeDownload(targetDownloadId, targetUrl, targetFormatId, targetDeviceId, { title: targetTitle });
                        showToast(`جاري استئناف التحميل: ${fileName}`);
                        stopBtn.textContent = 'إيقاف';
                        stopBtn.setAttribute('data-status', 'active');
                        stopBtn.style.background = '#D32F2F';
                        stopBtn.disabled = false;
                    } catch (err) {
                        showToast(`فشل استئناف التحميل: ${err.message}`, true);
                        stopBtn.textContent = 'استئناف';
                        stopBtn.disabled = false;
                    }
                } else {
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
    const stopBtn = row.querySelector('.btn-stop-download');
    if (stopBtn) {
        stopBtn.textContent = 'مكتمل';
        stopBtn.disabled = true;
        stopBtn.style.background = '#388E3C';
    }
}

export function markDownloadError(downloadId, errorMsg) {
    if (!downloadsTbody) return;
    const row = downloadsTbody.querySelector(`tr[data-download-id="${downloadId}"]`);
    if (!row) {
        return;
    }
    const percentSpan = row.querySelector('.progress-percentage');
    if (percentSpan) percentSpan.textContent = 'فشل';
    const stopBtn = row.querySelector('.btn-stop-download');
    if (stopBtn) {
        stopBtn.textContent = 'فشل';
        stopBtn.disabled = true;
        stopBtn.style.background = '#D32F2F';
    }
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
    const stopBtn = row.querySelector('.btn-stop-download');
    if (stopBtn) {
        stopBtn.textContent = 'جاري إعادة المحاولة...';
        stopBtn.disabled = true;
        stopBtn.style.background = '#FF9800';
    }
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