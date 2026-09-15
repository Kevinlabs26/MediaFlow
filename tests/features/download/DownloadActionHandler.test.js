/** @jest-environment jsdom */

describe('DownloadActionHandler creator action', () => {
    beforeEach(() => {
        jest.resetModules();
        window.i18n = { t: jest.fn(() => null) };
        require('../../../src/features/download/DownloadActionHandler.js');
    });

    afterEach(() => {
        delete window.DownloadActionHandler;
        delete window.FeatureLoader;
        delete window.creatorFlow;
        delete window.mediaflow;
        delete window.i18n;
    });

    it('loads Creator tools lazily and passes the downloaded file to them', async () => {
        const addLocalFile = jest.fn().mockResolvedValue();
        const app = { switchPage: jest.fn().mockResolvedValue(), showToast: jest.fn() };
        const handler = new window.DownloadActionHandler({
            app,
            ui: {},
            service: {},
            lastDownloadedFilePath: 'C:/Downloads/video.mp4'
        });
        window.FeatureLoader = {
            ensureCreator: jest.fn().mockResolvedValue({ addLocalFile })
        };

        await handler.sendToCreator();

        expect(app.switchPage).toHaveBeenCalledWith('creator');
        expect(window.FeatureLoader.ensureCreator).toHaveBeenCalledWith(app);
        expect(addLocalFile).toHaveBeenCalledWith('C:/Downloads/video.mp4');
        expect(app.showToast).not.toHaveBeenCalled();
    });

    it('opens the configured download folder when no completed file is available', async () => {
        const openPath = jest.fn();
        window.mediaflow = {
            fs: { mkdir: jest.fn().mockResolvedValue() },
            shell: { openPath, showItemInFolder: jest.fn() }
        };
        const app = { showToast: jest.fn() };
        const service = {
            getSingleDownloadDir: jest.fn().mockResolvedValue('C:/Downloads/MediaFlow/Single Download')
        };
        const handler = new window.DownloadActionHandler({
            app,
            ui: {},
            service,
            lastDownloadedFilePath: null,
            lastOutputDir: null
        });

        await handler.openFolder();

        expect(openPath).toHaveBeenCalledWith('C:/Downloads/MediaFlow/Single Download');
        expect(app.showToast).not.toHaveBeenCalled();
    });
});
