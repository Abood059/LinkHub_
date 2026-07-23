// downloadService.js - عمليات التحميل
export async function inspectUrl(url) {
    console.log('[downloadService] === استدعاء inspectUrl ===');
    console.log('[downloadService] url:', url);
    const result = await linkhub.downloads.inspect(url);
    console.log('[downloadService] نتيجة inspectUrl:', result);
    return result;
}

export async function startDownload(url, formatId, deviceId, options = {}) {
    console.log('[downloadService] === استدعاء startDownload ===');
    console.log('[downloadService] url:', url);
    console.log('[downloadService] formatId:', formatId);
    console.log('[downloadService] deviceId:', deviceId);
    console.log('[downloadService] options:', options);
    const result = await linkhub.downloads.start(url, formatId, deviceId, options);
    console.log('[downloadService] نتيجة startDownload:', result);
    return result;
}

export async function stopDownload(processId) {
    console.log('[downloadService] === استدعاء stopDownload ===');
    console.log('[downloadService] processId:', processId);
    const result = await linkhub.downloads.stop(processId);
    console.log('[downloadService] نتيجة stopDownload:', result);
    return result;
}

export async function resumeDownload(processId, url, formatId, deviceId, options = {}) {
    console.log('[downloadService] === استدعاء resumeDownload ===');
    console.log('[downloadService] processId:', processId);
    console.log('[downloadService] url:', url);
    console.log('[downloadService] formatId:', formatId);
    console.log('[downloadService] deviceId:', deviceId);
    console.log('[downloadService] options:', options);
    const result = await linkhub.downloads.resume(processId, url, formatId, deviceId, options);
    console.log('[downloadService] نتيجة resumeDownload:', result);
    return result;
}

export async function deleteDownload(downloadId) {
    return await linkhub.downloads.delete(downloadId);
}

export async function deleteAllDownloads() {
    return await linkhub.downloads.deleteAll();
}

export async function deleteDownloadsBeforeDate(date) {
    return await linkhub.downloads.deleteBeforeDate(date);
}

export async function getDownloadHistory() {
    return await linkhub.downloads.getHistory();
}

export async function loadDownloadHistory() {
    try {
        const history = await getDownloadHistory();
        return history;
    } catch (error) {
        console.error('[downloadService] Failed to load download history:', error);
        throw error;
    }
}