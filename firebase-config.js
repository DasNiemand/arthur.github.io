// ============================================================
//  firebase-config.js  — Arto Cloud Sync (clean rewrite)
// ============================================================

const firebaseConfig = {
    apiKey: "AIzaSyCHqSaUEQtwNnYS-mP3csFThxm0RHGrsEc",
    authDomain: "arto-e7e1b.firebaseapp.com",
    projectId: "arto-e7e1b",
    storageBucket: "arto-e7e1b.firebasestorage.app",
    messagingSenderId: "560676285507",
    appId: "1:560676285507:web:99f279796e05a311aeb8f6",
    measurementId: "G-22RL49KHGX"
};

firebase.initializeApp(firebaseConfig);
window.auth = firebase.auth();
window.db   = firebase.firestore();
window.googleProvider = new firebase.auth.GoogleAuthProvider();

// Offline persistence — serve from cache when network is down
window.db.enablePersistence({ synchronizeTabs: true }).catch(() => {});

// ============================================================
//  HELPERS — IndexedDB read / write  (MindmapDB / Elements)
// ============================================================
function _openMindmapDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open("MindmapDB", 1);
        req.onupgradeneeded = e => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains("Elements"))
                db.createObjectStore("Elements");
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror   = () => reject(req.error);
    });
}

async function _idbGet(key) {
    const db = await _openMindmapDB();
    return new Promise((resolve, reject) => {
        const req = db.transaction("Elements", "readonly")
                      .objectStore("Elements").get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror   = () => reject(req.error);
    });
}

async function _idbSet(key, value) {
    const db = await _openMindmapDB();
    return new Promise((resolve, reject) => {
        const req = db.transaction("Elements", "readwrite")
                      .objectStore("Elements").put(value, key);
        req.onsuccess = () => resolve();
        req.onerror   = () => reject(req.error);
    });
}

async function _idbClear() {
    const db = await _openMindmapDB();
    return new Promise((resolve, reject) => {
        const req = db.transaction("Elements", "readwrite")
                      .objectStore("Elements").clear();
        req.onsuccess = () => resolve();
        req.onerror   = () => reject(req.error);
    });
}

// ============================================================
//  UI NOTIFICATION
// ============================================================
function showCloudNotif(html, color) {
    const nc = document.getElementById("notification-container");
    if (!nc) return;
    const n = document.createElement("div");
    n.className = "notification";
    if (color) n.style.backgroundColor = color;
    n.innerHTML = html;
    nc.appendChild(n);
    setTimeout(() => { n.style.opacity = "0"; setTimeout(() => n.remove(), 300); }, 3500);
}

// ============================================================
//  SAVE TO CLOUD
// ============================================================
const SKIP_LS_KEYS = new Set([
    "custom_card_icons", "main_card_custom_icons", "custom_icons",
    "active_card_icon_data", "main_active_card_icon_data"
]);
const MAX_COMPRESSED_CHARS = 500000; // ~1MB in UTF-16

function _compress(obj) {
    if (typeof LZString === "undefined") return JSON.stringify(obj);
    return LZString.compressToUTF16(JSON.stringify(obj));
}

function _decompress(str) {
    if (typeof LZString === "undefined") return JSON.parse(str);
    try { return JSON.parse(LZString.decompressFromUTF16(str)); }
    catch (e) { return null; }
}

