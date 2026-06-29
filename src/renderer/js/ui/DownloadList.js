// DownloadList.js - مكون عرض التحميلات مع Diffing ذكي
'use strict';

import downloadPresenter from '../presenters/downloadPresenter.js';

/**
 * DownloadList - مكون عرض التحميلات
 * يعرض التحميلات في جدول مع تحديثات DOM ذكية
 */
class DownloadList {
    constructor(container, options = {}) {
        this.container = container;
        this.options = options;
        this._elements = new Map();
        this._currentViewModel = null;
        this._unsubscribe = null;

        // ربط الأحداث
        this._eventHandlers = {
            onStopDownload: options.onStopDownload || null
        };

        // الاشتراك في التغييرات
        this._subscribe();
    }

    _subscribe() {
        this._unsubscribe = downloadPresenter.subscribe((viewModel) => {
            this._currentViewModel = viewModel;
            this._render(viewModel);
        });
    }

    _render(viewModel) {
        // عرض حالة التحميل
        if (viewModel.isLoading) {
            this.container.innerHTML = '<tr class="empty-row"><td colspan="6" style="text-align:center;">جاري تحميل التحميلات...</td></tr>';
            return;
        }

        // عرض الأخطاء
        if (viewModel.error) {
            this.container.innerHTML = `<tr class="empty-row"><td colspan="6" style="text-align:center;">خطأ: ${this._escapeHtml(viewModel.error.message || viewModel.error)}</td></tr>`;
            return;
        }

        // عرض جميع التحميلات
        const downloads = viewModel.allDownloads || [];

        // جمع العناصر الموجودة
        const existingElements = new Map();
        this.container.querySelectorAll('tr[data-download-id]').forEach(el => {
            const id = el.dataset.downloadId;
            if (id) existingElements.set(id, el);
        });

        const processedIds = new Set();

        // معالجة التحميلات
        downloads.forEach(downloadData => {
            const id = downloadData.downloadId;
            processedIds.add(id);

            if (existingElements.has(id)) {
                // تحديث عنصر موجود
                const element = existingElements.get(id);
                this._updateElement(element, downloadData);
                existingElements.delete(id);
            } else {
                // إضافة عنصر جديد
                const element = this._createElement(downloadData);
                this.container.appendChild(element);
            }
        });

        // حذف العناصر الزائدة
        existingElements.forEach((element) => {
            element.remove();
        });

        // عرض رسالة "لا توجد تحميلات" إذا كانت القائمة فارغة
        const oldEmptyRow = this.container.querySelector('.empty-row');
        if (oldEmptyRow) oldEmptyRow.remove();

        if (downloads.length === 0) {
            const emptyRow = document.createElement('tr');
            emptyRow.className = 'empty-row';
            emptyRow.innerHTML = '<td colspan="6" style="text-align:center;">لا توجد تحميلات نشطة</td>';
            this.container.appendChild(emptyRow);
        }
    }

    _createElement(downloadData) {
        const downloadId = downloadData.downloadId;
        const fileName = downloadData.fileName || 'Unknown';
        const targetDeviceName = downloadData.targetDeviceName || 'Unknown';
        const url = downloadData.url || '';

        const row = document.createElement('tr');
        row.setAttribute('data-download-id', downloadId);
        row.setAttribute('data-url', url);
        row.innerHTML = `
            <td class="file-name">${this._escapeHtml(fileName)}</td>
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
            <td><span class="device-tag">${this._escapeHtml(targetDeviceName)}</span></td>
            <td>
                <button class="btn-stop-download" data-download-id="${this._escapeHtml(downloadId)}" style="background: #D32F2F; border: none; color: white; padding: 4px 12px; border-radius: 20px; cursor: pointer; font-size: 0.7rem;">إيقاف</button>
            </td>
        `;

        // ربط الأحداث
        this._bindEvents(row, downloadData);

        return row;
    }

    _updateElement(element, downloadData) {
        const percent = downloadData.percent || 0;
        const speed = downloadData.speed || '--';
        const size = downloadData.size || '--';
        const status = downloadData.status || 'downloading';

        // تحديث شريط التقدم
        this._updateProgressBar(element, percent);

        // تحديث النصوص
        const speedSpan = element.querySelector('.download-speed');
        if (speedSpan) {
            speedSpan.textContent = speed;
        }

        const sizeSpan = element.querySelector('.file-size');
        if (sizeSpan) {
            sizeSpan.textContent = size;
        }

        // تحديث حالة الزر
        this._updateButtonState(element, status);
    }

    _updateProgressBar(element, percent) {
        const fill = element.querySelector('.progress-fill');
        const percentSpan = element.querySelector('.progress-percentage');

        if (fill) {
            fill.style.width = `${percent}%`;
            const hue = 210 - (percent / 100) * 90;
            fill.style.backgroundColor = `hsl(${hue}, 70%, 55%)`;
        }

        if (percentSpan) {
            percentSpan.textContent = `${percent}%`;
        }
    }

    _updateButtonState(element, status) {
        const stopBtn = element.querySelector('.btn-stop-download');
        if (!stopBtn) return;

        switch (status) {
            case 'completed':
                stopBtn.textContent = 'مكتمل';
                stopBtn.disabled = true;
                stopBtn.style.background = '#388E3C';
                break;
            case 'failed':
                stopBtn.textContent = 'فشل';
                stopBtn.disabled = true;
                stopBtn.style.background = '#D32F2F';
                break;
            case 'stopped':
                stopBtn.textContent = 'تم الإيقاف';
                stopBtn.disabled = true;
                stopBtn.style.background = '#666';
                break;
            default:
                stopBtn.textContent = 'إيقاف';
                stopBtn.disabled = false;
                stopBtn.style.background = '#D32F2F';
        }
    }

    _bindEvents(element, downloadData) {
        const downloadId = downloadData.downloadId;
        const fileName = downloadData.fileName || 'Unknown';

        const stopBtn = element.querySelector('.btn-stop-download');
        if (stopBtn) {
            stopBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (this._eventHandlers.onStopDownload) {
                    if (confirm('هل تريد إيقاف هذا التحميل؟')) {
                        await this._eventHandlers.onStopDownload(downloadId);
                    }
                }
            });
        }
    }

    _escapeHtml(str) {
        if (!str) return '';
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return str.replace(/[&<>"']/g, m => map[m]);
    }

    destroy() {
        if (this._unsubscribe) {
            this._unsubscribe();
            this._unsubscribe = null;
        }
        this.container.innerHTML = '';
        this._elements.clear();
        this._currentViewModel = null;
    }
}

export default DownloadList;
