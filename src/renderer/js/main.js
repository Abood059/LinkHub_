// main.js - نقطة الدخول للتطبيق
import { DOM_IDS } from './core/constants.js';
import { showToast } from './core/utils.js';
import { loadDevices as loadDevicesService, startStream } from './services/deviceService.js';
import { stopDownload } from './services/downloadService.js';
import { setupEventListeners } from './services/eventService.js';
import DeviceList from './ui/DeviceList.js';
import DownloadList from './ui/DownloadList.js';
import devicePresenter from './presenters/devicePresenter.js';
import { initModal, showDeviceModal } from './ui/modalManager.js';
import { initTabs, switchTab } from './ui/tabManager.js';
import { handleStartRoute } from './handlers/startRouteHandler.js';
import { handlePairDevice } from './handlers/pairHandler.js';

let deviceList, downloadList;

const navItems = document.querySelectorAll(DOM_IDS.navItems);
const sections = {
    home: document.getElementById(DOM_IDS.homeSection),
    downloads: document.getElementById(DOM_IDS.downloadsSection),
    settings: document.getElementById(DOM_IDS.settingsSection)
};
const registeredContainer = document.getElementById(DOM_IDS.registeredContainer);
const downloadsTbody = document.getElementById(DOM_IDS.downloadsTbody);
const btnStart = document.getElementById(DOM_IDS.btnStart);
const urlInput = document.getElementById(DOM_IDS.mediaUrl);

initModal(document.getElementById(DOM_IDS.deviceModal), document.querySelector(DOM_IDS.modalClose), document.querySelector(DOM_IDS.modalOverlay), document.getElementById(DOM_IDS.modalDeviceName), document.getElementById(DOM_IDS.modalDeviceModel), document.getElementById(DOM_IDS.modalDeviceVersion), document.getElementById(DOM_IDS.modalDeviceArch), document.getElementById(DOM_IDS.modalDeviceStatus), document.getElementById(DOM_IDS.modalDeviceAdb), document.getElementById(DOM_IDS.modalStreamBtn), document.getElementById(DOM_IDS.modalDisconnectBtn));

if (registeredContainer) deviceList = new DeviceList(registeredContainer, {
    onDeviceClick: (deviceId) => {
        const deviceData = devicePresenter.getDeviceById(deviceId);
        if (deviceData) showDeviceModal(deviceData);
    },
    onStreamClick: async (deviceId) => {
        const deviceData = devicePresenter.getDeviceById(deviceId);
        if (!deviceData || deviceData.runtimeState?.status !== 'connected') {
            showToast('الجهاز غير متصل حالياً، لا يمكن بدء البث.', true);
            return;
        }
        try {
            await startStream(deviceId);
            showToast(`بدأ بث الشاشة للجهاز ${deviceData.device.deviceFriendlyName}`);
        } catch (err) {
            showToast(`فشل بدء البث: ${err.message}`, true);
        }
    }
});

if (downloadsTbody) downloadList = new DownloadList(downloadsTbody, {
    onStopDownload: async (downloadId) => {
        try {
            await stopDownload(downloadId);
            showToast('تم إيقاف التحميل');
        } catch (err) {
            showToast(`فشل إيقاف التحميل: ${err.message}`, true);
        }
    }
});

setupEventListeners({}, {});
initTabs(navItems, sections);
switchTab('home', navItems, sections);

btnStart.addEventListener('click', async () => {
    const url = urlInput.value;
    const success = await handleStartRoute(url, urlInput);
    if (success) urlInput.focus();
});

document.getElementById(DOM_IDS.refreshDevices)?.addEventListener('click', () => loadDevicesService());
document.getElementById(DOM_IDS.pairDevice)?.addEventListener('click', () => handlePairDevice(loadDevicesService));

loadDevicesService();

window.addEventListener('beforeunload', () => {
    if (deviceList) deviceList.destroy();
    if (downloadList) downloadList.destroy();
});