window.saveUserDataToCloud = async function () {
    if (!window.auth || !window.auth.currentUser) return;
    const uid = window.auth.currentUser.uid;

    // --- 1. Collect localStorage (skip heavy keys & raw base64) ---
    const lsData = {};
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (SKIP_LS_KEYS.has(k)) continue;
        const v = localStorage.getItem(k);
        if (v && v.includes("data:image/") && v.length > 50000) continue;
        lsData[k] = v;
    }

    // --- 2. Load elements, split images into separate chunks ---
    let imageElements = [];
    try {
        const elements = await _idbGet("blank_mindmap_elements");
        if (Array.isArray(elements)) {
            const textEls = elements.map(el => {
                if (el.type === "image") {
                    imageElements.push(el);
                    return { ...el, content: "__CHUNKED__" };
                }
                return el;
            });
            lsData["blank_mindmap_elements"] = JSON.stringify(textEls);
        }
    } catch (e) { console.warn("[SYNC] Could not read elements:", e); }

    // --- 3. Compress with progressive stripping ---
    let payload = null;
    const attempts = [
        () => lsData,
        () => { delete lsData["blank_mindmap_drawings"]; return lsData; },
        () => { const keep = { "blank_mindmap_elements": lsData["blank_mindmap_elements"] }; return keep; }
    ];
    for (const attempt of attempts) {
        const obj = attempt();
        const c = _compress(obj);
        if (c.length <= MAX_COMPRESSED_CHARS) {
            payload = { c, hasChunks: imageElements.length > 0 };
            break;
        }
    }
    if (!payload) {
        showCloudNotif("<strong>Lỗi</strong><br>Dữ liệu quá lớn, không thể đồng bộ.", "#e53935");
        return;
    }

    const userDoc = window.db.collection("users").doc(uid);

    // --- 4. Save main document ---
    try {
        await userDoc.set({
            ...payload,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        showCloudNotif("<strong>☁ Đồng bộ</strong><br>Đã lưu ghi chú lên đám mây!", "#2e7d32");
    } catch (err) {
        console.error("[SYNC] Main save failed:", err);
        showCloudNotif("<strong>Lỗi</strong><br>Không lưu được lên đám mây.", "#e53935");
        return;
    }

    // --- 5. Save image chunks ---
    if (imageElements.length > 0) {
        try {
            const chunksCol = userDoc.collection("chunks");

            // Delete old chunks
            const old = await chunksCol.get();
            if (!old.empty) {
                const del = window.db.batch();
                old.forEach(d => del.delete(d.ref));
                await del.commit();
            }

            // Write new chunks (5 images per doc)
            const CHUNK = 5;
            const batch = window.db.batch();
            for (let i = 0; i < imageElements.length; i += CHUNK) {
                const slice = imageElements.slice(i, i + CHUNK);
                batch.set(chunksCol.doc("img_" + Math.floor(i / CHUNK)),
                    { c: _compress(slice) });
            }
            await batch.commit();
            showCloudNotif(`<strong>☁ Ảnh</strong><br>Đã lưu ${imageElements.length} ảnh!`, "#1565c0");
        } catch (err) {
            console.warn("[SYNC] Image chunk save failed:", err);
        }
    }
};

// ============================================================
//  LOAD FROM CLOUD  (called on login)
// ============================================================
async function loadFromCloud(user) {
    const uid = user.uid;
    const userDoc = window.db.collection("users").doc(uid);

    let docSnap;
    try {
        docSnap = await userDoc.get();
    } catch (err) {
        console.warn("[SYNC] Fetch failed (offline?):", err);
        showCloudNotif("<strong>Offline</strong><br>Không kết nối được. Dùng dữ liệu local.", "#e65100");
        if (typeof window.renderMindmap === "function") window.renderMindmap();
        return;
    }

    if (!docSnap.exists) {
        // First login — push local data up
        window.saveUserDataToCloud();
        return;
    }

    const docData = docSnap.data();
    const cloudObj = docData.c ? _decompress(docData.c) : null;
    if (!cloudObj) return;

    // Fetch image chunks if any
    if (docData.hasChunks) {
        try {
            const chunksSnap = await userDoc.collection("chunks").get();
            let allImages = [];
            chunksSnap.forEach(cd => {
                const imgs = _decompress(cd.data().c);
                if (Array.isArray(imgs)) allImages = allImages.concat(imgs);
            });

            // Merge images back into elements
            if (cloudObj["blank_mindmap_elements"] && allImages.length > 0) {
                const els = JSON.parse(cloudObj["blank_mindmap_elements"]);
                const imgMap = {};
                allImages.forEach(img => { imgMap[img.id] = img; });
                const merged = els.map(el => imgMap[el.id] || el);
                // Add any images not already present
                const textIds = new Set(els.map(e => e.id));
                allImages.forEach(img => { if (!textIds.has(img.id)) merged.push(img); });
                cloudObj["blank_mindmap_elements"] = JSON.stringify(merged);
            }
        } catch (e) {
            console.warn("[SYNC] Could not load image chunks:", e);
        }
    }

    // Restore localStorage
    let changed = false;
    for (const [k, v] of Object.entries(cloudObj)) {
        if (k === "blank_mindmap_elements") continue;
        if (localStorage.getItem(k) !== v) {
            localStorage.setItem(k, v);
            changed = true;
        }
    }

    // Restore IndexedDB elements
    if (cloudObj["blank_mindmap_elements"]) {
        try {
            const parsed = JSON.parse(cloudObj["blank_mindmap_elements"]);
            // Skip if placeholder-only (images failed to load)
            const hasPlaceholders = parsed.some(el => el.content === "__CHUNKED__");
            if (!hasPlaceholders) {
                const current = await _idbGet("blank_mindmap_elements");
                if (JSON.stringify(parsed) !== JSON.stringify(current)) {
                    await _idbSet("blank_mindmap_elements", parsed);
                    changed = true;
                }
            }
        } catch (e) {}
    }

    if (changed) {
        showCloudNotif("<strong>☁ Đồng bộ</strong><br>Đã tải dữ liệu từ đám mây!", "#2e7d32");
        setTimeout(() => {
            if (typeof window.renderMindmap === "function") {
                window.renderMindmap();
            } else {
                location.reload();
            }
        }, 400);
    }
}

// ============================================================
//  SYNC TRIGGER  (debounced, called after every dbSet / lsSet)
// ============================================================
window.triggerCloudSync = function () {
    if (!window.auth || !window.auth.currentUser) return;
    clearTimeout(window._syncTimer);
    window._syncTimer = setTimeout(() => window.saveUserDataToCloud(), 3000);
};

// Intercept localStorage writes to trigger sync
(function () {
    const _set = localStorage.setItem.bind(localStorage);
    const _rem = localStorage.removeItem.bind(localStorage);
    const _clr = localStorage.clear.bind(localStorage);
    localStorage.setItem = function (k, v) { _set(k, v); window.triggerCloudSync(); };
    localStorage.removeItem = function (k) { _rem(k); window.triggerCloudSync(); };
    localStorage.clear = function () { _clr(); window.triggerCloudSync(); };
    // Keep originals for internal use
    window._lsSet = _set;
    window._lsRem = _rem;
    window._lsClear = _clr;
})();

// ============================================================
//  AUTH STATE  → load on login, clear on logout
// ============================================================
window.auth.onAuthStateChanged(user => {
    if (user) {
        console.log("[AUTH] Logged in:", user.uid);
        loadFromCloud(user);
    }
    // Logout handling is done in page_blank.js (initializeAuth)
});

