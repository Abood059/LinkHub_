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