/** @jest-environment jsdom */

describe('UpdateManager', () => {
    let UpdateManager;
    let app;
    let updater;
    let downloadedListener;

    beforeEach(() => {
        jest.resetModules();
        downloadedListener = null;
        app = { showToast: jest.fn() };
        updater = {
            onAvailable: jest.fn(),
            onDownloaded: jest.fn((callback) => { downloadedListener = callback; }),
            onError: jest.fn(),
            getDownloaded: jest.fn().mockResolvedValue(null),
            quitAndInstall: jest.fn()
        };
        window.mediaflow = { updater };
        window.i18n = {
            t: jest.fn((key, params = {}) => key === 'update.downloaded'
                ? `New version v${params.version} is ready`
                : key)
        };
        require('../../../src/features/common/UpdateManager');
        UpdateManager = window.UpdateManager;
    });

    afterEach(() => {
        delete window.mediaflow;
        delete window.i18n;
        delete window.UpdateManager;
    });

    test('shows an install action when the download event arrives', () => {
        const manager = new UpdateManager(app);
        manager.init();

        downloadedListener({ version: '2.4.11' });

        const [, , options] = app.showToast.mock.calls[0];
        expect(options.duration).toBe(0);
        expect(options.buttons).toHaveLength(2);
        options.buttons[0].onClick();
        expect(updater.quitAndInstall).toHaveBeenCalledTimes(1);
    });

    test('restores a download that finished before renderer listeners were ready', async () => {
        updater.getDownloaded.mockResolvedValue({ version: '2.4.11' });
        const manager = new UpdateManager(app);
        manager.init();

        await Promise.resolve();

        expect(manager.isReady).toBe(true);
        expect(app.showToast).toHaveBeenCalledTimes(1);
    });
});
