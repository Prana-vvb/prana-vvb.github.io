document.addEventListener("DOMContentLoaded", () => {
    let lightbox = document.getElementById("lightbox");
    if (!lightbox) {
        lightbox = document.createElement("div");
        lightbox.id = "lightbox";
        lightbox.innerHTML = `
            <span class="lightbox-close">&times;</span>
            <span class="lightbox-btn lightbox-prev">&#10094;</span>
            <span class="lightbox-btn lightbox-next">&#10095;</span>
            <div class="lightbox-content-wrapper">
                <img id="lightbox-img" src="" alt="">
                <div id="lightbox-caption"></div>
            </div>
        `;
        document.body.appendChild(lightbox);
    }

    const img = document.getElementById('lightbox-img');
    const caption = document.getElementById('lightbox-caption');
    const closeBtn = document.querySelector('.lightbox-close');
    const prevBtn = document.querySelector('.lightbox-prev');
    const nextBtn = document.querySelector('.lightbox-next');

    const triggerElements = document.querySelectorAll('.lightbox-trigger, .markdown-body img, .bottom-image img, .photo-card img');

    let images = [];
    let currentIndex = 0;

    triggerElements.forEach((el, index) => {
        const src = el.getAttribute('data-src') || el.src;
        const cap = el.getAttribute('data-caption') || el.alt || "";

        images.push({ src, caption: cap });

        el.style.cursor = 'zoom-in';

        el.addEventListener('click', (e) => {
            e.preventDefault();
            openLightbox(index);
        });
    });

    if (images.length === 0) return;

    if (images.length === 1) {
        prevBtn.style.display = 'none';
        nextBtn.style.display = 'none';
    }

    function openLightbox(index) {
        currentIndex = index;
        img.src = images[currentIndex].src;
        caption.textContent = images[currentIndex].caption;
        lightbox.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }

    function closeLightbox() {
        lightbox.style.display = 'none';
        document.body.style.overflow = '';
    }

    function showNext(e) {
        if (e) e.stopPropagation();
        currentIndex = (currentIndex + 1) % images.length;
        openLightbox(currentIndex);
    }

    function showPrev(e) {
        if (e) e.stopPropagation();
        currentIndex = (currentIndex - 1 + images.length) % images.length;
        openLightbox(currentIndex);
    }

    closeBtn.addEventListener('click', closeLightbox);
    nextBtn.addEventListener('click', showNext);
    prevBtn.addEventListener('click', showPrev);

    lightbox.addEventListener('click', (e) => {
        if (e.target === lightbox || e.target.classList.contains('lightbox-content-wrapper')) {
            closeLightbox();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (lightbox.style.display === 'flex') {
            if (e.key === 'Escape') closeLightbox();
            if (e.key === 'ArrowRight') showNext();
            if (e.key === 'ArrowLeft') showPrev();
        }
    });

    let touchStartX = 0;
    let touchStartY = 0;
    let touchEndX = 0;
    let touchEndY = 0;

    lightbox.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
    }, { passive: true });

    lightbox.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        touchEndY = e.changedTouches[0].screenY;
        handleSwipe();
    }, { passive: true });

    function handleSwipe() {
        const swipeThreshold = 50;

        const diffX = touchStartX - touchEndX;
        const diffY = touchStartY - touchEndY;

        if (images.length > 1) {
            if (Math.abs(diffX) > Math.abs(diffY)) {
                if (diffX > swipeThreshold) {
                    showNext();
                } else if (diffX < -swipeThreshold) {
                    showPrev();
                }
            }
        }
    }
});
