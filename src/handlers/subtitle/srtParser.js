/**
 * SRT Parser Utility
 * 用于解析和生成 SRT 字幕文件
 */

const fs = require('fs');
const path = require('path');

class SRTParser {
    /**
     * 解析 SRT 文件内容
     * @param {string} content SRT 文件内容
     * @returns {Array} 字幕对象数组 [{id, start, end, text}]
     */
    static parse(content, formatHint = '') {
        if (!content) return [];

        // 统一换行符
        content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

        const format = String(formatHint).replace(/^\./, '').toLowerCase();
        if (format === 'ass' || /^\s*\[Events\]/mi.test(content)) {
            return this.parseASS(content);
        }
        if (format === 'vtt' || /^\s*WEBVTT(?:\s|$)/i.test(content)) {
            return this.parseVTT(content);
        }

        return this.parseSRT(content);
    }

    static parseSRT(content) {

        const subtitles = [];
        const blocks = content.split('\n\n');

        for (const block of blocks) {
            const lines = block.trim().split('\n');
            if (lines.length < 2) continue;

            const hasNumericId = /^\d+$/.test(lines[0].trim());
            const id = hasNumericId ? parseInt(lines[0].trim(), 10) : subtitles.length + 1;
            const timeLine = lines[hasNumericId ? 1 : 0].trim();
            const text = lines.slice(hasNumericId ? 2 : 1).join('\n');

            // 解析时间轴 00:00:01,000 --> 00:00:04,000
            const timeMatch = timeLine.match(/(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/);

            if (timeMatch) {
                subtitles.push({
                    id,
                    start: this.timeToSeconds(timeMatch[1]),
                    end: this.timeToSeconds(timeMatch[2]),
                    startTime: timeMatch[1],
                    endTime: timeMatch[2],
                    text: text
                });
            }
        }

        return subtitles;
    }

    /** 解析 WebVTT（支持 cue id、时间设置及多行文本）。 */
    static parseVTT(content) {
        const blocks = content.replace(/^\uFEFF/, '').split(/\n{2,}/);
        const subtitles = [];

        for (const rawBlock of blocks) {
            const lines = rawBlock.trim().split('\n');
            if (!lines.length || /^(WEBVTT|NOTE|STYLE|REGION)(?:\s|$)/i.test(lines[0])) continue;

            const timeIndex = lines.findIndex((line) => line.includes('-->'));
            if (timeIndex === -1) continue;
            const match = lines[timeIndex].match(/((?:\d{2}:)?\d{2}:\d{2}\.\d{3})\s*-->\s*((?:\d{2}:)?\d{2}:\d{2}\.\d{3})/);
            if (!match) continue;

            const cueId = timeIndex > 0 ? lines[0].trim() : subtitles.length + 1;
            const text = lines.slice(timeIndex + 1).join('\n')
                .replace(/<[^>]*>/g, '')
                .replace(/&nbsp;/gi, ' ')
                .replace(/&lt;/gi, '<')
                .replace(/&gt;/gi, '>')
                .replace(/&amp;/gi, '&');
            subtitles.push({
                id: cueId,
                start: this.webTimeToSeconds(match[1]),
                end: this.webTimeToSeconds(match[2]),
                startTime: match[1],
                endTime: match[2],
                text
            });
        }

        return subtitles;
    }

    /** 解析 Advanced SubStation Alpha 的 [Events] / Dialogue 行。 */
    static parseASS(content) {
        const lines = content.replace(/^\uFEFF/, '').split('\n');
        const subtitles = [];
        let inEvents = false;
        let fields = ['layer', 'start', 'end', 'style', 'name', 'marginl', 'marginr', 'marginv', 'effect', 'text'];

        for (const rawLine of lines) {
            const line = rawLine.trim();
            if (/^\[Events\]$/i.test(line)) {
                inEvents = true;
                continue;
            }
            if (/^\[.*\]$/.test(line)) {
                inEvents = false;
                continue;
            }
            if (!inEvents) continue;

            if (/^Format\s*:/i.test(line)) {
                fields = line.slice(line.indexOf(':') + 1).split(',').map((field) => field.trim().toLowerCase());
                continue;
            }
            if (!/^Dialogue\s*:/i.test(line)) continue;

            const body = line.slice(line.indexOf(':') + 1).trim();
            const values = this.splitASSFields(body, fields.length);
            const record = Object.fromEntries(fields.map((field, index) => [field, values[index] ?? '']));
            if (!record.start || !record.end) continue;

            const text = String(record.text || '')
                .replace(/\{[^}]*\}/g, '')
                .replace(/\\[Nn]/g, '\n')
                .replace(/\\h/g, ' ');
            subtitles.push({
                id: subtitles.length + 1,
                start: this.assTimeToSeconds(record.start),
                end: this.assTimeToSeconds(record.end),
                startTime: record.start,
                endTime: record.end,
                text
            });
        }

        return subtitles;
    }

    static splitASSFields(value, fieldCount) {
        const values = [];
        let start = 0;
        for (let index = 1; index < fieldCount; index++) {
            const comma = value.indexOf(',', start);
            if (comma === -1) break;
            values.push(value.slice(start, comma));
            start = comma + 1;
        }
        values.push(value.slice(start));
        return values;
    }

    static webTimeToSeconds(timeString) {
        const parts = timeString.split(':').map(Number);
        if (parts.length === 2) return parts[0] * 60 + parts[1];
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }

    static assTimeToSeconds(timeString) {
        const parts = timeString.trim().split(':').map(Number);
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }

    /**
     * 生成 SRT 文件内容
     * @param {Array} subtitles 字幕对象数组
     * @returns {string} SRT 文件内容
     */
    static generate(subtitles) {
        return subtitles.map((sub, index) => {
            const id = index + 1;
            const start = this.secondsToTime(sub.start);
            const end = this.secondsToTime(sub.end);
            return `${id}\n${start} --> ${end}\n${sub.text}`;
        }).join('\n\n');
    }

    /**
     * 时间字符串转秒 (00:00:01,000 -> 1.0)
     */
    static timeToSeconds(timeString) {
        const [time, ms] = timeString.split(',');
        const [h, m, s] = time.split(':').map(Number);
        return h * 3600 + m * 60 + s + parseInt(ms, 10) / 1000;
    }

    /**
     * 秒转时间字符串 (1.0 -> 00:00:01,000)
     */
    static secondsToTime(seconds) {
        const totalMs = Math.max(0, Math.round(Number(seconds) * 1000));
        const h = Math.floor(totalMs / 3600000);
        const m = Math.floor((totalMs % 3600000) / 60000);
        const s = Math.floor((totalMs % 60000) / 1000);
        const ms = totalMs % 1000;

        const hh = String(h).padStart(2, '0');
        const mm = String(m).padStart(2, '0');
        const ss = String(s).padStart(2, '0');
        const mmm = String(ms).padStart(3, '0');

        return `${hh}:${mm}:${ss},${mmm}`;
    }

    /**
     * 读取并解析 SRT 文件
     */
    static async readFile(filePath) {
        try {
            const content = await fs.promises.readFile(filePath, 'utf-8');
            return this.parse(content, path.extname(filePath));
        } catch (error) {
            console.error('[SRTParser] Read file error:', error);
            throw error;
        }
    }

    /**
     * 保存字幕到 SRT 文件
     */
    static async saveFile(filePath, subtitles) {
        try {
            const content = this.generate(subtitles);
            await fs.promises.writeFile(filePath, content, 'utf-8');
            return true;
        } catch (error) {
            console.error('[SRTParser] Save file error:', error);
            throw error;
        }
    }
}

module.exports = SRTParser;
