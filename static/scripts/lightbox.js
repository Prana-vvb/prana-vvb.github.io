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

    let scale = 1;
    let pointX = 0, pointY = 0;
    let isDragging = false;
    let dragStartX = 0, dragStartY = 0;

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

    function setTransform(animate = false) {
        img.style.transition = animate ? 'transform 0.25s ease-in-out' : 'none';
        img.style.transform = `translate(${pointX}px, ${pointY}px) scale(${scale})`;
    }

    function resetZoom() {
        scale = 1;
        pointX = 0;
        pointY = 0;
        setTransform(true);
        img.style.cursor = 'grab';
    }

    function openLightbox(index) {
        currentIndex = index;
        img.src = images[currentIndex].src;
        caption.textContent = images[currentIndex].caption;
        lightbox.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        resetZoom();
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

    lightbox.addEventListener('wheel', (e) => {
        if (lightbox.style.display !== 'flex' || e.target !== img) return;
        e.preventDefault();

        const xs = (e.clientX - pointX) / scale;
        const ys = (e.clientY - pointY) / scale;
        const delta = (e.deltaY > 0) ? -1 : 1;

        if (delta > 0) {
            scale *= 1.2;
        } else {
            scale /= 1.2;
        }

        scale = Math.max(1, Math.min(scale, 6));

        if (scale > 1) {
            pointX = e.clientX - xs * scale;
            pointY = e.clientY - ys * scale;
            img.style.cursor = 'grab';
        } else {
            pointX = 0;
            pointY = 0;
        }
        setTransform(false);
    }, { passive: false });

    let lastTap = 0;
    img.addEventListener('click', (e) => {
        e.stopPropagation();
        const currentTime = new Date().getTime();
        const tapLength = currentTime - lastTap;

        if (tapLength < 300 && tapLength > 0) {
            if (scale > 1) {
                resetZoom();
            } else {
                scale = 2.5;
                pointX = 0;
                pointY = 0;
                setTransform(true);
            }
        }
        lastTap = currentTime;
    });

    img.addEventListener('mousedown', (e) => {
        if (scale > 1) {
            e.preventDefault();
            isDragging = true;
            dragStartX = e.clientX - pointX;
            dragStartY = e.clientY - pointY;
            img.style.cursor = 'grabbing';
        }
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDragging || scale === 1) return;
        pointX = e.clientX - dragStartX;
        pointY = e.clientY - dragStartY;
        setTransform(false);
    });

    window.addEventListener('mouseup', () => {
        isDragging = false;
        if (scale > 1) img.style.cursor = 'grab';
    });

    let touchStartX = 0, touchStartY = 0;
    let touchEndX = 0, touchEndY = 0;
    let initialDistance = 0;
    let initialScale = 1;

    lightbox.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
            initialDistance = Math.hypot(
                e.touches[0].pageX - e.touches[1].pageX,
                e.touches[0].pageY - e.touches[1].pageY
            );
            initialScale = scale;
        } else if (e.touches.length === 1) {
            touchStartX = e.changedTouches[0].screenX;
            touchStartY = e.changedTouches[0].screenY;
            if (scale > 1) {
                isDragging = true;
                dragStartX = e.touches[0].pageX - pointX;
                dragStartY = e.touches[0].pageY - pointY;
            }
        }
    }, { passive: false });

    lightbox.addEventListener('touchmove', (e) => {
        if (lightbox.style.display !== 'flex') return;

        if (e.touches.length === 2) {
            e.preventDefault();
            const currentDistance = Math.hypot(
                e.touches[0].pageX - e.touches[1].pageX,
                e.touches[0].pageY - e.touches[1].pageY
            );
            scale = initialScale * (currentDistance / initialDistance);
            scale = Math.max(1, Math.min(scale, 6));

            if (scale === 1) {
                pointX = 0;
                pointY = 0;
            }
            setTransform(false);
        } else if (e.touches.length === 1 && scale > 1) {
            e.preventDefault();
            if (isDragging) {
                pointX = e.touches[0].pageX - dragStartX;
                pointY = e.touches[0].pageY - dragStartY;
                setTransform(false);
            }
        }
    }, { passive: false });

    lightbox.addEventListener('touchend', (e) => {
        isDragging = false;

        if (e.touches.length < 2) {
            initialDistance = 0;
        }

        if (scale === 1 && e.changedTouches.length === 1) {
            touchEndX = e.changedTouches[0].screenX;
            touchEndY = e.changedTouches[0].screenY;
            handleSwipe();
        }
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
