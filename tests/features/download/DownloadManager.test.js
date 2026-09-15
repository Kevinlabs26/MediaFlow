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

    test('single-link checks always leave batch mode before rendering', async () => {
        const app = {
            showToast: jest.fn(),
            router: { switchMode: jest.fn() },
            queueManager: null
        };
        const manager = new window.DownloadFlow(app);
        manager.ui.elements = {
            urlInput: { value: 'https://example.com/video/1' },
            btnCheck: { disabled: false, innerHTML: '' }
        };
        manager.ui.showSkeleton = jest.fn();
        manager.ui.renderVideoInfo = jest.fn();
        manager.service.extractUrlFromText = jest.fn((value) => value);
        manager.service.isValidUrl = jest.fn(() => true);
        manager.service.getInfo = jest.fn(() => Promise.resolve({ success: true, title: 'Video' }));

        await manager.checkVideo();

        expect(app.router.switchMode).toHaveBeenCalledWith('single');
        expect(manager.ui.renderVideoInfo).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    test('does not render a completed single-link check after switching to batch mode', async () => {
        let resolveInfo;
        const infoPromise = new Promise(resolve => { resolveInfo = resolve; });
        const app = {
            mode: 'single',
            showToast: jest.fn(),
            router: {
                switchMode: jest.fn(mode => { app.mode = mode; })
            },
            queueManager: null
        };
        const manager = new window.DownloadFlow(app);
        manager.ui.elements = {
            urlInput: { value: 'https://example.com/video/1' },
            btnCheck: { disabled: false, innerHTML: '' }
        };
        manager.ui.showSkeleton = jest.fn();
        manager.ui.renderVideoInfo = jest.fn();
        manager.ui.showErrorState = jest.fn();
        manager.service.extractUrlFromText = jest.fn(value => value);
        manager.service.isValidUrl = jest.fn(() => true);
        manager.service.getInfo = jest.fn(() => infoPromise);

        const check = manager.checkVideo();
        await Promise.resolve();
        app.mode = 'batch';
        resolveInfo({ success: true, title: 'Late video' });
        await check;

        expect(manager.videoInfo).toBeNull();
        expect(manager.ui.renderVideoInfo).not.toHaveBeenCalled();
        expect(manager.ui.showErrorState).not.toHaveBeenCalled();
    });
});
