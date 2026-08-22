const mockRun = jest.fn();
const mockGetBestEncoder = jest.fn();

jest.mock('child_process', () => ({
    spawnSync: jest.fn(() => ({
        stdout: JSON.stringify({
            format: { duration: '12' },
            streams: [{ codec_type: 'video' }, { codec_type: 'audio' }]
        })
    }))
}));
jest.mock('fs', () => ({
    existsSync: jest.fn(() => true),
    statSync: jest.fn(() => ({ size: 1000 }))
}));
jest.mock('../../../src/utils/binaries', () => ({
    getFfmpegPath: jest.fn(() => 'ffmpeg'),
    getFfprobePath: jest.fn(() => 'ffprobe')
}));
jest.mock('../../../src/utils/logger', () => ({ ffmpeg: jest.fn() }));
jest.mock('../../../src/utils/videoUtils', () => ({ postProcessVideo: jest.fn() }));
jest.mock('../../../src/handlers/video/FFmpegRunner', () => ({
    run: (...args) => mockRun(...args),
    getBestEncoder: (...args) => mockGetBestEncoder(...args)
}));

const { handleCompress } = require('../../../src/handlers/video/compressHandler');

describe('compressHandler AV1 fallback', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('falls back from unavailable AV1 hardware to the bundled libaom encoder', async () => {
        mockGetBestEncoder.mockResolvedValue('av1_nvenc');
        mockRun
            .mockResolvedValueOnce({ success: false, error: 'Hardware process failed', code: 1 })
            .mockResolvedValueOnce({ success: true });

        const result = await handleCompress({ sender: { isDestroyed: () => false, send: jest.fn() } }, {
            input: 'input.mp4',
            output: 'output.mp4',
            codec: 'av1',
            quality: 'medium',
            preset: 'balanced',
            audio: 'low'
        });

        expect(result.success).toBe(true);
        const fallbackArgs = mockRun.mock.calls[1][0];
        expect(fallbackArgs).toEqual(expect.arrayContaining([
            '-c:v', 'libaom-av1',
            '-crf', '42',
            '-cpu-used', '5',
            '-row-mt', '1'
        ]));
        expect(fallbackArgs).not.toContain('-svtav1-params');
    });
});
