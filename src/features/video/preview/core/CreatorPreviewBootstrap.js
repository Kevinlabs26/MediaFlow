class CreatorPreviewBootstrap {
    constructor(preview) {
        this.preview = preview;
    }

    closest(target, selector) {
        if (typeof target?.closest === 'function') return target.closest(selector);
        return target?.parentElement?.closest?.(selector) || null;
    }

    init() {
        this.cacheElements();
        this.bindEvents();
    }

    bindEvents() {
        const preview = this.preview;

        document.addEventListener('keydown', (e) => {
            if (window.app?.router?.currentPage !== 'creator') return;

            if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') {
                return;
            }

            if (e.code === 'Space') {
                e.preventDefault();
                preview.togglePlayback();
            }
        });

        preview.elements.previewStage?.addEventListener('click', (e) => {
            if (window.app?.router?.currentPage !== 'creator') return;
            if (this.closest(e.target, '.video-controls-overlay')) return;
            preview.togglePlayback();
        });

        preview.elements.video?.addEventListener('click', (e) => {
            if (window.app?.router?.currentPage !== 'creator') return;
            e.stopPropagation();
            preview.togglePlayback();
        });

        preview.elements.audioPlaceholder?.addEventListener('click', () => {
            if (window.app?.router?.currentPage !== 'creator') return;
            preview.togglePlayback();
        });
    }

    cacheElements() {
        const preview = this.preview;

        preview.elements = {
            previewStage: document.querySelector('#page-creator .video-preview-full'),
            video: document.getElementById('creator-video-preview'),
            audioPlayer: document.getElementById('creator-audio-preview'),
            audioPlaceholder: document.getElementById('audio-placeholder'),
            duration: document.getElementById('creator-duration'),
            resolution: document.getElementById('creator-resolution'),
            fps: document.getElementById('creator-fps'),
            codec: document.getElementById('creator-codec'),
            filesize: document.getElementById('creator-filesize'),
            filename: document.getElementById('creator-filename')
        };

    }

    reset() {
        const preview = this.preview;
        const { video, audioPlayer } = preview.elements;

        if (video) {
            video.pause();
            video.removeAttribute('src');
            video.load();
            video.style.transform = '';
        }

        if (audioPlayer) {
            audioPlayer.pause();
            audioPlayer.removeAttribute('src');
            audioPlayer.load();
        }

        preview.videoDuration = 0;
    }
}

window.CreatorPreviewBootstrap = CreatorPreviewBootstrap;
