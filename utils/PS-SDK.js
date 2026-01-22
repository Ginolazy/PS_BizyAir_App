const { app, action, core, imaging } = require('photoshop');
const { batchPlay } = action;
const fs = require('uxp').storage.localFileSystem;
const formats = require('uxp').storage.formats;
const executeAsModal = core.executeAsModal;

/**
 * [SDK INTERNAL] PNG Encoder Link
 * 统一引用同级目录下的 PNG-SDK.js
 */
const PngEncoder = require('./utils/PNG-SDK.js');

let isProcessing = false;

// ============================================================================
// HELPERS
// ============================================================================

const val = (v) => {
    if (v === null || v === undefined) return 0;
    if (typeof v === 'object') {
        if (v.value !== undefined) return v.value;
        if (v._value !== undefined) return v._value;
        if (Object.keys(v).length === 1) {
            const firstKey = Object.keys(v)[0];
            return val(v[firstKey]);
        }
    }
    return v;
};

async function getSelectionInfo() {
    try {
        const result = await action.batchPlay([{
            _obj: "get",
            _target: [{ _ref: "property", _property: "selection" }, { _ref: "document", _enum: "ordinal", _value: "targetEnum" }],
            _options: { dialogOptions: "dontDisplay" }
        }], { synchronousExecution: true });
        if (result && result[0] && result[0].selection) return result[0].selection;
        return null;
    } catch (e) { return null; }
}

async function saveBufferToTemp(buffer, nodeId, suffix, appId) {
    if (!buffer || buffer.byteLength === 0) return null;
    try {
        const cleanAppId = appId ? String(appId).replace(/[^a-zA-Z0-9_-]/g, '_') : '';
        let cleanNodeId = nodeId ? String(nodeId).replace(/[^a-zA-Z0-9_-]/g, '_').replace(/(_image|_mask_preview|_mask|_rgba)$/g, "") : '';
        if (!cleanNodeId) cleanNodeId = suffix || 'file';
        let fileName = cleanAppId ? `${cleanAppId}_${cleanNodeId}_${suffix}.png` : `${cleanNodeId}_${suffix}.png`;
        const tempFolder = await fs.getTemporaryFolder();
        const file = await tempFolder.createFile(fileName, { overwrite: true });
        await file.write(buffer, { format: formats.binary });
        return file.nativePath;
    } catch (e) { return null; }
}

// ============================================================================
// CORE: IMAGE ACQUISITION (成熟母版版 + DataView 补丁)
// ============================================================================

