/**
 * MediaFlow - basic preview for quick video tools.
 */
class CreatorPreview {
    constructor(creatorFlow) {
        this.app = creatorFlow;
        this.elements = {};
        this.videoDuration = 0;
        this._pipRaf = null;
        this._cropRaf = null;
        this.bootstrap = new window.CreatorPreviewBootstrap(this);
        this.presentation = new window.CreatorPreviewPresentation(this);
    }

    init() {
        this.bootstrap.init();
    }

    bindEvents() {
        this.bootstrap.bindEvents();
    }

    resolveMediaSrc(file) {
        if (!file) return '';
        if (typeof file === 'string') {
            return window.urlUtils ? window.urlUtils.getMediaSrc(file) : file;
        }
        if (file.path) {
            return window.urlUtils ? window.urlUtils.getMediaSrc(file) : file.path;
        }
        if (file instanceof File || file instanceof Blob) {
            return file.__cachedUrl || (file.__cachedUrl = URL.createObjectURL(file));
        }
        return '';
    }

    async togglePlayback() {
        const player = this.app.isAudioOnly ? this.elements.audioPlayer : this.elements.video;
        if (!player?.src) return;
        if (player.paused) {
            try {
                await player.play();
            } catch (error) {
                if (error?.name !== 'AbortError') {
                    console.error('[CreatorPreview] Playback failed:', error);
                }
            }
        } else {
            player.pause();
        }
    }

    seekTo(time) {
        const player = this.app.isAudioOnly ? this.elements.audioPlayer : this.elements.video;
        if (player?.src && Number.isFinite(time)) player.currentTime = time;
    }

    cacheElements() {
        this.bootstrap.cacheElements();
    }

    async loadMedia(file, isAudioOnly = false) {
        const { video, audioPlayer, audioPlaceholder, resolution } = this.elements;
        const player = isAudioOnly ? audioPlayer : video;
        const inactivePlayer = isAudioOnly ? video : audioPlayer;
        const src = this.resolveMediaSrc(file);
        if (!player || !src) return;

        inactivePlayer?.pause();
        if (inactivePlayer) {
            inactivePlayer.removeAttribute('src');
            inactivePlayer.load();
        }

        if (video) video.style.display = isAudioOnly ? 'none' : '';
        audioPlaceholder?.classList.toggle('hidden', !isAudioOnly);
        this.updateExtraMetadata(file);

        await new Promise((resolve) => {
            let settled = false;
            const finish = () => {
                if (settled) return;
                settled = true;
                player.removeEventListener('loadedmetadata', finish);
                player.removeEventListener('error', finish);
                resolve();
            };
            player.addEventListener('loadedmetadata', finish, { once: true });
            player.addEventListener('error', finish, { once: true });
            player.src = src;
            player.load();
            if (player.readyState >= 1) finish();
        });

        const duration = Number.isFinite(player.duration) ? player.duration : 0;
        this.videoDuration = duration;
        this.app.videoDuration = duration;
        this.updateDurationDisplay(duration);

        if (!isAudioOnly && video) {
            if (resolution) resolution.textContent = `${video.videoWidth} × ${video.videoHeight}`;
            if (video.videoWidth && video.videoHeight) {
                this.app.uiManager?.updateCropUIFromMedia(video.videoWidth, video.videoHeight);
            }
        } else if (resolution) {
            resolution.textContent = '-';
        }
    }

    async replaceMediaSource(file, isAudioOnly = this.app.isAudioOnly) {
        return this.loadMedia(file, isAudioOnly);
    }

    updateExtraMetadata(file) {
        return this.presentation.updateExtraMetadata(file);
    }

    formatFileSize(bytes) {
        return this.presentation.formatFileSize(bytes);
    }

    async fetchMediaInfo(filePath) {
        return this.presentation.fetchMediaInfo(filePath);
    }

    parseFrameRate(fpsString) {
        return this.presentation.parseFrameRate(fpsString);
    }

    updateDurationDisplay(seconds) {
        return this.presentation.updateDurationDisplay(seconds);
    }

    setVideoVisibility(visible) {
        return this.presentation.setVideoVisibility(visible);
    }

    applyTransform(transform = {}) {
        return this.presentation.applyTransform(transform);
    }

    updateVerticalPreview(isVisible, options = {}) {
        return this.presentation.updateVerticalPreview(isVisible, options);
    }

    updateCropPreview(isVisible, options = {}) {
        return this.presentation.updateCropPreview(isVisible, options);
    }

    reset() {
        this.bootstrap.reset();
    }

    updateClipVolume(_trackId, _segmentIndex, volume) {
        const player = this.app.isAudioOnly ? this.elements.audioPlayer : this.elements.video;
        if (player) player.volume = Math.max(0, Math.min(1, volume));
    }
}

window.CreatorPreview = CreatorPreview;
