// Arto Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyCHqSaUEQtwNnYS-mP3csFThxm0RHGrsEc",
  authDomain: "arto-e7e1b.firebaseapp.com",
  projectId: "arto-e7e1b",
  storageBucket: "arto-e7e1b.firebasestorage.app",
  messagingSenderId: "560676285507",
  appId: "1:560676285507:web:99f279796e05a311aeb8f6",
  measurementId: "G-22RL49KHGX"
};

// Initialize Firebase (Compat mode for direct browser usage)
firebase.initializeApp(firebaseConfig);

// Export common services to global window object
window.auth = firebase.auth();
window.db = firebase.firestore();
window.googleProvider = new firebase.auth.GoogleAuthProvider();

// --- CLOUD SYNC LOGIC ---
const originalSetItem = localStorage.setItem;
const originalRemoveItem = localStorage.removeItem;
const originalClear = localStorage.clear;

// Helper to access MindmapDB
function getMindmapDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open("MindmapDB", 1);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains("Elements")) {
                db.createObjectStore("Elements");
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}
async function getMindmapElements() {
    try {
        const db = await getMindmapDB();
        return new Promise((resolve, reject) => {
            if (!db.objectStoreNames.contains("Elements")) return resolve(null);
            const tx = db.transaction("Elements", "readonly");
            const store = tx.objectStore("Elements");
            const req = store.get("blank_mindmap_elements");
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    } catch(e) { return null; }
}
async function setMindmapElements(val) {
    try {
        const db = await getMindmapDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction("Elements", "readwrite");
            const store = tx.objectStore("Elements");
            const req = store.put(val, "blank_mindmap_elements");
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    } catch(e) {}
}

window.saveUserDataToCloud = async function() {
    if (!window.auth || !window.auth.currentUser) return;
    const user = window.auth.currentUser;

    // Keys containing large base64 image data — never sync to main doc
    const SKIP_KEYS = ['custom_card_icons', 'main_card_custom_icons', 'custom_icons',
                       'active_card_icon_data', 'main_active_card_icon_data'];

    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (SKIP_KEYS.includes(key)) continue;
        const val = localStorage.getItem(key);
        // Skip any localStorage value that embeds a raw base64 image
        if (val && val.includes('data:image/') && val.length > 50000) continue;
        data[key] = val;
    }

    // Separate image elements from text elements
    let imageElements = [];
    try {
        const elements = await getMindmapElements();
        if (elements && Array.isArray(elements)) {
            const textElements = elements.map(el => {
                if (el.type === 'image') {
                    imageElements.push(el);
                    return { ...el, content: '__IMAGE_CHUNKED__' };
                }
                return el;
            });
            data['indexeddb_blank_mindmap_elements'] = JSON.stringify(textElements);
        } else if (elements) {
            data['indexeddb_blank_mindmap_elements'] = JSON.stringify(elements);
        }
    } catch(e) {
        console.error("Could not read mindmap elements for sync", e);
    }

    if (Object.keys(data).length === 0) return;

    // Helper to show notification
    function showSyncNotif(msg, color) {
        const nc = document.getElementById("notification-container");
        if (!nc) return;
        const n = document.createElement("div");
        n.className = "notification";
        if (color) n.style.backgroundColor = color;
        n.innerHTML = msg;
        nc.appendChild(n);
        setTimeout(() => { n.style.opacity = "0"; setTimeout(() => n.remove(), 300); }, 3000);
    }

    // MAX 524,000 chars after UTF-16 compression (~1MB Firestore limit)
    const MAX_CHARS = 524000;

    function tryCompress(obj) {
        if (typeof LZString === 'undefined') return { raw: obj };
        const c = LZString.compressToUTF16(JSON.stringify(obj));
        return c.length <= MAX_CHARS ? { compressed: c } : null;
    }

    // Progressive stripping: try full → strip drawings → strip all remaining large values
    let payload = tryCompress(data);
    if (!payload) {
        delete data['blank_mindmap_drawings'];
        payload = tryCompress(data);
    }
    if (!payload) {
        // Last resort: strip everything except mindmap elements and core settings
        const keep = ['indexeddb_blank_mindmap_elements', 'crt_mode', 'arto_theme', 'arto_settings'];
        for (const k of Object.keys(data)) {
            if (!keep.includes(k)) delete data[k];
        }
        payload = tryCompress(data);
    }
    if (!payload) {
        showSyncNotif(`<strong>Lỗi Đồng bộ</strong><br>Dữ liệu vẫn quá lớn sau khi đã nén. Hãy giảm số ghi chú.`, "#ff4d4d");
        console.error("[SYNC] Data too large even after stripping. Aborting.");
        return;
    }

    payload.hasImageChunks = imageElements.length > 0;
    payload.updatedAt = firebase.firestore.FieldValue.serverTimestamp();

    const userDoc = window.db.collection('users').doc(user.uid);

    // Save main payload
    userDoc.set(payload, { merge: true })
    .then(async () => {
        console.log("Main data synced to cloud");
        showSyncNotif(`<strong>Đồng bộ</strong><br>Đã lưu ghi chú lên đám mây!`);

        // Save image chunks separately if any
        if (imageElements.length > 0) {
            const CHUNK_SIZE = 5; // 5 images per Firestore doc
            const chunks = [];
            for (let i = 0; i < imageElements.length; i += CHUNK_SIZE) {
                chunks.push(imageElements.slice(i, i + CHUNK_SIZE));
            }
            const chunksCol = userDoc.collection('chunks');
            // Clear old chunks first
            const oldChunks = await chunksCol.get();
            const delBatch = window.db.batch();
            oldChunks.forEach(d => delBatch.delete(d.ref));
            await delBatch.commit();

            // Write new chunks
            const batch = window.db.batch();
            chunks.forEach((chunk, idx) => {
                let chunkStr = JSON.stringify(chunk);
                if (typeof LZString !== 'undefined') {
                    batch.set(chunksCol.doc('img_' + idx), { compressed: LZString.compressToUTF16(chunkStr) });
                } else {
                    batch.set(chunksCol.doc('img_' + idx), { images: chunk });
                }
            });
            await batch.commit();
            console.log("Image chunks synced:", chunks.length, "chunk(s)");
            showSyncNotif(`<strong>Đồng bộ</strong><br>Đã lưu ${imageElements.length} ảnh lên đám mây!`);
        }
    })
    .catch(err => {
        console.error("Cloud sync error:", err);
        showSyncNotif(`<strong>Lỗi Đồng bộ</strong><br>Không thể lưu lên đám mây!`, "#ff4d4d");
    });
};

window.triggerCloudSync = function() {
    console.log("[SYNC] triggerCloudSync called. auth:", !!window.auth, "currentUser:", !!(window.auth && window.auth.currentUser));
    clearTimeout(window.cloudSyncTimeout);

    const notificationContainer = document.getElementById("notification-container");
    console.log("[SYNC] notification-container found:", !!notificationContainer);
    if (notificationContainer) {
        const notif = document.createElement("div");
        notif.className = "notification";
        notif.style.backgroundColor = "#ffb84d";
        notif.innerHTML = `<strong>Đang chuẩn bị Đồng bộ...</strong><br>Vui lòng chờ 3 giây...`;
        notificationContainer.appendChild(notif);
        setTimeout(() => {
            notif.style.opacity = "0";
            setTimeout(() => notif.remove(), 300);
        }, 1500);
    }

    window.cloudSyncTimeout = setTimeout(() => {
        // If auth already resolved, sync immediately
        if (window.auth && window.auth.currentUser) {
            console.log("[SYNC] Calling saveUserDataToCloud immediately...");
            window.saveUserDataToCloud();
        } else if (window.auth) {
            // Wait for auth state to resolve (up to 5s)
            console.log("[SYNC] Waiting for auth state to resolve...");
            const unsubscribe = window.auth.onAuthStateChanged(user => {
                unsubscribe();
                if (user) {
                    console.log("[SYNC] Auth resolved, calling saveUserDataToCloud...");
                    window.saveUserDataToCloud();
                } else {
                    console.warn("[SYNC] No user after auth resolved, skipping sync.");
                }
            });
        } else {
            console.warn("[SYNC] window.auth not available, skipping sync.");
        }
    }, 3000);
}

// Intercept LocalStorage
localStorage.setItem = function(key, value) {
    originalSetItem.apply(this, arguments);
    window.triggerCloudSync();
};
localStorage.removeItem = function(key) {
    originalRemoveItem.apply(this, arguments);
    window.triggerCloudSync();
};
localStorage.clear = function() {
    originalClear.apply(this, arguments);
    window.triggerCloudSync();
};

window.auth.onAuthStateChanged(user => {
    if (user) {
        const userDoc = window.db.collection('users').doc(user.uid);
        userDoc.get().then(async doc => {
            if (doc.exists) {
                const docData = doc.data();
                let cloudData;

                // Decompress if stored compressed
                if (docData.compressed && typeof LZString !== 'undefined') {
                    try {
                        cloudData = JSON.parse(LZString.decompressFromUTF16(docData.compressed));
                    } catch(e) { cloudData = docData.localStorageData; }
                } else {
                    cloudData = docData.localStorageData;
                }

                if (cloudData) {
                    // If image chunks exist, load and merge them back
                    if (docData.hasImageChunks) {
                        try {
                            const chunksSnap = await userDoc.collection('chunks').get();
                            let allImages = [];
                            chunksSnap.forEach(chunkDoc => {
                                const cd = chunkDoc.data();
                                if (cd.compressed && typeof LZString !== 'undefined') {
                                    try { allImages = allImages.concat(JSON.parse(LZString.decompressFromUTF16(cd.compressed))); } catch(e) {}
                                } else if (cd.images) {
                                    allImages = allImages.concat(cd.images);
                                }
                            });

                            // Merge images back into text elements
                            if (cloudData['indexeddb_blank_mindmap_elements'] && allImages.length > 0) {
                                const textEls = JSON.parse(cloudData['indexeddb_blank_mindmap_elements']);
                                // Replace placeholders with real image data
                                const imageMap = {};
                                allImages.forEach(img => { imageMap[img.id] = img; });
                                const merged = textEls.map(el => imageMap[el.id] ? imageMap[el.id] : el);
                                // Append any images not already in textEls
                                const textIds = new Set(textEls.map(e => e.id));
                                allImages.forEach(img => { if (!textIds.has(img.id)) merged.push(img); });
                                cloudData['indexeddb_blank_mindmap_elements'] = JSON.stringify(merged);
                            }
                        } catch(e) { console.error("Error loading image chunks:", e); }
                    }

                    let changed = false;
                    for (const key in cloudData) {
                        if (key === 'indexeddb_blank_mindmap_elements') {
                            try {
                                const parsed = JSON.parse(cloudData[key]);
                                const current = await getMindmapElements();
                                if (JSON.stringify(parsed) !== JSON.stringify(current)) {
                                    await setMindmapElements(parsed);
                                    changed = true;
                                }
                            } catch(e) {}
                        } else {
                            if (localStorage.getItem(key) !== cloudData[key]) {
                                originalSetItem.call(localStorage, key, cloudData[key]);
                                changed = true;
                            }
                        }
                    }
                    if (changed) {
                        const notificationContainer = document.getElementById("notification-container");
                        if (notificationContainer) {
                            const notif = document.createElement("div");
                            notif.className = "notification";
                            notif.innerHTML = `<strong>Đồng bộ</strong><br>Đã tải dữ liệu từ đám mây!`;
                            notificationContainer.appendChild(notif);
                            setTimeout(() => {
                                notif.style.opacity = "0";
                                setTimeout(() => notif.remove(), 300);
                            }, 3000);
                        }
                        // Re-render canvas directly if possible, else reload
                        if (typeof window.renderMindmap === 'function') {
                            setTimeout(() => window.renderMindmap(), 300);
                        } else {
                            setTimeout(() => location.reload(), 1500);
                        }
                    }
                }
            } else {
                // First time login, push current local data
                window.saveUserDataToCloud();
            }
        }).catch(err => console.error("Error fetching cloud data:", err));
    }
});