async function getActiveDocumentImage(options = {}) {
    const { baseMode = 'canvas', nodeId, appId } = options;
    if (!app.activeDocument) return { success: false, error: 'No active document' };
    isProcessing = true;
    try {
        const doc = app.activeDocument;
        let imagePath = null, maskPath = null, rgbaPath = null;
        const resultW = parseInt(val(doc.width)) || 0;
        const resultH = parseInt(val(doc.height)) || 0;
        let fullSizeImageData = null, fullMaskBuffer = null;

        await executeAsModal(async (context) => {
            if (baseMode === 'canvas') {
                const imageResult = await imaging.getPixels({
                    documentID: doc.id,
                    targetSize: { width: resultW, height: resultH },
                    applyAlpha: true
                });
                const cC = imageResult.imageData.components || 4;

                // [Fix] Robust DataView Handling
                const rawPixelData = await imageResult.imageData.getData();
                let cData = (rawPixelData && rawPixelData.buffer)
                    ? new Uint8Array(rawPixelData.buffer, rawPixelData.byteOffset, rawPixelData.byteLength)
                    : rawPixelData;

                fullSizeImageData = new Uint8Array(resultW * resultH * 4);
                for (let i = 0; i < resultW * resultH; i++) {
                    const sI = i * cC, dI = i * 4;
                    fullSizeImageData[dI] = cData[sI];
                    fullSizeImageData[dI + 1] = cData[sI + 1];
                    fullSizeImageData[dI + 2] = cData[sI + 2];
                    fullSizeImageData[dI + 3] = (cC === 4) ? cData[sI + 3] : 255;
                }
                const encoder = new PngEncoder(resultW, resultH, 4);
                imagePath = await saveBufferToTemp(encoder.encode(fullSizeImageData), nodeId, 'image', appId);
            } else {
                const activeLayer = doc.activeLayers[0];
                if (!activeLayer) throw new Error("No active layer selected");
                const bounds = activeLayer.boundsNoEffects;
                const L_top = parseInt(val(bounds.top)) || 0, L_left = parseInt(val(bounds.left)) || 0;
                const layerPixels = await imaging.getPixels({ documentID: doc.id, layerID: activeLayer.id, applyAlpha: true });
                const actualW = layerPixels.imageData.width, actualH = layerPixels.imageData.height, components = layerPixels.imageData.components || 4;

                // [Fix] Robust DataView Handling
                const rawLayerData = await layerPixels.imageData.getData();
                let srcData = (rawLayerData && rawLayerData.buffer)
                    ? new Uint8Array(rawLayerData.buffer, rawLayerData.byteOffset, rawLayerData.byteLength)
                    : rawLayerData;

                fullSizeImageData = new Uint8Array(resultW * resultH * 4);
                for (let y = 0; y < actualH; y++) {
                    const globalY = L_top + y;
                    if (globalY < 0 || globalY >= resultH) continue;
                    for (let x = 0; x < actualW; x++) {
                        const globalX = L_left + x;
                        if (globalX < 0 || globalX >= resultW) continue;
                        const sI = (y * actualW + x) * components, dI = (globalY * resultW + globalX) * 4;
                        fullSizeImageData[dI] = srcData[sI];
                        fullSizeImageData[dI + 1] = srcData[sI + 1];
                        fullSizeImageData[dI + 2] = srcData[sI + 2];
                        fullSizeImageData[dI + 3] = (components === 4) ? srcData[sI + 3] : 255;
                    }
                }
                if (layerPixels.dispose) layerPixels.dispose();
                const encoder = new PngEncoder(resultW, resultH, 4);
                imagePath = await saveBufferToTemp(encoder.encode(fullSizeImageData), nodeId, 'image', appId);
            }

            // Mask Logic
            let selectionBounds = null;
            try { selectionBounds = await getSelectionInfo(); } catch (e) { }
            if (selectionBounds) {
                let tempLayerId = null;
                try {
                    const S_left = Math.round(val(selectionBounds.left)) || 0, S_top = Math.round(val(selectionBounds.top)) || 0;
                    const captureResult = await action.batchPlay([{ _obj: "make", _target: [{ _ref: "layer" }] }, { _obj: "fill", mode: { _enum: "interpolation", _value: "normal" }, opacity: { _unit: "percentUnit", _value: 100 }, using: { _enum: "fillContents", _value: "black" } }, { _obj: "fill", mode: { _enum: "interpolation", _value: "normal" }, opacity: { _unit: "percentUnit", _value: 100 }, using: { _enum: "fillContents", _value: "white" } }], {});
                    tempLayerId = captureResult[0]?.layerID;
                    const maskPixels = await imaging.getPixels({ documentID: doc.id, layerID: tempLayerId });

                    // [Fix] Robust DataView Handling
                    const rawMaskData = await maskPixels.imageData.getData();
                    let mData = (rawMaskData && rawMaskData.buffer)
                        ? new Uint8Array(rawMaskData.buffer, rawMaskData.byteOffset, rawMaskData.byteLength)
                        : rawMaskData;

                    const mW = maskPixels.imageData.width, mH = maskPixels.imageData.height, mC = maskPixels.imageData.components || 1;
                    fullMaskBuffer = new Uint8Array(resultW * resultH * 4);
                    const limitW = Math.min(mW, resultW), limitH = Math.min(mH, resultH);
                    for (let y = 0; y < limitH; y++) {
                        const globalY = S_top + y;
                        if (globalY < 0 || globalY >= resultH) continue;
                        for (let x = 0; x < limitW; x++) {
                            const globalX = S_left + x;
                            if (globalX < 0 || globalX >= resultW) continue;
                            const sI = (y * mW + x) * mC, dI = (globalY * resultW + globalX) * 4;
                            fullMaskBuffer[dI] = 255; fullMaskBuffer[dI + 3] = mData[sI];
                        }
                    }
                    if (maskPixels.dispose) maskPixels.dispose();
                    const maskEncoder = new PngEncoder(resultW, resultH, 4);
                    maskPath = await saveBufferToTemp(maskEncoder.encode(fullMaskBuffer), nodeId, 'mask_preview', appId);
                } finally {
                    if (tempLayerId) try { await action.batchPlay([{ _obj: "delete", _target: [{ _ref: "layer", _id: tempLayerId }] }], {}); } catch (de) { }
                }
            }

            // RGBA Logic
            if (fullSizeImageData) {
                const rgbaBuffer = new Uint8Array(resultW * resultH * 4);
                for (let i = 0; i < rgbaBuffer.length; i += 4) {
                    rgbaBuffer[i] = fullSizeImageData[i];
                    rgbaBuffer[i + 1] = fullSizeImageData[i + 1];
                    rgbaBuffer[i + 2] = fullSizeImageData[i + 2];
                    rgbaBuffer[i + 3] = fullMaskBuffer ? (255 - fullMaskBuffer[i + 3]) : 255;
                }
                const rgbaEncoder = new PngEncoder(resultW, resultH, 4);
                rgbaPath = await saveBufferToTemp(rgbaEncoder.encode(rgbaBuffer), nodeId, 'rgba', appId);
            }
        }, { "commandName": "SDK: Image Acquisition" });

        return { success: true, image: imagePath ? 'file://' + imagePath : null, mask: maskPath ? 'file://' + maskPath : null, rgba: rgbaPath ? 'file://' + rgbaPath : null, width: resultW, height: resultH, isLocal: true };
    } catch (e) { return { success: false, error: e.message }; } finally { isProcessing = false; }
}

