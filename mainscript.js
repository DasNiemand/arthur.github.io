document.addEventListener("DOMContentLoaded", function () {
    // ------------------------------------------
    // 1. KHAI BÁO VÀ THIẾT LẬP BAN ĐẦU
    // ------------------------------------------

    // KHAI BÁO CÁC PHẦN TỬ DOM
    const mainContentArea = document.getElementById("main-content-area");
    const navLinks = document.querySelectorAll(".nav-link");
    const toggleBtn = document.querySelector(".toggle-btn");
    const navigation = document.querySelector(".navigation");
    const modalOverlay = document.querySelector(".modal-overlay");
    const modalAddBtn = document.querySelector(".modal-add-btn");
    const modalUrlInput = document.getElementById("modal-url-input");
    const downloadCardsBtn = document.getElementById("download-cards-btn");
    const uploadCardsTrigger = document.getElementById("upload-cards-trigger");
    const uploadCardsInput = document.getElementById("upload-cards-input");
    const backgroundVideo = document.getElementById("backgroundVideo");



    
    // Các biến cần được cập nhật lại khi Trang A được tải
    let cardWrapper = document.getElementById("card-wrapper");
    let addCardBtn = document.getElementById("add-new-card");

    // Biến toàn cục
    let draggedCard = null;
    let hoverTimeout = null;
    let isInitialLoad = true;

    // Cấu trúc HTML mặc định của Trang A (để tái tạo)
    const initialCardStructure = `
        <div class="card-container"> 
            <div id="card-wrapper">
                <a id="add-new-card" class="card add-new-card"></a>
            </div>
        </div>
    `;

    const SUIT_IMAGES = [
        "cardc1.png",
        "cardc2.png",
        "cardc3.png",
        "cardc4.png",
        "cardc5.png",
        "cardc6.png",
        "cardc7.png",
        "cardc8.png",
        "cardc9.png",
        "cardc10.png",
        "cardc11.png",
        "cardc12.png",
    ];

    // Thiết lập tốc độ phát lại video nền
    if (backgroundVideo) {
        backgroundVideo.playbackRate = 0.5;
    }


    // ------------------------------------------
    // 2. CHỨC NĂNG LƯU/TẢI DỮ LIỆU
    // ------------------------------------------

    function saveCards() {
        const cards = [];
        // Đảm bảo cardWrapper không null (chỉ xảy ra ở Trang A)
        if (!cardWrapper) return;

        // Lấy tất cả thẻ ngoại trừ thẻ 'add-new-card'
        const cardElements = Array.from(cardWrapper.children).filter(
            (child) => child.id !== "add-new-card"
        );

        cardElements.forEach((card) => {
            // Lấy suitIndex từ data attribute
            const suitIndex = card.getAttribute("data-suit-index");
            // LƯU CẢ suitIndex
            cards.push({
                url: card.href,
                suitIndex: suitIndex ? parseInt(suitIndex) : null,
            });
        });
        localStorage.setItem("cards", JSON.stringify(cards));
    }

    function loadCards() {
        if (!cardWrapper) return;

        // Reset bộ đếm và mảng theo dõi khi tải lại thẻ
        let cardCreationCount = 0;
        let usedSuitIndices = [];

        // Xóa tất cả thẻ hiện có (ngoại trừ thẻ thêm mới)
        Array.from(cardWrapper.children)
            .filter((child) => child.id !== "add-new-card")
            .forEach((card) => card.remove());

        const savedCards = JSON.parse(localStorage.getItem("cards"));

        if (savedCards) {
            savedCards.forEach((cardData) => {
                // Kiểm tra: Nếu là dữ liệu cũ (chỉ có url), gán suitIndex là null
                const suitIndexToUse =
                    cardData.suitIndex !== undefined ? cardData.suitIndex : null;

                // Truyền suitIndex đã lưu vào createCard
                createCard(cardData.url, false, suitIndexToUse);
            });
        }
    }


    // ------------------------------------------
    // 3. CHỨC NĂNG TẠO THẺ VÀ HIỆU ỨNG CHIA BÀI
    // ------------------------------------------

    /**
     * @param {string} url - URL của thẻ
     * @param {boolean} shouldSave - Có lưu vào localStorage không
     */
    function createCard(
        url,
        shouldSave = true
    ) {
        if (!url || !url.startsWith("http")) {
            if (shouldSave) return;
        }

        const newCard = document.createElement("a");
        newCard.className = "card is-new"; // Dùng 'is-new' cho hiệu ứng xuất hiện
        newCard.href = url;
        newCard.target = "_self";
        newCard.setAttribute("draggable", "true");

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

        const randomSuitImage =
            SUIT_IMAGES[Math.floor(Math.random() * SUIT_IMAGES.length)];

        newCard.innerHTML = `
            <span class="card-initial-top-left">${firstLetter}</span>
            <span class="card-initial-bottom-right">${firstLetter}</span>
            <div class="card-border"></div>
            <span class="card-title">${remainingDomainName}</span>
            <span class="card-title1">${remainingDomainName}</span>
            <div class="card-center-suit" style="background-image: url('${randomSuitImage}');"></div>
        `;

        const removeBtn = document.createElement("button");
        removeBtn.className = "card-remove-btn";
        removeBtn.textContent = "";

        // Gắn listener xóa class 'is-new' sau animation
        newCard.addEventListener(
            "animationend",
            () => {
                newCard.classList.remove("is-new");
            },
            { once: true }
        );

        // >>> GẮN CẢ DRAG VÀ HOVER LISTENER NGAY TẠI ĐÂY <<<
        addDragListeners(newCard);
        addVideoHoverListeners(newCard); // Gắn listener hover video nền

        if (shouldSave) {
            saveCards();
        }

        newCard.appendChild(removeBtn);
        // Chèn thẻ mới vào trước thẻ 'add-new-card'
        cardWrapper.insertBefore(newCard, addCardBtn);
    }


    // ------------------------------------------
    // 4. CHỨC NĂNG DRAG, DROP VÀ VIDEO HOVER
    // ------------------------------------------

    const HOVER_BRIGHTNESS = 'brightness(25%)';
    const DEFAULT_BRIGHTNESS = 'brightness(15%)';
    const BACKGROUND_VIDEO_TRANSITION = 'filter 0.5s ease-in-out';

    function addVideoHoverListeners(cardElement) {
        if (cardElement.id === "add-new-card") return;

        if (!backgroundVideo) return;

        // Sự kiện khi di chuột vào (mouseover)
        cardElement.addEventListener('mouseover', () => {
            backgroundVideo.style.filter = HOVER_BRIGHTNESS;
            backgroundVideo.style.transition = BACKGROUND_VIDEO_TRANSITION;
        });

        // Sự kiện khi di chuột ra (mouseout)
        cardElement.addEventListener('mouseout', () => {
            backgroundVideo.style.filter = DEFAULT_BRIGHTNESS;
        });
    }

    function addDragListeners(cardElement) {
        if (cardElement.id === "add-new-card") return;

        // DRAG & DROP LOGIC
        cardElement.addEventListener("dragstart", (e) => {
            draggedCard = cardElement;
            cardElement.classList.add("is-dragging");
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/html", cardElement.innerHTML);
            if (cardWrapper) cardWrapper.classList.add("dragging");
        });

        cardElement.addEventListener("dragend", () => {
            draggedCard = null;
            cardElement.classList.remove("is-dragging");
            if (cardWrapper) cardWrapper.classList.remove("dragging");
            saveCards();
        });

        cardElement.addEventListener("dragover", (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
        });

        cardElement.addEventListener("drop", (e) => {
            e.preventDefault();

            if (draggedCard && draggedCard !== cardElement && cardWrapper) {
                const cardElements = Array.from(cardWrapper.children).filter(
                    (child) => child.id !== "add-new-card"
                );
                const draggedIndex = cardElements.indexOf(draggedCard);
                const dropIndex = cardElements.indexOf(cardElement);

                if (draggedIndex < dropIndex) {
                    cardWrapper.insertBefore(draggedCard, cardElement.nextSibling);
                } else {
                    cardWrapper.insertBefore(draggedCard, cardElement);
                }
            }
        });
    }


    // ------------------------------------------
    // 5. CHỨC NĂNG KHÁC VÀ KHỞI TẠO (Không thay đổi DOM chính)
    // ------------------------------------------

    // NAV BAR TOGGLE
    if (toggleBtn) {
        toggleBtn.addEventListener("click", function () {
            if (navigation) {
                navigation.classList.toggle("nav-hidden");
            }
        });
    }

    // MODAL INPUT
    function setupModalListeners() {
        // Gắn sự kiện cho Add Card Button (chỉ khi nó tồn tại)
        if (addCardBtn) {
            // Loại bỏ listener cũ nếu có (Quan trọng khi gọi lại initializeCardPage)
            const cloneAddBtn = addCardBtn.cloneNode(true);
            addCardBtn.replaceWith(cloneAddBtn);
            addCardBtn = cloneAddBtn; // Cập nhật lại biến tham chiếu

            addCardBtn.addEventListener("click", function () {
                if (modalOverlay) {
                    modalOverlay.classList.remove("modal-hidden");
                    modalUrlInput.value = "";
                    modalUrlInput.focus();
                }
            });
        }
    }
    setupModalListeners(); // Gắn lần đầu

    if (modalOverlay) {
        modalOverlay.addEventListener("click", function (e) {
            if (e.target === modalOverlay) {
                modalOverlay.classList.add("modal-hidden");
            }
        });
    }

    if (modalAddBtn) {
        modalAddBtn.addEventListener("click", function () {
            const url = modalUrlInput.value.trim();
            if (url) {
                // Đảm bảo cardWrapper không null trước khi tạo card
                if (cardWrapper) {
                    createCard(url);
                    modalOverlay.classList.add("modal-hidden");
                } else {
                    alert("Không thể thêm thẻ. Vui lòng chuyển về Trang A trước.");
                }
            } else {
                alert("Vui lòng nhập URL.");
            }
        });
    }

    if (modalUrlInput) {
        modalUrlInput.addEventListener("keypress", function (e) {
            if (e.key === "Enter") {
                modalAddBtn.click();
            }
        });
    }

    // DOWNLOAD/UPLOAD
    if (downloadCardsBtn) {
        downloadCardsBtn.addEventListener("click", function () {
            const cardsData = localStorage.getItem("cards");
            if (!cardsData) {
                alert("Không có dữ liệu thẻ nào để tải xuống.");
                return;
            }

            const blob = new Blob([cardsData], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "cards_backup.json";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });
    }

    if (uploadCardsTrigger) {
        uploadCardsTrigger.addEventListener("click", function (e) {
            e.preventDefault();
            uploadCardsInput.click();
        });
    }

    if (uploadCardsInput) {
        uploadCardsInput.addEventListener("change", function (e) {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function (event) {
                    try {
                        const uploadedCards = JSON.parse(event.target.result);
                        if (Array.isArray(uploadedCards)) {
                            localStorage.setItem("cards", JSON.stringify(uploadedCards));
                            initializeCardPage(); // Tải lại Trang A để hiển thị thẻ mới
                            alert("Đã khôi phục dữ liệu thành công!");
                        } else {
                            throw new Error("Dữ liệu không hợp lệ.");
                        }
                    } catch (error) {
                        alert("Lỗi khi đọc file: " + error.message);
                    }
                };
                reader.readAsText(file);
            }
        });
    }

    // ------------------------------------------
    // 6. LOGIC CHUYỂN TRANG AJAX VÀ KHỞI TẠO LẠI
    // ------------------------------------------

    /**
     * Tái tạo cấu trúc Trang A (Trang Card) và khởi tạo lại các sự kiện.
     */
    function initializeCardPage() {
        // 1. Tái tạo cấu trúc HTML (Đảm bảo ID card-wrapper tồn tại)
        mainContentArea.innerHTML = initialCardStructure;

        // 2. Cập nhật lại các biến DOM (vì nội dung đã thay đổi)
        cardWrapper = document.getElementById("card-wrapper");
        addCardBtn = document.getElementById("add-new-card");

        // 3. Khởi tạo lại các sự kiện cho Add Card Button
        setupModalListeners();

        // 4. Tải và tạo lại các card đã lưu
        isInitialLoad = true;
        loadCards();
        isInitialLoad = false;
    }

    /**
     * Tải nội dung từ file HTML vào vùng chính.
     * @param {string} pageUrl - Đường dẫn đến file HTML.
     */
    function loadPage(pageUrl) {
    // Xử lý Trang A (Trang Card/Home)
    if (pageUrl === "page_a.html") {
        initializeCardPage(); // Gọi hàm khởi tạo Trang Card
        return;
    }
    // ... (các hàm xử lý sự kiện cho navLinks)

// 7. KHỞI TẠO BAN ĐẦU
// Đảm bảo rằng khi trang TẢI LẠI hoàn toàn, Trang A (trang thẻ) được tạo ra
// và các thẻ đã lưu được tải lại.
if (mainContentArea.innerHTML.trim() === '') { 
    // Giả sử trang ban đầu là Trang A.
    // Nếu mainContentArea trống, hãy tải Trang A.
    initializeCardPage();
} else {
    // Nếu nội dung đã có sẵn (vd: Trang A mặc định), vẫn cần loadCards()
    // Nhưng vì Trang A được tạo bằng initialCardStructure, nên gọi initializeCardPage là an toàn nhất.
    // Tuy nhiên, nếu HTML ban đầu ĐÃ có card-wrapper, chỉ cần loadCards.
    // => Phương án an toàn: Nếu đang ở Trang A, hãy loadCards.
    if (document.getElementById("card-wrapper")) {
        loadCards();
    }
}
// Xử lý cho các trang B, C, D (hoặc trang trống mới)
    cardWrapper = null;
    addCardBtn = null;

    fetch(pageUrl)
        .then((response) => {
            if (!response.ok) {
                throw new Error("Không thể tải trang: " + response.statusText);
            }
            return response.text();
        })
        .then((html) => {
            // 1. Chèn nội dung mới (Trang B, C, D)
            mainContentArea.innerHTML = html;

            // 2. >>> PHẦN THAY ĐỔI QUAN TRỌNG: Kích hoạt logic riêng <<<
            if (pageUrl === "page_b.html") {
                // Gọi hàm khởi tạo logic gom bài từ file page_b_logic.js
                // LƯU Ý: File page_b_logic.js PHẢI được link trong file HTML GỐC
                initializePageBLogic(); 
            }
            // >>> KẾT THÚC PHẦN THAY ĐỔI QUAN TRỌNG <<<

        })
        .catch((error) => {
            console.error("Lỗi khi tải trang:", error);
            mainContentArea.innerHTML = `
                <div style="text-align: center; color: white; padding-top: 50px;">
                    <h1 style="color: red;">Lỗi tải nội dung</h1>
                    <p>Không tìm thấy nội dung cho trang này. Vui lòng kiểm tra file <b>${pageUrl}</b>.</p>
                </div>`;
        });
}

    // Thiết lập sự kiện click cho các nút điều hướng
    navLinks.forEach((link) => {
        link.setAttribute("href", "#");

        link.addEventListener("click", function (event) {
            event.preventDefault();

            const pageToLoad = this.getAttribute("data-page");
            loadPage(pageToLoad);
        });


        
    });

initializeCardPage();

});
