// DeviceList.js - مكون عرض الأجهزة مع Diffing ذكي
'use strict';

import devicePresenter from '../presenters/devicePresenter.js';
import store from '../store/appStore.js';

/**
 * DeviceList - مكون عرض الأجهزة
 * يعرض الأجهزة المسجلة والمكتشفة مع تحديثات DOM ذكية
 */
class DeviceList {
    constructor(container, options = {}) {
        this.container = container;
        this.options = options;
        this._elements = new Map();
        this._currentViewModel = null;
        this._unsubscribe = null;

        // ربط الأحداث
        this._eventHandlers = {
            onDeviceClick: options.onDeviceClick || null,
            onStreamClick: options.onStreamClick || null,
            onDeviceSelect: options.onDeviceSelect || null
        };

        // الاشتراك في التغييرات
        this._subscribe();
    }

    _subscribe() {
        this._unsubscribe = devicePresenter.subscribe((viewModel) => {
            this._currentViewModel = viewModel;
            this._render(viewModel);
        });
    }

    _render(viewModel) {
        // عرض حالة التحميل
        if (viewModel.isLoading) {
            this.container.innerHTML = '<div class="placeholder-text">جاري تحميل الأجهزة...</div>';
            return;
        }

        // عرض الأخطاء
        if (viewModel.error) {
            this.container.innerHTML = `<div class="placeholder-text error">${this._escapeHtml(viewModel.error.message || viewModel.error)}</div>`;
            return;
        }

        // عرض الأجهزة المسجلة
        this._renderDeviceGroup(viewModel.registeredDevices, 'registered');

        // عرض الأجهزة المكتشفة
        this._renderDeviceGroup(viewModel.discoveredDevices, 'discovered');
    }

    _renderDeviceGroup(devices, type) {
        // تحديد الحاوية المناسبة
        const container = type === 'registered'
            ? document.getElementById('registered-devices')
            : document.getElementById('discovered-devices');

        if (!container) return;

        // جمع العناصر الموجودة
        const existingElements = new Map();
        container.querySelectorAll('.device-item').forEach(el => {
            const id = el.dataset.deviceId;
            if (id) existingElements.set(id, el);
        });

        const processedIds = new Set();

        // معالجة الأجهزة الجديدة
        devices.forEach(deviceData => {
            const id = deviceData.device.id;
            processedIds.add(id);

            if (existingElements.has(id)) {
                // تحديث عنصر موجود
                const element = existingElements.get(id);
                this._updateElement(element, deviceData);
                existingElements.delete(id);
            } else {
                // إضافة عنصر جديد
                const element = this._createElement(deviceData, type);
                container.appendChild(element);
            }
        });

        // حذف العناصر الزائدة
        existingElements.forEach((element) => {
            element.remove();
        });

        // عرض رسالة "لا توجد أجهزة" إذا كانت القائمة فارغة
        // إزالة العناصر القديمة أولاً
        const oldPlaceholders = container.querySelectorAll('.placeholder-text');
        oldPlaceholders.forEach(p => p.remove());

        if (devices.length === 0) {
            const placeholder = document.createElement('div');
            placeholder.className = 'placeholder-text';
            placeholder.textContent = type === 'registered'
                ? 'لا توجد أجهزة مسجلة'
                : 'لا توجد أجهزة جديدة مكتشفة';
            container.appendChild(placeholder);
        }
    }

    _createElement(deviceData, type) {
        const deviceId = deviceData.device.id;
        const element = document.createElement('div');
        element.className = `device-item ${this._getStatusClass(deviceData)}`;
        element.dataset.deviceId = deviceId;

        if (deviceData.isSelected) {
            element.classList.add('selected');
        }

        // بناء الهيكل الداخلي (نفس القالب القديم)
        element.innerHTML = this._buildTemplate(deviceData);

        // ربط الأحداث
        this._bindEvents(element, deviceData, type);

        return element;
    }

