/** @jest-environment jsdom */

describe('SubtitlePreviewHandler karaoke preview', () => {
    beforeAll(() => {
        global.ResizeObserver = class {
            observe() {}
            disconnect() {}
        };
        require('../../../src/features/subtitle/SubtitleUtils');
        require('../../../src/features/subtitle/SubtitlePreviewHandler');
    });

    it('highlights single-character original text in karaoke highlight mode', () => {
        document.documentElement.style.setProperty('--v-render-h', '720');
        const overlay = document.createElement('div');
        overlay.id = 'subtitle-overlay';
        document.body.appendChild(overlay);

        const handler = new window.SubtitlePreviewHandler({
            flow: {
                video: { currentTime: 6 },
                timeline: { displayMode: 'bilingual' }
            }
        });

        handler.renderSubtitleToOverlay({
            start: 5,
            end: 7,
            originalText: '哎',
            translatedText: '这个床大家刚刚看到了'
        }, overlay, {
            fontFamily: 'Microsoft YaHei',
            fontSize: 32,
            fontColor: '#ffffff',
            enableKaraoke: true,
            karaokeStyle: 'highlight',
            karaokeColor: '#8b5cf6',
            strokes: [],
            shadows: []
        }, 6, 'track-1');

        expect(overlay.innerHTML).toContain('background: #8b5cf6; color: #fff;');
        expect(overlay.innerHTML).toContain('哎');
    });

    it('falls back to tokenized karaoke when source words only contain one coarse segment', () => {
        document.documentElement.style.setProperty('--v-render-h', '720');
        const overlay = document.createElement('div');
        overlay.id = 'subtitle-overlay-2';
        document.body.appendChild(overlay);

        const handler = new window.SubtitlePreviewHandler({
            flow: {
                video: { currentTime: 5.5 },
                timeline: { displayMode: 'original' }
            }
        });

        handler.renderSubtitleToOverlay({
            start: 5,
            end: 7,
            originalText: 'Challenge the roller dormitory',
            words: [{ text: 'Challenge the roller dormitory', start: 5, end: 7 }]
        }, overlay, {
            fontFamily: 'Arial',
            fontSize: 32,
            fontColor: '#ffffff',
            enableKaraoke: true,
            karaokeStyle: 'highlight',
            karaokeColor: '#8b5cf6',
            strokes: [],
            shadows: []
        }, 5.5, 'track-2');

        expect(overlay.innerHTML).toContain('background: #8b5cf6; color: #fff;');
        expect(overlay.innerHTML).not.toContain('>Challenge the roller dormitory</span>');
    });

    it('keeps a wrapped single English word as one karaoke token', () => {
        document.documentElement.style.setProperty('--v-render-h', '720');
        const overlay = document.createElement('div');
        overlay.id = 'subtitle-overlay-3';
        document.body.appendChild(overlay);

        const handler = new window.SubtitlePreviewHandler({
            flow: {
                video: { currentTime: 6.5 },
                timeline: { displayMode: 'original' }
            }
        });

        handler.renderSubtitleToOverlay({
            start: 5,
            end: 7,
            originalText: 'Challenge the Rolling Pin Bed and\nBreakfast'
        }, overlay, {
            fontFamily: 'Arial',
            fontSize: 32,
            fontColor: '#ffffff',
            enableKaraoke: true,
            karaokeStyle: 'highlight',
            karaokeColor: '#8b5cf6',
            strokes: [],
            shadows: []
        }, 6.5, 'track-3');

        expect(overlay.innerHTML).toContain('>Breakfast</span>');
        expect(overlay.innerHTML).not.toContain('>B</span>r');
    });

    it('uses the finalized dubbing caption text for translated preview after TTS succeeds', () => {
        document.documentElement.style.setProperty('--v-render-h', '720');
        const overlay = document.createElement('div');
        overlay.id = 'subtitle-overlay-4';
        document.body.appendChild(overlay);

        const handler = new window.SubtitlePreviewHandler({
            flow: {
                video: { currentTime: 6 },
                timeline: { displayMode: 'translated' }
            }
        });

        handler.renderSubtitleToOverlay({
            start: 5,
            end: 7,
            originalText: '所以取名叶羊',
            translatedText: 'He makes up for the lack of small sheep in the sea',
            dubCaptionText: 'He makes up for small sheep in the sea',
            dubCaptionReady: true,
            ttsSource: 'translated',
            ttsSourceUserSet: true
        }, overlay, {
            fontFamily: 'Arial',
            fontSize: 32,
            fontColor: '#ffffff',
            strokes: [],
            shadows: []
        }, 6, 'track-4');

        expect(overlay.textContent).toContain('He makes up for small sheep in the sea');
        expect(overlay.textContent).not.toContain('the lack of');
    });

    it('converts screen drag distance into overlay coordinates when preview is zoomed', () => {
        const handler = new window.SubtitlePreviewHandler({ flow: {} });
        const overlay = document.createElement('div');
        Object.defineProperty(overlay, 'clientWidth', { value: 400 });
        Object.defineProperty(overlay, 'clientHeight', { value: 300 });
        overlay.getBoundingClientRect = () => ({ left: 100, top: 50, width: 800, height: 600 });
        handler.subtitleOverlay = overlay;
        handler._isInlineEditing = true;

        const box = document.createElement('div');
        box.style.left = '10px';
        box.style.top = '20px';
        overlay.appendChild(box);
        handler._bindBoxDrag(box, null);

        box.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 200, clientY: 150 }));
        document.dispatchEvent(new MouseEvent('mousemove', { clientX: 240, clientY: 210 }));

        expect(box.style.left).toBe('30px');
        expect(box.style.top).toBe('50px');

        document.dispatchEvent(new MouseEvent('mouseup', { clientX: 240, clientY: 210 }));
    });
});
