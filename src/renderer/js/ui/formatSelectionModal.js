/**
 * formatSelectionModal.js - واجهة اختيار الجودة والجهاز
 */

let formatSelectedCallback = null;
let selectedVideoFormatId = null;
let selectedAudioFormatId = null;
let selectedDeviceId = null;
let startButtonElement = null;

/**
 * عرض نافذة اختيار الجودة والجهاز
 */
export function showFormatSelectionModal(inspectionData, devices) {
    const modal = document.getElementById('format-selection-modal');
    const videoFormatsTbody = document.getElementById('video-formats-tbody');
    const audioFormatsTbody = document.getElementById('audio-formats-tbody');
    const devicesTbody = document.getElementById('devices-tbody');

    // إعادة تعيين الاختيارات
    selectedVideoFormatId = null;
    selectedAudioFormatId = null;
    selectedDeviceId = null;

    // عرض جودات الفيديو
    videoFormatsTbody.innerHTML = '';
    if (inspectionData.formats && inspectionData.formats.length > 0) {
        const videoFormats = inspectionData.formats.filter(format => format.vcodec && format.vcodec !== 'none');
        
        if (videoFormats.length > 0) {
            videoFormats.forEach((format, index) => {
                const row = document.createElement('tr');
                row.dataset.formatId = format.formatId || index;
                
                const resolution = format.resolution || format.formatNote || '-';
                const bitrate = format.bitrate ? `${Math.round(format.bitrate / 1000)} kbps` : '-';
                const filesize = format.filesize ? formatBytes(format.filesize) : '-';
                const formatId = format.formatId || index;

                row.innerHTML = `
                    <td><input type="radio" name="video-format" class="video-format-radio" value="${formatId}"></td>
                    <td>${resolution}</td>
                    <td>${bitrate}</td>
                    <td>${filesize}</td>
                    <td>${formatId}</td>
                `;

                row.addEventListener('click', (e) => {
                    if (e.target.type !== 'radio') {
                        const radio = row.querySelector('.video-format-radio');
                        radio.checked = true;
                    }
                    selectVideoFormat(formatId);
                });

                videoFormatsTbody.appendChild(row);
            });
        } else {
            videoFormatsTbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">لا توجد جودات فيديو متاحة</td></tr>';
        }
    } else {
        videoFormatsTbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">لا توجد جودات متاحة</td></tr>';
    }

    // عرض جودات الصوت
    audioFormatsTbody.innerHTML = '';
    if (inspectionData.formats && inspectionData.formats.length > 0) {
        const audioFormats = inspectionData.formats.filter(format => format.acodec && format.acodec !== 'none' && (!format.vcodec || format.vcodec === 'none'));
        
        if (audioFormats.length > 0) {
            audioFormats.forEach((format, index) => {
                const row = document.createElement('tr');
                row.dataset.formatId = format.formatId || index;
                
                const bitrate = format.bitrate ? `${Math.round(format.bitrate / 1000)} kbps` : '-';
                const filesize = format.filesize ? formatBytes(format.filesize) : '-';
                const formatId = format.formatId || index;
                const abr = format.abr ? `${format.abr} kbps` : bitrate;

                row.innerHTML = `
                    <td><input type="radio" name="audio-format" class="audio-format-radio" value="${formatId}"></td>
                    <td>${abr}</td>
                    <td>${filesize}</td>
                    <td>${formatId}</td>
                `;

                row.addEventListener('click', (e) => {
                    if (e.target.type !== 'radio') {
                        const radio = row.querySelector('.audio-format-radio');
                        radio.checked = true;
                    }
                    selectAudioFormat(formatId);
                });

                audioFormatsTbody.appendChild(row);
            });
        } else {
            audioFormatsTbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">لا توجد جودات صوت متاحة</td></tr>';
        }
    } else {
        audioFormatsTbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">لا توجد جودات متاحة</td></tr>';
    }

    // عرض الأجهزة
    devicesTbody.innerHTML = '';
    if (devices && devices.length > 0) {
        devices.forEach(device => {
            const row = document.createElement('tr');
            row.dataset.deviceId = device.id;

            const statusBadge = device.connected 
                ? '<span class="status-badge-modal connected">متصل</span>'
                : '<span class="status-badge-modal offline">غير متصل</span>';

            row.innerHTML = `
                <td>${device.name}</td>
                <td>${statusBadge}</td>
                <td><input type="radio" name="device" class="device-radio" value="${device.id}" ${!device.connected ? 'disabled' : ''}></td>
            `;

            row.addEventListener('click', (e) => {
                if (e.target.type !== 'radio' && device.connected) {
                    const radio = row.querySelector('.device-radio');
                    radio.checked = true;
                    selectDevice(device.id);
                }
            });

            devicesTbody.appendChild(row);
        });
    } else {
        devicesTbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">لا توجد أجهزة متصلة</td></tr>';
    }

    // إظهار النافذة
    modal.style.display = 'flex';
}