// ============================================================================
// SDK EXPOSED APIS (从母版同步)
// ============================================================================

async function pickLocalFile() {
    try {
        const file = await fs.getFileForOpening({ types: ["png", "jpg", "jpeg", "webp"], allowMultiple: false });
        if (!file) return { success: false, error: 'User cancelled' };
        const tempFolder = await fs.getTemporaryFolder();
        const copiedFile = await file.copyTo(tempFolder, { newName: file.name, overwrite: true });
        return { success: true, image: copiedFile.nativePath, name: file.name, isLocal: true };
    } catch (e) { return { success: false, error: e.message }; }
}

async function downloadUrlToTemp(url, fileName) {
    if (!fileName) fileName = `dl_${Date.now()}.png`;
    const res = await fetch(url);
    const buf = await res.arrayBuffer();
    const tempFolder = await fs.getTemporaryFolder();
    const file = await tempFolder.createFile(fileName, { overwrite: true });
    await file.write(buf, { format: formats.binary });
    return { success: true, nativePath: file.nativePath };
}

async function createDocFromUrl(url) {
    try {
        let file;
        if (url.startsWith('file://')) file = await fs.getEntryWithUrl(url);
        else {
            const res = await downloadUrlToTemp(url, 'sdk_doc.png');
            file = await fs.getEntryWithUrl('file://' + res.nativePath);
        }
        await executeAsModal(async () => { await app.open(file); }, { "commandName": "SDK: Open Doc" });
        return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
}

async function placeImageFromUrl(url, isShiftCenter = false) {
    try {
        let file;
        if (url.startsWith('file://')) file = await fs.getEntryWithUrl(url);
        else {
            const res = await downloadUrlToTemp(url, 'sdk_layer.png');
            file = await fs.getEntryWithUrl('file://' + res.nativePath);
        }
        await executeAsModal(async () => {
            const doc = app.activeDocument;
            const token = await fs.createSessionToken(file);
            await batchPlay([{ _obj: "placeEvent", target: { _path: token, _kind: "local" }, linked: true }], {});
            const layer = doc.activeLayers[0], bounds = layer.boundsNoEffects;
            const layerW = bounds.right - bounds.left, layerH = bounds.bottom - bounds.top;
            const layerCenterX = (bounds.left + bounds.right) / 2, layerCenterY = (bounds.top + bounds.bottom) / 2;
            let targetBounds = { left: 0, top: 0, right: doc.width, bottom: doc.height };
            try { const sel = doc.selection.bounds; if (sel) targetBounds = sel; } catch (e) { }
            const targetW = targetBounds.right - targetBounds.left, targetH = targetBounds.bottom - targetBounds.top;
            const targetCenterX = (targetBounds.left + targetBounds.right) / 2, targetCenterY = (targetBounds.top + targetBounds.bottom) / 2;
            let scaleX = 100, scaleY = 100, transX = targetCenterX - layerCenterX, transY = targetCenterY - layerCenterY;
            if (!isShiftCenter) { scaleX = (targetW / layerW) * 100; scaleY = (targetH / layerH) * 100; }
            else { transX = (doc.width / 2) - layerCenterX; transY = (doc.height / 2) - layerCenterY; }

            await action.batchPlay([
                {
                    _obj: "transform",
                    _target: [{ _ref: "layer", _enum: "ordinal", _value: "targetEnum" }],
                    freeTransformCenterState: { _enum: "quadCenterState", _value: "QCSAverage" },
                    offset: { _obj: "offset", horizontal: { _unit: "pixelsUnit", _value: transX }, vertical: { _unit: "pixelsUnit", _value: transY } },
                    width: { _unit: "percentUnit", _value: scaleX },
                    height: { _unit: "percentUnit", _value: scaleY },
                    interpolation: { _enum: "interpolationType", _value: "bicubic" }
                }
            ], {});

            await action.batchPlay([{ _obj: "rasterizeLayer", _target: [{ _ref: "layer", _enum: "ordinal", _value: "targetEnum" }] }], {});
        }, { "commandName": "SDK: Place Image" });
        return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
}

function getDocumentInfo() {
    if (!app || !app.activeDocument) return { hasDocument: false };
    const doc = app.activeDocument;
    return { hasDocument: true, width: val(doc.width), height: val(doc.height) };
}

function startSelectionListener(callback) {
    if (!action || !action.addNotificationListener) return;
    let timeout = null;
    action.addNotificationListener(['all'], (event, descriptor) => {
        const triggers = ['set', 'reset', 'select', 'make', 'move', 'transform', 'show', 'hide', 'delete'];
        if (triggers.includes(event)) {
            if (timeout) clearTimeout(timeout);
            timeout = setTimeout(() => { if (!isProcessing && callback) callback(); }, 600);
        }
    });
}

async function listHistoryFiles() {
    try {
        const tempFolder = await fs.getTemporaryFolder(), entries = await tempFolder.getEntries();
        // 扫描策略：
        // 1. 以 dl_ 开头的 (下载的临时文件)
        // 2. 以 sdk_ 开头的 (SDK 内部使用的)
        // 3. 包含 _result_ 的 (BizyAir 结果图)
        const files = entries
            .filter(e => e.isFile && (
                e.name.startsWith('dl_') ||
                e.name.startsWith('sdk_') ||
                e.name.includes('_result_')
            ))
            .sort((a, b) => b.modDate - a.modDate) // 按时间倒序
            .map(e => 'file://' + e.nativePath);
        return { success: true, files };
    } catch (e) { return { success: false, error: e.message }; }
}

async function deleteFile(path) {
    try {
        if (!path) return { success: false, error: 'Empty path' };
        // Clean path: remove protocol, decode URL characters
        let cleanPath = decodeURIComponent(path.replace(/^(file|uxp-file):\/\/\/?/, ''));
        // Handle both / and \ (for Windows compatibility)
        const name = cleanPath.split(/[\\\/]/).pop();

        const temp = await fs.getTemporaryFolder();
        const file = await temp.getEntry(name);
        if (file) await file.delete();
        return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
}

async function clearHistoryFiles() {
    try {
        const temp = await fs.getTemporaryFolder(), entries = await temp.getEntries();
        let count = 0;
        for (const e of entries) {
            if (e.isFile && (
                e.name.includes('_image') ||
                e.name.includes('_mask') ||
                e.name.includes('_result_') ||
                e.name.startsWith('dl_')
            )) {
                await e.delete();
                count++;
            }
        }
        return { success: true, count };
    } catch (e) { return { success: false, error: e.message }; }
}

async function readBinaryFile(path) {
    try {
        if (!path) return { success: false, error: 'Empty path' };

        // 1. 尝试直接通过 URL 获取 Entry (最稳妥的方式)
        let file;
        try {
            if (path.startsWith('file:') || path.startsWith('uxp-file:')) {
                file = await fs.getEntryWithUrl(path);
            }
        } catch (e) { /* 继续尝试备选方案 */ }

        // 2. 备选方案：手动解析文件名并从 Temp 目录找
        if (!file) {
            // 清理路径：移除协议头，处理编码
            let cleanPath = decodeURIComponent(path.replace(/^(file|uxp-file):\/\/\/?/, ''));
            const name = cleanPath.split(/[\\\/]/).pop();
            const temp = await fs.getTemporaryFolder();
            file = await temp.getEntry(name);
        }

        if (!file) throw new Error(`Could not locate file Entry for path: ${path}`);

        const buf = await file.read({ format: formats.binary });
        return { success: true, buffer: Array.from(new Uint8Array(buf)) };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

// ============================================================================
// EXPORTS
// ============================================================================

window.photoshopAPI = {
    getActiveDocumentImage,
    createDocFromUrl,
    placeImageFromUrl,
    downloadUrlToTemp,
    getDocumentInfo,
    startSelectionListener,
    listHistoryFiles,
    deleteFile,
    clearHistoryFiles,
    pickLocalFile,
    readBinaryFile,
    showAlert: (m) => app.showAlert(m)
};
