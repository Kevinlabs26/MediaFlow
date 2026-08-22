class CreatorAudioDemucsResults {
    constructor(handler) {
        this.handler = handler;
    }

    renderDemucsResults() {
        const files = this.handler.currentDemucsFiles;
        const resultList = document.getElementById('demucs-result-list');
        const tracksArea = document.getElementById('demucs-tracks');
        const saveAllButton = document.getElementById('btn-open-demucs-folder');
        if (!files || !resultList || !tracksArea) return;

        resultList.classList.remove('hidden');
        tracksArea.innerHTML = '';

        if (saveAllButton) {
            saveAllButton.innerHTML = `<i class="fa-solid fa-cloud-arrow-down"></i><span>${window.i18n?.t('creator.demucs.saveAll') || 'Save All'}</span>`;
            saveAllButton.onclick = () => this.downloadAllDemucs();
        }

        const labels = {
            no_vocals: window.i18n?.t('creator.demucs.tracks.instrumental') || 'Instrumental',
            vocals: window.i18n?.t('creator.demucs.tracks.vocals') || 'Vocals',
            drums: window.i18n?.t('creator.demucs.tracks.drums') || 'Drums',
            bass: window.i18n?.t('creator.demucs.tracks.bass') || 'Bass',
            other: window.i18n?.t('creator.demucs.tracks.other') || 'Other'
        };

        Object.entries(files).forEach(([name, filePath]) => {
            const item = document.createElement('div');
            item.className = 'demucs-track-item';
            const fileName = filePath.split(/[/\\]/).pop();
            const audioSrc = window.urlUtils ? window.urlUtils.pathToMediaUrl(filePath) : filePath;
            item.innerHTML = `
                <div class="demucs-track-info">
                    <strong>${labels[name] || name}</strong>
                    <small>${fileName}</small>
                </div>
                <audio id="audio-preview-${name}" src="${audioSrc}" hidden></audio>
                <button class="btn-play-track" data-track="${name}" title="${window.i18n?.t('common.actions.play') || 'Play'}">
                    <i class="fa-solid fa-play"></i>
                </button>
                <button class="btn-dl-track" data-track="${name}" title="${window.i18n?.t('creator.demucs.saveTrack') || 'Save'}">
                    <i class="fa-solid fa-download"></i>
                </button>
            `;
            item.querySelector('.btn-play-track').onclick = () => this.toggleTrackPlay(name);
            item.querySelector('.btn-dl-track').onclick = () => this.downloadSingleDemucs(name);
            tracksArea.appendChild(item);
        });
    }

    toggleTrackPlay(name) {
        const audio = document.getElementById(`audio-preview-${name}`);
        const button = document.querySelector(`.btn-play-track[data-track="${name}"]`);
        if (!audio || !button) return;

        document.querySelectorAll('#demucs-tracks audio').forEach((other) => {
            if (other !== audio) {
                other.pause();
                const otherName = other.id.replace('audio-preview-', '');
                const otherButton = document.querySelector(`.btn-play-track[data-track="${otherName}"]`);
                if (otherButton) otherButton.innerHTML = '<i class="fa-solid fa-play"></i>';
            }
        });

        if (audio.paused) {
            audio.play()
                .then(() => { button.innerHTML = '<i class="fa-solid fa-pause"></i>'; })
                .catch((error) => {
                    console.error('[AudioHandler] Play track failed:', error);
                    window.app?.showToast(window.i18n?.t('creator.toasts.playFail') || 'Failed to play track', 'error');
                });
        } else {
            audio.pause();
            button.innerHTML = '<i class="fa-solid fa-play"></i>';
        }
        audio.onended = () => { button.innerHTML = '<i class="fa-solid fa-play"></i>'; };
    }

    async saveFiles(files, successKey, successFallback) {
        const targetDir = await window.mediaflow?.dialog.selectFolder?.();
        if (!targetDir) return;
        const result = await window.mediaflow?.audio?.demucsSave?.({ files, targetDir });
        if (result?.success) {
            window.app?.showToast(window.i18n?.t(successKey) || successFallback, 'success');
        } else if (result?.error) {
            window.app?.showToast((window.i18n?.t('creator.demucs.saveFail') || 'Save failed') + ': ' + result.error, 'error');
        }
    }

    async downloadAllDemucs() {
        if (!this.handler.currentDemucsFiles) return;
        return this.saveFiles(
            this.handler.currentDemucsFiles,
            'creator.demucs.saveAllSuccess',
            'All tracks saved successfully'
        );
    }

    async downloadSingleDemucs(name) {
        const filePath = this.handler.currentDemucsFiles?.[name];
        if (!filePath) return;
        return this.saveFiles(
            { [name]: filePath },
            'creator.demucs.saveTrackSuccess',
            'Track saved successfully'
        );
    }
}

window.CreatorAudioDemucsResults = CreatorAudioDemucsResults;
