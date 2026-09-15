/**
 * @jest-environment jsdom
 */
const { mapDownloadError } = require('../../src/utils/downloadErrorMap');

describe('mapDownloadError', () => {
    beforeEach(() => {
        window.i18n = {
            t: (key, params) => {
                if (key === 'download.errors.ytdlpMissing') return 'YTDLP_FRIENDLY';
                if (key === 'download.errors.ffmpegMissing') return 'FFMPEG_FRIENDLY';
                if (key === 'common.proOnly') return 'PRO_ONLY';
                if (key === 'download.errors.unknownError') {
                    return `UNKNOWN:${params?.message || ''}`;
                }
                return key;
            }
        };
    });

    it('maps YTDLP_MISSING', () => {
        expect(mapDownloadError({ error: 'YTDLP_MISSING', message: 'yt-dlp not found' })).toBe('YTDLP_FRIENDLY');
        expect(mapDownloadError('Failed to start yt-dlp: ENOENT')).toBe('YTDLP_FRIENDLY');
    });

    it('maps ffmpeg missing', () => {
        expect(mapDownloadError({ code: 'FFMPEG_MISSING', message: 'ffmpeg not found' })).toBe('FFMPEG_FRIENDLY');
    });

    it('maps extractor failures to an actionable message', () => {
        window.i18n.t = (key) => key;
        expect(
            mapDownloadError(
                'ERROR: [AmazonStore] B0BZJCFS45: Unable to extract data; please report this issue'
            )
        ).toBe('download.errors.extractFailed');
    });

    it('maps YouTube reload failures as a temporary extraction failure', () => {
        window.i18n.t = (key) => key;
        expect(
            mapDownloadError('ERROR: [youtube] mX5pb6Tfw1s: The page needs to be reloaded.')
        ).toBe('download.errors.extractFailed');
    });

    it('explains cookie access and Facebook parsing failures without claiming the video is private', () => {
        const strings = require('../../src/locales/zh-CN/download.json').download.errors;
        window.i18n.t = key => strings[key.replace('download.errors.', '')] || key;
        const locked = mapDownloadError('ERROR: Could not copy Chrome cookie database. Permission denied');
        expect(locked).toContain('同步 Cookie');
        expect(locked).not.toContain('保存目录');
        const failed = mapDownloadError('ERROR: [facebook] 1271822231658248: Cannot parse data');
        expect(failed).toContain('发送当前视频');
        expect(failed).toContain('只有登录后才能播放时才需要同步 Cookie');
    });

    it('maps an empty Instagram media response without claiming login is always required', () => {
        const strings = require('../../src/locales/zh-CN/download.json').download.errors;
        window.i18n.t = key => strings[key.replace('download.errors.', '')] || key;

        const failed = mapDownloadError(
            'ERROR: [Instagram] DQIyCFUkdfg: Instagram sent an empty media response'
        );

        expect(failed).toContain('没有返回此链接的媒体数据');
        expect(failed).toContain('可能');
    });

    it('returns i18n key when mock is identity', () => {
        window.i18n.t = (key) => key;
        expect(mapDownloadError(new Error('Private video'))).toBe('download.errors.privateVideo');
    });

    it('maps disk full / permission / rate limit / age / cookies', () => {
        window.i18n.t = (key) => key;
        expect(mapDownloadError('ENOSPC: no space left on device')).toBe('download.errors.diskFull');
        expect(mapDownloadError('EACCES: permission denied')).toBe('download.errors.permissionDenied');
        expect(mapDownloadError('HTTP Error 429: Too Many Requests')).toBe('download.errors.rateLimited');
        // Prefer age-restricted over generic auth when both phrases appear
        expect(mapDownloadError('confirm your age to continue')).toBe('download.errors.ageRestricted');
        expect(mapDownloadError('ERROR: cookies are needed')).toBe('download.errors.authRequired');
        expect(mapDownloadError('ERROR: [Douyin] 123: Fresh cookies (not necessarily logged in) are needed'))
            .toBe('download.errors.extractFailed');
        expect(mapDownloadError('not available in your country')).toBe('download.errors.geoRestricted');
        expect(mapDownloadError('Download cancelled by user')).toBe('download.cancelled');
        expect(mapDownloadError('ERROR: Postprocessing: ffmpeg failed')).toBe(
            'download.errors.postprocessFailed'
        );
    });
});
