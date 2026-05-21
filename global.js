/**
 * global.js - Shared logic for all pages
 * Handles: Username onboarding, global download/upload (sync)
 */
(function () {
    "use strict";

    // ─── DB HELPERS ──────────────────────────────────────────────────────────
    const LARGE_FILE_DB   = "ArtoStorageDB";
    const LARGE_FILE_VER  = 1;
    const LARGE_FILE_STORE = "files";

    const MINDMAP_DB    = "MindmapDB";
    const MINDMAP_VER   = 1;
    const MINDMAP_STORE = "Elements";

    function openIDB(name, version, storeName) {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(name, version);
            req.onupgradeneeded = e => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(storeName)) {
                    db.createObjectStore(storeName);
                }
            };
            req.onsuccess  = e => resolve(e.target.result);
            req.onerror    = e => reject(e.target.error);
        });
    }

    async function idbGet(dbName, version, storeName, key) {
        const db = await openIDB(dbName, version, storeName);
        return new Promise((resolve, reject) => {
            const tx    = db.transaction(storeName, "readonly");
            const store = tx.objectStore(storeName);
            const req   = store.get(key);
            req.onsuccess = () => resolve(req.result);
            req.onerror   = () => reject(req.error);
        });
    }

    async function idbGetAllKeys(dbName, version, storeName) {
        const db = await openIDB(dbName, version, storeName);
        return new Promise((resolve, reject) => {
            const tx    = db.transaction(storeName, "readonly");
            const store = tx.objectStore(storeName);
            const req   = store.getAllKeys();
            req.onsuccess = () => resolve(req.result);
            req.onerror   = () => reject(req.error);
        });
    }

    async function idbSet(dbName, version, storeName, key, value) {
        const db = await openIDB(dbName, version, storeName);
        return new Promise((resolve, reject) => {
            const tx    = db.transaction(storeName, "readwrite");
            const store = tx.objectStore(storeName);
            const req   = store.put(value, key);
            req.onsuccess = () => resolve();
            req.onerror   = () => reject(req.error);
        });
    }

    // ─── BLOB ↔ BASE64 ───────────────────────────────────────────────────────
    function blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result); // data:<mime>;base64,<data>
            reader.onerror   = reject;
            reader.readAsDataURL(blob);
        });
    }

    async function base64ToBlob(dataUrl) {
        const res  = await fetch(dataUrl);
        return res.blob();
    }

    // ─── UUID ─────────────────────────────────────────────────────────────────
    function generateUUID() {
        return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
            const r = (Math.random() * 16) | 0;
            return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
        });
    }

    // ─── STYLES INJECTION ─────────────────────────────────────────────────────
    const globalStyle = document.createElement("style");
    globalStyle.textContent = `
        #notification-container {
            position: fixed;
            bottom: 20px;
            right: 20px;
            display: flex;
            flex-direction: column;
            gap: 12px;
            z-index: 999999;
            pointer-events: none;
        }
        .global-alert {
            pointer-events: auto;
            padding: 12px 16px;
            border-radius: 8px;
            display: flex;
            align-items: center;
            transition: all 0.3s ease-in-out;
            border-left: 4px solid;
            cursor: pointer;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
            transform: translateX(110%);
            opacity: 0;
            font-family: 'Inter', system-ui, sans-serif;
        }
        .global-alert.show {
            transform: translateX(0);
            opacity: 1;
        }
        .global-alert:hover {
            transform: scale(1.05);
        }
        .global-alert svg {
            height: 20px;
            width: 20px;
            flex-shrink: 0;
            margin-right: 12px;
        }
        .global-alert p {
            font-size: 0.85rem;
            font-weight: 600;
            margin: 0;
            line-height: 1.4;
        }
        
        /* Dark theme equivalents for the Tailwind classes */
        .alert-success { background-color: #14532d; border-color: #15803d; color: #d1fae5; }
        .alert-success:hover { background-color: #166534; }
        .alert-success svg { color: #22c55e; }

        .alert-info { background-color: #1e3a8a; border-color: #1d4ed8; color: #dbeafe; }
        .alert-info:hover { background-color: #1e40af; }
        .alert-info svg { color: #3b82f6; }

        .alert-warning { background-color: #713f12; border-color: #a16207; color: #fef3c7; }
        .alert-warning:hover { background-color: #854d0e; }
        .alert-warning svg { color: #eab308; }

        .alert-error { background-color: #7f1d1d; border-color: #b91c1c; color: #fee2e2; }
        .alert-error:hover { background-color: #991b1b; }
        .alert-error svg { color: #ef4444; }

        /* User Dropdown - positioned to the right of the navbar */
        .user-dropdown-menu {
            position: fixed;
            left: 76px;
            background: rgba(22, 22, 28, 0.98);
            border: 1px solid #444;
            border-radius: 10px;
            padding: 6px 0;
            min-width: 160px;
            display: none;
            flex-direction: column;
            box-shadow: 0 12px 32px rgba(0,0,0,0.6);
            z-index: 200000;
            opacity: 0;
            transition: opacity 0.15s ease, transform 0.15s ease;
            transform: translateX(-6px);
        }
        .user-dropdown-menu.show {
            display: flex;
            opacity: 1;
            transform: translateX(0);
        }
        .user-dropdown-item {
            padding: 10px 16px;
            color: #eee;
            font-size: 0.9rem;
            cursor: pointer;
            transition: background 0.15s;
            text-align: left;
            border: none;
            background: transparent;
            font-family: inherit;
        }
        .user-dropdown-item:hover {
            background: #333;
            color: #fff;
        }
        .user-dropdown-item.danger {
            color: #ef4444;
        }
        .user-dropdown-item.danger:hover {
            background: rgba(239, 68, 68, 0.1);
        }
    `;
    document.head.appendChild(globalStyle);

    // ─── NOTIFICATION ─────────────────────────────────────────────────────────
    window.globalNotify = function(type, title, message) {
        let container = document.getElementById("notification-container");
        if (!container) {
            container = document.createElement("div");
            container.id = "notification-container";
            document.body.appendChild(container);
        }

        const typeMap = {
            'success': { class: 'alert-success', icon: '<path d="M13 16h-1v-4h1m0-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"></path>' },
            'info': { class: 'alert-info', icon: '<path d="M13 16h-1v-4h1m0-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"></path>' },
            'warning': { class: 'alert-warning', icon: '<path d="M13 16h-1v-4h1m0-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"></path>' },
            'error': { class: 'alert-error', icon: '<path d="M13 16h-1v-4h1m0-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"></path>' }
        };

        // Fallback for old calls that passed (title, message) without type
        if (!message) {
            message = title;
            title = type;
            type = 'info';
        }
        
        const config = typeMap[type] || typeMap['info'];
        const fullMessage = title && title !== message ? `${title} - ${message}` : message;

        const notif = document.createElement("div");
        notif.className = `global-alert ${config.class}`;
        notif.innerHTML = `
            <svg stroke="currentColor" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                ${config.icon}
            </svg>
            <p>${fullMessage}</p>
        `;
        
        container.appendChild(notif);
        
        // Trigger animation
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                notif.classList.add("show");
            });
        });

        setTimeout(() => {
            notif.classList.remove("show");
            notif.style.transform = "translateX(110%)";
            notif.style.opacity = "0";
            setTimeout(() => notif.remove(), 300);
        }, 4000);

        notif.addEventListener("click", () => {
            notif.classList.remove("show");
            setTimeout(() => notif.remove(), 300);
        });
    };

    // ─── ONBOARDING ──────────────────────────────────────────────────────────
    function showOnboarding() {
        return new Promise(resolve => {
            const overlay = document.createElement("div");
            overlay.id = "global-onboarding-overlay";
            overlay.style.cssText = `
                position: fixed; inset: 0; z-index: 99999;
                background: #0a0a0f;
                display: flex; align-items: center; justify-content: center;
                flex-direction: column; gap: 0;
                animation: fadeInOnboard 0.6s ease;
            `;

            overlay.innerHTML = `
                <style>
                    @keyframes fadeInOnboard { from { opacity: 0; } to { opacity: 1; } }
                    @keyframes slideUpOnboard { from { opacity:0; transform: translateY(24px); } to { opacity:1; transform: translateY(0); } }
                    #global-onboarding-overlay * { box-sizing: border-box; font-family: 'Inter', system-ui, sans-serif; }
                    #onboard-card {
                        animation: slideUpOnboard 0.5s 0.2s both;
                        background: #16161e;
                        border: 1px solid rgba(255,255,255,0.08);
                        border-radius: 20px;
                        padding: 48px 40px 40px;
                        width: 100%;
                        max-width: 420px;
                        text-align: center;
                        box-shadow: 0 24px 80px rgba(0,0,0,0.7);
                    }
                    #onboard-logo {
                        font-size: 2.8rem;
                        font-weight: 800;
                        letter-spacing: -1px;
                        color: #d17842;
                        margin-bottom: 8px;
                    }
                    #onboard-subtitle {
                        font-size: 0.92rem;
                        color: rgba(255,255,255,0.45);
                        margin-bottom: 36px;
                        line-height: 1.5;
                    }
                    #onboard-label {
                        display: block;
                        font-size: 0.8rem;
                        color: rgba(255,255,255,0.5);
                        text-align: left;
                        letter-spacing: 0.08em;
                        text-transform: uppercase;
                        margin-bottom: 10px;
                    }
                    #onboard-input {
                        width: 100%;
                        background: rgba(255,255,255,0.05);
                        border: 1px solid rgba(255,255,255,0.12);
                        border-radius: 10px;
                        color: #fff;
                        font-size: 1rem;
                        padding: 12px 16px;
                        outline: none;
                        transition: border-color 0.2s;
                        margin-bottom: 20px;
                    }
                    #onboard-input:focus { border-color: #d17842; }
                    #onboard-submit {
                        width: 100%;
                        padding: 13px;
                        border-radius: 10px;
                        border: none;
                        background: #d17842;
                        color: #fff;
                        font-size: 1rem;
                        font-weight: 600;
                        cursor: pointer;
                        transition: opacity 0.2s, transform 0.15s;
                    }
                    #onboard-submit:hover { opacity: 0.88; transform: translateY(-1px); }
                    #onboard-submit:active { transform: translateY(0); }
                </style>
                <div id="onboard-card">
                    <div id="onboard-logo">Arto</div>
                    <p id="onboard-subtitle">Workspace của bạn.<br>Chúng tôi cần biết bạn là ai.</p>
                    <label id="onboard-label" for="onboard-input">Chúng tôi nên gọi bạn là gì?</label>
                    <input id="onboard-input" type="text" placeholder="Nhập tên..." maxlength="32" autocomplete="off" />
                    <button id="onboard-submit">Bắt đầu →</button>
                </div>
            `;

            document.body.appendChild(overlay);
            document.getElementById("onboard-input").focus();

            function submit() {
                const val = document.getElementById("onboard-input").value.trim();
                if (!val) {
                    document.getElementById("onboard-input").style.borderColor = "#f87171";
                    return;
                }
                localStorage.setItem("global_username", val);
                overlay.style.opacity = "0";
                overlay.style.transition = "opacity 0.4s";
                setTimeout(() => {
                    overlay.remove();
                    resolve(val);
                }, 400);
            }

            document.getElementById("onboard-submit").addEventListener("click", submit);
            document.getElementById("onboard-input").addEventListener("keydown", e => {
                if (e.key === "Enter") submit();
            });
        });
    }

    async function initOnboarding() {
        let username = localStorage.getItem("global_username");
        if (!username) {
            username = await showOnboarding();
            setTimeout(() => window.globalNotify('success', "Chào mừng! 👋", `Xin chào ${username}, workspace của bạn đã sẵn sàng!`), 600);
        }
        
        // Inject user icon in navbar above the 'page card' button
        const navTop = document.querySelector(".navbar-top ul");
        if (navTop) {
            const li = document.createElement("li");
            li.innerHTML = `
                <div id="global-user-icon" style="display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 50%; background: #d17842; color: #fff; font-weight: bold; font-size: 1.2rem; margin-left: 15px; cursor: pointer; transition: transform 0.2s; box-shadow: 0 4px 12px rgba(209, 120, 66, 0.4);" title="${username}" onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'">${username.charAt(0).toUpperCase()}</div>
            `;
            navTop.insertBefore(li, navTop.firstChild);

            // Dropdown is appended to body so it can escape the navbar overflow
            const dropdownEl = document.createElement("div");
            dropdownEl.id = "global-user-dropdown";
            dropdownEl.className = "user-dropdown-menu";
            dropdownEl.innerHTML = `
                <button class="user-dropdown-item" id="global-menu-rename">Đổi tên</button>
                <button class="user-dropdown-item" id="global-menu-settings">Cài đặt</button>
                <button class="user-dropdown-item danger" id="global-menu-exit">Đăng xuất</button>
            `;
            document.body.appendChild(dropdownEl);

            const userIcon = document.getElementById("global-user-icon");
            const userMenu = document.getElementById("global-user-dropdown");
            const renameBtn = document.getElementById("global-menu-rename");
            const settingsBtn = document.getElementById("global-menu-settings");
            const exitBtn = document.getElementById("global-menu-exit");

            userIcon.addEventListener("click", (e) => {
                e.stopPropagation();
                const rect = userIcon.getBoundingClientRect();
                // Position dropdown vertically aligned with the icon
                userMenu.style.top = rect.top + "px";
                userMenu.classList.toggle("show");
            });

            document.addEventListener("click", (e) => {
                if (!userMenu.contains(e.target) && e.target !== userIcon) {
                    userMenu.classList.remove("show");
                }
            });

            renameBtn.addEventListener("click", async () => {
                userMenu.classList.remove("show");
                const newName = await showOnboarding();
                userIcon.innerText = newName.charAt(0).toUpperCase();
                userIcon.title = newName;
                window.globalNotify('success', "Thành công", `Đã đổi tên thành ${newName}`);
            });

            settingsBtn.addEventListener("click", () => {
                userMenu.classList.remove("show");
                // Trigger the existing settings logic (usually opening #settings-panel)
                const settingsPanel = document.getElementById("settings-panel");
                if (settingsPanel) {
                    settingsPanel.classList.remove("settings-panel-hidden");
                }
            });

            exitBtn.addEventListener("click", () => {
                if(confirm("Bạn có chắc chắn muốn đăng xuất? Tên của bạn sẽ bị xóa.")) {
                    localStorage.removeItem("global_username");
                    location.reload();
                }
            });
        }
    }

    // ─── GLOBAL EXPORT ────────────────────────────────────────────────────────
    async function downloadGlobalData() {
        try {
            window.globalNotify('info', "Đang xuất dữ liệu...", "Vui lòng chờ, đang thu thập dữ liệu.");

            const backup = {
                _version: 2,
                _exportedAt: new Date().toISOString(),
                _id: generateUUID(),
                localStorage: {},
                indexedDB: {},
                largeFiles: {}
            };

            // 1. Dump all localStorage
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                backup.localStorage[key] = localStorage.getItem(key);
            }

            // 2. Dump MindmapDB (Elements) - all keys
            try {
                const mindmapKeys = await idbGetAllKeys(MINDMAP_DB, MINDMAP_VER, MINDMAP_STORE);
                backup.indexedDB.mindmap = {};
                for (const key of mindmapKeys) {
                    backup.indexedDB.mindmap[key] = await idbGet(MINDMAP_DB, MINDMAP_VER, MINDMAP_STORE, key);
                }
            } catch (e) { backup.indexedDB.mindmap = null; }

            // 3. Dump large files (video/gif) from ArtoStorageDB - convert Blob to Base64
            try {
                const fileKeys = await idbGetAllKeys(LARGE_FILE_DB, LARGE_FILE_VER, LARGE_FILE_STORE);
                for (const key of fileKeys) {
                    const blob = await idbGet(LARGE_FILE_DB, LARGE_FILE_VER, LARGE_FILE_STORE, key);
                    if (blob instanceof Blob) {
                        const base64 = await blobToBase64(blob);
                        const fileId = generateUUID();
                        backup.largeFiles[key] = { id: fileId, type: blob.type, data: base64 };
                    }
                }
            } catch (e) { /* No large files */ }

            const json = JSON.stringify(backup);
            const blob = new Blob([json], { type: "application/json" });
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement("a");
            a.href     = url;
            a.download = `arto_workspace_${new Date().toISOString().slice(0,10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            setTimeout(() => window.globalNotify('success', "Xuất thành công ✅", "File backup đã được tải xuống."), 800);
        } catch (err) {
            window.globalNotify('error', "Lỗi xuất dữ liệu", err.message);
            console.error(err);
        }
    }

    // ─── GLOBAL IMPORT ────────────────────────────────────────────────────────
    async function importGlobalData(file) {
        const reader = new FileReader();
        reader.onload = async e => {
            try {
                const backup = JSON.parse(e.target.result);

                const confirmed = confirm(
                    `📦 Tìm thấy backup từ ${backup._exportedAt ? new Date(backup._exportedAt).toLocaleString() : "không rõ"}.\n\nImport sẽ GHI ĐÈ toàn bộ dữ liệu hiện tại. Bạn có chắc chắn không?`
                );
                if (!confirmed) return;

                window.globalNotify('warning', "Đang import...", "Vui lòng không đóng trang.");

                // 1. Restore localStorage
                if (backup.localStorage) {
                    localStorage.clear();
                    for (const [key, val] of Object.entries(backup.localStorage)) {
                        localStorage.setItem(key, val);
                    }
                }

                // 2. Restore MindmapDB
                if (backup.indexedDB && backup.indexedDB.mindmap) {
                    for (const [key, val] of Object.entries(backup.indexedDB.mindmap)) {
                        await idbSet(MINDMAP_DB, MINDMAP_VER, MINDMAP_STORE, key, val);
                    }
                }

                // 3. Restore large files - decode Base64 back to Blob
                if (backup.largeFiles) {
                    for (const [originalKey, fileInfo] of Object.entries(backup.largeFiles)) {
                        try {
                            const blob = await base64ToBlob(fileInfo.data);
                            await idbSet(LARGE_FILE_DB, LARGE_FILE_VER, LARGE_FILE_STORE, originalKey, blob);
                        } catch (blobErr) {
                            console.warn("Failed to restore large file:", originalKey, blobErr);
                        }
                    }
                }

                window.globalNotify('success', "Import thành công ✅", "Đang tải lại trang...");
                setTimeout(() => location.reload(), 1200);

            } catch (err) {
                window.globalNotify('error', "Lỗi import", "File JSON không hợp lệ: " + err.message);
                console.error(err);
            }
        };
        reader.readAsText(file);
    }

    // ─── BIND DOWNLOAD / UPLOAD BUTTONS ───────────────────────────────────────
    function bindGlobalSyncButtons() {
        const downloadBtn    = document.getElementById("download-cards-btn");
        const uploadTrigger  = document.getElementById("upload-cards-trigger");
        const uploadInput    = document.getElementById("upload-cards-input");

        if (downloadBtn) {
            const newDownload = downloadBtn.cloneNode(true);
            downloadBtn.parentNode.replaceChild(newDownload, downloadBtn);
            newDownload.addEventListener("click", e => {
                e.preventDefault();
                downloadGlobalData();
            });
        }

        if (uploadTrigger) {
            const newTrigger = uploadTrigger.cloneNode(true);
            uploadTrigger.parentNode.replaceChild(newTrigger, uploadTrigger);
            newTrigger.addEventListener("click", e => {
                e.preventDefault();
                const currentInput = document.getElementById("upload-cards-input");
                if (currentInput) currentInput.click();
            });
        }

        if (uploadInput) {
            const newInput = uploadInput.cloneNode(true);
            uploadInput.parentNode.replaceChild(newInput, uploadInput);
            newInput.addEventListener("change", e => {
                const file = e.target.files[0];
                if (!file) return;
                importGlobalData(file);
                e.target.value = "";
            });
        }
    }

    // ─── FLOATING TOOLBAR LIVE TRACKING ───────────────────────────────────────
    // canvas.js calls window.__updateFloatingToolbar() after calling its own update
    // This is a shim so global.js can trigger canvas's toolbar from outside
    window.__globalFloatingToolbarRAF = null;

    // ─── INIT ─────────────────────────────────────────────────────────────────
    document.addEventListener("DOMContentLoaded", () => {
        initOnboarding();
        bindGlobalSyncButtons();
    });

    // Expose for canvas.js to use if needed
    window.globalSync = { downloadGlobalData, importGlobalData };

})();
