jest.mock('../../../src/utils/binaries', () => ({ getFfmpegPath: jest.fn(() => 'ffmpeg') }));

const FFmpegRunner = require('../../../src/handlers/video/FFmpegRunner');

describe('FFmpegRunner AV1 encoder selection', () => {
    afterEach(() => {
        delete FFmpegRunner._hwCache;
    });

    it('prefers AV1 hardware and falls back to the bundled software encoder', async () => {
        FFmpegRunner._hwCache = { av1_nvenc: true };
        await expect(FFmpegRunner.getBestEncoder('av1')).resolves.toBe('av1_nvenc');

        FFmpegRunner._hwCache = {};
        await expect(FFmpegRunner.getBestEncoder('av1')).resolves.toBe('libaom-av1');
    });
});
