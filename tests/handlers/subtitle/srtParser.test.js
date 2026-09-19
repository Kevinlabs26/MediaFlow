const SRTParser = require('../../../src/handlers/subtitle/srtParser');

describe('SRTParser supported import formats', () => {
    test('parses ordinary SRT and preserves multiline text', () => {
        const result = SRTParser.parse('1\n00:00:01,250 --> 00:00:03,000\nfirst\nsecond');

        expect(result).toEqual([expect.objectContaining({
            id: 1,
            start: 1.25,
            end: 3,
            text: 'first\nsecond'
        })]);
    });

    test('parses WebVTT cue ids, settings, markup and multiline text', () => {
        const result = SRTParser.parse(`WEBVTT\n\nintro\n00:01.500 --> 00:03.250 align:center\n<v Speaker>Hello &amp; welcome</v>\nsecond line`, '.vtt');

        expect(result).toEqual([expect.objectContaining({
            id: 'intro',
            start: 1.5,
            end: 3.25,
            text: 'Hello & welcome\nsecond line'
        })]);
    });

    test('parses ASS dialogue text with commas, line breaks and override tags', () => {
        const result = SRTParser.parse(`[Script Info]\nTitle: test\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.20,0:00:03.45,Default,,0,0,0,,{\\b1}Hello, world\\Nsecond line`, 'ass');

        expect(result).toEqual([expect.objectContaining({
            start: 1.2,
            end: 3.45,
            text: 'Hello, world\nsecond line'
        })]);
    });

    test('normalizes millisecond carry when generating SRT timestamps', () => {
        expect(SRTParser.secondsToTime(59.9996)).toBe('00:01:00,000');
    });
});
