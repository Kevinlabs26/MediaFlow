/**
 * MediaFlow - CreatorUIManager
 * 核心调度器：负责 DOM 缓存、界面状态管理及子模块分发
 * 遵循单文件 < 300 行规范，业务逻辑已解耦至 ui/ 目录下
 */

class CreatorUIManager {
    constructor(app) {
        this.app = app;
        this.elements = {};

        // 子管理器初始化
        this.dialogs = new window.DialogManager(this);
        this.inspector = new window.InspectorManager(this);
        this.quickTools = new window.QuickToolsRenderer(this);
        this.toolSettings = new window.ToolSettingsManager(this);
    }

    /**
     * 初始化 UI 系统
     */
    init() {
        this.cacheElements();
        this.inspector.init();
        this.toolSettings.init();
        this.setupDragDrop();
        this.setupFloatingPreviewControls();
        window.addEventListener('languageChanged', () => this.refreshI18n());

        // 初始 UI 状态
        this.resetUI();
        this.setMode();
    }

    /**
     * 缓存 DOM 元素引用
     */
    cacheElements() {
        this.elements = {
            mainLayout: document.getElementById('view-single-tool'),
            uploadZone: document.getElementById('creator-upload-zone'),
            batchPanel: document.getElementById('batch-panel'),
            videoInfo: document.getElementById('creator-video-info'),
            quickToolsGrid: document.getElementById('creator-quick-tools'),
            btnSelectMedia: document.getElementById('btn-creator-select-media'),
            fileInput: document.getElementById('creator-video-file'),
            rootContainer: document.getElementById('page-creator'),
            singleView: document.getElementById('creator-single-view'),
            batchView: document.getElementById('creator-batch-view'),

            // Header & Tools
            btnToggleInspector: document.getElementById('creator-btn-toggle-inspector'),

            // Meta Bar Quick Tools
            btnQuickRotate: document.getElementById('btn-quick-rotate'),
            btnQuickMirror: document.getElementById('btn-quick-mirror'),
            btnQuickCrop: document.getElementById('btn-quick-crop'),

            // Inspector Tabs
            inspectorTabs: document.querySelectorAll('#page-creator .inspector-tab'),
            tabPanels: document.querySelectorAll('#page-creator .tab-content'),
            btnPropertiesTab: document.getElementById('tab-btn-properties'),

            // Tool Inputs
            rotateSelect: document.getElementById('prop-rotate-angle'),
            mirrorSection: document.getElementById('prop-section-mirror'),
            propCropW: document.getElementById('prop-crop-w'),
            propCropH: document.getElementById('prop-crop-h'),
            propCropRatio: document.getElementById('prop-crop-ratio'),
            propCropOrigRes: document.getElementById('prop-crop-orig-res'),
            btnLockCropRatio: document.getElementById('btn-lock-crop-ratio'),
            btnApplyCrop: document.getElementById('btn-prop-apply-crop'),
            clipStart: document.getElementById('clip-start-time'),
            clipEnd: document.getElementById('clip-end-time'),
            btnMakeVertical: document.getElementById('btn-make-vertical')
        };
    }

    /**
     * Creator is now a single quick-tools workspace.
     */
    setMode() {
        const { mainLayout, rootContainer, quickToolsGrid } = this.elements;
        if (!mainLayout || !rootContainer) return;

        const hasFile = !!this.app.videoFile;
        rootContainer.classList.toggle('no-video', !hasFile);
        mainLayout.classList.toggle('no-video', !hasFile);

        rootContainer.classList.remove('mode-quick');
        rootContainer.classList.add('mode-quick');
        mainLayout.classList.remove('mode-quick');
        mainLayout.classList.add('mode-quick');

        if (hasFile) {
            quickToolsGrid?.classList.remove('hidden');
            this.quickTools.render();
        } else {
            quickToolsGrid?.classList.add('hidden');
        }
        this.inspector.focusTool(null);
        mainLayout.classList.remove('inspector-active');
    }

