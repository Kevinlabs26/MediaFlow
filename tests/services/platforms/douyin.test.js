const { __test__ } = require('../../../services/platforms/douyin');

describe('douyin concurrent download planning', () => {
    test('enables concurrent download for large byte-range responses', () => {
        expect(__test__.shouldUseConcurrentDownload({ 'accept-ranges': 'bytes' }, 12 * 1024 * 1024)).toBe(true);
    });

    test('keeps single-stream mode for small files or missing range support', () => {
        expect(__test__.shouldUseConcurrentDownload({ 'accept-ranges': 'bytes' }, 1024 * 1024)).toBe(false);
        expect(__test__.shouldUseConcurrentDownload({}, 12 * 1024 * 1024)).toBe(false);
        expect(__test__.getConcurrentChunkCount(1024 * 1024)).toBe(1);
    });

    test('builds complete non-overlapping byte ranges', () => {
        expect(__test__.buildChunkRanges(10, 3)).toEqual([
            { start: 0, end: 3 },
            { start: 4, end: 7 },
            { start: 8, end: 9 }
        ]);
    });

    test('compacts browser-captured aweme detail', () => {
        expect(__test__.compactAwemeDetail({
            aweme_id: '7683071155057879717',
            desc: '测试视频',
            author: { nickname: '作者', extra: 'ignored' },
            video: {
                duration: 1234,
                cover: { url_list: ['cover.jpg'] },
                play_addr: { url_list: ['https://v3-dy-o.zjcdn.com/video.mp4'] },
                extra: 'ignored'
            }
        })).toEqual({
            aweme_id: '7683071155057879717',
            desc: '测试视频',
            author: { nickname: '作者' },
            video: {
                duration: 1234,
                cover: { url_list: ['cover.jpg'] },
                play_addr: { url_list: ['https://v3-dy-o.zjcdn.com/video.mp4'] }
            }
        });
    });

    test('blocks external protocols in the anonymous resolver', () => {
        expect(__test__.isSafeAnonymousNavigation('https://www.douyin.com/video/1')).toBe(true);
        expect(__test__.isSafeAnonymousNavigation('bitbrowser://open')).toBe(false);
        expect(__test__.isSafeAnonymousNavigation('not a url')).toBe(false);
    });

    test('rejects browser detail for a different preloaded video', () => {
        expect(__test__.compactAwemeDetail({
            aweme_id: 'wrong-video',
            video: { play_addr: { url_list: ['https://example.com/wrong.mp4'] } }
        }, 'target-video')).toBeNull();
    });

    test('only caches a direct URL verified against the requested video ID', () => {
        const verified = {
            success: true,
            videoId: 'target-video',
            url: 'https://example.com/target.mp4'
        };
        expect(__test__.isVerifiedVideoInfo('target-video', verified)).toBe(true);
        expect(__test__.isVerifiedVideoInfo('target-video', {
            success: true,
            videoId: 'related-video',
            url: 'https://example.com/related.mp4'
        })).toBe(false);

        __test__.cacheVideoInfo('target-video', verified);
        expect(__test__.getCachedVideoInfo('target-video')).toBe(verified);
        expect(__test__.getCachedVideoInfo('related-video')).toBeNull();
    });
});
