class CreatorAudioDemucsTools {
    constructor(handler) {
        this.handler = handler;
        this.resultsTools = new window.CreatorAudioDemucsResults(handler);
    }

    setupDemucsListeners() {
        document.getElementById('btn-install-demucs')?.addEventListener('click', async () => {
            try {
                await this.installDemucs();
            } catch (error) {
                console.error('[AudioProcessor] Install error:', error);
            }
        });
        document.getElementById('btn-demucs-separate')?.addEventListener('click', async () => {
            try {
                await this.separateAudio();
            } catch (error) {
                console.error('[AudioProcessor] Separate click error:', error);
            }
        });
    }

    async setupDemucs() {
        await this.checkDemucsStatus();
        this.setupDemucsListeners();
    }

    async checkDemucsStatus() {
        const handler = this.handler;
        const statusEl = document.getElementById('demucs-status');
        const installArea = document.getElementById('demucs-install-area');
        const readyArea = document.getElementById('demucs-ready-area');
        const separateBtn = document.getElementById('btn-demucs-separate');

        try {
            const result = await window.mediaflow?.audio?.demucsCheck?.();
            handler.demucsAvailable = !!result?.available;
            if (statusEl) {
                const key = handler.demucsAvailable ? 'creator.demucs.installedMsg' : 'creator.demucs.notReadyMsg';
                const fallback = handler.demucsAvailable ? 'Installed' : 'Not ready';
                const color = handler.demucsAvailable ? '#10b981' : '#f59e0b';
                statusEl.innerHTML = `<span class="status-text" style="color: ${color};">${window.i18n?.t(key) || fallback}</span>`;
            }
            installArea?.classList.toggle('hidden', handler.demucsAvailable);
            readyArea?.classList.toggle('hidden', !handler.demucsAvailable);
            if (separateBtn) separateBtn.disabled = !handler.demucsAvailable;
            return result;
        } catch (error) {
            handler.demucsAvailable = false;
            if (statusEl) {
                statusEl.innerHTML = `<span class="status-text" style="color: #f59e0b;">${window.i18n?.t('creator.demucs.notReadyMsg') || 'Not ready'}</span>`;
            }
            readyArea?.classList.add('hidden');
            installArea?.classList.remove('hidden');
            if (separateBtn) separateBtn.disabled = true;
            return { available: false, error: error.message };
        }
    }

    async installDemucs() {
        const installBtn = document.getElementById('btn-install-demucs');
        if (!installBtn) return;
        installBtn.disabled = true;
        installBtn.textContent = window.i18n?.t('creator.demucs.installing') || 'Installing...';

        try {
            const result = await window.mediaflow?.audio?.demucsInstall?.();
            if (!result?.success) throw new Error(result?.error);
            const status = await this.checkDemucsStatus();
            if (!status?.available) {
                throw new Error(status?.error || status?.details || 'Demucs not ready');
            }
            window.app?.showToast(window.i18n?.t('creator.toasts.toastInstalled') || 'Installed!', 'success');
        } catch (error) {
            window.app?.showToast(error.message, 'error');
        } finally {
            installBtn.disabled = false;
            installBtn.textContent = window.i18n?.t('creator.demucs.installBtn') || 'Install Demucs';
        }
    }

    normalizeDemucsError(error) {
        const rawMessage = error?.message || String(error || '');
        if (/libtorchcodec|torchcodec|Could not load this library/i.test(rawMessage)) {
            return window.i18n?.t('creator.demucs.runtimeDependencyError')
                || 'Demucs runtime dependency failed to load. Please reinstall the Demucs runtime.';
        }
        return rawMessage;
    }

    async separateAudio(options = {}) {
        const handler = this.handler;
        if (handler.app.isProcessing || !handler.app.videoFile?.path) return;
        if (!handler.demucsAvailable) {
            window.app?.showToast(window.i18n?.t('creator.demucs.notInstalledErr') || 'Demucs is not installed', 'error');
            return;
        }

        const twoStems = options.twoStems !== undefined
            ? options.twoStems
            : document.getElementById('demucs-mode')?.value !== 'full';
        let cleanupProgress = null;
        let tempClipPath = null;

        try {
            if (!options.isBatch) {
                handler.app.isProcessing = true;
                handler.app.showProgress(
                    window.i18n?.t('creator.demucs.statusSeparating') || 'Separating audio (Demucs)...',
                    0,
                    true,
                    () => window.mediaflow?.audio?.demucsCancel?.()
                );
            }

            const updateProgress = (percent, text) => {
                options.onProgress?.(percent, text);
                if (!options.isBatch) handler.app.updateProgress(percent, text);
            };
            cleanupProgress = window.mediaflow?.audio?.onDemucsProgress?.((data) => {
                updateProgress(data.progress, data.status);
            });

            let inputPath = handler.app.videoFile.path;
            if (options.startTime !== undefined && options.endTime !== undefined) {
                const separator = inputPath.includes('\\') ? '\\' : '/';
                const dir = inputPath.slice(0, Math.max(inputPath.lastIndexOf('\\'), inputPath.lastIndexOf('/')));
                tempClipPath = `${dir}${separator}temp_demucs_input_${Date.now()}.mp4`;
                updateProgress(5, window.i18n?.t('creator.video.statusClipping') || 'Clipping segment...');
                await window.mediaflow?.video.clip({
                    input: inputPath,
                    output: tempClipPath,
                    startTime: options.startTime,
                    endTime: options.endTime
                });
                inputPath = tempClipPath;
            }

            const result = await window.mediaflow?.audio?.demucsSeparate?.({
                input: inputPath,
                twoStems
            });

            if (!result?.success) {
                if (result?.cancelled) return null;
                throw new Error(result?.error || (window.i18n?.t('creator.demucs.error') || 'Separation failed'));
            }

            if (!options.isBatch) {
                handler.currentDemucsFiles = result.files;
                this.renderDemucsResults();
                window.app?.showToast(window.i18n?.t('creator.demucs.separateSuccess') || 'Separation completed!', 'success');
            }
            return result;
        } catch (error) {
            const friendlyMessage = this.normalizeDemucsError(error);
            if (!options.isBatch) {
                window.app?.showToast(
                    (window.i18n?.t('creator.demucs.error') || 'Separation failed') + ': ' + friendlyMessage,
                    'error'
                );
                return null;
            }
            throw new Error(friendlyMessage);
        } finally {
            if (tempClipPath) window.mediaflow?.file?.deleteFile?.(tempClipPath);
            cleanupProgress?.();
            if (!options.isBatch) {
                handler.app.isProcessing = false;
                handler.app.hideProgress();
            }
        }
    }

    renderDemucsResults() {
        return this.resultsTools.renderDemucsResults();
    }

    toggleTrackPlay(name, themeColor = '#6b9ad4') {
        return this.resultsTools.toggleTrackPlay(name, themeColor);
    }

    async downloadAllDemucs() {
        return this.resultsTools.downloadAllDemucs();
    }

    async downloadSingleDemucs(name) {
        return this.resultsTools.downloadSingleDemucs(name);
    }
}

window.CreatorAudioDemucsTools = CreatorAudioDemucsTools;
