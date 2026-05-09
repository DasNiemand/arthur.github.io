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
        localStorage.setItem("setting_" + key, JSON.stringify(val));
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
    function applyBackgroundSettings() {
        const mode = getSetting("bg_mode", "video");
        const brightness = getSetting("bg_brightness", 25);
        const speed = getSetting("bg_speed", 0.5);
        const customSrc = getSetting("bg_custom_src", null);
        
        const colors = getSetting("bg_colors", ["#1a1a1a", "#333333"]);
        const angle = getSetting("bg_color_angle", 45);

        const video = document.getElementById("backgroundVideo");
        const prevVideo = document.getElementById("bg-preview-video");
        const prevGif = document.getElementById("bg-preview-gif");
        
        let colorBg = document.getElementById("color-background");
        if (!colorBg) {
            colorBg = document.createElement("div");
            colorBg.id = "color-background";
            colorBg.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;z-index:-1;`;
            document.body.insertBefore(colorBg, document.body.firstChild);
        }

        if (mode === "color") {
            if (video) video.style.display = "none";
            if (prevVideo) prevVideo.style.display = "none";
            if (prevGif) prevGif.style.display = "none";
            const gifBg = document.getElementById("gif-background");
            if (gifBg) gifBg.style.display = "none";
            
            const grad = `linear-gradient(${angle}deg, ${colors.join(', ')})`;
            colorBg.style.display = "block";
            colorBg.style.background = grad;
            
            const p = document.getElementById("bg-color-preview");
            if (p) p.style.background = grad;
        } else {
            colorBg.style.display = "none";
            const updateEl = (el, isMain) => {
                if (!el) return;
                el.style.filter = `brightness(${brightness}%)`;
                if (el.tagName === "VIDEO") el.playbackRate = speed;
            };

            updateEl(video, true);
            updateEl(prevVideo, false);
            if (prevGif) prevGif.style.filter = `brightness(${brightness}%)`;

            if (customSrc && customSrc !== "default") {
                if (customSrc.startsWith("data:video")) {
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
                } else if (customSrc.startsWith("data:image")) {
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
        localStorage.setItem("cards", JSON.stringify(cards));
    }

    function loadCards() {
        if (!cardWrapper) return;
        Array.from(cardWrapper.children)
            .filter(c => c.id !== "add-new-card")
            .forEach(c => c.remove());
        const savedCards = JSON.parse(localStorage.getItem("cards"));
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
    // 9. DRAG & DROP + VIDEO HOVER
    // ------------------------------------------
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
    // 11. DOWNLOAD / UPLOAD
    // ------------------------------------------
    if (downloadCardsBtn) {
        downloadCardsBtn.addEventListener("click", () => {
            const data = localStorage.getItem("cards");
            if (!data) { showNotification("Lỗi", "Không có dữ liệu thẻ."); return; }
            const blob = new Blob([data], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url; a.download = "cards_backup.json";
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
            reader.onload = ev => {
                try {
                    const uploaded = JSON.parse(ev.target.result);
                    if (Array.isArray(uploaded)) {
                        localStorage.setItem("cards", JSON.stringify(uploaded));
                        initializeCardPage();
                        showNotification("Thành công", "Đã khôi phục dữ liệu thành công!");
                    } else throw new Error("Dữ liệu không hợp lệ.");
                } catch (err) { showNotification("Lỗi", err.message); }
            };
            reader.readAsText(file);
        });
    }

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
        const vidControls = document.getElementById("bg-video-controls");
        const colControls = document.getElementById("bg-color-controls");
        
        if (btnVideo && btnColor && vidControls && colControls) {
            if (mode === "video") {
                btnVideo.style.backgroundColor = "#333";
                btnVideo.style.color = "#fff";
                btnColor.style.backgroundColor = "transparent";
                btnColor.style.color = "";
                vidControls.style.display = "flex";
                colControls.style.display = "none";
            } else {
                btnColor.style.backgroundColor = "#333";
                btnColor.style.color = "#fff";
                btnVideo.style.backgroundColor = "transparent";
                btnVideo.style.color = "";
                colControls.style.display = "flex";
                vidControls.style.display = "none";
            }
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
        bgUploadInput.addEventListener("change", e => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = ev => {
                const base64 = ev.target.result;
                setSetting("bg_custom_src", base64);
                applyBackgroundSettings();
            };
            reader.readAsDataURL(file);
        });
    }

    // Background reset
    const bgResetBtn = document.getElementById("bg-reset-btn");
    if (bgResetBtn) {
        bgResetBtn.addEventListener("click", () => {
            setSetting("bg_brightness", 25);
            setSetting("bg_speed", 0.5);
            setSetting("bg_custom_src", null);
            applyBackgroundSettings();
            syncSettingsUI();
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

    const colorResetBtn = document.getElementById("bg-color-reset-btn");
    if (colorResetBtn) colorResetBtn.addEventListener("click", () => {
        setSetting("bg_colors", ["#1a1a1a", "#333333"]);
        setSetting("bg_color_angle", 45);
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
        mainContentArea.innerHTML = initialCardStructure;
        cardWrapper = document.getElementById("card-wrapper");
        addCardBtn = document.getElementById("add-new-card");
        setupModalListeners();
        isInitialLoad = true;
        loadCards();
        isInitialLoad = false;
    }

    function loadPage(pageUrl) {
        if (pageUrl === "page_a.html") {
            location.reload();
            return;
        }
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

    initializeCardPage();
});