    setupFloatingPreviewControls() {
        const root = this.elements.rootContainer || document.getElementById('page-creator');
        root?.addEventListener('click', (event) => {
            const closeButton = event.target?.closest?.('.btn-close-preview');
            if (!closeButton) return;
            closeButton.closest('.preview-float-window')?.classList.add('hidden');
        });
    }

    /**
     * 业务逻辑委派 (Delegation)
     */
    showProgress(s, p, c, o) { this.dialogs.showProgress(s, p, c, o); }
    updateProgress(p, s) { this.dialogs.updateProgress(p, s); }
    hideProgress() { this.dialogs.hideProgress(); }
    showInputDialog(t, p, d) { return this.dialogs.showInputDialog(t, p, d); }
    askConfirm(m) { return this.dialogs.askConfirm(m); }
    askFolderPath() { return this.dialogs.askFolderPath(); }

    focusTool(id) { this.inspector.focusTool(id); }
    hideProperties() { this.inspector.focusTool(null); }
    showOnlySections(ids) { this.inspector.showOnlySections(ids); }
    showAllSections() { this.inspector.showAllSections(); }
    showProperties(t, d) { this.toolSettings.showProperties(t, d); }
    updateCropUIFromMedia(w, h) { this.toolSettings.updateCropUIFromMedia(w, h); }
    updateClipInputs(s, e) { this.toolSettings.updateClipInputs(s, e); }
    updateToolState(isAudio) { this.quickTools.updateToolState(isAudio); }

    // 基础 UI 重置
    resetUI() {
        const { uploadZone, mainLayout, rootContainer, videoInfo, batchPanel, quickToolsGrid, fileInput } = this.elements;
        uploadZone?.classList.remove('hidden');
        videoInfo?.classList.add('hidden');
        batchPanel?.classList.add('hidden');
        quickToolsGrid?.classList.add('hidden');
        this.elements.singleView?.classList.remove('hidden');
        this.elements.batchView?.classList.add('hidden');

        if (rootContainer) {
            rootContainer.classList.add('no-video', 'mode-quick');
        }

        if (mainLayout) {
            mainLayout.classList.add('no-video', 'mode-quick');
            mainLayout.classList.remove('inspector-active');
        }

        // 关键：清空 fileInput.value，否则第二次选择同路径文件时
        // 浏览器认为 value 未变，不会触发 change 事件，导致无法重新导入
        if (fileInput) fileInput.value = '';
    }

    setupDragDrop() {
        const { uploadZone, fileInput } = this.elements;
        if (!uploadZone) return;

        uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('dragover'); });
        uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
        uploadZone.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadZone.classList.remove('dragover');
            if (e.dataTransfer?.files?.length > 0) this.app.handleFileSelect(e.dataTransfer.files);
        });

        // 点击整个区域触发文件选择
        uploadZone.addEventListener('click', () => {
            // 如果点击的是按钮本身，由按钮事件冒泡处理（或者统一处理）
            fileInput?.click();
        });

        // 文件选择变更
        fileInput?.addEventListener('change', (e) => {
            if (e.target.files.length > 0) this.app.handleFileSelect(e.target.files);
        });
    }

    showSingleModeUI() {
        const { uploadZone, videoInfo, mainLayout, singleView, batchView } = this.elements;
        uploadZone?.classList.add('hidden');
        videoInfo?.classList.remove('hidden');
        mainLayout?.classList.remove('hidden');
        singleView?.classList.remove('hidden');
        batchView?.classList.add('hidden');
        this.setMode();
    }

    refreshI18n() {
        const { rootContainer } = this.elements;
        if (rootContainer && window.i18n?.updateUI) {
            window.i18n.updateUI(rootContainer);
        }

        this.inspector.syncButtonState();
        if (this.app.videoFile) {
            this.quickTools.render();
            this.quickTools.updateToolState(!!this.app.isAudioOnly);
        }
    }
}

window.CreatorUIManager = CreatorUIManager;