    _updateElement(element, deviceData) {
        // تحديث الفئات
        element.className = `device-item ${this._getStatusClass(deviceData)}`;
        if (deviceData.isSelected) {
            element.classList.add('selected');
        } else {
            element.classList.remove('selected');
        }

        // تحديث النصوص
        const nameEl = element.querySelector('.device-name');
        if (nameEl) {
            nameEl.textContent = deviceData.displayName || deviceData.device.deviceFriendlyName || deviceData.device.model || deviceData.device.id;
        }

        const statusBadge = element.querySelector('.status-badge');
        if (statusBadge) {
            statusBadge.textContent = this._getStatusText(deviceData);
        }

        const detailEl = element.querySelector('.device-detail');
        const model = deviceData.device.model;
        const version = deviceData.device.version;
        const detailsText = model && version && model !== 'Unknown' && version !== 'Unknown' 
            ? `${model} (${version})` 
            : (model !== 'Unknown' ? model : (version !== 'Unknown' ? version : ''));
        
        if (detailEl) {
            if (detailsText) {
                detailEl.textContent = detailsText;
                detailEl.style.display = '';
            } else {
                detailEl.style.display = 'none';
            }
        }
    }

    _buildTemplate(deviceData) {
        const device = deviceData.device;
        const displayName = device.deviceFriendlyName || device.model || device.id;
        const model = (device.model && device.model !== 'Unknown') ? device.model : '';
        const version = (device.version && device.version !== 'Unknown') ? device.version : '';
        const detailsText = model && version ? `${model} (${version})` : (model || version || '');
        const statusText = this._getStatusText(deviceData);

        return `
            <div class="device-circle">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect>
                    <line x1="12" y1="18" x2="12.01" y2="18"></line>
                </svg>
            </div>
            <div class="device-info">
                <h3 class="device-name">${this._escapeHtml(displayName)}</h3>
                ${detailsText ? `<div class="device-detail">${this._escapeHtml(detailsText)}</div>` : '<div class="device-detail" style="display:none"></div>'}
            </div>
            <span class="status-badge">${statusText}</span>
            <button class="stream-btn" data-device-id="${device.id}" title="بدء البث">📺</button>
        `;
    }

    _bindEvents(element, deviceData, type) {
        const deviceId = deviceData.device.id;
        const isConnected = deviceData.runtimeState?.status === 'connected';

        // النقر على الجهاز → فتح المودال
        element.addEventListener('click', (e) => {
            if (e.target.closest('.stream-btn')) return;
            if (this._eventHandlers.onDeviceClick) {
                this._eventHandlers.onDeviceClick(deviceId);
            }
        });

        // زر البث
        const streamBtn = element.querySelector('.stream-btn');
        if (streamBtn) {
            streamBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this._eventHandlers.onStreamClick) {
                    this._eventHandlers.onStreamClick(deviceId);
                }
            });
        }

        // النقر المزدوج للبث المباشر
        element.addEventListener('dblclick', (e) => {
            if (e.target.closest('.stream-btn')) return;
            if (this._eventHandlers.onStreamClick) {
                this._eventHandlers.onStreamClick(deviceId);
            }
        });

        // تحديد الجهاز (للأجهزة المسجلة والمتصلة فقط)
        if (type === 'registered' && isConnected) {
            element.addEventListener('click', (e) => {
                if (e.target.closest('.stream-btn')) return;
                // تبديل التحديد في المخزن
                store.toggleSelection(deviceId);
                if (this._eventHandlers.onDeviceSelect) {
                    const isSelected = store.getState().selectedDeviceIds.has(deviceId);
                    this._eventHandlers.onDeviceSelect(deviceId, isSelected);
                }
            });
        }
    }

    _getStatusClass(deviceData) {
        const status = deviceData.runtimeState?.status || 'offline';
        return status === 'connected' ? 'status-connected' : 'status-offline';
    }

    _getStatusText(deviceData) {
        const status = deviceData.runtimeState?.status || 'offline';
        const map = { connected: 'متصل', offline: 'غير متصل', discovered: 'مكتشف' };
        return map[status] || status;
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

export default DeviceList;
