/** @jest-environment jsdom */

describe('DownloadExecutor playlist progress isolation', () => {
    beforeEach(() => {
        jest.resetModules();
        window.i18n = { t: jest.fn(() => null) };
        window.mapDownloadError = jest.fn((x) => String(x));
        require('../../../src/features/download/DownloadExecutor.js');
    });

    afterEach(() => {
        delete window.DownloadExecutor;
        delete window.i18n;
        delete window.mapDownloadError;
    });

    test('only updates the playlist card for the current playlist download id', async () => {
        const ui = {
            updateCardProgress: jest.fn(),
            setCardStatus: jest.fn(),
            updateOverallPlaylistProgress: jest.fn(),
            showProgressUI: jest.fn()
        };

        let resolveFirst;
        const firstDownloadPromise = new Promise((resolve) => { resolveFirst = resolve; });

        const service = {
            getDownloadPath: jest.fn().mockResolvedValue('F:\\Downloads'),
            startDownload: jest.fn()
                .mockImplementationOnce(() => firstDownloadPromise)
                .mockImplementationOnce(async () => ({ success: true, file: 'F:\\Downloads\\out.mp4' }))
        };

        const app = { showToast: jest.fn() };

        const manager = {
            app,
            service,
            ui,
            selectedPlaylistItems: new Set([0, 1]),
            playlistInfo: {
                title: 'Test Playlist',
                items: [{ url: 'https://example.com/1' }, { url: 'https://example.com/2' }]
            },
            playlistQuality: '720',
            playlistFormat: 'video',
            playlistAudioFormat: 'mp3',
            playlistAudioQuality: '192',
            isDownloading: false,
            currentPlaylistIndex: -1,
            currentPlaylistDownloadId: null
        };

        const executor = new window.DownloadExecutor(manager);

        let progressHandler;
        window.mediaflow = {
            path: { join: jest.fn((...args) => args.join('\\')) },
            fs: { mkdir: jest.fn().mockResolvedValue() },
            video: {
                onProgress: jest.fn((cb) => { progressHandler = cb; return () => {}; })
            }
        };

        const promise = executor.downloadPlaylist();

        // Wait until the first item's startDownload has been invoked (id assigned)
        // Flush microtasks repeatedly — firstDownloadPromise stays pending so the
        // loop remains inside item 0's await.
        await new Promise((r) => setTimeout(r, 0));
        await new Promise((r) => setTimeout(r, 0));
        await new Promise((r) => setTimeout(r, 0));
        await new Promise((r) => setTimeout(r, 0));

        const activeId = manager.currentPlaylistDownloadId;
        expect(activeId).toBeTruthy();
        expect(ui.setCardStatus).toHaveBeenCalledWith(0, 'downloading');

        // Foreign queue-task progress must not touch the playlist card
        progressHandler({ id: 'q-queue-item', progress: 90 });
        expect(ui.updateCardProgress).not.toHaveBeenCalled();

        // Own playlist progress must update the current card
        progressHandler({ id: activeId, progress: 55 });
        expect(ui.updateCardProgress).toHaveBeenCalledWith(0, 55);

        // Finish the first item, let the loop complete
        resolveFirst({ success: true, file: 'F:\\Downloads\\one.mp4' });
        await promise;

        expect(manager.currentPlaylistDownloadId).toBeNull();
        expect(service.startDownload).toHaveBeenCalledTimes(2);
    });
});