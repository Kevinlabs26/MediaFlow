class CreatorFlowBootstrap {
    constructor(flow) {
        this.flow = flow;
    }

    closest(target, selector) {
        if (typeof target?.closest === 'function') return target.closest(selector);
        return target?.parentElement?.closest?.(selector) || null;
    }

    init() {
        const flow = this.flow;

        flow.uiManager.init();
        flow.previewHandler.init();
        flow.audioHandler.init();
        flow.loadGlobalSettings();

        this.bindResetButton();

        if (window.i18n?.updateUI) {
            window.i18n.updateUI();
        }

        this.initOptionalModules();
        flow.batchFlow = new window.BatchCreatorFlow(flow);
        flow.batchFlow.init();

        this.setupPiP();
    }

    initOptionalModules() {
        const flow = this.flow;

        if (window.SilenceProcessor) {
            flow.silenceProcessor = new window.SilenceProcessor(flow);
            flow.silenceProcessor.init();
        } else {
            console.error('SilenceProcessor not loaded');
        }

        if (window.VideoProcessor) {
            flow.videoProcessor = new window.VideoProcessor(flow);
            flow.videoProcessor.init();
        } else {
            console.error('VideoProcessor not found');
        }
    }

    bindResetButton() {
        document.getElementById('btn-reset-video')?.addEventListener('click', () => this.flow.reset());
    }

    setupPiP() {
        const pipBtn = document.getElementById('btn-pip-video');
        const video = document.getElementById('creator-video-preview');
        if (!pipBtn || !video) return;

        if (!document.pictureInPictureEnabled) {
            pipBtn.style.display = 'none';
            return;
        }

        pipBtn.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();

            const videoSrc = video.src || video.currentSrc;
            const currentTime = video.currentTime || 0;

            if (!videoSrc) {
                window.app?.showToast?.(window.i18n?.t('creator.toasts.loadVideoFirst') || 'Please load a video first', 'warning');
                return;
            }

            try {
                await window.mediaflow.pip.open({ videoSrc, currentTime });
                pipBtn.classList.add('active');
                window.app?.showToast?.(window.i18n?.t('creator.toasts.pipOpen') || 'Picture-in-Picture window opened', 'success');
            } catch (err) {
                console.error('PiP error:', err);
                const toastMsg = window.i18n?.t('creator.toasts.pipFail', { error: err.message || 'Unknown' }) || (`Failed to start PiP: ${err.message || 'Unknown'}`);
                window.app?.showToast?.(toastMsg, 'error');
            }
        };

        if (window.mediaflow?.pip?.onClosed) {
            window.mediaflow.pip.onClosed(() => {
                pipBtn.classList.remove('active');
            });
        }
    }

    enableVideoDrag(container) {
        let isDragging = false;
        let offsetX;
        let offsetY;

        const onMouseDown = (e) => {
            if (this.closest(e.target, '.video-controls-overlay') || e.target?.tagName === 'VIDEO') return;

            isDragging = true;
            offsetX = e.clientX - container.getBoundingClientRect().left;
            offsetY = e.clientY - container.getBoundingClientRect().top;
            container.style.cursor = 'grabbing';
            e.preventDefault();
        };

        const onMouseMove = (e) => {
            if (!isDragging) return;
            container.style.left = `${e.clientX - offsetX}px`;
            container.style.top = `${e.clientY - offsetY}px`;
            container.style.right = 'auto';
            container.style.bottom = 'auto';
        };

        const onMouseUp = () => {
            isDragging = false;
            container.style.cursor = '';
        };

        container.removeEventListener('mousedown', container._dragMouseDown);
        document.removeEventListener('mousemove', container._dragMouseMove);
        document.removeEventListener('mouseup', container._dragMouseUp);

        container._dragMouseDown = onMouseDown;
        container._dragMouseMove = onMouseMove;
        container._dragMouseUp = onMouseUp;

        container.addEventListener('mousedown', onMouseDown);
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }
}

window.CreatorFlowBootstrap = CreatorFlowBootstrap;
