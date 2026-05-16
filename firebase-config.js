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
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        data[key] = localStorage.getItem(key);
    }
    
    try {
        const elements = await getMindmapElements();
        if (elements) {
            data['indexeddb_blank_mindmap_elements'] = JSON.stringify(elements);
        }
    } catch(e) {
        console.error("Could not read mindmap elements for sync", e);
    }

    if (Object.keys(data).length === 0) return;

    let dataString = JSON.stringify(data);

    // Compress with LZ-String if available
    let payload;
    if (typeof LZString !== 'undefined') {
        payload = { compressed: LZString.compressToUTF16(dataString) };
    } else {
        // Fallback: strip heavy icons if no compression
        if (dataString.length > 900000) {
            delete data['custom_card_icons'];
            delete data['main_card_custom_icons'];
            dataString = JSON.stringify(data);
        }
        if (dataString.length > 1000000) {
            console.warn("Data too large for Firestore.");
            const notificationContainer = document.getElementById("notification-container");
            if (notificationContainer) {
                const notif = document.createElement("div");
                notif.className = "notification";
                notif.style.backgroundColor = "#ff4d4d";
                notif.innerHTML = `<strong>Lỗi Đồng bộ</strong><br>Dữ liệu quá lớn (vượt 1MB). Hãy dùng Tải Xuống (Backup).`;
                notificationContainer.appendChild(notif);
                setTimeout(() => { notif.style.opacity="0"; setTimeout(()=>notif.remove(),300); }, 3000);
            }
            return;
        }
        payload = { localStorageData: data };
    }

    window.db.collection('users').doc(user.uid).set(Object.assign(payload, {
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }), { merge: true })
    .then(() => {
        console.log("Data synced to cloud");
        const notificationContainer = document.getElementById("notification-container");
        if (notificationContainer) {
            const notif = document.createElement("div");
            notif.className = "notification";
            notif.innerHTML = `<strong>Đồng bộ</strong><br>Đã lưu dữ liệu lên đám mây!`;
            notificationContainer.appendChild(notif);
            setTimeout(() => {
                notif.style.opacity = "0";
                setTimeout(() => notif.remove(), 300);
            }, 3000);
        }
    })
    .catch(err => {
        console.error("Cloud sync error:", err);
        const notificationContainer = document.getElementById("notification-container");
        if (notificationContainer) {
            const notif = document.createElement("div");
            notif.className = "notification";
            notif.style.backgroundColor = "#ff4d4d";
            notif.innerHTML = `<strong>Lỗi Đồng bộ</strong><br>Không thể lưu lên đám mây!`;
            notificationContainer.appendChild(notif);
            setTimeout(() => {
                notif.style.opacity = "0";
                setTimeout(() => notif.remove(), 300);
            }, 3000);
        }
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
        window.db.collection('users').doc(user.uid).get().then(async doc => {
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
                        // Need a small delay to let UI show up before reload
                        setTimeout(() => location.reload(), 1500);
                    }
                }
            } else {
                // First time login, push current local data
                window.saveUserDataToCloud();
            }
        }).catch(err => console.error("Error fetching cloud data:", err));
    }
});
