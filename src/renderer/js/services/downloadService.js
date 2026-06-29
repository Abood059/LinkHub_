// downloadService.js - عمليات التحميل
export async function inspectUrl(url) {
    return await linkhub.downloads.inspect(url);
}

export async function startDownload(url, formatId, deviceId) {
    return await linkhub.downloads.start(url, formatId, deviceId, {});
}

export async function stopDownload(processId) {
    return await linkhub.downloads.stop(processId);
}