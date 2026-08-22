/**
 * MediaFlow - CreatorFlow Module
 */

class CreatorFlow {
    constructor(app) {
        this.app = app;
        window.creatorFlow = this;

        this.videoFile = null;
        this.audioFile = null;
        this.videoDuration = 0;
        this.isProcessing = false;
        this.isAudioOnly = false;
        this.clipSegments = [];
        this.silenceSegments = [];
        this.silenceProcessor = null;

        this.service = new window.CreatorService();
        this.uiManager = new window.CreatorUIManager(this);
        this.previewHandler = new window.CreatorPreview(this);
        this.audioHandler = new window.CreatorAudioHandler(this);
        this.bootstrap = new window.CreatorFlowBootstrap(this);
        this.toolDispatcher = new window.CreatorFlowToolDispatcher(this);
    }

    init() {
        this.bootstrap.init();
    }

    setupPiP() {
        this.bootstrap.setupPiP();
    }

    enableVideoDrag(container) {
        this.bootstrap.enableVideoDrag(container);
    }

    updateInputsFromRegion(start, end) {
        const startStr = this.service.formatTime(start);
        const endStr = this.service.formatTime(end);
        this.uiManager.updateClipInputs(startStr, endStr);
    }

    formatTimeSimple(seconds) {
        return this.service.formatTime(seconds);
    }

    setupSilenceRemoval() {
        // Deprecated: delegated to SilenceProcessor.init()
    }

    async checkFileExists(path) {
        if (!path) return false;

        const exists = await this.service.checkFileExists(path);
        if (!exists) {
            window.app?.showToast(
                window.i18n?.t('creator.toasts.fileNotFound') || 'Source file not found. Please check if it was deleted or moved.',
                'error'
            );
            return false;
        }
        return true;
    }

    async addLocalFile(filePath) {
        if (!filePath) return;

        const name = filePath.split(/[/\\]/).pop();
        const { type } = this.service.inferFileType(filePath);

        const mockFile = {
            name,
            path: filePath,
            type,
            lastModified: Date.now()
        };

        this.handleFileSelect([mockFile]);
    }

    async showInputDialog(title, placeholder = '', defaultValue = '') {
        return await this.uiManager.showInputDialog(title, placeholder, defaultValue);
    }

    getMediaPath(fileLike) {
        if (!fileLike) return '';
        if (typeof fileLike === 'string') return fileLike;
        return fileLike.path || '';
    }

    createMediaFileRef(filePath, fallback = this.videoFile || this.audioFile) {
        const inferred = this.service.inferFileType(filePath);
        return {
            name: filePath.split(/[\\/]/).pop(),
            path: filePath,
            type: fallback?.type || inferred.type || '',
            lastModified: Date.now()
        };
    }

    async applyProcessedMediaToEditor(outputPath, sourcePath = null) {
        if (!outputPath) return;

        const originalPath = sourcePath || this.getMediaPath(this.videoFile) || this.getMediaPath(this.audioFile);
        if (!originalPath) return;

        const nextFile = this.createMediaFileRef(outputPath);
        const matchesSource = (fileLike) => this.getMediaPath(fileLike) === originalPath;

        if (matchesSource(this.videoFile)) {
            this.videoFile = nextFile;
        }
        if (matchesSource(this.audioFile)) {
            this.audioFile = nextFile;
        }

        await this.previewHandler?.replaceMediaSource(nextFile, this.isAudioOnly);

        const filenameEl = document.getElementById('creator-filename');
        if (filenameEl) {
            filenameEl.textContent = nextFile.name;
            filenameEl.title = nextFile.name;
        }
    }

    async handleSegmentAction(action, data, segments) {
        return this.toolDispatcher.handleSegmentAction(action, data, segments);
    }

    handleFileSelect(arg) {
        if (!arg) return;

        let files = (typeof FileList !== 'undefined' && arg instanceof FileList)
            ? Array.from(arg)
            : (Array.isArray(arg) ? arg : [arg]);
        files = files.filter(f => f.type.startsWith('video/') || f.type.startsWith('audio/') || f.type.startsWith('image/'));

        if (files.length === 0) {
            window.app?.showToast(window.i18n?.t('creator.toasts.selectMediaFile') || 'Please select a video or audio file', 'error');
            return;
        }

        const isAlreadyInBatch = this.batchFlow && this.batchFlow.batchFiles.length > 0;
        if (files.length > 1 || isAlreadyInBatch) {
            this.batchFlow.addFiles(files);
            return;
        }

        const file = files[0];
        this.videoFile = file;
        this.isAudioOnly = file.type.startsWith('audio/');
        this.audioFile = this.isAudioOnly ? file : null;

        this.uiManager.showSingleModeUI();

        const filenameEl = document.getElementById('creator-filename');
        if (filenameEl) {
            filenameEl.textContent = file.name;
        }

        this.uiManager.updateToolState(this.isAudioOnly);
        this.previewHandler.loadMedia(file, this.isAudioOnly);

        setTimeout(() => this.videoProcessor?.ui?.updateSizeEstimation?.(), 100);
    }

    showProgress(status, percent = 0, canCancel = false, onCancel = null) {
        this.isProcessing = true;
        this.uiManager.showProgress(status, percent, canCancel, onCancel);
    }

    updateProgress(percent, status) {
        this.uiManager.updateProgress(percent, status);
    }

    hideProgress() {
        this.isProcessing = false;
        this.uiManager.hideProgress();
    }

    showToast(msg, type = 'info') {
        window.app?.showToast(msg, type);
    }

    reset() {
        console.log('[CreatorFlow] Cleaning up state...');

        this.videoFile = null;
        this.audioFile = null;
        this.videoDuration = 0;
        this.isProcessing = false;
        this.isAudioOnly = false;
        this.clipSegments = [];
        this.silenceSegments = [];

        this.uiManager.resetUI();

        if (this.previewHandler) {
            this.previewHandler.reset();
        } else {
            const video = document.getElementById('creator-video-preview');
            if (video) {
                video.onerror = null;
                video.removeAttribute('src');
                video.load();
            }

            const audioPlayer = document.getElementById('creator-audio-preview');
            if (audioPlayer) {
                audioPlayer.onerror = null;
                audioPlayer.removeAttribute('src');
                audioPlayer.load();
            }
        }

        const audioPlaceholder = document.getElementById('audio-placeholder');
        if (audioPlaceholder) {
            audioPlaceholder.classList.add('hidden');
        }

        this.batchFlow?.reset();
    }

    async loadGlobalSettings() {
        try {
            const globalPath = await window.mediaflow?.store?.get('last_creator_output_path');
            const input = document.getElementById('creator-output-path');
            if (globalPath && input) input.value = globalPath;
        } catch (error) {
            console.error('[CreatorFlow] Failed to load global settings:', error);
        }
    }

    async executeTool(action, params = {}) {
        return this.toolDispatcher.executeTool(action, params);
    }

}

window.CreatorFlow = CreatorFlow;
