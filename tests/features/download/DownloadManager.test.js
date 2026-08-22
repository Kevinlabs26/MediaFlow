/** @jest-environment jsdom */

describe('DownloadManager progress listener isolation', () => {
    beforeEach(() => {
        jest.resetModules();
        window.i18n = { t: jest.fn(() => null) };
        window.SpeedMonitor = class {
            constructor() {}
            reset() {}
            addSample() {}
        };
        window.mapDownloadError = jest.fn((x) => String(x));

        window.DownloadService = class {
            constructor() {}
            buildDownloadOptions() {}
            startDownload() {}
            getDownloadPath() {}
            extractUrlFromText() {}
            isValidUrl() {}
        };
        window.DownloadUIManager = class {
            constructor() {}
            cacheElements() {}
            bindEvents() {}
            updateProgress() {}
            showProgressUI() {}
            resetProgress() {}
        };
        window.DownloadExecutor = class {
            constructor() {}
        };
        window.DownloadActionHandler = class {
            constructor() {}
        };

        require('../../../src/features/download/DownloadManager.js');
    });

    afterEach(() => {
        delete window.DownloadFlow;
        delete window.DownloadManager;
        delete window.DownloadService;
        delete window.DownloadUIManager;
        delete window.DownloadExecutor;
        delete window.DownloadActionHandler;
        delete window.SpeedMonitor;
        delete window.mapDownloadError;
        delete window.i18n;
    });

    test('ignores progress events that do not match the current download id', async () => {
        const ui = {
            updateProgress: jest.fn(),
            cacheElements: jest.fn(),
            bindEvents: jest.fn(),
            showProgressUI: jest.fn(),
            resetProgress: jest.fn()
        };
        window.DownloadUIManager = class {
            constructor() { return ui; }
        };

        const speedMonitor = { reset: jest.fn() };
        window.SpeedMonitor = class {
            constructor() { return speedMonitor; }
        };

        const app = {
            showToast: jest.fn(),
            router: { switchPage: jest.fn() },
            queueManager: null,
            historyManager: null
        };

        let progressHandler;
        window.mediaflow = {
            video: {
                onProgress: jest.fn((cb) => { progressHandler = cb; return () => {}; }),
                onWarning: jest.fn(() => () => {})
            }
        };

        const manager = new window.DownloadFlow(app);
        manager.init();

        manager.isDownloading = true;
        manager.currentDownloadId = 'single-id-123';

        // Queue task progress arrives with a different id — must be ignored
        progressHandler({ id: 'q-queue-item', progress: 50 });
        expect(ui.updateProgress).not.toHaveBeenCalled();

        // Own download progress arrives — must be applied
        progressHandler({ id: 'single-id-123', progress: 70 });
        expect(ui.updateProgress).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'single-id-123', progress: 70 }),
            speedMonitor
        );
    });
});