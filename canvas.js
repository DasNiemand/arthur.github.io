document.addEventListener("DOMContentLoaded", function () {

    // ------------------------------------------
    // 0. NOTIFICATIONS (Uiverse.io inspired)
    // ------------------------------------------
    function showNotification(title, message) {
        const container = document.getElementById("notification-container");
        if (!container) return;

        // Get web icon (main card icon)
        let iconSrc = getActiveMainCardIcon();
        if (iconSrc === "default") iconSrc = "icon-main.png";

        const notif = document.createElement("div");
        notif.className = "notif-card";
        notif.innerHTML = `
            <div class="notif-img" style="background-image: url('${iconSrc}')"></div>
            <div class="notif-text-box">
                <div class="notif-text-content">
                    <p class="notif-title">${title}</p>
                    <span class="notif-time">Just now</span>
                </div>
                <p class="notif-message">${message}</p>
            </div>
        `;

        console.log("Showing notification:", title, message);
        container.appendChild(notif);

        // Auto remove
        setTimeout(() => {
            notif.style.transform = "translateY(-150%)";
            notif.style.opacity = "0";
            setTimeout(() => notif.remove(), 500);
        }, 4000);
        
        notif.addEventListener("click", () => notif.remove());
    }

    // ------------------------------------------
    // 1. DOM REFERENCES
    // ------------------------------------------
    const mainContentArea = document.getElementById("main-content-area");
    const navLinks = document.querySelectorAll(".nav-link");
    const modalOverlay = document.getElementById("url-modal");
    const modalAddBtn = document.getElementById("modal-add-btn");
    const modalUrlInput = document.getElementById("modal-url-input");
    const downloadCardsBtn = document.getElementById("download-cards-btn");
    const uploadCardsTrigger = document.getElementById("upload-cards-trigger");
    const uploadCardsInput = document.getElementById("upload-cards-input");
    const backgroundVideo = document.getElementById("backgroundVideo");
    const openSettingsBtn = document.getElementById("open-settings-btn");
    const settingsPanel = document.getElementById("settings-panel");
    const closeSettingsBtn = document.getElementById("close-settings-btn");

    let cardWrapper = document.getElementById("card-wrapper");
    let addCardBtn = document.getElementById("add-new-card");
    let draggedCard = null;
    let isInitialLoad = true;

    const initialCardStructure = `
        <div class="card-container">
            <div id="card-wrapper">
                <a id="add-new-card" class="card add-new-card"></a>
            </div>
        </div>
    `;

    // URL Icon Mapping logic removed.

    // ------------------------------------------
    // 3. SETTINGS STORAGE HELPERS
    // ------------------------------------------
    function getSetting(key, defaultVal) {
        const v = localStorage.getItem("setting_" + key);
        return v !== null ? JSON.parse(v) : defaultVal;
    }
    function setSetting(key, val) {
        try {
            localStorage.setItem("setting_" + key, JSON.stringify(val));
        } catch (e) {
            if (e.name === "QuotaExceededError") {
                showNotification("Lỗi bộ nhớ", "Dung lượng LocalStorage đã đầy.");
            }
        }
    }

    // --- IndexedDB for Large Files (Background Video/GIF) ---
    const DB_NAME = "ArtoStorageDB";
    const DB_VERSION = 1;
    const STORE_NAME = "backgrounds";

    function openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME);
                }
            };
            request.onsuccess = (e) => resolve(e.target.result);
            request.onerror = (e) => reject(e.target.error);
        });
    }

    async function saveLargeFile(key, file) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, "readwrite");
            const store = tx.objectStore(STORE_NAME);
            const request = store.put(file, key);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async function getLargeFile(key) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, "readonly");
            const store = tx.objectStore(STORE_NAME);
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async function deleteLargeFile(key) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, "readwrite");
            const store = tx.objectStore(STORE_NAME);
            const request = store.delete(key);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // Custom card icons pool (base64 strings)
    function getCustomCardIcons() {
        return getSetting("custom_card_icons", []);
    }
    function saveCustomCardIcons(arr) {
        setSetting("custom_card_icons", arr);
    }

    function getHiddenIcons() {
        return getSetting("hidden_icons", []);
    }
    function saveHiddenIcons(arr) {
        setSetting("hidden_icons", arr);
    }

    // Custom main card icons pool (base64 strings)
    function getCustomMainCardIcons() {
        return getSetting("custom_main_card_icons", []);
    }
    function saveCustomMainCardIcons(arr) {
        setSetting("custom_main_card_icons", arr);
    }

    // Active main card icon (index or "default")
    function getActiveMainCardIcon() {
        return getSetting("active_main_card_icon", "default");
    }
    function setActiveMainCardIcon(val) {
        setSetting("active_main_card_icon", val);
    }

    // ------------------------------------------
    // 4. SUIT IMAGES (built-in + custom)
    // ------------------------------------------
    const BUILTIN_SUIT_IMAGES = [
        "cardc1.png","cardc2.png","cardc3.png","cardc4.png",
        "cardc5.png","cardc6.png","cardc7.png","cardc8.png",
        "cardc9.png","cardc10.png","cardc11.png","cardc12.png",
    ];

    function getAllSuitImages(includeHidden = true) {
        const custom = getCustomCardIcons();
        const hidden = getHiddenIcons();
        const all = BUILTIN_SUIT_IMAGES.concat(custom);
        if (includeHidden) return all;
        return all.filter(s => !hidden.includes(s));
    }

    // ------------------------------------------
    // 5. BACKGROUND SETTINGS INIT
    // ------------------------------------------
    async function applyBackgroundSettings() {
        const mode = getSetting("bg_mode", "video");
        const brightness = getSetting("bg_brightness", 25);
        const speed = getSetting("bg_speed", 0.5);
        
        let customSrc = null;
        const fileBlob = await getLargeFile("bg_custom_file");
        if (fileBlob) {
            customSrc = URL.createObjectURL(fileBlob);
        } else {
            customSrc = getSetting("bg_custom_src", null);
        }
        
        const colors = getSetting("bg_colors", ["#1a1a1a", "#333333"]);
        const angle = getSetting("bg_color_angle", 45);

        const dotBgColor = getSetting("bg_dot_bg_color", "#313131");
        const dotColor = getSetting("bg_dot_color", "#ffffff");
        const dotOpacity = getSetting("bg_dot_opacity", 17);
        const dotSize = getSetting("bg_dot_size", 30);

        const video = document.getElementById("backgroundVideo");
        const prevVideo = document.getElementById("bg-preview-video");
        const prevGif = document.getElementById("bg-preview-gif");
        const dotBg = document.getElementById("dot-background");
        const dotPreview = document.getElementById("bg-dot-preview");
        
        let colorBg = document.getElementById("color-background");
        if (!colorBg) {
            colorBg = document.createElement("div");
            colorBg.id = "color-background";
            colorBg.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;z-index:-1;`;
            document.body.insertBefore(colorBg, document.body.firstChild);
        }

        // Helper
        const hexToRgb = (h) => {
            let hex = h.replace('#', '');
            if(hex.length===3) hex = hex.split('').map(x=>x+x).join('');
            return `${parseInt(hex.substring(0,2),16)}, ${parseInt(hex.substring(2,4),16)}, ${parseInt(hex.substring(4,6),16)}`;
        };

        if (mode === "dot") {
            if (video) video.style.display = "none";
            if (prevVideo) prevVideo.style.display = "none";
            if (prevGif) prevGif.style.display = "none";
            const gifBg = document.getElementById("gif-background");
            if (gifBg) gifBg.style.display = "none";
            colorBg.style.display = "none";
            
            if (dotBg) {
                dotBg.style.display = "block";
                dotBg.style.backgroundColor = dotBgColor;
                dotBg.style.backgroundImage = `radial-gradient(rgba(${hexToRgb(dotColor)}, ${dotOpacity/100}) 2px, transparent 0)`;
                dotBg.style.backgroundSize = `${dotSize}px ${dotSize}px`;
            }
            if (dotPreview) {
                dotPreview.style.backgroundColor = dotBgColor;
                dotPreview.style.backgroundImage = `radial-gradient(rgba(${hexToRgb(dotColor)}, ${dotOpacity/100}) 2px, transparent 0)`;
                dotPreview.style.backgroundSize = `${dotSize}px ${dotSize}px`;
            }
        } else if (mode === "color") {
            if (video) video.style.display = "none";
            if (prevVideo) prevVideo.style.display = "none";
            if (prevGif) prevGif.style.display = "none";
            const gifBg = document.getElementById("gif-background");
            if (gifBg) gifBg.style.display = "none";
            if (dotBg) dotBg.style.display = "none";
            
            const grad = `linear-gradient(${angle}deg, ${colors.join(', ')})`;
            colorBg.style.display = "block";
            colorBg.style.background = grad;
            
            const p = document.getElementById("bg-color-preview");
            if (p) p.style.background = grad;
        } else {
            colorBg.style.display = "none";
            if (dotBg) dotBg.style.display = "none";
            const updateEl = (el, isMain) => {
                if (!el) return;
                el.style.filter = `brightness(${brightness}%)`;
                if (el.tagName === "VIDEO") el.playbackRate = speed;
            };

            updateEl(video, true);
            updateEl(prevVideo, false);
            if (prevGif) prevGif.style.filter = `brightness(${brightness}%)`;

            if (customSrc && customSrc !== "default") {
                const isVideo = (fileBlob && fileBlob.type.startsWith("video")) || (typeof customSrc === "string" && customSrc.startsWith("data:video"));
                const isImage = (fileBlob && fileBlob.type.startsWith("image")) || (typeof customSrc === "string" && customSrc.startsWith("data:image"));

                if (isVideo) {
                    if (video) {
                        video.style.display = "block";
                        const s = video.querySelector("source");
                        if (s && s.src !== customSrc) { s.src = customSrc; video.load(); video.play(); }
                    }
                    if (prevVideo) {
                        prevVideo.style.display = "block";
                        const s = prevVideo.querySelector("source");
                        if (s && s.src !== customSrc) { s.src = customSrc; prevVideo.load(); prevVideo.play(); }
                    }
                    if (prevGif) prevGif.style.display = "none";
                    const g = document.getElementById("gif-background");
                    if (g) g.style.display = "none";
                } else if (isImage) {
                    if (video) video.style.display = "none";
                    if (prevVideo) prevVideo.style.display = "none";
                    if (prevGif) {
                        prevGif.style.display = "block";
                        prevGif.style.backgroundImage = `url(${customSrc})`;
                    }
                    let gifBg = document.getElementById("gif-background");
                    if (!gifBg) {
                        gifBg = document.createElement("div");
                        gifBg.id = "gif-background";
                        gifBg.style.cssText = `position:fixed;top:0;right:0;width:100%;height:100%;background:rgba(12, 12, 12, 0.98);background-size:cover;background-position:center;z-index:0;`;
                        document.body.appendChild(gifBg);
                    }
                    gifBg.style.display = "block";
                    gifBg.style.backgroundImage = `url(${customSrc})`;
                    gifBg.style.filter = `brightness(${brightness}%)`;
                }
            } else {
                if (video) {
                    video.style.display = "block";
                    const s = video.querySelector("source");
                    if (s && !s.src.endsWith("bg.mp4")) { s.src = "bg.mp4"; video.load(); video.play(); }
                }
                if (prevVideo) {
                    prevVideo.style.display = "block";
                    const s = prevVideo.querySelector("source");
                    if (s && !s.src.endsWith("bg.mp4")) { s.src = "bg.mp4"; prevVideo.load(); prevVideo.play(); }
                }
                if (prevGif) prevGif.style.display = "none";
                const g = document.getElementById("gif-background");
                if (g) g.style.display = "none";
            }
        }
    }

    applyBackgroundSettings();

    // ------------------------------------------
    // 6. MAIN CARD ICON INIT
    // ------------------------------------------
    function applyMainCardIcon() {
        const active = getActiveMainCardIcon();
        if (!addCardBtn) return;
        if (active === "default") {
            addCardBtn.style.backgroundImage = "url('maincard.png')";
        } else {
            addCardBtn.style.backgroundImage = `url(${active})`;
        }
    }

    // ------------------------------------------
    // 7. SAVE / LOAD CARDS
    // ------------------------------------------
    function saveCards() {
        if (!cardWrapper) return;
        const cards = [];
        Array.from(cardWrapper.children)
            .filter(c => c.id !== "add-new-card")
            .forEach(card => {
                cards.push({
                    url: card.href,
                    suitIndex: card.getAttribute("data-suit-index")
                        ? parseInt(card.getAttribute("data-suit-index")) : null,
                    customIcon: card.getAttribute("data-custom-icon") || null
                });
            });
        localStorage.setItem("cards_blank", JSON.stringify(cards));
    }

    function loadCards() {
        if (!cardWrapper) return;
        Array.from(cardWrapper.children)
            .filter(c => c.id !== "add-new-card")
            .forEach(c => c.remove());
        const savedCards = JSON.parse(localStorage.getItem("cards_blank"));
        if (savedCards) {
            savedCards.forEach(cardData => {
                // Pass null for suitIndex to force random selection on reload
                createCard(cardData.url, false, null, cardData.customIcon || null);
            });
        }
    }

    // ------------------------------------------
    // 8. CREATE CARD
    // ------------------------------------------
    function createCard(url, shouldSave = true, forcedSuitIndex = null, customIcon = null) {
        if (!url || !url.startsWith("http")) {
            if (shouldSave) return;
        }

        const newCard = document.createElement("a");
        newCard.className = "card is-new";
        newCard.href = url;
        newCard.target = "_self";
        newCard.setAttribute("draggable", "true");
        if (customIcon) newCard.setAttribute("data-custom-icon", customIcon);

        let domainName, firstLetter = "", remainingDomainName = "";
        try {
            const fullDomain = new URL(url).hostname;
            domainName = fullDomain.startsWith("www.") ? fullDomain.substring(4) : fullDomain;
            domainName = domainName.replace(/\.[^/.]+$/, "");
            firstLetter = domainName.charAt(0).toUpperCase();
            remainingDomainName = domainName.substring(1).toUpperCase();
            newCard.setAttribute("data-initial", firstLetter);
        } catch (e) {
            domainName = url;
            firstLetter = "?";
            remainingDomainName = url;
            newCard.setAttribute("data-initial", firstLetter);
        }

        // Filter out hidden icons for random selection
        const allSuits = getAllSuitImages(false);
        const suitIndex = (forcedSuitIndex !== null && forcedSuitIndex < allSuits.length)
            ? forcedSuitIndex
            : Math.floor(Math.random() * allSuits.length);
        const suitImage = allSuits[suitIndex];
        // We store the image SRC instead of index to be safer when items are hidden/deleted
        newCard.setAttribute("data-suit-src", suitImage);

        // Check for custom icon
        const finalIcon = customIcon;
        if (finalIcon) newCard.setAttribute("data-custom-icon", finalIcon);

        // Favicon / Custom Icon logic
        const faviconHtml = finalIcon
            ? `<div class="card-favicon" style="background-image:url('${finalIcon}')"></div>`
            : "";

        newCard.innerHTML = `
            <span class="card-initial-top-left">${firstLetter}</span>
            <span class="card-initial-bottom-right">${firstLetter}</span>
            <div class="card-border"></div>
            <span class="card-title">${remainingDomainName}</span>
            <span class="card-title1">${remainingDomainName}</span>
            <div class="card-center-suit" style="background-image:url('${suitImage}');"></div>
            ${faviconHtml}
        `;

        const removeBtn = document.createElement("button");
        removeBtn.className = "card-remove-btn";
        removeBtn.textContent = "";
        removeBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            newCard.classList.add("is-deleting");
            newCard.addEventListener("animationend", () => {
                newCard.remove();
                saveCards();
            }, { once: true });
        });
        newCard.appendChild(removeBtn);

        newCard.addEventListener("animationend", () => {
            newCard.classList.remove("is-new");
        }, { once: true });

        addDragListeners(newCard);
        addVideoHoverListeners(newCard);

        cardWrapper.insertBefore(newCard, addCardBtn);
        if (shouldSave) {
            console.log("Saving cards after creation...");
            saveCards();
        }
    }

    // ------------------------------------------
    // CLIPBOARD LOGIC
    // ------------------------------------------
    let clipboard = [];

    function copySelectedElements() {
        if (selectedElements.length === 0) return;
        clipboard = selectedElements.map(el => ({
            type: el.dataset.type,
            content: el.querySelector(".content-wrapper") ? el.querySelector(".content-wrapper").innerHTML : el.innerHTML,
            width: el.style.width,
            height: el.style.height,
            bg: el.style.backgroundColor,
            x: parseFloat(el.dataset.x),
            y: parseFloat(el.dataset.y)
        }));
    }

    function pasteElements() {
        if (clipboard.length === 0) return;
        
        // Clear selection before pasting new ones
        selectedElements.forEach(el => el.classList.remove("selected"));
        selectedElements = [];

        clipboard.forEach(data => {
            const offset = 20; // Slight offset for pasted elements
            const newX = data.x + offset;
            const newY = data.y + offset;
            
            if (data.type === "sticky") {
                const note = createStickyNote(newX, newY, data.content, Date.now().toString() + Math.random(), data.width, data.height, data.bg);
                note.classList.add("selected");
                selectedElements.push(note);
            } else if (data.type === "image") {
                const temp = document.createElement('div');
                temp.innerHTML = data.content;
                const img = temp.querySelector('img');
                if (img) {
                    const note = createImageNote(newX, newY, img.src, Date.now().toString() + Math.random(), data.width, data.height);
                    note.classList.add("selected");
                    selectedElements.push(note);
                }
            }
        });
        
        saveMindmap();
    }
    const HOVER_BRIGHTNESS = "brightness(25%)";
    const DEFAULT_BRIGHTNESS = `brightness(${getSetting("bg_brightness", 25)}%)`;
    const BG_TRANSITION = "filter 0.5s ease-in-out";

    function addVideoHoverListeners(el) {
        if (el.id === "add-new-card" || !backgroundVideo) return;
        el.addEventListener("mouseover", () => {
            backgroundVideo.style.filter = HOVER_BRIGHTNESS;
            backgroundVideo.style.transition = BG_TRANSITION;
        });
        el.addEventListener("mouseout", () => {
            const br = getSetting("bg_brightness", 25);
            backgroundVideo.style.filter = `brightness(${br}%)`;
        });
    }

    function addDragListeners(el) {
        if (el.id === "add-new-card") return;
        el.addEventListener("dragstart", e => {
            draggedCard = el;
            el.classList.add("is-dragging");
            e.dataTransfer.effectAllowed = "move";
            // Allow card to be dragged to trash can
            e.dataTransfer.setData("text/plain", "card|" + el.href);
            if (cardWrapper) cardWrapper.classList.add("dragging");
        });
        el.addEventListener("dragend", () => {
            draggedCard = null;
            el.classList.remove("is-dragging");
            if (cardWrapper) cardWrapper.classList.remove("dragging");
            saveCards();
        });
        el.addEventListener("dragover", e => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
        });
        el.addEventListener("drop", e => {
            e.preventDefault();
            if (draggedCard && draggedCard !== el && cardWrapper) {
                const cards = Array.from(cardWrapper.children).filter(c => c.id !== "add-new-card");
                const di = cards.indexOf(draggedCard);
                const ti = cards.indexOf(el);
                if (di < ti) cardWrapper.insertBefore(draggedCard, el.nextSibling);
                else cardWrapper.insertBefore(draggedCard, el);
            }
        });
    }

    // ------------------------------------------
    // 10. MODAL
    // ------------------------------------------
    function setupModalListeners() {
        if (addCardBtn) {
            const clone = addCardBtn.cloneNode(true);
            addCardBtn.replaceWith(clone);
            addCardBtn = clone;
            addCardBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                if (modalOverlay) {
                    modalOverlay.classList.remove("url-input-hidden");
                    modalUrlInput.value = "";
                    modalUrlInput.focus();
                }
            });
            applyMainCardIcon();
        }
    }
    setupModalListeners();

    if (modalOverlay) {
        document.addEventListener("click", e => {
            if (!modalOverlay.classList.contains("url-input-hidden")) {
                if (!modalOverlay.contains(e.target) && e.target !== addCardBtn && !addCardBtn.contains(e.target)) {
                    modalOverlay.classList.add("url-input-hidden");
                }
            }
        });
    }
    if (modalAddBtn) {
        modalAddBtn.addEventListener("click", () => {
            const url = modalUrlInput.value.trim();
            if (url) {
                if (cardWrapper) {
                    createCard(url, true);
                    modalOverlay.classList.add("url-input-hidden");
                } else {
                    showNotification("Lỗi", "Vui lòng chuyển về Trang A để thêm thẻ.");
                }
            } else {
                showNotification("Thông báo", "Vui lòng nhập địa chỉ URL.");
            }
        });
    }
    if (modalUrlInput) {
        modalUrlInput.addEventListener("keypress", e => {
            if (e.key === "Enter") modalAddBtn.click();
        });
    }

    // ------------------------------------------
    // INDEXEDDB MANAGER (For larger storage)
    // ------------------------------------------
    const dbName = "MindmapDB";
    const storeName = "Elements";
    let db = null;

    function initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(dbName, 1);
            request.onupgradeneeded = (e) => {
                const dbInst = e.target.result;
                if (!dbInst.objectStoreNames.contains(storeName)) {
                    dbInst.createObjectStore(storeName);
                }
            };
            request.onsuccess = (e) => {
                db = e.target.result;
                resolve(db);
            };
            request.onerror = (e) => reject(e);
        });
    }

    async function dbSet(key, val) {
        if (!db) await initDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, "readwrite");
            const store = tx.objectStore(storeName);
            const request = store.put(val, key);
            request.onsuccess = () => {
                resolve();
            };
            request.onerror = () => {
                console.error("[DB] dbSet error for key:", key, request.error);
                reject(request.error);
            };
        });
    }

    async function dbGet(key) {
        if (!db) await initDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, "readonly");
            const store = tx.objectStore(storeName);
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // Initialize Canvas & Legacy Data
    window.addEventListener("DOMContentLoaded", async () => {
        const crtCheckbox = document.getElementById("crt-checkbox");
        const crtOverlay = document.getElementById("crt-overlay");
        const savedMode = localStorage.getItem("crt_mode");
        if (savedMode === "on" && crtOverlay) crtOverlay.style.display = "block";
        if (savedMode === "on" && crtCheckbox) crtCheckbox.checked = true;

        if (crtCheckbox) {
            crtCheckbox.addEventListener("change", (e) => {
                if (e.target.checked) {
                    crtOverlay.style.display = "block";
                    localStorage.setItem("crt_mode", "on");
                } else {
                    crtOverlay.style.display = "none";
                    localStorage.setItem("crt_mode", "off");
                }
            });
        }

        // ------------------------------------------
        // 11. DOWNLOAD / UPLOAD
        // ------------------------------------------
        if (downloadCardsBtn) {
            downloadCardsBtn.addEventListener("click", async (e) => {
                e.preventDefault();
                const mindmapElements = await dbGet("blank_mindmap_elements");
                const drawingsData = localStorage.getItem("blank_mindmap_drawings");
                if (!mindmapElements && !drawingsData) { showNotification("Lỗi", "Không có dữ liệu."); return; }
                
                const backup = {
                    mindmap_elements: mindmapElements || [],
                    drawings: drawingsData ? JSON.parse(drawingsData) : null
                };
                
                const blob = new Blob([JSON.stringify(backup)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url; a.download = "mindmap_backup.json";
                document.body.appendChild(a); a.click();
                document.body.removeChild(a); URL.revokeObjectURL(url);
            });
        }
        if (uploadCardsTrigger) {
            uploadCardsTrigger.addEventListener("click", e => {
                e.preventDefault(); uploadCardsInput.click();
            });
        }
        if (uploadCardsInput) {
            uploadCardsInput.addEventListener("change", e => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = async ev => {
                    try {
                        const uploaded = JSON.parse(ev.target.result);
                        if (uploaded.mindmap_elements || uploaded.drawings || uploaded.mindmap) {
                            if (uploaded.mindmap_elements) {
                                await dbSet("blank_mindmap_elements", uploaded.mindmap_elements);
                            } else if (uploaded.mindmap) { // Legacy backup
                                await dbSet("blank_mindmap_elements", uploaded.mindmap);
                            }
                            if (uploaded.drawings) {
                                localStorage.setItem("blank_mindmap_drawings", JSON.stringify(uploaded.drawings));
                            }
                            showNotification("Thành công", "Đã khôi phục dữ liệu thành công!");
                            setTimeout(() => location.reload(), 1000); // Reload to apply the mindmap
                        } else throw new Error("Dữ liệu không hợp lệ.");
                    } catch (err) { showNotification("Lỗi", err.message); }
                    e.target.value = ""; // Reset input so same file can be uploaded again
                };
                reader.readAsText(file);
            });
        }
    });

    // ------------------------------------------
    // 12. SETTINGS PANEL
    // ------------------------------------------
    if (openSettingsBtn) {
        openSettingsBtn.addEventListener("click", () => {
            settingsPanel.classList.toggle("settings-panel-hidden");
            if (!settingsPanel.classList.contains("settings-panel-hidden")) {
                renderCardIconsGrid();
                renderMainCardIconsGrid();
                syncSettingsUI();
            }
        });
    }
    if (closeSettingsBtn) {
        closeSettingsBtn.addEventListener("click", () => {
            settingsPanel.classList.add("settings-panel-hidden");
        });
    }

    // Drag & Drop Deletion (Trash Can)
    const trashCan = document.getElementById("delete-all-icons-btn");
    if (trashCan) {
        trashCan.addEventListener("dragover", e => {
            e.preventDefault();
            trashCan.classList.add("drag-over");
        });
        trashCan.addEventListener("dragenter", e => {
            e.preventDefault();
            trashCan.classList.add("drag-over");
        });
        trashCan.addEventListener("dragleave", () => {
            trashCan.classList.remove("drag-over");
        });
        trashCan.addEventListener("drop", e => {
            e.preventDefault();
            trashCan.classList.remove("drag-over");
            
            const raw = e.dataTransfer.getData("text/plain");
            if (!raw || !raw.includes("|")) return;

            const splitIdx = raw.indexOf("|");
            const type = raw.substring(0, splitIdx);
            const src = raw.substring(splitIdx + 1);

            if (src && type) {
                if (type === "random") {
                    const current = getCustomCardIcons();
                    if (current.includes(src)) {
                        const updated = current.filter(s => s !== src);
                        saveCustomCardIcons(updated);
                        renderCardIconsGrid();
                        showNotification("Thành công", "Đã xóa icon khỏi danh sách.");
                    } else if (BUILTIN_SUIT_IMAGES.includes(src)) {
                        // "Delete" built-in icon by hiding it
                        let hidden = getHiddenIcons();
                        if (!hidden.includes(src)) {
                            hidden.push(src);
                            saveHiddenIcons(hidden);
                            renderCardIconsGrid();
                            showNotification("Hệ thống", "Đã ẩn icon mặc định.");
                        }
                    }
                } else if (type === "main") {
                    const current = getCustomMainCardIcons();
                    if (current.includes(src)) {
                        const updated = current.filter(s => s !== src);
                        saveCustomMainCardIcons(updated);
                        if (getActiveMainCardIcon() === src) {
                            setActiveMainCardIcon("default");
                            applyMainCardIcon();
                        }
                        renderMainCardIconsGrid();
                        showNotification("Thành công", "Đã xóa icon chính.");
                    }
                } else if (type === "card") {
                    // Delete a card
                    const cards = Array.from(document.querySelectorAll("#card-wrapper .card:not(.add-new-card)"));
                    const target = cards.find(c => c.href === src);
                    if (target) {
                        target.classList.add("is-deleting");
                        target.addEventListener("animationend", () => {
                            target.remove();
                            saveCards();
                            showNotification("Thành công", "Đã xóa thẻ.");
                        }, { once: true });
                    }
                }
            }
        });
        
        // Disable the old click-to-delete-all logic if preferred, 
        // or keep it as a fallback. User said "kéo vào để xóa", so I'll disable click.
        trashCan.addEventListener("click", (e) => {
            e.preventDefault();
            showNotification("Hướng dẫn", "Hãy kéo thả icon vào đây để xóa!");
        });
    }

    function syncSettingsUI() {
        const mode = getSetting("bg_mode", "video");
        const br = getSetting("bg_brightness", 25);
        const sp = getSetting("bg_speed", 0.5);
        const colors = getSetting("bg_colors", ["#1a1a1a", "#333333"]);
        const angle = getSetting("bg_color_angle", 45);

        const brSlider = document.getElementById("bg-brightness-slider");
        const spSlider = document.getElementById("bg-speed-slider");
        const brVal = document.getElementById("bg-brightness-val");
        const spVal = document.getElementById("bg-speed-val");
        if (brSlider) { brSlider.value = br; brVal.textContent = br; }
        if (spSlider) { spSlider.value = sp; spVal.textContent = sp; }

        const angleSlider = document.getElementById("bg-color-angle");
        const angleVal = document.getElementById("bg-color-angle-val");
        if(angleSlider && angleVal) { angleSlider.value = angle; angleVal.textContent = angle; }
        
        const dynamicList = document.getElementById("dynamic-color-list");
        if (dynamicList) {
            dynamicList.innerHTML = "";
            colors.forEach((col, idx) => {
                const row = document.createElement("div");
                row.className = "settings-row";
                row.innerHTML = `
                    <label>Màu ${idx + 1}</label>
                    <div style="display: flex; gap: 5px;">
                        <input type="color" value="${col}" data-idx="${idx}" class="dynamic-color-input" style="cursor: pointer; width: 40px; height: 40px; border: none; padding: 0; border-radius: 5px; background: transparent;">
                        ${colors.length > 2 ? `<button class="settings-btn color-remove-btn" data-idx="${idx}" style="background-color: #ff4d4d; color: white;">Xóa</button>` : ''}
                    </div>
                `;
                dynamicList.appendChild(row);
            });

            document.querySelectorAll(".dynamic-color-input").forEach(inp => {
                inp.addEventListener("input", (e) => {
                    const id = parseInt(e.target.getAttribute("data-idx"));
                    colors[id] = e.target.value;
                    setSetting("bg_colors", colors);
                    applyBackgroundSettings();
                });
            });

            document.querySelectorAll(".color-remove-btn").forEach(btn => {
                btn.addEventListener("click", (e) => {
                    const id = parseInt(e.target.getAttribute("data-idx"));
                    colors.splice(id, 1);
                    setSetting("bg_colors", colors);
                    syncSettingsUI();
                    applyBackgroundSettings();
                });
            });
        }

        const btnVideo = document.getElementById("bg-mode-video-btn");
        const btnColor = document.getElementById("bg-mode-color-btn");
        const btnDot = document.getElementById("bg-mode-dot-btn");
        const vidControls = document.getElementById("bg-video-controls");
        const colControls = document.getElementById("bg-color-controls");
        const dotControls = document.getElementById("bg-dot-controls");
        
        if (btnVideo && btnColor && btnDot && vidControls && colControls && dotControls) {
            btnVideo.style.backgroundColor = mode === "video" ? "#333" : "transparent";
            btnVideo.style.color = mode === "video" ? "#fff" : "";
            btnColor.style.backgroundColor = mode === "color" ? "#333" : "transparent";
            btnColor.style.color = mode === "color" ? "#fff" : "";
            btnDot.style.backgroundColor = mode === "dot" ? "#333" : "transparent";
            btnDot.style.color = mode === "dot" ? "#fff" : "";
            
            vidControls.style.display = mode === "video" ? "flex" : "none";
            colControls.style.display = mode === "color" ? "flex" : "none";
            dotControls.style.display = mode === "dot" ? "flex" : "none";
        }

        const dotBgColor = document.getElementById("bg-dot-bg-color");
        const dotColor = document.getElementById("bg-dot-color");
        const dotOpacitySlider = document.getElementById("bg-dot-opacity");
        const dotOpacityVal = document.getElementById("bg-dot-opacity-val");
        const dotSizeSlider = document.getElementById("bg-dot-size");
        const dotSizeVal = document.getElementById("bg-dot-size-val");

        if (dotBgColor) dotBgColor.value = getSetting("bg_dot_bg_color", "#313131");
        if (dotColor) dotColor.value = getSetting("bg_dot_color", "#ffffff");
        if (dotOpacitySlider && dotOpacityVal) {
            const v = getSetting("bg_dot_opacity", 17);
            dotOpacitySlider.value = v;
            dotOpacityVal.textContent = v;
        }
        if (dotSizeSlider && dotSizeVal) {
            const v = getSetting("bg_dot_size", 30);
            dotSizeSlider.value = v;
            dotSizeVal.textContent = v;
        }

        // Clock UI sync
        const clockSize = document.getElementById("clock-size-slider");
        const clockSizeVal = document.getElementById("clock-size-val");
        const clockColor = document.getElementById("clock-color-picker");
        const clockFont = document.getElementById("clock-font-select");
        const clockAmpm = document.getElementById("clock-ampm-checkbox");
        const clockIconCheckbox = document.getElementById("clock-icon-checkbox");

        if (clockSize && clockSizeVal) {
            const v = getSetting("clock_size", 48);
            clockSize.value = v;
            clockSizeVal.textContent = v;
        }
        if (clockColor) clockColor.value = getSetting("clock_color", "#ffffff");
        if (clockFont) clockFont.value = getSetting("clock_font", "'Courier New', Courier, monospace");
        if (clockAmpm) clockAmpm.checked = getSetting("clock_ampm", false);
        if (clockIconCheckbox) clockIconCheckbox.checked = getSetting("clock_icon", false);

        const crtModeCb = document.getElementById("crt-mode-checkbox");
        if (crtModeCb) {
            crtModeCb.checked = getSetting("crt_mode", false);
            applyCrtMode();
        }

        const noiseSlider = document.getElementById("noise-level-slider");
        const noiseVal = document.getElementById("noise-level-val");
        if (noiseSlider && noiseVal) {
            const v = getSetting("noise_level", 15);
            noiseSlider.value = v;
            noiseVal.textContent = v;
        }

        const ditherSlider = document.getElementById("dither-level-slider");
        const ditherVal = document.getElementById("dither-level-val");
        if (ditherSlider && ditherVal) {
            const v = getSetting("dither_level", 20);
            ditherSlider.value = v;
            ditherVal.textContent = v;
        }

        const vhsSlider = document.getElementById("vhs-level-slider");
        const vhsVal = document.getElementById("vhs-level-val");
        if (vhsSlider && vhsVal) {
            const v = getSetting("vhs_level", 100);
            vhsSlider.value = v;
            vhsVal.textContent = v;
        }

        updateStorageInfo();
    }

    async function updateStorageInfo() {
        const bar = document.getElementById("storage-progress");
        if (!bar) return;
        
        if (navigator.storage && navigator.storage.estimate) {
            try {
                const estimate = await navigator.storage.estimate();
                const percentUsed = ((estimate.usage / estimate.quota) * 100).toFixed(1);
                const usedMB = (estimate.usage / (1024 * 1024)).toFixed(2);
                const totalGB = (estimate.quota / (1024 * 1024 * 1024)).toFixed(1);

                if (bar) {
                    bar.style.width = percentUsed + "%";
                    // Add hover info to the parent row
                    const row = bar.closest(".settings-row");
                    if (row) row.title = `Dung lượng đã dùng: ${usedMB} MB / Tổng: ${totalGB} GB (${percentUsed}%)`;
                }
            } catch (e) {
                console.error("Storage estimate failed", e);
            }
        } else {
            info.textContent = "Không hỗ trợ";
        }
    }

    // Background brightness
    const bgBrightnessSlider = document.getElementById("bg-brightness-slider");
    const bgBrightnessVal = document.getElementById("bg-brightness-val");
    if (bgBrightnessSlider) {
        bgBrightnessSlider.addEventListener("input", () => {
            const v = parseInt(bgBrightnessSlider.value);
            bgBrightnessVal.textContent = v;
            setSetting("bg_brightness", v);
            applyBackgroundSettings();
        });
    }

    // Background speed
    const bgSpeedSlider = document.getElementById("bg-speed-slider");
    const bgSpeedVal = document.getElementById("bg-speed-val");
    if (bgSpeedSlider) {
        bgSpeedSlider.addEventListener("input", () => {
            const v = parseFloat(bgSpeedSlider.value);
            bgSpeedVal.textContent = v.toFixed(1);
            setSetting("bg_speed", v);
            applyBackgroundSettings();
        });
    }

    // Background upload
    const bgUploadBtn = document.getElementById("bg-upload-btn");
    const bgUploadInput = document.getElementById("bg-upload-input");
    if (bgUploadBtn) bgUploadBtn.addEventListener("click", () => bgUploadInput.click());
    if (bgUploadInput) {
        bgUploadInput.addEventListener("change", async e => {
            const file = e.target.files[0];
            if (!file) return;

            showNotification("Hệ thống", "Đang xử lý file lớn...");
            try {
                await saveLargeFile("bg_custom_file", file);
                localStorage.removeItem("setting_bg_custom_src");
                applyBackgroundSettings();
                showNotification("Thành công", "Đã cập nhật hình nền!");
            } catch (err) {
                console.error(err);
                showNotification("Lỗi", "Không thể lưu file vào IndexedDB.");
            }
        });
    }

    // Background reset
    const bgResetBtn = document.getElementById("bg-reset-btn");
    if (bgResetBtn) {
        bgResetBtn.addEventListener("click", async () => {
            setSetting("bg_brightness", 25);
            setSetting("bg_speed", 0.5);
            setSetting("bg_custom_src", null);
            await deleteLargeFile("bg_custom_file");
            applyBackgroundSettings();
            syncSettingsUI();
            showNotification("Thành công", "Đã đặt lại nền.");
        });
    }

    // Color UI Listeners
    const btnVideo = document.getElementById("bg-mode-video-btn");
    const btnColor = document.getElementById("bg-mode-color-btn");
    if (btnVideo) btnVideo.addEventListener("click", () => {
        setSetting("bg_mode", "video");
        syncSettingsUI();
        applyBackgroundSettings();
    });
    if (btnColor) btnColor.addEventListener("click", () => {
        setSetting("bg_mode", "color");
        syncSettingsUI();
        applyBackgroundSettings();
    });

    const addColorBtn = document.getElementById("bg-color-add-btn");
    if (addColorBtn) addColorBtn.addEventListener("click", () => {
        const colors = getSetting("bg_colors", ["#1a1a1a", "#333333"]);
        colors.push("#000000"); // Add black by default
        setSetting("bg_colors", colors);
        syncSettingsUI();
        applyBackgroundSettings();
    });

    const angleSlider = document.getElementById("bg-color-angle");
    const angleVal = document.getElementById("bg-color-angle-val");
    if (angleSlider) angleSlider.addEventListener("input", (e) => {
        setSetting("bg_color_angle", e.target.value);
        if(angleVal) angleVal.textContent = e.target.value;
        applyBackgroundSettings();
    });

    const btnDot = document.getElementById("bg-mode-dot-btn");
    if (btnDot) btnDot.addEventListener("click", () => {
        setSetting("bg_mode", "dot");
        syncSettingsUI();
        applyBackgroundSettings();
    });

    const colorResetBtn = document.getElementById("bg-color-reset-btn");
    if (colorResetBtn) colorResetBtn.addEventListener("click", () => {
        setSetting("bg_colors", ["#1a1a1a", "#333333"]);
        setSetting("bg_color_angle", 45);
        syncSettingsUI();
        applyBackgroundSettings();
    });

    // Dot Settings Listeners
    const dotBgColorInp = document.getElementById("bg-dot-bg-color");
    if (dotBgColorInp) dotBgColorInp.addEventListener("input", (e) => {
        setSetting("bg_dot_bg_color", e.target.value);
        applyBackgroundSettings();
    });

    const dotColorInp = document.getElementById("bg-dot-color");
    if (dotColorInp) dotColorInp.addEventListener("input", (e) => {
        setSetting("bg_dot_color", e.target.value);
        applyBackgroundSettings();
    });

    const dotOpacitySlider = document.getElementById("bg-dot-opacity");
    const dotOpacityVal = document.getElementById("bg-dot-opacity-val");
    if (dotOpacitySlider) dotOpacitySlider.addEventListener("input", (e) => {
        setSetting("bg_dot_opacity", parseInt(e.target.value));
        if (dotOpacityVal) dotOpacityVal.textContent = e.target.value;
        applyBackgroundSettings();
    });

    const dotSizeSlider = document.getElementById("bg-dot-size");
    const dotSizeVal = document.getElementById("bg-dot-size-val");
    if (dotSizeSlider) dotSizeSlider.addEventListener("input", (e) => {
        setSetting("bg_dot_size", parseInt(e.target.value));
        if (dotSizeVal) dotSizeVal.textContent = e.target.value;
        applyBackgroundSettings();
    });

    const dotResetBtn = document.getElementById("bg-dot-reset-btn");
    if (dotResetBtn) dotResetBtn.addEventListener("click", () => {
        setSetting("bg_dot_bg_color", "#313131");
        setSetting("bg_dot_color", "#ffffff");
        setSetting("bg_dot_opacity", 17);
        setSetting("bg_dot_size", 30);
        syncSettingsUI();
        applyBackgroundSettings();
    });

    const crtModeCb = document.getElementById("crt-mode-checkbox");
    if (crtModeCb) crtModeCb.addEventListener("change", (e) => {
        setSetting("crt_mode", e.target.checked);
        applyCrtMode();
    });

    const noiseSlider = document.getElementById("noise-level-slider");
    const noiseVal = document.getElementById("noise-level-val");
    if (noiseSlider) noiseSlider.addEventListener("input", (e) => {
        setSetting("noise_level", parseInt(e.target.value));
        if (noiseVal) noiseVal.textContent = e.target.value;
        applyCrtMode();
    });

    const ditherSlider = document.getElementById("dither-level-slider");
    const ditherVal = document.getElementById("dither-level-val");
    if (ditherSlider) ditherSlider.addEventListener("input", (e) => {
        setSetting("dither_level", parseInt(e.target.value));
        if (ditherVal) ditherVal.textContent = e.target.value;
        applyCrtMode();
    });

    const vhsSlider = document.getElementById("vhs-level-slider");
    const vhsVal = document.getElementById("vhs-level-val");
    if (vhsSlider) vhsSlider.addEventListener("input", (e) => {
        setSetting("vhs_level", parseInt(e.target.value));
        if (vhsVal) vhsVal.textContent = e.target.value;
        applyCrtMode();
    });

    // Clock UI Listeners
    const clockSize = document.getElementById("clock-size-slider");
    const clockSizeVal = document.getElementById("clock-size-val");
    if (clockSize) clockSize.addEventListener("input", (e) => {
        setSetting("clock_size", parseInt(e.target.value));
        if (clockSizeVal) clockSizeVal.textContent = e.target.value;
        applyClockSettings();
    });

    const clockColor = document.getElementById("clock-color-picker");
    if (clockColor) clockColor.addEventListener("input", (e) => {
        setSetting("clock_color", e.target.value);
        applyClockSettings();
    });

    const clockFont = document.getElementById("clock-font-select");
    if (clockFont) clockFont.addEventListener("change", (e) => {
        setSetting("clock_font", e.target.value);
        applyClockSettings();
    });

    const clockAmpm = document.getElementById("clock-ampm-checkbox");
    if (clockAmpm) clockAmpm.addEventListener("change", (e) => {
        setSetting("clock_ampm", e.target.checked);
        updateClock();
    });

    const clockIconCheckbox = document.getElementById("clock-icon-checkbox");
    if (clockIconCheckbox) clockIconCheckbox.addEventListener("change", (e) => {
        setSetting("clock_icon", e.target.checked);
        updateClock();
    });

    const clockResetBtn = document.getElementById("clock-reset-btn");
    if (clockResetBtn) clockResetBtn.addEventListener("click", () => {
        setSetting("clock_pos", "top-center");
        setSetting("clock_color", "#ffffff");
        setSetting("clock_size", 48);
        syncSettingsUI();
        applyClockSettings();
    });

    // Card icons grid
    function renderCardIconsGrid() {
        const grid = document.getElementById("card-icons-grid");
        if (!grid) return;
        grid.innerHTML = "";
        const custom = getCustomCardIcons();
        const all = BUILTIN_SUIT_IMAGES.map(src => ({ src, isCustom: false }))
                    .concat(custom.map(src => ({ src, isCustom: true })));

        const hidden = getHiddenIcons();
        all.forEach(({ src, isCustom }) => {
            const item = document.createElement("div");
            const isHidden = hidden.includes(src);
            item.className = "settings-icon-item" + (isHidden ? " icon-hidden" : "");
            
            item.innerHTML = `<img src="${src}" alt="icon">`;
            
            // Visibility Toggle
            const toggle = document.createElement("div");
            toggle.className = "icon-visibility-toggle" + (isHidden ? " active" : "");
            toggle.title = isHidden ? "Hiện icon" : "Ẩn icon";
            toggle.addEventListener("click", ev => {
                ev.stopPropagation();
                let currentHidden = getHiddenIcons();
                if (currentHidden.includes(src)) {
                    currentHidden = currentHidden.filter(s => s !== src);
                } else {
                    currentHidden.push(src);
                }
                saveHiddenIcons(currentHidden);
                renderCardIconsGrid();
            });
            item.appendChild(toggle);
            
            // Make all draggable so user gets feedback even on built-in ones
            item.setAttribute("draggable", "true");
            item.addEventListener("dragstart", e => {
                // Combine type and src into one string for better compatibility
                e.dataTransfer.setData("text/plain", "random|" + src);
                item.style.opacity = "0.5";
            });
            item.addEventListener("dragend", () => {
                item.style.opacity = "1";
            });

            // Add click for mapping
            item.addEventListener("click", () => {
                if (currentlyMappingIndex !== null) {
                    const arr = getUrlMappings();
                    if (arr[currentlyMappingIndex]) {
                        arr[currentlyMappingIndex].icon = src;
                        saveUrlMappings(arr);
                        renderUrlMappings();
                        currentlyMappingIndex = null;
                        // Scroll back up
                        document.getElementById("url-mapping-list").scrollIntoView({ behavior: 'smooth' });
                    }
                }
            });

            grid.appendChild(item);
        });
    }

    // Toggle All Random
    const toggleAllRandomBtn = document.getElementById("toggle-all-random-btn");
    if (toggleAllRandomBtn) {
        toggleAllRandomBtn.addEventListener("click", () => {
            const all = getAllSuitImages(true);
            const hidden = getHiddenIcons();
            const allHidden = all.every(s => hidden.includes(s));
            
            if (allHidden) {
                // Show all (remove all from hidden)
                saveHiddenIcons(hidden.filter(s => !all.includes(s)));
            } else {
                // Hide all (add all to hidden)
                const newHidden = [...new Set([...hidden, ...all])];
                saveHiddenIcons(newHidden);
            }
            renderCardIconsGrid();
        });
    }

    // Toggle All Main
    const toggleAllMainBtn = document.getElementById("toggle-all-main-btn");
    if (toggleAllMainBtn) {
        toggleAllMainBtn.addEventListener("click", () => {
            const custom = getCustomMainCardIcons();
            const hidden = getHiddenIcons();
            const allHidden = custom.every(s => hidden.includes(s));
            
            if (allHidden) {
                saveHiddenIcons(hidden.filter(s => !custom.includes(s)));
            } else {
                const newHidden = [...new Set([...hidden, ...custom])];
                saveHiddenIcons(newHidden);
            }
            renderMainCardIconsGrid();
        });
    }

    // Card icon upload
    const cardIconUploadBtn = document.getElementById("card-icon-upload-btn");
    const cardIconUploadInput = document.getElementById("card-icon-upload-input");
    if (cardIconUploadBtn) cardIconUploadBtn.addEventListener("click", () => cardIconUploadInput.click());
    if (cardIconUploadInput) {
        cardIconUploadInput.addEventListener("change", e => {
            const files = Array.from(e.target.files);
            if (files.length === 0) return;
            files.forEach(file => {
                const reader = new FileReader();
                reader.onload = ev => {
                    const arr = getCustomCardIcons();
                    arr.push(ev.target.result);
                    saveCustomCardIcons(arr);
                    renderCardIconsGrid();
                };
                reader.readAsDataURL(file);
            });
            cardIconUploadInput.value = "";
        });
    }

    // Main card icons grid
    function renderMainCardIconsGrid() {
        const grid = document.getElementById("main-card-icons-grid");
        if (!grid) return;
        grid.innerHTML = "";
        const active = getActiveMainCardIcon();
        const custom = getCustomMainCardIcons();

        // Built-in default
        const defItem = document.createElement("div");
        defItem.className = "settings-icon-item" + (active === "default" ? " active" : "");
        defItem.innerHTML = `<img src="maincard.png" alt="default">`;
        defItem.addEventListener("click", () => {
            setActiveMainCardIcon("default");
            applyMainCardIcon();
            renderMainCardIconsGrid();
        });
        grid.appendChild(defItem);

        const hidden = getHiddenIcons();
        custom.forEach(src => {
            const item = document.createElement("div");
            const isHidden = hidden.includes(src);
            item.className = "settings-icon-item" + (active === src ? " active" : "") + (isHidden ? " icon-hidden" : "");
            item.innerHTML = `<img src="${src}" alt="custom">`;
            
            // Visibility Toggle
            const toggle = document.createElement("div");
            toggle.className = "icon-visibility-toggle" + (isHidden ? " active" : "");
            toggle.title = isHidden ? "Hiện icon" : "Ẩn icon";
            toggle.addEventListener("click", ev => {
                ev.stopPropagation();
                let currentHidden = getHiddenIcons();
                if (currentHidden.includes(src)) {
                    currentHidden = currentHidden.filter(s => s !== src);
                } else {
                    currentHidden.push(src);
                }
                saveHiddenIcons(currentHidden);
                renderMainCardIconsGrid();
            });
            item.appendChild(toggle);

            item.setAttribute("draggable", "true");
            item.addEventListener("dragstart", e => {
                e.dataTransfer.setData("text/plain", "main|" + src);
                item.style.opacity = "0.5";
            });
            item.addEventListener("dragend", () => {
                item.style.opacity = "1";
            });

            item.addEventListener("click", () => {
                setActiveMainCardIcon(src);
                applyMainCardIcon();
                renderMainCardIconsGrid();
            });
            grid.appendChild(item);
        });
    }

    // Main card icon upload
    const mainCardIconUploadBtn = document.getElementById("main-card-icon-upload-btn");
    const mainCardIconUploadInput = document.getElementById("main-card-icon-upload-input");
    if (mainCardIconUploadBtn) mainCardIconUploadBtn.addEventListener("click", () => mainCardIconUploadInput.click());
    if (mainCardIconUploadInput) {
        mainCardIconUploadInput.addEventListener("change", e => {
            const files = Array.from(e.target.files);
            if (files.length === 0) return;
            files.forEach(file => {
                const reader = new FileReader();
                reader.onload = ev => {
                    const arr = getCustomMainCardIcons();
                    arr.push(ev.target.result);
                    saveCustomMainCardIcons(arr);
                    renderMainCardIconsGrid();
                };
                reader.readAsDataURL(file);
            });
            mainCardIconUploadInput.value = "";
        });
    }

    // ------------------------------------------
    // 13. PAGE INIT
    // ------------------------------------------
    function initializeCardPage() {
        if (!mainContentArea) return;
        mainContentArea.innerHTML = initialCardStructure;
        cardWrapper = document.getElementById("card-wrapper");
        addCardBtn = document.getElementById("add-new-card");
        setupModalListeners();
        isInitialLoad = true;
        loadCards();
        isInitialLoad = false;
    }

    function loadPage(pageUrl) {
        if (pageUrl === "cards.html" || pageUrl === "page_a.html") {
            window.location.href = "cards.html";
            return;
        }
        if (!mainContentArea) return;
        cardWrapper = null;
        addCardBtn = null;
        fetch(pageUrl)
            .then(r => { if (!r.ok) throw new Error(r.statusText); return r.text(); })
            .then(html => { mainContentArea.innerHTML = html; })
            .catch(err => {
                mainContentArea.innerHTML = `<div style="text-align:center;color:white;padding-top:50px;">
                    <h1 style="color:red;">Lỗi tải nội dung</h1>
                    <p>Không tìm thấy file <b>${pageUrl}</b>.</p></div>`;
            });
    }

    navLinks.forEach(link => {
        link.setAttribute("href", "#");
        link.addEventListener("click", function (e) {
            e.preventDefault();
            loadPage(this.getAttribute("data-page"));
        });
    });

    // ESC to close settings
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            if (settingsPanel && !settingsPanel.classList.contains("settings-panel-hidden")) {
                settingsPanel.classList.add("settings-panel-hidden");
            }
            if (modalOverlay && !modalOverlay.classList.contains("url-input-hidden")) {
                modalOverlay.classList.add("url-input-hidden");
            }
        }
    });

    // ------------------------------------------
    // 13. UI SOUND EFFECTS
    // ------------------------------------------
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    let audioCtx = null;
    function getSfxVolume() { return getSetting("sfx_volume", 50); }
    function setSfxVolume(val) { setSetting("sfx_volume", val); }

    try {
        audioCtx = new AudioContext();
    } catch(e) {}

    // UI Listeners
    const sfxVolumeSlider = document.getElementById("sfx-volume-slider");
    const sfxVolumeVal = document.getElementById("sfx-volume-val");

    if (sfxVolumeSlider) {
        sfxVolumeSlider.value = getSfxVolume();
        sfxVolumeVal.innerText = getSfxVolume();
        sfxVolumeSlider.addEventListener("input", (e) => {
            setSfxVolume(e.target.value);
            sfxVolumeVal.innerText = e.target.value;
        });
    }

    let lastHoverSfxTime = 0;
    function playHoverSound() {
        const now = Date.now();
        if (now - lastHoverSfxTime < 80) return;
        lastHoverSfxTime = now;

        if (!audioCtx) {
            try { audioCtx = new AudioContext(); } catch (e) { return; }
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume().catch(() => {});
        }
        
        const vol = getSfxVolume() / 100;
        if (vol === 0) return;
        
        try {
            const gain = audioCtx.createGain();
            gain.connect(audioCtx.destination);
            
            const osc = audioCtx.createOscillator();
            osc.type = 'sine';
            
            osc.frequency.setValueAtTime(600, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.05);
            
            gain.gain.setValueAtTime(0.05 * vol, audioCtx.currentTime); 
            gain.gain.exponentialRampToValueAtTime(0.001 * vol, audioCtx.currentTime + 0.05);
            
            osc.connect(gain);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.05);
        } catch (e) {}
    }

    document.body.addEventListener('mouseover', (e) => {
        const selectors = '.card, #open-settings-btn, #upload-cards-trigger, #download-cards-btn, .settings-btn, .Subscribe-btn, .settings-icon-item';
        const target = e.target.closest(selectors);
        if (target && !target.contains(e.relatedTarget)) {
            playHoverSound();
        }
    });

    // ------------------------------------------
    // 13.5 RETRO DITHER & NOISE MODE
    // ------------------------------------------
    function applyCrtMode() {
        const isOn = getSetting("crt_mode", false);
        const overlay = document.getElementById("crt-overlay");
        const sliderDiv = document.getElementById("retro-sliders");
        const noiseLvl = getSetting("noise_level", 15);
        const ditherLvl = getSetting("dither_level", 20);
        const vhsLvl = getSetting("vhs_level", 100);

        const noiseEl = document.getElementById("crt-noise");
        const ditherEl = document.getElementById("dither-overlay");
        const scanlinesEl = document.querySelector(".crt-scanlines");

        if (isOn) {
            if (overlay) overlay.style.display = "block";
            if (sliderDiv) sliderDiv.style.display = "flex";
            if (noiseEl) noiseEl.style.opacity = noiseLvl / 100;
            if (ditherEl) ditherEl.style.opacity = ditherLvl / 100;
            if (scanlinesEl) scanlinesEl.style.opacity = vhsLvl / 100;
        } else {
            if (overlay) overlay.style.display = "none";
            if (sliderDiv) sliderDiv.style.display = "none";
        }
    }

    // ------------------------------------------
    // 14. DRAGGABLE CLOCK
    // ------------------------------------------
    const clockEl = document.getElementById("draggable-clock");
    const clockTime = document.getElementById("clock-time");
    const clockAmpmStr = document.getElementById("clock-ampm");
    const clockIcon = document.getElementById("clock-icon");

    let isDraggingClock = false;
    let clockOffsetX = 0;
    let clockOffsetY = 0;

    function applyClockSettings() {
        const size = getSetting("clock_size", 48);
        const color = getSetting("clock_color", "#ffffff");
        const font = getSetting("clock_font", "'Courier New', Courier, monospace");
        const pos = getSetting("clock_pos", "top-center");
        
        if (clockEl) {
            clockEl.style.fontSize = size + "px";
            clockEl.style.color = color;
            clockEl.style.fontFamily = font;
            
            // reset transforms and positioning
            clockEl.style.transform = "none";
            clockEl.style.writingMode = "horizontal-tb";
            clockEl.style.left = "";
            clockEl.style.top = "";
            clockEl.style.right = "";
            clockEl.style.bottom = "";
            
            const padding = 20;

            if (pos === "custom") {
                clockEl.style.left = getSetting("clock_custom_x", padding) + "px";
                clockEl.style.top = getSetting("clock_custom_y", padding) + "px";
            } else {
                switch(pos) {
                    case "top-left":
                        clockEl.style.top = padding + "px";
                        clockEl.style.left = padding + "px";
                        break;
                    case "top-center":
                        clockEl.style.top = padding + "px";
                        clockEl.style.left = "50%";
                        clockEl.style.transform = "translateX(-50%)";
                        break;
                    case "top-right":
                        clockEl.style.top = padding + "px";
                        clockEl.style.right = padding + "px";
                        break;
                    case "bottom-left":
                        clockEl.style.bottom = padding + "px";
                        clockEl.style.left = padding + "px";
                        break;
                    case "bottom-center":
                        clockEl.style.bottom = padding + "px";
                        clockEl.style.left = "50%";
                        clockEl.style.transform = "translateX(-50%)";
                        break;
                    case "bottom-right":
                        clockEl.style.bottom = padding + "px";
                        clockEl.style.right = padding + "px";
                        break;
                    case "center-center":
                        clockEl.style.top = "50%";
                        clockEl.style.left = "50%";
                        clockEl.style.transform = "translate(-50%, -50%)";
                        break;
                    case "mid-right":
                        clockEl.style.top = "50%";
                        clockEl.style.right = padding + "px";
                        clockEl.style.writingMode = "vertical-rl";
                        clockEl.style.transform = "translateY(-50%)";
                        break;
                    case "mid-left":
                        clockEl.style.top = "50%";
                        clockEl.style.left = padding + "px";
                        clockEl.style.writingMode = "vertical-rl";
                        clockEl.style.transform = "translateY(-50%) rotate(180deg)";
                        break;
                }
            }

            const dot = document.getElementById("clock-retro-dot");
            if (dot) {
                if (pos.includes("right")) {
                    clockEl.insertBefore(dot, document.getElementById("clock-icon"));
                } else {
                    clockEl.insertBefore(dot, document.getElementById("clock-ampm"));
                }
            }

            Array.from(clockEl.children).forEach(child => {
                child.style.color = color;
            });
        }
    }

    function updateClock() {
        if (!clockEl) return;
        const useAmpm = getSetting("clock_ampm", false);
        const showIcon = getSetting("clock_icon", false);
        const now = new Date();
        let h = now.getHours();
        const m = now.getMinutes().toString().padStart(2, '0');
        const s = now.getSeconds().toString().padStart(2, '0');
        
        let ampmStr = "";
        if (useAmpm) {
            ampmStr = h >= 12 ? "PM" : "AM";
            h = h % 12 || 12;
        }
        h = h.toString().padStart(2, '0');
        
        clockTime.textContent = `${h}:${m}:${s}`;
        clockAmpmStr.textContent = ampmStr;

        if (showIcon) {
            const isDay = now.getHours() >= 6 && now.getHours() < 18;
            clockIcon.textContent = isDay ? "O " : "C ";
            clockIcon.style.display = "inline";
        } else {
            clockIcon.style.display = "none";
        }
    }

    setInterval(updateClock, 1000);
    updateClock();
    applyClockSettings();

    if (clockEl) {
        clockEl.addEventListener("mousedown", (e) => {
            if(e.button !== 0) return;
            e.preventDefault();
            isDraggingClock = true;
            clockEl.classList.add("dragging");
            
            const rect = clockEl.getBoundingClientRect();
            const startLeft = rect.left;
            const startTop = rect.top;

            clockOffsetX = e.clientX - startLeft;
            clockOffsetY = e.clientY - startTop;

            // Lock to exact current visual coordinates before removing transforms
            clockEl.style.left = startLeft + "px";
            clockEl.style.top = startTop + "px";
            
            clockEl.style.transform = "none";
            clockEl.style.right = "auto";
            clockEl.style.bottom = "auto";
            clockEl.style.writingMode = "horizontal-tb";
            
            clockEl.style.cursor = "grabbing";
        });
        document.addEventListener("mousemove", (e) => {
            if (!isDraggingClock) return;
            e.preventDefault();
            const x = e.clientX - clockOffsetX;
            const y = e.clientY - clockOffsetY;
            clockEl.style.left = x + "px";
            clockEl.style.top = y + "px";
        });
        document.addEventListener("mouseup", (e) => {
            if (isDraggingClock) {
                isDraggingClock = false;
                clockEl.classList.remove("dragging");
                clockEl.style.cursor = "grab";
                
                const rect = clockEl.getBoundingClientRect();
                const dropX = rect.left;
                const dropY = rect.top;
                const dropW = rect.width;
                const dropH = rect.height;
                const w = window.innerWidth;
                const h = window.innerHeight;

                const padding = 20;

                const points = [
                    { id: 'top-left', x: padding, y: padding },
                    { id: 'top-center', x: w/2 - dropW/2, y: padding },
                    { id: 'top-right', x: w - dropW - padding, y: padding },
                    { id: 'mid-left', x: padding, y: h/2 - dropH/2 },
                    { id: 'center-center', x: w/2 - dropW/2, y: h/2 - dropH/2 },
                    { id: 'mid-right', x: w - dropW - padding, y: h/2 - dropH/2 },
                    { id: 'bottom-left', x: padding, y: h - dropH - padding },
                    { id: 'bottom-center', x: w/2 - dropW/2, y: h - dropH - padding },
                    { id: 'bottom-right', x: w - dropW - padding, y: h - dropH - padding }
                ];

                let closest = null;
                let minDist = 150; // magnetism threshold
                points.forEach(p => {
                    const dist = Math.hypot(p.x - dropX, p.y - dropY);
                    if (dist < minDist) {
                        minDist = dist;
                        closest = p.id;
                    }
                });

                if (closest) {
                    setSetting("clock_pos", closest);
                } else {
                    setSetting("clock_pos", "custom");
                    setSetting("clock_custom_x", dropX);
                    setSetting("clock_custom_y", dropY);
                }
                
                applyClockSettings();
            }
        });
    }
    applyClockSettings();
    applyCrtMode();

    const navToggleBtn = document.getElementById("nav-toggle-btn");
    const navigation = document.getElementById("navigation");
    if (navToggleBtn && navigation) {
        navToggleBtn.addEventListener("click", () => {
            navigation.classList.toggle("nav-hidden");
        });
    }

    initializeCardPage();

    // ------------------------------------------
    // MINDMAP LOGIC
    // ------------------------------------------
    const canvas = document.getElementById("mindmap-canvas");
    const workspace = document.getElementById("mindmap-workspace");
    const toolInputs = document.querySelectorAll('input[name="tool"]');
    
    let currentTool = "select";
    let isPanning = false;
    let panStartX = 0;
    let panStartY = 0;
    let translateX = 0;
    let translateY = 0;
    let scale = 1;

    let draggedElement = null;
    let dragOffsetX = 0;
    let dragOffsetY = 0;
    let selectedElement = null;

    let resizingElement = null;
    let resizeDir = "";
    let resizeStartX = 0;
    let resizeStartY = 0;
    let resizeStartWidth = 0;
    let resizeStartHeight = 0;
    let resizeStartLeft = 0;
    let resizeStartTop = 0;

    // Load elements (just sticky notes for now)
    let mindmapElements = JSON.parse(localStorage.getItem("blank_mindmap_elements") || "[]");

    const selectionBox = document.createElement("div");
    selectionBox.className = "selection-box";
    document.body.appendChild(selectionBox);

    let isSelecting = false;
    let selectStartX = 0;
    let selectStartY = 0;
    let selectedElements = [];

    // ------------------------------------------
    // MARKER LOGIC
    // ------------------------------------------
    const drawingLayer = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    drawingLayer.id = "drawing-layer";
    drawingLayer.style.cssText = "position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible; z-index: 20; background: transparent;";

    const connectorsLayer = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    connectorsLayer.id = "connectors-layer";
    connectorsLayer.style.cssText = "position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible; z-index: 9; background: transparent;";
    const connectorDefs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    connectorDefs.innerHTML = '<marker id="connector-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><polygon points="0 0, 8 4, 0 8" fill="#d17842"/></marker>';
    connectorsLayer.appendChild(connectorDefs);

    const CONNECTORS_DB_KEY = "blank_mindmap_connectors";
    let connectorsData = [];
    let connectorStart = null;
    let connectorPreviewPath = null;
    let selectedConnectorId = null;

    function getAnchorFromDot(dot) {
        return dot.dataset.anchor || ["top", "bottom", "left", "right"].find(a => dot.classList.contains(a)) || "right";
    }

    function getMindmapElementRect(el) {
        const x = parseFloat(el.dataset.x) || 0;
        const y = parseFloat(el.dataset.y) || 0;
        const w = el.offsetWidth || parseFloat(el.style.width) || 200;
        const h = el.offsetHeight || parseFloat(el.style.minHeight) || 200;
        return { x, y, w, h };
    }

    function getAnchorPoint(elementId, anchor) {
        const el = document.getElementById(elementId);
        if (!el) return null;
        const { x, y, w, h } = getMindmapElementRect(el);
        switch (anchor) {
            case "top": return { x: x + w / 2, y };
            case "bottom": return { x: x + w / 2, y: y + h };
            case "left": return { x, y: y + h / 2 };
            case "right": return { x: x + w, y: y + h / 2 };
            default: return { x: x + w / 2, y: y + h / 2 };
        }
    }

    function buildConnectorPathD(x1, y1, x2, y2, fromAnchor, toAnchor) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const bend = Math.max(40, Math.min(160, Math.max(Math.abs(dx), Math.abs(dy)) * 0.45));
        let cp1x = x1, cp1y = y1, cp2x = x2, cp2y = y2;
        if (fromAnchor === "left" || fromAnchor === "right") {
            cp1x = x1 + (fromAnchor === "right" ? bend : -bend);
        } else {
            cp1y = y1 + (fromAnchor === "bottom" ? bend : -bend);
        }
        if (toAnchor === "left" || toAnchor === "right") {
            cp2x = x2 + (toAnchor === "left" ? -bend : bend);
        } else {
            cp2y = y2 + (toAnchor === "top" ? -bend : bend);
        }
        return `M ${x1} ${y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`;
    }

    function findConnectorPathEl(id) {
        return connectorsLayer.querySelector(`path.connector-line[data-id="${id}"]`);
    }

    function setSelectedConnector(id) {
        selectedConnectorId = id;
        connectorsLayer.querySelectorAll("path.connector-line").forEach(p => {
            p.classList.toggle("selected", p.dataset.id === id);
        });
    }

    function clearSelectedConnector() {
        selectedConnectorId = null;
        connectorsLayer.querySelectorAll("path.connector-line.selected").forEach(p => p.classList.remove("selected"));
    }

    async function saveConnectors() {
        try {
            await dbSet(CONNECTORS_DB_KEY, connectorsData);
        } catch (e) {
            console.error("Connector save failed:", e);
        }
    }

    async function loadConnectorsData() {
        try {
            let data = await dbGet(CONNECTORS_DB_KEY);
            if (!data) {
                const legacy = localStorage.getItem(CONNECTORS_DB_KEY);
                if (legacy) {
                    data = JSON.parse(legacy);
                    await dbSet(CONNECTORS_DB_KEY, data);
                }
            }
            connectorsData = Array.isArray(data) ? data : [];
        } catch (e) {
            connectorsData = [];
        }
    }

    function pruneOrphanConnectors() {
        const before = connectorsData.length;
        connectorsData = connectorsData.filter(c =>
            document.getElementById(c.from.elementId) && document.getElementById(c.to.elementId)
        );
        if (connectorsData.length !== before) saveConnectors();
    }

    function renderAllConnectorPaths() {
        connectorsLayer.querySelectorAll("path.connector-line, path.connector-preview").forEach(p => p.remove());
        pruneOrphanConnectors();
        connectorsData.forEach(conn => {
            const fromPt = getAnchorPoint(conn.from.elementId, conn.from.anchor);
            const toPt = getAnchorPoint(conn.to.elementId, conn.to.anchor);
            if (!fromPt || !toPt) return;
            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.classList.add("connector-line");
            path.dataset.id = conn.id;
            path.setAttribute("d", buildConnectorPathD(fromPt.x, fromPt.y, toPt.x, toPt.y, conn.from.anchor, conn.to.anchor));
            path.setAttribute("stroke", "#d17842");
            path.setAttribute("stroke-width", "2.5");
            path.setAttribute("fill", "none");
            path.setAttribute("stroke-linecap", "round");
            path.setAttribute("marker-end", "url(#connector-arrow)");
            if (conn.id === selectedConnectorId) path.classList.add("selected");
            connectorsLayer.appendChild(path);
        });
        updateConnectorPointerEvents();
    }

    function updateConnectorPointerEvents() {
        const selectable = currentTool === "select";
        connectorsLayer.querySelectorAll("path.connector-line").forEach(p => {
            p.style.pointerEvents = selectable ? "stroke" : "none";
        });
    }

    function updateConnectorPaths() {
        connectorsLayer.querySelectorAll("path.connector-line").forEach(path => {
            const conn = connectorsData.find(c => c.id === path.dataset.id);
            if (!conn) return;
            const fromPt = getAnchorPoint(conn.from.elementId, conn.from.anchor);
            const toPt = getAnchorPoint(conn.to.elementId, conn.to.anchor);
            if (!fromPt || !toPt) return;
            path.setAttribute("d", buildConnectorPathD(fromPt.x, fromPt.y, toPt.x, toPt.y, conn.from.anchor, conn.to.anchor));
        });
        if (connectorPreviewPath && connectorStart) {
            const fromPt = getAnchorPoint(connectorStart.elementId, connectorStart.anchor);
            if (fromPt) {
                const end = connectorPreviewPath._endPoint || fromPt;
                connectorPreviewPath.setAttribute("d", buildConnectorPathD(
                    fromPt.x, fromPt.y, end.x, end.y, connectorStart.anchor, connectorPreviewPath._endAnchor || "left"
                ));
            }
        }
    }

    function clearConnectorPreview() {
        connectorPreviewPath = null;
        connectorStart = null;
        connectorsLayer.querySelectorAll("path.connector-preview").forEach(p => p.remove());
    }

    function beginConnectorFromDot(dot) {
        const el = dot.closest(".mindmap-element");
        if (!el) return;
        clearConnectorPreview();
        connectorStart = {
            elementId: el.id,
            anchor: getAnchorFromDot(dot)
        };
        connectorPreviewPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
        connectorPreviewPath.classList.add("connector-preview");
        connectorPreviewPath.setAttribute("stroke", "#d17842");
        connectorPreviewPath.setAttribute("stroke-width", "2.5");
        connectorPreviewPath.setAttribute("stroke-dasharray", "6 4");
        connectorPreviewPath.setAttribute("fill", "none");
        connectorPreviewPath.setAttribute("stroke-linecap", "round");
        connectorPreviewPath.setAttribute("opacity", "0.75");
        connectorsLayer.appendChild(connectorPreviewPath);
        const pt = getAnchorPoint(connectorStart.elementId, connectorStart.anchor);
        if (pt) {
            connectorPreviewPath._endPoint = { ...pt };
            connectorPreviewPath._endAnchor = "left";
            connectorPreviewPath.setAttribute("d", buildConnectorPathD(pt.x, pt.y, pt.x, pt.y, connectorStart.anchor, "left"));
        }
    }

    function finishConnectorAtDot(dot) {
        if (!connectorStart) return;
        const el = dot.closest(".mindmap-element");
        if (!el || el.id === connectorStart.elementId) {
            clearConnectorPreview();
            return;
        }
        const toAnchor = getAnchorFromDot(dot);
        const duplicate = connectorsData.some(c =>
            c.from.elementId === connectorStart.elementId &&
            c.from.anchor === connectorStart.anchor &&
            c.to.elementId === el.id &&
            c.to.anchor === toAnchor
        );
        if (duplicate) {
            clearConnectorPreview();
            return;
        }
        const conn = {
            id: "conn_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
            from: { elementId: connectorStart.elementId, anchor: connectorStart.anchor },
            to: { elementId: el.id, anchor: toAnchor }
        };
        connectorsData.push(conn);
        clearConnectorPreview();
        renderAllConnectorPaths();
        saveConnectors();
        showNotification("Connector", "Đã nối hai phần tử.");
    }

    function removeConnectorsForElements(elementIds) {
        const idSet = new Set(elementIds);
        const before = connectorsData.length;
        connectorsData = connectorsData.filter(c => !idSet.has(c.from.elementId) && !idSet.has(c.to.elementId));
        if (connectorsData.length !== before) {
            if (selectedConnectorId && !connectorsData.some(c => c.id === selectedConnectorId)) {
                clearSelectedConnector();
            }
            renderAllConnectorPaths();
            saveConnectors();
        }
    }

    const CONNECTOR_DOTS_HTML = `
            <div class="connector-dot top" data-anchor="top"></div>
            <div class="connector-dot bottom" data-anchor="bottom"></div>
            <div class="connector-dot left" data-anchor="left"></div>
            <div class="connector-dot right" data-anchor="right"></div>`;

    let isDrawing = false;
    let currentPath = null;
    let pathData = "";
    let drawingHistory = []; // Stack to store drawing actions for undo

    function pushDrawingAction(action) {
        drawingHistory.push(action);
        if (drawingHistory.length > 50) drawingHistory.shift(); // Limit history size
    }

    function undoDrawing() {
        if (drawingHistory.length === 0) return;
        
        const action = drawingHistory.pop();
        if (action.type === "add") {
            if (action.node && action.node.parentNode) {
                action.node.remove();
            }
        } else if (action.type === "remove") {
            if (action.nodes) {
                action.nodes.forEach(node => {
                    drawingLayer.appendChild(node);
                });
            }
        }
        saveDrawings();
    }

    function getMarkerSettings() {
        const typeEl = document.querySelector('input[name="marker_type"]:checked');
        const colorEl = document.querySelector('input[name="marker_color"]:checked');
        const sizeEl = document.querySelector('input[name="marker_size"]:checked');
        
        return { 
            type: typeEl ? typeEl.value : 'pen', 
            color: colorEl ? colorEl.value : '#000', 
            size: sizeEl ? sizeEl.value : '2' 
        };
    }




    function saveDrawings() {
        const paths = [];
        drawingLayer.querySelectorAll("path").forEach(p => {
            paths.push({
                d: p.getAttribute("d"),
                stroke: p.getAttribute("stroke"),
                width: p.getAttribute("stroke-width"),
                opacity: p.getAttribute("stroke-opacity") || "1",
                cap: p.getAttribute("stroke-linecap")
            });
        });
        localStorage.setItem("blank_mindmap_drawings", JSON.stringify(paths));
    }

    function loadDrawings() {
        drawingLayer.innerHTML = ""; // Clear current paths before loading
        const saved = JSON.parse(localStorage.getItem("blank_mindmap_drawings") || "[]");
        saved.forEach(data => {
            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.setAttribute("d", data.d);
            path.setAttribute("stroke", data.stroke);
            path.setAttribute("stroke-width", data.width);
            path.setAttribute("stroke-opacity", data.opacity);
            path.setAttribute("stroke-linecap", data.cap);
            path.setAttribute("fill", "none");
            drawingLayer.appendChild(path);
        });
    }

    async function saveMindmap() {
        try {
            const elements = [];
            document.querySelectorAll(".mindmap-element").forEach(el => {
                elements.push({
                    id: el.id,
                    type: el.dataset.type,
                    x: parseFloat(el.dataset.x),
                    y: parseFloat(el.dataset.y),
                    width: el.style.width,
                    height: el.style.height,
                    bg: el.style.backgroundColor,
                    content: el.querySelector(".content-wrapper") ? el.querySelector(".content-wrapper").innerHTML : el.innerHTML
                });
            });
            await dbSet("blank_mindmap_elements", elements);
        } catch (e) {
            console.error("Save failed:", e);
        }
    }

    function createStickyNote(x, y, content = "", id = Date.now().toString(), width = "", height = "", bg = "") {
        const sticky = document.createElement("div");
        sticky.className = "sticky-note mindmap-element";
        sticky.id = "el_" + id;
        sticky.dataset.type = "sticky";
        sticky.dataset.x = x;
        sticky.dataset.y = y;
        
        if (width) sticky.style.width = width;
        if (height) {
            sticky.style.minHeight = height;
            sticky.style.height = "auto";
        }
        if (bg) sticky.style.backgroundColor = bg;
        else {
            const selectedColor = document.querySelector('input[name="note_color"]:checked');
            if (selectedColor) {
                if (selectedColor.value === "random") {
                    sticky.style.backgroundColor = `hsl(${Math.floor(Math.random() * 360)}, 70%, 85%)`;
                } else {
                    sticky.style.backgroundColor = selectedColor.value;
                }
            }
        }

        const contentHtml = (content && content.includes('class="note-')) 
            ? content.replace(/contenteditable="true"/g, 'contenteditable="false"') 
            : `<div class="note-body" contenteditable="false" placeholder="Take a note...">${content}</div>`;

        sticky.innerHTML = `
            <div class="content-wrapper" style="flex-grow: 1; display: flex; flex-direction: column;">
                ${contentHtml}
            </div>
            <!-- Resize Handles -->
            <div class="resize-handle edge top" data-dir="n"></div>
            <div class="resize-handle edge bottom" data-dir="s"></div>
            <div class="resize-handle edge left" data-dir="w"></div>
            <div class="resize-handle edge right" data-dir="e"></div>
            <div class="resize-handle corner nw" data-dir="nw"></div>
            <div class="resize-handle corner ne" data-dir="ne"></div>
            <div class="resize-handle corner sw" data-dir="sw"></div>
            <div class="resize-handle corner se" data-dir="se"></div>
            ${CONNECTOR_DOTS_HTML}
        `;
        
        sticky.style.transform = `translate(${x}px, ${y}px)`;

        // Interaction
        sticky.addEventListener("mousedown", (e) => {
            if (e.target.classList.contains("connector-dot")) return;
            if (currentTool !== "select") return;
            if (e.target.classList.contains("resize-handle")) {
                e.stopPropagation();
                startResize(e, sticky, e.target.dataset.dir);
                return;
            }
            
            e.stopPropagation();
            
            if (e.shiftKey) {
                toggleElementSelection(sticky);
            } else {
                if (!selectedElements.includes(sticky)) {
                    selectElement(sticky);
                }
            }
            
            draggedElement = sticky;
            const startX = parseFloat(sticky.dataset.x);
            const startY = parseFloat(sticky.dataset.y);
            const mouseWorkspaceX = (e.clientX - translateX) / scale;
            const mouseWorkspaceY = (e.clientY - translateY) / scale;
            dragOffsetX = mouseWorkspaceX - startX;
            dragOffsetY = mouseWorkspaceY - startY;

            // Store starting positions for all selected elements for multi-drag
            selectedElements.forEach(el => {
                el.dataset.dragStartX = el.dataset.x;
                el.dataset.dragStartY = el.dataset.y;
            });
        });

        sticky.addEventListener("dragstart", (e) => {
            e.preventDefault();
        });

        sticky.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && e.shiftKey) {
                const target = e.target;
                if (target.classList.contains("note-body") && !sticky.querySelector(".note-title")) {
                    e.preventDefault();
                    const text = target.innerText;
                    const wrapper = sticky.querySelector(".content-wrapper");
                    if (wrapper) {
                        wrapper.innerHTML = `
                            <div class="note-title" contenteditable="true" placeholder="Title">${text}</div>
                            <div class="note-body" contenteditable="true" placeholder="Take a note..."></div>
                        `;
                        const newBody = wrapper.querySelector(".note-body");
                        newBody.focus();
                        saveMindmap();
                    }
                }
            }
        });

        sticky.addEventListener("dblclick", (e) => {
            if (currentTool !== "select") return;
            const target = e.target.closest('.note-body, .note-title');
            if (target) {
                target.contentEditable = "true";
                target.focus();
                
                // Select all text
                const range = document.createRange();
                range.selectNodeContents(target);
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
            }
        });

        // Disable editing on blur
        sticky.addEventListener("blur", (e) => {
            if (e.target.classList.contains("note-body") || e.target.classList.contains("note-title")) {
                e.target.contentEditable = "false";
                saveMindmap();
            }
        }, true);

        // Use mouseup to capture resize changes
        sticky.addEventListener("mouseup", () => {
            saveMindmap();
        });

        sticky.addEventListener("input", () => {
            saveMindmap();
        });

        workspace.appendChild(sticky);
        return sticky;
    }

    function createImageNote(x, y, dataUrl, id = Date.now().toString(), width = "", height = "") {
        const imageNote = document.createElement("div");
        imageNote.className = "image-note mindmap-element";
        imageNote.id = "el_" + id;
        imageNote.dataset.type = "image";
        imageNote.dataset.x = x;
        imageNote.dataset.y = y;
        
        if (width) imageNote.style.width = width;
        else imageNote.style.width = "300px";
        
        if (height) {
            imageNote.style.minHeight = height;
            imageNote.style.height = "auto";
        }

        imageNote.innerHTML = `
            <div class="content-wrapper" style="flex-grow: 1; display: flex; align-items: center; justify-content: center; overflow: hidden; pointer-events: none;">
                <img src="${dataUrl}" style="max-width: 100%; max-height: 100%; object-fit: contain; pointer-events: none; display: block;">
            </div>
            <!-- Resize Handles -->
            <div class="resize-handle edge top" data-dir="n"></div>
            <div class="resize-handle edge bottom" data-dir="s"></div>
            <div class="resize-handle edge left" data-dir="w"></div>
            <div class="resize-handle edge right" data-dir="e"></div>
            <div class="resize-handle corner nw" data-dir="nw"></div>
            <div class="resize-handle corner ne" data-dir="ne"></div>
            <div class="resize-handle corner sw" data-dir="sw"></div>
            <div class="resize-handle corner se" data-dir="se"></div>
            ${CONNECTOR_DOTS_HTML}
        `;
        
        imageNote.style.transform = `translate(${x}px, ${y}px)`;

        // Interaction (Shared with sticky notes)
        imageNote.addEventListener("mousedown", (e) => {
            if (e.target.classList.contains("connector-dot")) return;
            if (currentTool !== "select") return;
            if (e.target.classList.contains("resize-handle")) {
                e.stopPropagation();
                startResize(e, imageNote, e.target.dataset.dir);
                return;
            }
            
            e.stopPropagation();
            
            if (e.shiftKey) {
                toggleElementSelection(imageNote);
            } else {
                if (!selectedElements.includes(imageNote)) {
                    selectElement(imageNote);
                }
            }
            
            draggedElement = imageNote;
            const startX = parseFloat(imageNote.dataset.x);
            const startY = parseFloat(imageNote.dataset.y);
            const mouseWorkspaceX = (e.clientX - translateX) / scale;
            const mouseWorkspaceY = (e.clientY - translateY) / scale;
            dragOffsetX = mouseWorkspaceX - startX;
            dragOffsetY = mouseWorkspaceY - startY;

            selectedElements.forEach(el => {
                el.dataset.dragStartX = el.dataset.x;
                el.dataset.dragStartY = el.dataset.y;
            });
        });

        imageNote.addEventListener("mouseup", () => {
            saveMindmap();
        });

        workspace.appendChild(imageNote);
        return imageNote;
    }



    let mindmapRenderPromise = null;

    async function renderMindmap() {
        if (mindmapRenderPromise) return mindmapRenderPromise;

        mindmapRenderPromise = (async () => {
        let elements = await dbGet("blank_mindmap_elements");
        
        // Migration: If IndexedDB is empty, check LocalStorage
        if (!elements) {
            const legacy = localStorage.getItem("blank_mindmap_elements");
            if (legacy) {
                elements = JSON.parse(legacy);
                // Save to IndexedDB so next time it's there
                await dbSet("blank_mindmap_elements", elements);
                // Optional: Clear legacy
                // localStorage.removeItem("blank_mindmap_elements");
            } else {
                elements = [];
            }
        }

        workspace.innerHTML = "";
        if (connectorsLayer) workspace.appendChild(connectorsLayer);
        if (drawingLayer) workspace.appendChild(drawingLayer);

        const seenIds = new Set();
        const deduped = elements.filter(el => {
            if (!el || !el.id || seenIds.has(el.id)) return false;
            seenIds.add(el.id);
            return true;
        });
        if (deduped.length !== elements.length) {
            elements = deduped;
            await dbSet("blank_mindmap_elements", elements);
        } else {
            elements = deduped;
        }
        
        elements.forEach(el => {
            if (el.type === "sticky") {
                createStickyNote(el.x, el.y, el.content, el.id.replace("el_", ""), el.width, el.height, el.bg);
            } else if (el.type === "image") {
                // Extract img src from content string
                const temp = document.createElement('div');
                temp.innerHTML = el.content;
                const img = temp.querySelector('img');
                if (img) {
                    createImageNote(el.x, el.y, img.src, el.id.replace("el_", ""), el.width, el.height);
                }
            }
        });
        loadDrawings();
        await loadConnectorsData();
        renderAllConnectorPaths();
        })().finally(() => { mindmapRenderPromise = null; });

        return mindmapRenderPromise;
    }

    function startResize(e, el, dir) {
        resizingElement = el;
        resizeDir = dir;
        resizeStartX = e.clientX;
        resizeStartY = e.clientY;
        resizeStartWidth = el.offsetWidth;
        resizeStartHeight = el.offsetHeight;
        resizeStartLeft = parseFloat(el.dataset.x);
        resizeStartTop = parseFloat(el.dataset.y);
    }

    function selectElement(el) {
        // Clear current selection if el is null or not in list
        selectedElements.forEach(item => item.classList.remove("selected"));
        selectedElements = [];
        
        if (el) {
            if (Array.isArray(el)) {
                selectedElements = el;
            } else {
                selectedElements = [el];
            }
            selectedElements.forEach(item => item.classList.add("selected"));
        }
    }

    function toggleElementSelection(el) {
        const index = selectedElements.indexOf(el);
        if (index > -1) {
            selectedElements.splice(index, 1);
            el.classList.remove("selected");
        } else {
            selectedElements.push(el);
            el.classList.add("selected");
        }
    }

    function updateWorkspaceTransform() {
        workspace.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
        
        // Move the dot background to create parallax/panning effect
        const dotBg = document.getElementById("dot-background");
        if (dotBg) {
            dotBg.style.backgroundPosition = `${translateX}px ${translateY}px`;
        }
    }

    // Color picking logic
    const colorRadios = document.querySelectorAll('input[name="note_color"]');
    colorRadios.forEach(radio => {
        radio.addEventListener("change", (e) => {
            if (selectedElements.length > 0) {
                selectedElements.forEach(el => {
                    if (el.classList.contains("sticky-note")) {
                        if (e.target.value === "random") {
                            el.style.backgroundColor = `hsl(${Math.floor(Math.random() * 360)}, 70%, 85%)`;
                        } else {
                            el.style.backgroundColor = e.target.value;
                        }
                    }
                });
                saveMindmap();
            }
        });
    });

    // Tool Selection
    toolInputs.forEach(input => {
        const label = input.closest('.toolbar-item');
        
        // Use mousedown on label to catch clicks even if radio is already checked
        if (label) {
            label.addEventListener("mousedown", (e) => {
                // If this tool is already the current tool, toggle the sub-toolbar
                if (input.checked) {
                    const toolValue = input.value;
                    const colorToolbar = document.getElementById("note-color-toolbar");
                    const markerToolbar = document.getElementById("marker-settings-toolbar");
                    const toolbar = document.querySelector(".figjam-toolbar");
                    
                    let isNowActive = false;
                    if (toolValue === "sticky" && colorToolbar) {
                        isNowActive = colorToolbar.classList.toggle("active");
                    } else if (toolValue === "marker" && markerToolbar) {
                        isNowActive = markerToolbar.classList.toggle("active");
                    }
                    
                    if (toolbar) toolbar.classList.toggle("sub-active", isNowActive);
                }
            });
        }

        input.addEventListener("change", (e) => {
            if (e.target.checked) {
                currentTool = e.target.value;
                const colorToolbar = document.getElementById("note-color-toolbar");
                const markerToolbar = document.getElementById("marker-settings-toolbar");
                
                if (currentTool === "hand") {
                    canvas.style.cursor = "grab";
                } else if (currentTool === "sticky") {
                    canvas.style.cursor = "crosshair";
                } else if (currentTool === "marker") {
                    const settings = getMarkerSettings();
                    if (settings.type === "eraser") {
                        canvas.style.cursor = "url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMiIgaGVpZ2h0PSIzMiIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImJsYWNrIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBhdGggZD0iTTIwIDIwaC03bC00LTRjLS41LS41LS41LTEuNSAwLTIgbDctN2w0IDRsLTcgN2gyMHYyWiIvPjxwYXRoIGQ9Ik0xOSA3bC01IDVsMyAzYzEuMSAxLjEgMyAxLjEgNC4xIDBsMy0zYzEuMS0xLjEgMS4xLTMgMC00LjFsLTMtM1oiLz48L3N2Zz4='), auto";
                    } else {
                        canvas.style.cursor = "url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNiIgaGVpZ2h0PSIxNiIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImJsYWNrIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBhdGggZD0iTTEyIDE5bDctNyAzIDMtNyA3LTMtM3pNMTEgMTFsLTEuNS03LjVMMiAybDMuNSAxNC41TDEzIDE4bDUtNXpNMiAybDcuNTg2IDcuNTg2Ij48L3BhdGg+PGNpcmNsZSBjeD0iMTEiIGN5PSIxMSIgcj0iMiI+PC9jaXJjbGU+PC9zdmc+'), auto";
                    }
                } else if (currentTool === "connector") {
                    canvas.style.cursor = "crosshair";
                } else {
                    canvas.style.cursor = "default";
                }

                workspace.classList.toggle("connector-tool", currentTool === "connector");
                updateConnectorPointerEvents();
                
                // Show sub-toolbars initially when tool is selected
                const toolbar = document.querySelector(".figjam-toolbar");
                const isSubActive = currentTool === "sticky" || currentTool === "marker";
                
                // Reset all sub-toolbars first
                if (colorToolbar) colorToolbar.classList.remove("active");
                if (markerToolbar) markerToolbar.classList.remove("active");
                
                if (colorToolbar && currentTool === "sticky") colorToolbar.classList.add("active");
                if (markerToolbar && currentTool === "marker") markerToolbar.classList.add("active");
                if (toolbar) toolbar.classList.toggle("sub-active", isSubActive);
                
                if (currentTool !== "select") {
                    selectElement(null);
                    clearSelectedConnector();
                }
            }
        });
    });

    // Auto-hide sub-toolbars when settings change
    const subToolbars = document.querySelectorAll('.note-color-toolbar, .marker-settings-toolbar');
    subToolbars.forEach(toolbar => {
        // Stop mousedown propagation so clicking inside the sub-toolbar doesn't 
        // trigger the parent label's toggle logic
        toolbar.addEventListener("mousedown", (e) => {
            e.stopPropagation();
        });
    });

    const subToolbarInputs = document.querySelectorAll('.note-color-toolbar input, .marker-settings-toolbar input');
    subToolbarInputs.forEach(input => {
        input.addEventListener("change", () => {
            // Give a small delay so user can see their selection
            setTimeout(() => {
                document.getElementById("note-color-toolbar")?.classList.remove("active");
                document.getElementById("marker-settings-toolbar")?.classList.remove("active");
                document.querySelector(".figjam-toolbar")?.classList.remove("sub-active");
                
                // Update cursor if marker type changed to eraser or vice versa
                if (currentTool === "marker") {
                    const settings = getMarkerSettings();
                    if (settings.type === "eraser") {
                        canvas.style.cursor = "url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMiIgaGVpZ2h0PSIzMiIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImJsYWNrIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBhdGggZD0iTTIwIDIwaC03bC00LTRjLS41LS41LS41LTEuNSAwLTIgbDctN2w0IDRsLTcgN2gyMHYyWiIvPjxwYXRoIGQ9Ik0xOSA3bC01IDVsMyAzYzEuMSAxLjEgMyAxLjEgNC4xIDBsMy0zYzEuMS0xLjEgMS4xLTMgMC00LjFsLTMtM1oiLz48L3N2Zz4='), auto";
                    } else {
                        canvas.style.cursor = "url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNiIgaGVpZ2h0PSIxNiIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImJsYWNrIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBhdGggZD0iTTEyIDE5bDctNyAzIDMtNyA3LTMtM3pNMTEgMTFsLTEuNS03LjVMMiAybDMuNSAxNC41TDEzIDE4bDUtNXpNMiAybDcuNTg2IDcuNTg2Ij48L3BhdGg+PGNpcmNsZSBjeD0iMTEiIGN5PSIxMSIgcj0iMiI+PC9jaXJjbGU+PC9zdmc+'), auto";
                    }
                }
            }, 300);
        });
    });

    // Keyboard Shortcuts for Tool Selection
    const toolKeyMap = {
        'v': 'select',
        'h': 'hand',
        'm': 'marker',
        's': 'sticky',
        'r': 'shape',
        'l': 'connector',
        't': 'text',
        'a': 'section',
        'b': 'table',
        'e': 'stamp',
        'c': 'comment',
        'w': 'widgets'
    };

    window.addEventListener("keydown", (e) => {
        // Don't trigger if user is typing in an input or contenteditable
        const target = e.target;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
            return;
        }

        const key = e.key.toLowerCase();
        if (e.ctrlKey || e.metaKey || e.altKey) return; // Prevent tool switch on shortcuts
        
        if (key === "escape" && connectorStart) {
            clearConnectorPreview();
            return;
        }

        if (toolKeyMap[key]) {
            const toolValue = toolKeyMap[key];
            const input = document.querySelector(`input[name="tool"][value="${toolValue}"]`);
            if (input) {
                input.checked = true;
                // Dispatch change event to trigger the listener above
                input.dispatchEvent(new Event('change'));
            }
        }
    });



    let currentErasedNodes = [];

    // Connector tool: capture clicks on anchor dots
    if (canvas) {
        canvas.addEventListener("mousedown", (e) => {
            if (currentTool !== "connector") return;
            const dot = e.target.closest(".connector-dot");
            if (!dot) return;
            e.preventDefault();
            e.stopPropagation();
            if (connectorStart) finishConnectorAtDot(dot);
            else beginConnectorFromDot(dot);
        }, true);

        canvas.addEventListener("mousedown", (e) => {
            if (currentTool !== "select") return;
            const path = e.target.closest("#connectors-layer path.connector-line");
            if (!path) return;
            e.preventDefault();
            e.stopPropagation();
            setSelectedConnector(path.dataset.id);
            selectElement(null);
        }, true);
    }

    // Canvas Mouse Events
    if (canvas && workspace) {
        canvas.addEventListener("mousedown", (e) => {
            // Middle click or hand tool initiates pan
            if (e.button === 1 || currentTool === "hand") {
                e.preventDefault();
                isPanning = true;
                panStartX = e.clientX - translateX;
                panStartY = e.clientY - translateY;
                canvas.style.cursor = "grabbing";
                return;
            }

            if (e.button === 0) {
                const wx = (e.clientX - translateX) / scale;
                const wy = (e.clientY - translateY) / scale;

                // Close sub-toolbars when interacting with canvas
                document.getElementById("note-color-toolbar")?.classList.remove("active");
                document.getElementById("marker-settings-toolbar")?.classList.remove("active");
                document.querySelector(".figjam-toolbar")?.classList.remove("sub-active");

                if (currentTool === "marker") {
                    const settings = getMarkerSettings();
                    if (settings.type === "eraser") {
                        currentErasedNodes = [];
                        eraseAt(wx, wy, settings.size);
                    } else {
                        isDrawing = true;
                        currentPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
                        
                        let opacity = "1";
                        if (settings.type === "highlighter") {
                            opacity = "0.5";
                        }
                        
                        currentPath.setAttribute("stroke", settings.color);
                        currentPath.setAttribute("stroke-width", settings.size);
                        currentPath.setAttribute("stroke-opacity", opacity);
                        currentPath.setAttribute("stroke-linecap", "round");
                        currentPath.setAttribute("stroke-linejoin", "round");
                        currentPath.setAttribute("fill", "none");
                        
                        pathData = `M ${wx} ${wy}`;
                        currentPath.setAttribute("d", pathData);
                        drawingLayer.appendChild(currentPath);
                    }
                } else if (currentTool === "sticky") {
                    const sticky = createStickyNote(wx, wy);
                    saveMindmap();
                    
                    const selectTool = document.querySelector('input[value="select"]');
                    if(selectTool) {
                        selectTool.checked = true;
                        selectTool.dispatchEvent(new Event('change'));
                        selectElement(sticky);
                    }
                } else if (currentTool === "connector") {
                    clearConnectorPreview();
                } else if (currentTool === "select") {
                    isSelecting = true;
                    selectStartX = e.clientX;
                    selectStartY = e.clientY;
                    
                    if (!e.shiftKey) {
                        selectElement(null);
                    }
                    
                    selectionBox.style.display = "block";
                    selectionBox.style.left = selectStartX + "px";
                    selectionBox.style.top = selectStartY + "px";
                    selectionBox.style.width = "0px";
                    selectionBox.style.height = "0px";
                }
            }
        });

        function eraseAt(wx, wy, size) {
            const eraserRadius = parseFloat(size) * 2; // Slightly larger for better feel
            const paths = drawingLayer.querySelectorAll("path");
            paths.forEach(path => {
                if (currentErasedNodes.includes(path)) return; // Already erased in this stroke
                
                const bbox = path.getBBox();
                // Check if eraser point is within a padded bbox of the path
                if (wx >= bbox.x - eraserRadius && wx <= bbox.x + bbox.width + eraserRadius &&
                    wy >= bbox.y - eraserRadius && wy <= bbox.y + bbox.height + eraserRadius) {
                    currentErasedNodes.push(path);
                    path.remove();
                }
            });
        }

        window.addEventListener("mousemove", (e) => {
            if (connectorStart && connectorPreviewPath) {
                const wx = (e.clientX - translateX) / scale;
                const wy = (e.clientY - translateY) / scale;
                const snapDot = document.elementFromPoint(e.clientX, e.clientY)?.closest?.(".connector-dot");
                let endAnchor = "left";
                let end = { x: wx, y: wy };
                if (snapDot) {
                    const snapEl = snapDot.closest(".mindmap-element");
                    if (snapEl && snapEl.id !== connectorStart.elementId) {
                        endAnchor = getAnchorFromDot(snapDot);
                        const pt = getAnchorPoint(snapEl.id, endAnchor);
                        if (pt) end = pt;
                    }
                }
                connectorPreviewPath._endPoint = end;
                connectorPreviewPath._endAnchor = endAnchor;
                updateConnectorPaths();
            } else if (isPanning) {
                translateX = e.clientX - panStartX;
                translateY = e.clientY - panStartY;
                updateWorkspaceTransform();
            } else if (currentTool === "marker") {
                const wx = (e.clientX - translateX) / scale;
                const wy = (e.clientY - translateY) / scale;
                const settings = getMarkerSettings();

                if (isDrawing) {
                    pathData += ` L ${wx} ${wy}`;
                    currentPath.setAttribute("d", pathData);
                } else if (settings.type === "eraser" && e.buttons === 1) {
                    eraseAt(wx, wy, settings.size);
                }
            } else if (isSelecting) {
                const currentX = e.clientX;
                const currentY = e.clientY;
                const left = Math.min(selectStartX, currentX);
                const top = Math.min(selectStartY, currentY);
                const width = Math.abs(currentX - selectStartX);
                const height = Math.abs(currentY - selectStartY);
                
                selectionBox.style.left = left + "px";
                selectionBox.style.top = top + "px";
                selectionBox.style.width = width + "px";
                selectionBox.style.height = height + "px";
                
                // Intersection detection
                const boxRect = selectionBox.getBoundingClientRect();
                document.querySelectorAll(".mindmap-element").forEach(el => {
                    const elRect = el.getBoundingClientRect();
                    const intersects = !(elRect.right < boxRect.left || 
                                         elRect.left > boxRect.right || 
                                         elRect.bottom < boxRect.top || 
                                         elRect.top > boxRect.bottom);
                    
                    if (intersects) {
                        if (!selectedElements.includes(el)) {
                            selectedElements.push(el);
                            el.classList.add("selected");
                        }
                    } else if (!e.shiftKey) {
                        const idx = selectedElements.indexOf(el);
                        if (idx > -1) {
                            selectedElements.splice(idx, 1);
                            el.classList.remove("selected");
                        }
                    }
                });
            } else if (resizingElement) {
                const dx = (e.clientX - resizeStartX) / scale;
                const dy = (e.clientY - resizeStartY) / scale;
                let newWidth = resizeStartWidth;
                let newHeight = resizeStartHeight;
                let newX = resizeStartLeft;
                let newY = resizeStartTop;

                if (resizeDir.includes("e")) newWidth += dx;
                if (resizeDir.includes("s")) newHeight += dy;
                if (resizeDir.includes("w")) {
                    newWidth -= dx;
                    newX += dx;
                }
                if (resizeDir.includes("n")) {
                    newHeight -= dy;
                    newY += dy;
                }

                // Minimum dimensions (Sync with CSS 200x200 min-size)
                const minSize = 200;
                if (newWidth < minSize) {
                    if (resizeDir.includes("w")) newX -= (minSize - newWidth);
                    newWidth = minSize;
                }
                if (newHeight < minSize) {
                    if (resizeDir.includes("n")) newY -= (minSize - newHeight);
                    newHeight = minSize;
                }

                resizingElement.style.width = newWidth + "px";
                resizingElement.style.minHeight = newHeight + "px";
                resizingElement.style.height = "auto";
                resizingElement.dataset.x = newX;
                resizingElement.dataset.y = newY;
                resizingElement.style.transform = `translate(${newX}px, ${newY}px)`;
                updateConnectorPaths();
            } else if (draggedElement && currentTool === "select") {
                const mouseWorkspaceX = (e.clientX - translateX) / scale;
                const mouseWorkspaceY = (e.clientY - translateY) / scale;
                const dx = mouseWorkspaceX - (parseFloat(draggedElement.dataset.dragStartX) + dragOffsetX);
                const dy = mouseWorkspaceY - (parseFloat(draggedElement.dataset.dragStartY) + dragOffsetY);
                
                selectedElements.forEach(el => {
                    const startX = parseFloat(el.dataset.dragStartX);
                    const startY = parseFloat(el.dataset.dragStartY);
                    const newX = startX + dx;
                    const newY = startY + dy;
                    el.dataset.x = newX;
                    el.dataset.y = newY;
                    el.style.transform = `translate(${newX}px, ${newY}px)`;
                });
                updateConnectorPaths();
            }
        });

        window.addEventListener("mouseup", (e) => {
            if (connectorStart) {
                const dot = document.elementFromPoint(e.clientX, e.clientY)?.closest?.(".connector-dot");
                if (dot) finishConnectorAtDot(dot);
                else clearConnectorPreview();
            }
            if (isPanning) {
                isPanning = false;
                if (currentTool === "hand") canvas.style.cursor = "grab";
                else if (currentTool === "connector") canvas.style.cursor = "crosshair";
                else canvas.style.cursor = "default";
            }
            if (isDrawing) {
                isDrawing = false;
                pushDrawingAction({ type: "add", node: currentPath });
                saveDrawings();
            }
            if (currentTool === "marker" && getMarkerSettings().type === "eraser" && currentErasedNodes.length > 0) {
                pushDrawingAction({ type: "remove", nodes: [...currentErasedNodes] });
                currentErasedNodes = [];
                saveDrawings();
            }
            if (isSelecting) {
                isSelecting = false;
                selectionBox.style.display = "none";
            }
            
            // Critical: Ensure these are always reset even if saveMindmap throws
            if (draggedElement || resizingElement) {
                saveMindmap();
                draggedElement = null;
                resizingElement = null;
            }
        });

        // Delete selected element with Backspace or Delete
        window.addEventListener("keydown", (e) => {
            if ((e.key === "Delete" || e.key === "Backspace") && selectedConnectorId) {
                if (document.activeElement.isContentEditable) return;
                connectorsData = connectorsData.filter(c => c.id !== selectedConnectorId);
                clearSelectedConnector();
                renderAllConnectorPaths();
                saveConnectors();
                e.preventDefault();
                return;
            }

            if ((e.key === "Delete" || e.key === "Backspace") && selectedElements.length > 0) {
                if (document.activeElement.isContentEditable) {
                    return; 
                }
                
                const removedIds = selectedElements.map(el => el.id);
                selectedElements.forEach(el => el.remove());
                selectedElements = [];
                removeConnectorsForElements(removedIds);
                saveMindmap();
            }
            
            if (e.key.toLowerCase() === 'c' && (e.ctrlKey || e.metaKey)) {
                if (!document.activeElement.isContentEditable) {
                    copySelectedElements();
                }
            }

            if (e.key.toLowerCase() === 'v' && (e.ctrlKey || e.metaKey)) {
                if (!document.activeElement.isContentEditable) {
                    pasteElements();
                }
            }

            // Undo with Ctrl + Z
            if (e.key.toLowerCase() === 'z' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                undoDrawing();
            }

            // Clear drawings with Alt + C
            if (e.key.toLowerCase() === 'c' && e.altKey) {
                if (confirm("Clear all drawings?")) {
                    drawingLayer.innerHTML = "";
                    saveDrawings();
                    drawingHistory = []; // Clear history too
                }
            }
        });
        
        // Simple Zoom
        canvas.addEventListener("wheel", (e) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
                const mouseX = e.clientX;
                const mouseY = e.clientY;
                const newScale = Math.min(Math.max(scale * zoomFactor, 0.1), 5);
                
                if (newScale !== scale) {
                    translateX = mouseX - (mouseX - translateX) * (newScale / scale);
                    translateY = mouseY - (mouseY - translateY) * (newScale / scale);
                    scale = newScale;
                    updateWorkspaceTransform();
                }
            } else {
                translateX -= e.deltaX;
                translateY -= e.deltaY;
                updateWorkspaceTransform();
            }
        }, { passive: false });

        // Drag & Drop Image Logic
        canvas.addEventListener("dragover", (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
        });

        canvas.addEventListener("drop", (e) => {
            e.preventDefault();
            const files = e.dataTransfer.files;
            if (files && files.length > 0) {
                const wx = (e.clientX - translateX) / scale;
                const wy = (e.clientY - translateY) / scale;
                
                Array.from(files).forEach((file, index) => {
                    if (file.type.startsWith("image/")) {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                            // Offset multiple images slightly
                            createImageNote(wx + (index * 20), wy + (index * 20), event.target.result);
                            saveMindmap();
                        };
                        reader.readAsDataURL(file);
                    }
                });
            }
        });

        renderMindmap();
        window.renderMindmap = renderMindmap;
        updateWorkspaceTransform();
    }
});
