const { app } = require('electron');
const path = require('path');
const fs = require('fs');

/**
 * 获取 yt-dlp cookies.txt 路径（由浏览器扩展“同步 Cookie”写入 userData）
 * 仅当文件存在时返回路径，否则返回 null。
 */
function getCookiesPath() {
    try {
        const cookiePath = path.join(app.getPath('userData'), 'cookies.txt');
        return fs.existsSync(cookiePath) ? cookiePath : null;
    } catch {
        return null;
    }
}

/**
 * Only use cookies explicitly synced to MediaFlow. Reading a live Chrome
 * database on Windows can fail before any network request is made.
 * 用于平台专用下载服务（tiktok/instagram/facebook 2026 年起普遍需要 Cookie）
 * Public YouTube videos are more reliable without a stale/shared login session.
 * Restricted YouTube videos can still be handled separately as an auth flow.
 * @param {string[]} args - yt-dlp 参数数组
 * @param {string} url - 当前媒体链接
 * @returns {string[]}
 */
function appendCookiesArg(args = [], url = '') {
    if (/(?:youtube\.com|youtu\.be)/i.test(String(url))) {
        return args;
    }

    const cookiePath = getCookiesPath();
    if (cookiePath) {
        args.push('--cookies', cookiePath);
    }
    return args;
}

/**
 * Write cookies received from the companion extension in Netscape format.
 * @param {Array<Object>} cookies
 * @returns {{ path: string, count: number }}
 */
function writeCookiesFile(cookies) {
    if (!Array.isArray(cookies) || cookies.length === 0) {
        throw new Error('No cookies received');
    }

    const rows = cookies
        .filter(cookie => cookie && cookie.name && cookie.value !== undefined)
        .map(cookie => [
            cookie.domain || '',
            cookie.domain?.startsWith('.') ? 'TRUE' : 'FALSE',
            cookie.path || '/',
            cookie.secure ? 'TRUE' : 'FALSE',
            Math.floor(cookie.expirationDate || (Date.now() / 1000 + 31536000)),
            cookie.name,
            cookie.value
        ].join('\t'));

    if (rows.length === 0) throw new Error('No valid cookies received');

    const cookiePath = path.join(app.getPath('userData'), 'cookies.txt');
    fs.writeFileSync(cookiePath, '# Netscape HTTP Cookie File\n' + rows.join('\n') + '\n', 'utf8');
    return { path: cookiePath, count: rows.length };
}

module.exports = { getCookiesPath, appendCookiesArg, writeCookiesFile };
