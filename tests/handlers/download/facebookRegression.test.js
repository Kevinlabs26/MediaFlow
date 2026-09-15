const { EventEmitter } = require('events');

jest.mock('child_process', () => ({ spawn: jest.fn() }));
jest.mock('electron', () => ({ app: { getPath: () => 'C:/MediaFlow-test' } }));
jest.mock('fs', () => ({ existsSync: jest.fn(), writeFileSync: jest.fn() }));
jest.mock('../../../src/utils/binaries', () => ({ getYtDlpPath: () => 'yt-dlp' }));
jest.mock('../../../src/handlers/download/proxyUtils', () => ({ getProxyUrl: () => 'http://localhost:7890' }));
jest.mock('../../../services/platforms/douyin', () => ({ isDouyinUrl: () => false }));
jest.mock('../../../services/platforms/tiktok', () => ({ isTikTokUrl: () => false }));
jest.mock('../../../services/platforms/instagram', () => ({ isInstagramUrl: () => false }));

const { spawn } = require('child_process');
const fs = require('fs');
const facebook = require('../../../services/platforms/facebook');
const parser = require('../../../src/handlers/download/videoInfoParser');
const { appendCookiesArg } = require('../../../src/handlers/download/cookieUtils');
const { writeCookiesFile } = require('../../../src/handlers/download/cookieUtils');
const url = 'https://www.facebook.com/watch/?v=1271822231658248';
const parseError = 'ERROR: [facebook] 1271822231658248: Cannot parse data';

beforeEach(() => {
    jest.clearAllMocks();
    fs.existsSync.mockReturnValue(false);
    spawn.mockImplementation(() => {
        const child = new EventEmitter();
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        child.kill = jest.fn();
        process.nextTick(() => {
            child.stderr.emit('data', Buffer.from(parseError));
            child.emit('close', 1);
        });
        return child;
    });
});

test('missing synced cookies never triggers a read of the live Chrome database', () => {
    expect(appendCookiesArg([])).toEqual([]);
    fs.existsSync.mockReturnValue(true);
    const args = appendCookiesArg([]);
    expect(args[0]).toBe('--cookies');
    expect(args[1]).toMatch(/cookies\.txt$/);
    expect(args).not.toContain('--cookies-from-browser');
});

test('public YouTube requests stay anonymous even when synced cookies exist', () => {
    fs.existsSync.mockReturnValue(true);
    expect(appendCookiesArg([], 'https://www.youtube.com/watch?v=mX5pb6Tfw1s')).toEqual([]);
    expect(appendCookiesArg([], 'https://youtu.be/mX5pb6Tfw1s')).toEqual([]);
});

test('YouTube temporary reload response is retried once without cookies', async () => {
    fs.existsSync.mockReturnValue(true);
    let attempt = 0;
    spawn.mockImplementation(() => {
        const child = new EventEmitter();
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        child.kill = jest.fn();
        process.nextTick(() => {
            attempt += 1;
            if (attempt === 1) {
                child.stderr.emit('data', Buffer.from('ERROR: [youtube] mX5pb6Tfw1s: The page needs to be reloaded.'));
                child.emit('close', 1);
                return;
            }
            child.stdout.emit('data', Buffer.from(JSON.stringify({
                id: 'mX5pb6Tfw1s',
                title: 'Test video',
                webpage_url: 'https://www.youtube.com/watch?v=mX5pb6Tfw1s',
                formats: []
            })));
            child.emit('close', 0);
        });
        return child;
    });

    await expect(parser.getVideoInfoWithYtDlp('https://www.youtube.com/watch?v=mX5pb6Tfw1s'))
        .resolves.toEqual(expect.objectContaining({ success: true, title: 'Test video' }));
    expect(spawn).toHaveBeenCalledTimes(2);
    for (const call of spawn.mock.calls) expect(call[1]).not.toContain('--cookies');
});

test('extension cookies are stored as a Netscape cookie file', () => {
    const result = writeCookiesFile([{
        domain: '.facebook.com',
        path: '/',
        secure: true,
        expirationDate: 2000000000,
        name: 'c_user',
        value: 'redacted-test-value'
    }]);
    expect(result.count).toBe(1);
    expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringMatching(/cookies\.txt$/),
        expect.stringContaining('.facebook.com\tTRUE\t\/\tTRUE\t2000000000\tc_user\tredacted-test-value'),
        'utf8'
    );
});

test('Facebook parser failure falls back to the generic parser', async () => {
    await expect(parser.getVideoInfo(url)).resolves.toEqual({ success: false, error: parseError });
    expect(spawn).toHaveBeenCalledTimes(2);
    const args = spawn.mock.calls[0][1];
    expect(args).not.toContain('--cookies-from-browser');
    expect(args).toEqual(expect.arrayContaining(['--proxy', 'http://localhost:7890']));
    expect(args).not.toContain('--impersonate');
    expect(args.slice(-2)).toEqual(['--', url]);
});

test('explicit generic info caller uses synced cookies without Facebook-specific impersonation', async () => {
    fs.existsSync.mockReturnValue(true);
    await expect(parser.getVideoInfoWithYtDlp(url)).resolves.toEqual({ success: false, error: parseError });
    const args = spawn.mock.calls[0][1];
    expect(args).not.toContain('--cookies-from-browser');
    expect(args).toContain('--cookies');
    expect(args).not.toContain('--impersonate');
});

test('Facebook download preserves the extractor failure and does not read Chrome', async () => {
    await expect(facebook.downloadVideo(url, { savePath: 'C:/Downloads' })).rejects.toEqual({ success: false, error: parseError });
    expect(spawn.mock.calls[0][1]).not.toContain('--cookies-from-browser');
});

test('Facebook process launch failure settles the info request rather than hanging', async () => {
    spawn.mockImplementation(() => {
        const child = new EventEmitter();
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        process.nextTick(() => child.emit('error', new Error('ENOENT')));
        return child;
    });
    await expect(facebook.getVideoInfo(url)).rejects.toEqual({ success: false, error: 'Failed to start yt-dlp: ENOENT' });
});
