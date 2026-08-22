/**
 * featureLoader.js — on-demand feature bundles (classic scripts).
 * Phase D: Enhance + Subtitle + Creator lazy load.
 *
 * Cold-start keeps shared pieces:
 * - TranslationService, SubtitleDisplayMode
 */
(function (root) {
    const ENHANCE_SCRIPTS = Object.freeze([
        'features/enhance/EnhanceSmartSelector.js',
        'features/enhance/EnhanceZoomViewer.js',
        'features/enhance/EnhanceInfoManager.js',
        'features/enhance/EnhanceExportManager.js',
        'features/enhance/EnhanceUIManager.js',
        'features/enhance/EnhanceProcessManager.js',
        'features/enhance/EnhanceSettingsManager.js',
        'features/enhance/EnhanceStateManager.js',
        'features/enhance/EnhanceFlow.js'
    ]);

    // TranslationService + SubtitleDisplayMode stay on cold-start (shared).
    const SUBTITLE_SCRIPTS = Object.freeze([
        'features/subtitle/SubtitleUtils.js',
        'features/subtitle/dubbing/SubtitleDubSegmentPlanner.js',
        'features/subtitle/dubbing/SubtitleDubTimingPlanner.js',
        'features/subtitle/dubbing/SubtitleDubGroupPlanner.js',
        'features/subtitle/dubbing/SubtitleDubAdapter.js',
        'features/subtitle/SubtitleService.js',
        'features/subtitle/SubtitleListRenderer.js',
        'features/subtitle/SubtitleEditorActionHandler.js',
        'features/subtitle/SubtitleEditor.js',
        'features/subtitle/SubtitleSearchHandler.js',
        'features/subtitle/SubtitleQualityHandler.js',
        'features/subtitle/SubtitleTrackManager.js',
        'features/subtitle/SubtitleTemplateManager.js',
        'features/subtitle/SubtitleContextMenu.js',
        'features/subtitle/SubtitlePreviewHandler.js',
        'features/subtitle/TTSConfig.js',
        'features/subtitle/SubtitleTTSHandler.js',
        'features/subtitle/SubtitleBatchHandler.js',
        'features/subtitle/SubtitleStyleManager.js',
        'features/subtitle/SubtitlePreferenceManager.js',
        'features/subtitle/ui/SubtitleUIBase.js',
        'features/subtitle/ui/SubtitleUITransform.js',
        'features/subtitle/ui/SubtitleUILayout.js',
        'features/subtitle/ui/SubtitleUISearch.js',
        'features/subtitle/ui/SubtitleUISettings.js',
        'features/subtitle/ui/SubtitleUIInject.js',
        'features/subtitle/ui/SubtitleTTSLocalUI.js',
        'features/subtitle/SubtitleUIManager.js',
        'features/subtitle/SubtitleMediaHandler.js',
        'features/subtitle/SubtitleVisualOptimizer.js',
        'features/subtitle/SubtitleAIHandler.js',
        'features/subtitle/SubtitleExportHandler.js',
        'features/subtitle/AudioWaveformLoader.js',
        'features/subtitle/SubtitleTimelineRenderer.js',
        'features/subtitle/SubtitleTimelineClips.js',
        'features/subtitle/SubtitleAudioManager.js',
        'features/subtitle/SubtitleAudioActionHandler.js',
        'features/subtitle/SubtitleTimeline.js',
        'features/subtitle/SubtitleDraftManager.js',
        'features/subtitle/SubtitleFlow.js'
    ]);

    const CREATOR_SCRIPTS = Object.freeze([
        'features/video/BatchListRenderer.js',
        'features/video/BatchFileManager.js',
        'features/video/BatchUIManager.js',
        'features/video/TransitionManager.js',
        'features/video/BatchMergePreview.js',
        'features/video/BatchPreviewRenderer.js',
        'features/video/BatchTaskRunner.js',
        'features/video/BatchProcessor.js',
        'features/video/CreatorService.js',
        'features/video/ui/DialogManager.js',
        'features/video/ui/InspectorManager.js',
        'features/video/ui/QuickToolsRenderer.js',
        'features/video/ui/ToolSettingsManager.js',
        'features/video/CreatorUIManager.js',
        'features/video/preview/core/CreatorPreviewBootstrap.js',
        'features/video/preview/core/CreatorPreviewPresentation.js',
        'features/video/CreatorPreview.js',
        'features/video/BatchCreatorFlow.js',
        'features/video/SilenceProcessor.js',
        'features/video/audio/core/CreatorAudioMixerTools.js',
        'features/video/audio/core/CreatorAudioDemucsResults.js',
        'features/video/audio/core/CreatorAudioDemucsTools.js',
        'features/video/CreatorAudioHandler.js',
        'features/video/VideoService.js',
        'features/video/VideoUIManager.js',
        'features/video/VideoProcessor.js',
        'features/video/flow/core/CreatorFlowBootstrap.js',
        'features/video/flow/core/CreatorFlowToolDispatcher.js',
        'features/video/CreatorFlow.js'
    ]);

    /** @type {Promise<*>|null} */
    let enhancePromise = null;
    let subtitlePromise = null;
    /** @type {Promise<*>|null} */
    let creatorPromise = null;

    let _loadingDepth = 0;

    function t(key, fb) {
        try {
            const v = root.i18n?.t?.(key);
            if (v && v !== key) return v;
        } catch {
            /* ignore */
        }
        return fb;
    }

    function showFeatureLoading(featureKey) {
        if (typeof document === 'undefined') return;
        _loadingDepth += 1;
        let el = document.getElementById('feature-loading-overlay');
        if (!el) {
            el = document.createElement('div');
            el.id = 'feature-loading-overlay';
            el.className = 'feature-loading-overlay';
            el.setAttribute('role', 'status');
            el.setAttribute('aria-live', 'polite');
            el.innerHTML =
                '<div class="feature-loading-card">' +
                '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i>' +
                '<span class="feature-loading-text"></span>' +
                '</div>';
            document.body.appendChild(el);
        }
        const labels = {
            enhance: t('common.loadingFeature.enhance', 'Loading AI Enhance…'),
            subtitle: t('common.loadingFeature.subtitle', 'Loading Subtitle studio…'),
            creator: t('common.loadingFeature.creator', 'Loading Creator tools…')
        };
        const text = el.querySelector('.feature-loading-text');
        if (text) text.textContent = labels[featureKey] || t('common.loadingFeature.generic', 'Loading…');
        el.classList.add('is-visible');
    }

    function hideFeatureLoading() {
        if (typeof document === 'undefined') return;
        _loadingDepth = Math.max(0, _loadingDepth - 1);
        if (_loadingDepth > 0) return;
        const el = document.getElementById('feature-loading-overlay');
        if (el) el.classList.remove('is-visible');
    }

    async function withFeatureLoading(featureKey, fn) {
        showFeatureLoading(featureKey);
        try {
            return await fn();
        } finally {
            hideFeatureLoading();
        }
    }

    async function ensureEnhance() {
        if (root.EnhanceFlow && typeof root.EnhanceFlow.init === 'function') {
            return root.EnhanceFlow;
        }

        if (enhancePromise) return enhancePromise;

        enhancePromise = withFeatureLoading('enhance', async () => {
            const loader = root.ScriptLoader;
            if (!loader?.loadScripts) {
                throw new Error('[FeatureLoader] ScriptLoader missing');
            }

            await loader.loadScripts(ENHANCE_SCRIPTS);

            if (!root.EnhanceFlow || typeof root.EnhanceFlow.init !== 'function') {
                const Cls = root.EnhanceFlowClass;
                if (typeof Cls !== 'function') {
                    throw new Error('[FeatureLoader] EnhanceFlowClass not found after script load');
                }
                root.EnhanceFlow = new Cls();
            }

            return root.EnhanceFlow;
        }).catch((err) => {
            enhancePromise = null;
            console.error('[FeatureLoader] ensureEnhance failed:', err);
            throw err;
        });

        return enhancePromise;
    }

    async function ensureSubtitle(app) {
        if (root.subtitleFlow && typeof root.subtitleFlow.init === 'function') {
            return root.subtitleFlow;
        }

        if (subtitlePromise) return subtitlePromise;

        subtitlePromise = withFeatureLoading('subtitle', async () => {
            const loader = root.ScriptLoader;
            if (!loader?.loadScripts) {
                throw new Error('[FeatureLoader] ScriptLoader missing');
            }

            if (!root.TranslationService) {
                console.warn(
                    '[FeatureLoader] TranslationService not on window yet — subtitle AI may fail until loaded'
                );
            }

            await loader.loadScripts(SUBTITLE_SCRIPTS);

            const SubtitleCls = root.SubtitleFlow;
            if (typeof SubtitleCls !== 'function') {
                throw new Error('[FeatureLoader] SubtitleFlow not found after script load');
            }

            const appRef = app || root.app || null;
            const flow = new SubtitleCls(appRef);
            root.subtitleFlow = flow;
            if (appRef) {
                appRef.subtitleFlow = flow;
            }

            if (typeof flow.init === 'function' && !flow._featureLoaderInited) {
                await flow.init();
                flow._featureLoaderInited = true;
            }

            return flow;
        }).catch((err) => {
            subtitlePromise = null;
            console.error('[FeatureLoader] ensureSubtitle failed:', err);
            throw err;
        });

        return subtitlePromise;
    }

    /**
     * Ensure Creator toolbox scripts + CreatorFlow are ready (once).
     * @param {object} [app]
     * @returns {Promise<object|null>}
     */
    async function ensureCreator(app) {
        if (root.creatorFlow && typeof root.creatorFlow.init === 'function') {
            return root.creatorFlow;
        }

        if (creatorPromise) return creatorPromise;

        creatorPromise = withFeatureLoading('creator', async () => {
            const loader = root.ScriptLoader;
            if (!loader?.loadScripts) {
                throw new Error('[FeatureLoader] ScriptLoader missing');
            }

            await loader.loadScripts(CREATOR_SCRIPTS);

            const CreatorCls = root.CreatorFlow;
            if (typeof CreatorCls !== 'function') {
                throw new Error('[FeatureLoader] CreatorFlow not found after script load');
            }

            const appRef = app || root.app || null;
            const flow = new CreatorCls(appRef);
            root.creatorFlow = flow;
            if (appRef) {
                appRef.creatorFlow = flow;
            }

            if (typeof flow.init === 'function' && !flow._featureLoaderInited) {
                await flow.init();
                flow._featureLoaderInited = true;
            }

            return flow;
        }).catch((err) => {
            creatorPromise = null;
            console.error('[FeatureLoader] ensureCreator failed:', err);
            throw err;
        });

        return creatorPromise;
    }

    root.FeatureLoader = {
        ENHANCE_SCRIPTS,
        SUBTITLE_SCRIPTS,
        CREATOR_SCRIPTS,
        ensureEnhance,
        ensureSubtitle,
        ensureCreator
    };
})(typeof window !== 'undefined' ? window : globalThis);
