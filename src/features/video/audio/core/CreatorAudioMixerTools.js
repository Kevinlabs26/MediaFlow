class CreatorAudioMixerTools {
    constructor(handler) {
        this.handler = handler;
    }

    setupDenoiseListeners() {
        document.getElementById('btn-denoise')?.addEventListener('click', () => this.handler.denoiseAudio());
        document.getElementById('btn-prop-run-denoise')?.addEventListener('click', () => {
            const level = document.getElementById('prop-denoise-level')?.value || 'medium';
            this.handler.denoiseAudio({ level, applyToEditor: true });
        });
    }

    async denoiseAudio(options = {}) {
        const handler = this.handler;
        if (!handler.app.videoFile?.path) return;
        const level = options.level || 'medium';
        const sourcePath = handler.app.videoFile.path;
        const sourceName = handler.app.videoFile.name || sourcePath.split(/[\\/]/).pop();
        let cleanupProgress = null;

        try {
            let savePath = options.savePath;
            if (!savePath) {
                const dir = sourcePath.substring(0, sourcePath.lastIndexOf('\\'));
                if (options.applyToEditor) {
                    const baseName = sourceName.replace(/\.[^.]+$/, '');
                    savePath = `${dir}\\${baseName}_denoised_edit.mp4`;
                } else if (options.isBatch) {
                    savePath = `${dir}\\${options.originalName || 'denoised'}.mp4`;
                } else {
                    savePath = await window.mediaflow?.dialog.saveFile({
                        title: window.i18n?.t('creator.denoise.saveDenoised') || 'Save Denoised File',
                        defaultPath: sourceName.replace(/\.[^.]+$/, '_denoised.mp4'),
                        filters: [{ name: 'Video', extensions: ['mp4'] }]
                    });
                }
            }
            if (!savePath) return;

            if (!options.isBatch) {
                handler.app.isProcessing = true;
                handler.app.showProgress(
                    window.i18n?.t('creator.toasts.statusDenoising') || 'Denoising...',
                    0,
                    true,
                    () => window.mediaflow?.audio?.cancel?.()
                );
            }

            const updateProgress = (percent, text) => {
                options.onProgress?.(percent, text);
                if (!options.isBatch) handler.app.updateProgress(percent, text);
            };
            cleanupProgress = window.mediaflow?.audio?.onDenoiseProgress?.((data) => {
                updateProgress(data.progress, data.status);
            });

            const result = await window.mediaflow?.audio?.denoise({
                input: sourcePath,
                output: savePath,
                level,
                startTime: options.startTime,
                endTime: options.endTime
            });

            if (!result?.success) {
                throw new Error(result?.error || (window.i18n?.t('creator.toasts.denoiseFail') || 'Denoising failed'));
            }

            updateProgress(100, window.i18n?.t('creator.video.statusDone') || 'Done!');
            if (options.applyToEditor) {
                await handler.app.applyProcessedMediaToEditor(savePath, sourcePath);
                if (!options.isBatch) {
                    window.app?.showToast(
                        window.i18n?.t('creator.toasts.toastDenoiseApplied') || 'Denoising completed and applied to the current file!',
                        'success'
                    );
                }
            } else if (!options.isBatch) {
                window.app?.showToast(window.i18n?.t('creator.toasts.toastDenoiseDone') || 'Denoising completed!', 'success');
            }
        } catch (error) {
            if (!options.isBatch) {
                window.app?.showToast(error.message || (window.i18n?.t('creator.toasts.denoiseFail') || 'Denoising failed'), 'error');
            }
            throw error;
        } finally {
            cleanupProgress?.();
            if (!options.isBatch) {
                handler.app.isProcessing = false;
                handler.app.hideProgress();
            }
        }
    }
}

window.CreatorAudioMixerTools = CreatorAudioMixerTools;
