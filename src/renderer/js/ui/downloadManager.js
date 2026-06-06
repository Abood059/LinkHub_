// downloadManager.js - إدارة جدول التحميلات
import { escapeHtml } from '../core/utils.js';
import { showToast } from '../core/utils.js';
import { stopDownload } from '../services/downloadService.js';

let downloadsTbody = null;

export function initDownloadTable(tbodyElement) {
    downloadsTbody = tbodyElement;
}

export function addDownloadRow(downloadId, fileName, targetDeviceName, url) {
    if (!downloadsTbody) return;
    const row = document.createElement('tr');
    row.setAttribute('data-download-id', downloadId);
    row.setAttribute('data-url', url);
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
        <td>
            <button class="btn-stop-download" data-url="${escapeHtml(url)}" style="background: #D32F2F; border: none; color: white; padding: 4px 12px; border-radius: 20px; cursor: pointer; font-size: 0.7rem;">إيقاف</button>
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
            if (targetUrl && confirm('هل تريد إيقاف هذا التحميل؟')) {
                try {
                    await stopDownload(targetUrl);
                    showToast(`تم إيقاف التحميل: ${fileName}`);
                    stopBtn.textContent = 'تم الإيقاف';
                    stopBtn.disabled = true;
                    stopBtn.style.background = '#666';
                } catch (err) {
                    showToast(`فشل إيقاف التحميل: ${err.message}`, true);
                }
            }
        });
    }
    return row;
}

export function updateDownloadProgress(downloadId, percent, speed, size) {
    if (!downloadsTbody) return;
    const row = downloadsTbody.querySelector(`tr[data-download-id="${downloadId}"]`);
    if (!row) return;
    const fill = row.querySelector('.progress-fill');
    const percentSpan = row.querySelector('.progress-percentage');
    const speedSpan = row.querySelector('.download-speed');
    const sizeSpan = row.querySelector('.file-size');
    if (fill) fill.style.width = `${percent}%`;
    if (percentSpan) percentSpan.textContent = `${percent}%`;
    if (speedSpan && speed) speedSpan.textContent = speed;
    if (sizeSpan && size) sizeSpan.textContent = size;
    if (fill) {
        const hue = 210 - (percent / 100) * 90;
        fill.style.backgroundColor = `hsl(${hue}, 70%, 55%)`;
    }
}

export function markDownloadComplete(downloadId) {
    if (!downloadsTbody) return;
    const row = downloadsTbody.querySelector(`tr[data-download-id="${downloadId}"]`);
    if (!row) return;
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
    if (!row) return;
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