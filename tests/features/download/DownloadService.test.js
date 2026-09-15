/** @jest-environment jsdom */

describe('DownloadService output folder', () => {
    beforeEach(() => {
        jest.resetModules();
        window.mediaflow = {
            path: { join: jest.fn((...parts) => parts.join('/')) }
        };
        require('../../../src/features/download/DownloadService.js');
    });

    afterEach(() => {
        delete window.DownloadService;
        delete window.mediaflow;
    });

    test('returns the actual single-video output folder', async () => {
        const service = new window.DownloadService({});
        service.getDownloadPath = jest.fn()
            .mockResolvedValueOnce('C:/Downloads')
            .mockResolvedValueOnce('C:/Downloads/MediaFlow');

        await expect(service.getSingleDownloadDir())
            .resolves.toBe('C:/Downloads/MediaFlow/Single Download');
        await expect(service.getSingleDownloadDir())
            .resolves.toBe('C:/Downloads/MediaFlow/Single Download');
    });
});
