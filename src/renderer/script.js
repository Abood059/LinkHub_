// LinkFlow - جاهز للتكامل مع Electron IPC
// لا يحتوي على بيانات وهمية، فقط هيكل للربط

document.addEventListener('DOMContentLoaded', () => {
    // ------------------- تبديل الأقسام -------------------
    const navItems = document.querySelectorAll('.nav-item');
    const sections = {
        home: document.getElementById('home-section'),
        downloads: document.getElementById('downloads-section'),
        settings: document.getElementById('settings-section')
    };

    function switchTab(tabId) {
        Object.values(sections).forEach(section => section?.classList.remove('active-section'));
        if (sections[tabId]) sections[tabId].classList.add('active-section');
        navItems.forEach(item => {
            const itemTab = item.getAttribute('data-tab');
            if (itemTab === tabId) item.classList.add('active');
            else item.classList.remove('active');
        });
    }

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            switchTab(item.getAttribute('data-tab'));
        });
    });
    switchTab('home');

    // ------------------- إدارة الأجهزة (حقيقية) -------------------
    let devices = [];        // قائمة الأجهزة المسجلة (من device:list)
    let selectedDeviceIds = new Set();   // تخزين معرفات الأجهزة المحددة (لتوجيه التحميل)

    const registeredContainer = document.getElementById('registered-devices');
    const discoveredContainer = document.getElementById('discovered-devices');

    // دالة لعرض الأجهزة (تقوم بتحديث الواجهة)
    function renderDevices(registeredDevices, discoveredDevices) {
        // عرض الأجهزة المسجلة (المتصلة)
        if (registeredContainer) {
            if (!registeredDevices || registeredDevices.length === 0) {
                registeredContainer.innerHTML = '<div class="placeholder-text">لا توجد أجهزة متصلة</div>';
            } else {
                registeredContainer.innerHTML = '';
                registeredDevices.forEach(device => {
                    const deviceElement = createDeviceElement(device, true);
                    registeredContainer.appendChild(deviceElement);
                });
            }
        }

        // عرض الأجهزة المكتشفة (غير المسجلة)
        if (discoveredContainer) {
            if (!discoveredDevices || discoveredDevices.length === 0) {
                discoveredContainer.innerHTML = '<div class="placeholder-text">لا توجد أجهزة مكتشفة</div>';
            } else {
                discoveredContainer.innerHTML = '';
                discoveredDevices.forEach(device => {
                    const deviceElement = createDeviceElement(device, false);
                    discoveredContainer.appendChild(deviceElement);
                });
            }
        }
    }

    // إنشاء عنصر جهاز (UI) مع دعم التحديد المتعدد
    function createDeviceElement(device, isRegistered) {
        const div = document.createElement('div');
        div.className = `device-item ${device.status === 'connected' ? 'status-connected' : 'status-offline'}`;
        div.setAttribute('data-device-id', device.id);
        div.setAttribute('data-device-name', device.deviceFriendlyName || device.model || device.id);

        // إذا كان الجهاز مسجلاً ومحدداً، أضف class selected
        if (isRegistered && selectedDeviceIds.has(device.id)) {
            div.classList.add('selected');
        }

        div.innerHTML = `
            <div class="device-circle">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect>
                    <line x1="12" y1="18" x2="12.01" y2="18"></line>
                </svg>
            </div>
            <h3 class="device-name">${escapeHtml(device.deviceFriendlyName || device.model || device.id)}</h3>
            <span class="status-badge">${device.status === 'connected' ? 'متصل' : (device.status === 'available' ? 'متاح' : 'غير متصل')}</span>
        `;

        // إذا كان الجهاز مسجلاً (متصل أو متاح)، نمكن التحديد
        if (isRegistered && (device.status === 'connected' || device.status === 'available')) {
            div.addEventListener('click', (e) => {
                e.stopPropagation();
                if (selectedDeviceIds.has(device.id)) {
                    selectedDeviceIds.delete(device.id);
                    div.classList.remove('selected');
                } else {
                    selectedDeviceIds.add(device.id);
                    div.classList.add('selected');
                }
                console.log('الأجهزة المحددة:', Array.from(selectedDeviceIds));
            });
        } else {
            // الأجهزة غير المسجلة (مكتشفة) – نضيف اقتران عند النقر
            div.addEventListener('click', async () => {
                // TODO: استدعاء عملية الاقتران أو الاتصال عبر IPC
                // سيكون لاحقاً: window.electronAPI.pairDevice(...) أو connectDevice
                alert(`جهاز "${device.deviceFriendlyName}" غير مسجل. سيتم تنفيذ إجراء الاقتران/الاتصال لاحقاً.`);
            });
        }

        return div;
    }

    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/[&<>]/g, function(m) {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            return m;
        });
    }

    // ------------------- تحميل الأجهزة من الخلفية (IPC) -------------------
    async function loadDevices() {
        // TODO: بعد ربط IPC، استخدم window.electronAPI.getAllDevices()
        // return await window.electronAPI.getAllDevices();
        // حالياً نعيد بيانات وهمية فارغة لتجنب الأخطاء
        console.log('سيتم استدعاء device:list لاحقاً');
        return { registered: [], discovered: [] };
    }

    // تحديث واجهة الأجهزة
    async function refreshDevicesUI() {
        try {
            const { registered, discovered } = await loadDevices();
            devices = registered; // تخزين للأجهزة المسجلة
            renderDevices(registered, discovered);
        } catch (err) {
            console.error('فشل تحميل الأجهزة:', err);
            if (registeredContainer) registeredContainer.innerHTML = '<div class="placeholder-text">خطأ في تحميل الأجهزة</div>';
        }
    }

    // ------------------- إدارة التحميلات -------------------
    const downloadsTbody = document.getElementById('downloads-tbody');
    const btnStart = document.getElementById('btn-start-route');
    const urlInput = document.getElementById('media-url');

    // إضافة صف تحميل جديد (يتم استدعاؤه عند بدء التحميل)
    function addDownloadRow(fileName, targetDeviceId, targetDeviceName) {
        // TODO: سيتم استدعاؤها من خلال IPC على progress و completion
        const row = document.createElement('tr');
        row.setAttribute('data-download-id', `dl-${Date.now()}-${targetDeviceId}`);
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
        `;
        // إزالة رسالة "لا توجد تحميلات"
        const emptyRow = downloadsTbody.querySelector('.empty-row');
        if (emptyRow) emptyRow.remove();
        downloadsTbody.prepend(row);
        return row;
    }

    // تحديث تقدم التحميل (يتم استدعاؤها من مستمع IPC)
    function updateDownloadProgress(rowId, percent, speed, size) {
        const row = downloadsTbody.querySelector(`tr[data-download-id="${rowId}"]`);
        if (!row) return;
        const fill = row.querySelector('.progress-fill');
        const percentSpan = row.querySelector('.progress-percentage');
        const speedSpan = row.querySelector('.download-speed');
        const sizeSpan = row.querySelector('.file-size');
        if (fill) fill.style.width = `${percent}%`;
        if (percentSpan) percentSpan.textContent = `${percent}%`;
        if (speedSpan) speedSpan.textContent = speed;
        if (sizeSpan && size) sizeSpan.textContent = size;
        // تغيير لون شريط التقدم
        if (fill) {
            const hue = 210 - (percent / 100) * 90;
            fill.style.backgroundColor = `hsl(${hue}, 70%, 55%)`;
        }
    }

    // إكمال التحميل
    function markDownloadComplete(rowId) {
        const row = downloadsTbody.querySelector(`tr[data-download-id="${rowId}"]`);
        if (!row) return;
        const fill = row.querySelector('.progress-fill');
        const percentSpan = row.querySelector('.progress-percentage');
        const speedSpan = row.querySelector('.download-speed');
        if (fill) fill.style.width = '100%';
        if (percentSpan) percentSpan.textContent = '100%';
        if (speedSpan) speedSpan.textContent = '0 MB/s';
        if (fill) fill.style.backgroundColor = 'hsl(120, 70%, 55%)';
    }

    // بدء التحميل للأجهزة المحددة
    async function startDownloadForSelectedDevices(url, fileName) {
        if (selectedDeviceIds.size === 0) {
            alert('الرجاء تحديد جهاز واحد أو أكثر أولاً من قسم الأجهزة المتصلة.');
            return false;
        }
        // TODO: استدعاء download:start لكل جهاز محدد
        for (let deviceId of selectedDeviceIds) {
            const device = devices.find(d => d.id === deviceId);
            if (!device) continue;
            const deviceName = device.deviceFriendlyName || device.model || deviceId;
            const row = addDownloadRow(fileName, deviceId, deviceName);
            // هنا سيتم ربط IPC لبدء التحميل وتحديث التقدم
            console.log(`بدء التحميل للجهاز ${deviceName} (${deviceId})`, row);
            // مؤقتاً نضيف محاكاة صغيرة لعرض التقدم لاحقاً
        }
        return true;
    }

    // معالج زر التوجيه
    btnStart.addEventListener('click', async () => {
        let url = urlInput.value.trim();
        if (!url) {
            alert('الرجاء إدخال رابط الوسائط');
            return;
        }
        let fileName = 'media_' + Date.now();
        try {
            const urlObj = new URL(url);
            const lastSegment = urlObj.pathname.split('/').pop();
            if (lastSegment && lastSegment.includes('.')) fileName = lastSegment;
        } catch(e) {}
        const success = await startDownloadForSelectedDevices(url, fileName);
        if (success) urlInput.value = '';
        urlInput.focus();
    });

    // ------------------- الإعدادات -------------------
    const refreshBtn = document.getElementById('refresh-devices');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            refreshDevicesUI();
        });
    }

    // ------------------- استقبال التحديثات من الخلفية (IPC Events) -------------------
    // TODO: ربط الأحداث القادمة من window.electronAPI
    // مثال:
    // window.electronAPI.onUpdateList(({ registered, discovered }) => {
    //     devices = registered;
    //     renderDevices(registered, discovered);
    // });
    // window.electronAPI.onProgress((data) => { updateDownloadProgress(data.id, data.progress, data.speed, data.size); });
    // window.electronAPI.onFinished((data) => { markDownloadComplete(data.id); });

    // تحميل أولي للأجهزة
    refreshDevicesUI();
});
