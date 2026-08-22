describe('ErrorUtils', () => {
    it('does not classify FFmpeg copyright banners as download restrictions', () => {
        jest.resetModules();
        const ErrorUtils = require('../../src/utils/errorUtils');

        expect(ErrorUtils.formatError('ffmpeg version 7.0 Copyright (c) 2000-2024')).toContain('Copyright');
    });

    it('keeps downloader copyright restrictions user-friendly', () => {
        jest.resetModules();
        const ErrorUtils = require('../../src/utils/errorUtils');

        expect(ErrorUtils.formatError('ERROR: video blocked due to copyright claim')).toBe('视频因版权问题无法下载');
    });
});
