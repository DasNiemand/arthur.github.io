document.addEventListener("DOMContentLoaded", function () {
    
    // Khai báo DOM Elements
    let addCardBtn = document.getElementById("source-add-card-btn"); 
    const cardWrapper = document.getElementById("card-wrapper");
    const toggleBtn = document.querySelector(".toggle-btn");
    const navigation = document.querySelector(".navigation");
    const backgroundVideo = document.getElementById("backgroundVideo");
    const sourceCard = document.getElementById("source-card-container"); 
    
    // Khai báo thêm DOM Elements cho Download/Upload
    const downloadBtn = document.getElementById("download-cards-btn");
    const uploadTrigger = document.getElementById("upload-cards-trigger");
    const uploadInput = document.getElementById("upload-cards-input");

    // Khởi tạo biến cần thiết
    let targetCardsInWrapper = [];
    let initialPositions = new Map();
    let usedSuitIndices = []; 
    
    const SUIT_IMAGES = [
        "cardc1.png", "cardc2.png", "cardc3.png", "cardc4.png", 
        "cardc5.png", "cardc6.png", "cardc7.png", "cardc8.png", 
        "cardc9.png", "cardc10.png", "cardc11.png", "cardc12.png",
    ];
    
    // Cài đặt tốc độ video
    if (backgroundVideo) {
        backgroundVideo.playbackRate = 0.5;
    }
    
    /**
     * Lấy vị trí tuyệt đối của Nút Thêm Thẻ (Thẻ gốc ảo)
     * Đây là vị trí "từ" mà hiệu ứng Deal sẽ bắt đầu.
     */
    function getSourceCardPosition() {
        if (!addCardBtn) {
            return { left: 0, top: 0 };
        }
        // Lấy vị trí của Nút Thêm Thẻ (đã có margin: 0 trong CSS, 
        // và container source-card-container có margin 15px)
        const rect = addCardBtn.getBoundingClientRect(); 
        
        return {
            left: rect.left + window.scrollX,
            top: rect.top + window.scrollY
        };
    }


    // --- CHỨC NĂNG LƯU/TẢI THẺ TỪ LOCALSTORAGE ---

    function saveCards() {
        const cards = [];
        if (!cardWrapper) return;

        const cardElements = Array.from(cardWrapper.children);

        cardElements.forEach((card) => {
            const suitIndex = card.getAttribute("data-suit-index");
            cards.push({
                url: card.href,
                suitIndex: suitIndex ? parseInt(suitIndex) : null,
            });
        });
        localStorage.setItem("cards", JSON.stringify(cards));
    }

    function getNextSuitIndex(preferredIndex = null) {
        let index = preferredIndex;
        if (index === null || usedSuitIndices.includes(index)) {
            do {
                index = Math.floor(Math.random() * SUIT_IMAGES.length);
            } while (usedSuitIndices.includes(index));
        }
        usedSuitIndices.push(index);
        return index;
    }

    function updateTargetCardsList() {
        targetCardsInWrapper = Array.from(
            cardWrapper ? cardWrapper.querySelectorAll(".card2") : []
        );
    }
    
    /**
     * @param {string} url - URL của thẻ
     * @param {boolean} shouldSave - Có lưu vào localStorage không
     * @param {number|null} preferredSuitIndex - Index hình nền đã lưu (để tái tạo)
     */
    function createCard(url, shouldSave = true, preferredSuitIndex = null) {
        if (!url || !url.startsWith("http")) {
            if (shouldSave) return;
        }

        const suitIndexToUse = getNextSuitIndex(preferredSuitIndex);
        const randomSuitImage = SUIT_IMAGES[suitIndexToUse];
        
        const newCard = document.createElement("a");
        // Bắt đầu ở trạng thái "collecting" để chuẩn bị cho hiệu ứng deal
        newCard.className = "card2 collecting"; 
        newCard.href = url;
        newCard.target = "_blank";
        newCard.setAttribute("draggable", "true");
        newCard.setAttribute("data-suit-index", suitIndexToUse); 

        let domainName;
        let firstLetter = "";
        let remainingDomainName = "";

        try {
            const fullDomain = new URL(url).hostname;
            domainName = fullDomain.startsWith("www.")
                ? fullDomain.substring(4)
                : fullDomain;
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

        newCard.innerHTML = `
            <span class="card2-initial-top-left-M">${firstLetter}</span>
            <span class="card2-initial-bottom-right-M">${firstLetter}</span>
            <div class="card2-border"></div>
            <span class="card2-vertical-text">${remainingDomainName}</span>
            <span class="card2-vertical-text2">${remainingDomainName}</span>
            <div class="card2-center-suit" style="background-image: url('${randomSuitImage}');"></div>
        `;

        newCard.addEventListener(
            "animationend",
            () => {
                newCard.classList.remove("is-new");
            },
            { once: true }
        );
        
        cardWrapper.appendChild(newCard);
        
        updateTargetCardsList();
        
        if (shouldSave) {
            saveCards(); 
            // Chạy hiệu ứng deal ngay khi tạo thẻ mới
            runDealEffectForNewCard(newCard);
        }
    }

    function loadCards() {
        if (!cardWrapper) return;

        usedSuitIndices = [];

        Array.from(cardWrapper.children).forEach((card) => card.remove());

        const savedCards = JSON.parse(localStorage.getItem("cards"));

        if (savedCards) {
            savedCards.forEach((cardData) => {
                // Tái tạo thẻ, KHÔNG lưu lại lần nữa
                createCard(cardData.url, false, cardData.suitIndex); 
            });
        }
        
        updateTargetCardsList();
        
        // Chạy hiệu ứng chia bài cho tất cả các thẻ đã load
        if (targetCardsInWrapper.length > 0 && sourceCard) {
            runDealEffect(targetCardsInWrapper);
        }
    }

    // --- CHỨC NĂNG TẢI XUỐNG (DOWNLOAD) ---
    function downloadCards() {
        const savedData = localStorage.getItem("cards");
        if (!savedData || savedData === '[]') {
            alert("Không có dữ liệu thẻ để tải xuống.");
            return;
        }

        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(savedData);
        
        // Tạo một thẻ <a> tạm thời để kích hoạt tải xuống
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "cards_backup.json");
        document.body.appendChild(downloadAnchorNode); 
        
        // Kích hoạt click để tải xuống
        downloadAnchorNode.click();
        
        // Dọn dẹp
        downloadAnchorNode.remove();
        alert("Đã tải xuống file cards_backup.json.");
    }


    // --- CHỨC NĂNG TẢI LÊN (UPLOAD) ---
    function handleUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();

        reader.onload = function(e) {
            try {
                const uploadedData = JSON.parse(e.target.result);
                
                // Ghi đè dữ liệu thẻ cũ bằng dữ liệu mới tải lên
                localStorage.setItem("cards", JSON.stringify(uploadedData));
                
                // Tải lại các thẻ trên giao diện
                loadCards(); 
                
                alert("Đã tải lên thành công và cập nhật thẻ.");
            } catch (error) {
                alert("Lỗi: File tải lên không phải định dạng JSON hợp lệ.");
                console.error("Lỗi khi đọc file JSON:", error);
            }
        };

        reader.readAsText(file);
    }
    
    // --- CHỨC NĂNG XỬ LÝ SỰ KIỆN CHÍNH ---

    if (toggleBtn) {
        toggleBtn.addEventListener("click", function () {
            if (navigation) {
                navigation.classList.toggle("nav-hidden");
            }
        });
    }

    if (addCardBtn) {
        addCardBtn.addEventListener("click", function (e) {
            e.preventDefault();
            const url = prompt("Vui lòng nhập URL:");
            if (url) {
                if (cardWrapper) {
                    createCard(url); 
                } else {
                    alert("Không tìm thấy vùng chứa thẻ.");
                }
            }
        });
    }

    // --- XỬ LÝ SỰ KIỆN CHO DOWNLOAD/UPLOAD ---
    if (downloadBtn) {
        downloadBtn.addEventListener("click", function(e) {
            e.preventDefault();
            downloadCards();
        });
    }

    if (uploadTrigger) {
        uploadTrigger.addEventListener("click", function(e) {
            e.preventDefault();
            // Kích hoạt input file ẩn khi click vào nút trigger
            uploadInput.click();
        });
    }

    if (uploadInput) {
        uploadInput.addEventListener("change", handleUpload);
    }

    // --- HIỆU ỨNG CHIA BÀI FLIP ---

    const transitionDuration = 300; 
    const slideDuration = 200; 
    const dealDelay = 100; 
    
    // Chức năng lấy vị trí (FLIP First)
    const storePositions = () => {
        initialPositions.clear();
        targetCardsInWrapper.forEach((card) => {
            const rect = card.getBoundingClientRect();
            initialPositions.set(card, {
                left: rect.left,
                top: rect.top,
            });
        });
    };

    // Chạy hiệu ứng chia bài cho MỘT thẻ duy nhất
    function runDealEffectForNewCard(newCard) {
        if (!sourceCard) return;

        const sourcePos = getSourceCardPosition(); 
        
        // 1. LƯU VỊ TRÍ FIRST
        storePositions(); 

        // 2. Kích hoạt Flexbox (LAST STATE) cho thẻ mới
        newCard.classList.remove("collecting");
        newCard.style.transform = "";
        newCard.style.visibility = "visible";
        newCard.style.opacity = "1";

        void newCard.offsetWidth; // Reflow

        // 3. Áp dụng INVERT & PLAY cho CÁC THẺ CŨ ĐÃ TRONG FLOW
        targetCardsInWrapper.forEach((card) => {
            if (card === newCard) return; 
            
            const rect = card.getBoundingClientRect();
            const prevPos = initialPositions.get(card);

            if (prevPos) {
                const deltaX = prevPos.left - rect.left;
                const deltaY = prevPos.top - rect.top;

                if (deltaX !== 0 || deltaY !== 0) {
                    card.style.transition = "none";
                    card.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
                    void card.offsetWidth;

                    card.style.transition = `transform ${slideDuration}ms ease-out`;
                    card.style.transform = "none";
                    
                    setTimeout(() => {
                        card.style.transition = "none";
                    }, slideDuration);
                }
            }
        });

        // 4. Áp dụng INVERT & PLAY cho THẺ MỚI (Deal Effect)
        const newCardRect = newCard.getBoundingClientRect();

        const newCardDeltaX = sourcePos.left - newCardRect.left;
        const newCardDeltaY = sourcePos.top - newCardRect.top;

        // INVERT: Dịch chuyển thẻ mới về vị trí của thẻ gốc
        newCard.style.transition = "none";
        newCard.style.transform = `translate(${newCardDeltaX}px, ${newCardDeltaY}px)`;
        void newCard.offsetWidth;

        // PLAY: Trượt từ vị trí Gốc (đã invert) đến vị trí Flexbox của nó
        newCard.style.transition = `transform ${transitionDuration}ms ease-out, opacity 300ms ease-in`;
        newCard.style.transform = "none";
        
        setTimeout(() => {
            newCard.style.transition = "none";
        }, transitionDuration);
    }
    
    // Chạy hiệu ứng chia bài cho TOÀN BỘ thẻ (dùng khi load trang)
    function runDealEffect(cardsToDeal) {
        if (!sourceCard || cardsToDeal.length === 0) return;

        const sourcePos = getSourceCardPosition(); 
        let currentCardsInFlow = []; 

        // GIAI ĐOẠAN 1: THIẾT LẬP TRẠNG THÁI KHỞI ĐẦU 
        cardsToDeal.forEach((card) => {
            card.classList.add("collecting"); 
            card.style.transform = `translate(${sourcePos.left}px, ${sourcePos.top}px)`; 
            card.style.opacity = "0";
            card.style.visibility = "hidden";
            card.style.transition = "none"; 
        });
        
        // GIAI ĐOẠAN 2: THỰC HIỆN HIỆU ỨNG FLIP CHO TỪNG THẺ
        setTimeout(() => {
            cardsToDeal.forEach((newCard, index) => {
                setTimeout(() => {
                    // 1. LƯU VỊ TRÍ FIRST 
                    storePositions(); 
                    
                    // 2. Kích hoạt Flexbox (LAST STATE)
                    newCard.classList.remove("collecting");
                    newCard.style.transform = "";
                    newCard.style.visibility = "visible";
                    newCard.style.opacity = "1";

                    void newCard.offsetWidth; 

                    // 3. Áp dụng INVERT & PLAY cho CÁC THẺ CŨ ĐÃ TRONG FLOW
                    currentCardsInFlow.forEach((card) => {
                        const rect = card.getBoundingClientRect();
                        const prevPos = initialPositions.get(card);

                        if (prevPos) {
                            const deltaX = prevPos.left - rect.left;
                            const deltaY = prevPos.top - rect.top;

                            if (deltaX !== 0 || deltaY !== 0) {
                                card.style.transition = "none";
                                card.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
                                void card.offsetWidth;

                                card.style.transition = `transform ${slideDuration}ms ease-out`;
                                card.style.transform = "none";
                                
                                setTimeout(() => {
                                    card.style.transition = "none";
                                }, slideDuration);
                            }
                        }
                    });

                    // 4. Áp dụng INVERT & PLAY cho THẺ MỚI (Deal Effect)
                    const newCardRect = newCard.getBoundingClientRect();
                    const newCardDeltaX = sourcePos.left - newCardRect.left;
                    const newCardDeltaY = sourcePos.top - newCardRect.top;

                    // INVERT: Dịch chuyển thẻ mới về vị trí của thẻ gốc
                    newCard.style.transition = "none";
                    newCard.style.transform = `translate(${newCardDeltaX}px, ${newCardDeltaY}px)`;
                    void newCard.offsetWidth;

                    // PLAY: Trượt từ vị trí Gốc (đã invert) đến vị trí Flexbox của nó
                    newCard.style.transition = `transform ${transitionDuration}ms ease-out, opacity 300ms ease-in`;
                    newCard.style.transform = "none";
                    
                    setTimeout(() => {
                        newCard.style.transition = "none";
                    }, transitionDuration);

                    // 5. CẬP NHẬT TRẠNG THÁI 
                    currentCardsInFlow.push(newCard);
                }, index * dealDelay);
            });
        }, 50); // delayBeforeStart
    }
    
    // --- KHỞI TẠO ---
    loadCards(); 
});