/**
 * إخفاء نافذة اختيار الجودة والجهاز
 */
export function hideFormatSelectionModal() {
    const modal = document.getElementById('format-selection-modal');
    modal.style.display = 'none';
    formatSelectedCallback = null;
}

/**
 * تسجيل callback عند اختيار الجودة والجهاز
 */
export function onFormatSelected(callback) {
    formatSelectedCallback = callback;
}

/**
 * اختيار جودة الفيديو
 */
function selectVideoFormat(formatId) {
    selectedVideoFormatId = formatId;
    
    // تحديث الواجهة
    document.querySelectorAll('#video-formats-tbody tr').forEach(row => {
        row.classList.remove('selected');
        if (row.dataset.formatId === String(formatId)) {
            row.classList.add('selected');
        }
    });
}

/**
 * اختيار جودة الصوت
 */
function selectAudioFormat(formatId) {
    selectedAudioFormatId = formatId;
    
    // تحديث الواجهة
    document.querySelectorAll('#audio-formats-tbody tr').forEach(row => {
        row.classList.remove('selected');
        if (row.dataset.formatId === String(formatId)) {
            row.classList.add('selected');
        }
    });
}

/**
 * اختيار جهاز
 */
function selectDevice(deviceId) {
    selectedDeviceId = deviceId;
}

/**
 * تحويل حجم الملف إلى صيغة مقروءة
 */
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * تهيئة مستمعي الأحداث
 */
export function initFormatSelectionModal() {
    const closeBtn = document.getElementById('format-modal-close');
    const cancelBtn = document.getElementById('format-cancel-btn');
    const startBtn = document.getElementById('format-start-btn');

    startButtonElement = startBtn;

    closeBtn.addEventListener('click', hideFormatSelectionModal);
    cancelBtn.addEventListener('click', hideFormatSelectionModal);

    startBtn.addEventListener('click', () => {
        if (!selectedVideoFormatId && !selectedAudioFormatId) {
            alert('يرجى اختيار جودة التحميل (فيديو أو صوت)');
            return;
        }

        // تغيير حالة الزر إلى "جاري بدأ التحميل" وتعطيله
        startBtn.textContent = 'جاري بدأ التحميل';
        startBtn.disabled = true;
        startBtn.style.opacity = '0.6';
        startBtn.style.cursor = 'not-allowed';

        if (formatSelectedCallback) {
            formatSelectedCallback({
                videoFormatId: selectedVideoFormatId || null,
                audioFormatId: selectedAudioFormatId || null,
                deviceId: selectedDeviceId || null
            });
        }
        hideFormatSelectionModal();
    });

    // إغلاق عند النقر على الخلفية
    const overlay = document.querySelector('#format-selection-modal .modal-overlay');
    overlay.addEventListener('click', hideFormatSelectionModal);
}

/**
 * استعادة حالة زر بدأ التحميل
 */
export function resetStartButtonState() {
    if (startButtonElement) {
        startButtonElement.textContent = 'بدء التحميل';
        startButtonElement.disabled = false;
        startButtonElement.style.opacity = '1';
        startButtonElement.style.cursor = 'pointer';
    }
}
