// downloadService.js - عمليات التحميل
export async function inspectUrl(url) {
    return await linkhub.downloads.inspect(url);
}

export async function startDownload(url, formatId, deviceId, options = {}) {
    return await linkhub.downloads.start(url, formatId, deviceId, options);
}

export async function stopDownload(processId) {
    return await linkhub.downloads.stop(processId);
}

export async function resumeDownload(processId, url, formatId, deviceId, options = {}) {
    return await linkhub.downloads.resume(processId, url, formatId, deviceId, options);
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