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
        expect(overlay.querySelector('.subtitle-preview-text').style.padding).toBe('0px');
        expect(overlay.querySelector('.subtitle-preview-text').style.boxSizing).toBe('border-box');
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

    it('keeps the edit box on the exact rendered text bounds', () => {
        const overlay = document.createElement('div');
        const wrapper = document.createElement('div');
        const span = document.createElement('span');
        wrapper.className = 'subtitle-draggable';
        wrapper.style.transform = 'translate(-50%, -50%)';
        span.className = 'subtitle-preview-text';
        wrapper.appendChild(span);
        overlay.appendChild(wrapper);

        Object.defineProperty(overlay, 'clientWidth', { value: 400 });
        Object.defineProperty(overlay, 'clientHeight', { value: 300 });
        overlay.getBoundingClientRect = () => ({ left: 100, top: 50, width: 800, height: 600 });
        wrapper.getBoundingClientRect = () => ({ left: 180, top: 90, width: 640, height: 40 });
        span.getBoundingClientRect = () => ({ left: 420, top: 90, width: 160, height: 40 });

        const handler = new window.SubtitlePreviewHandler({
            currentStyle: {},
            flow: { trackManager: { tracks: [] } }
        });
        handler.subtitleOverlay = overlay;
        handler._showBoundingBox(span, {}, 0, false);

        expect(handler._boundingBox.style.left).toBe('40px');
        expect(handler._boundingBox.style.top).toBe('20px');
        expect(handler._boundingBox.style.width).toBe('320px');
        expect(handler._boundingBox.style.height).toBe('20px');
    });

    it('stores dragged positions with sub-percent precision', () => {
        const currentStyle = {};
        const handler = new window.SubtitlePreviewHandler({
            currentStyle,
            flow: { trackManager: { tracks: [] } }
        });
        const overlay = document.createElement('div');
        Object.defineProperty(overlay, 'clientWidth', { value: 400 });
        Object.defineProperty(overlay, 'clientHeight', { value: 300 });
        overlay.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 300 });
        handler.subtitleOverlay = overlay;

        const box = document.createElement('div');
        box.style.left = '11px';
        box.style.top = '13px';
        Object.defineProperty(box, 'offsetWidth', { value: 101 });
        Object.defineProperty(box, 'offsetHeight', { value: 51 });

        handler._syncPositionFromBox(box, null);

        expect(currentStyle.marginH).toBe(15.38);
        expect(currentStyle.marginV).toBe(12.83);
    });

    it('keeps inline editing visible and does not move focus to the list editor', () => {
        const overlay = document.createElement('div');
        const wrapper = document.createElement('div');
        const span = document.createElement('span');
        const sub = { id: 'sub-1', originalText: 'Creado por IA', start: 0, end: 2 };
        const focusSubtitle = jest.fn();
        const track = { id: 'track-1', subtitles: [sub] };

        wrapper.className = 'subtitle-draggable';
        wrapper.dataset.trackId = track.id;
        span.className = 'subtitle-preview-text';
        span.dataset.subId = sub.id;
        span.style.color = '#ffffff';
        span.textContent = sub.originalText;
        wrapper.appendChild(span);
        overlay.appendChild(wrapper);
        document.body.appendChild(overlay);

        Object.defineProperty(overlay, 'clientWidth', { value: 400 });
        Object.defineProperty(overlay, 'clientHeight', { value: 300 });
        overlay.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 300 });
        wrapper.getBoundingClientRect = () => ({ left: 100, top: 20, width: 200, height: 30 });
        span.getBoundingClientRect = () => ({ left: 100, top: 20, width: 200, height: 30 });

        const handler = new window.SubtitlePreviewHandler({
            currentStyle: {},
            flow: {
                timeline: { displayMode: 'original' },
                editor: { focusSubtitle },
                trackManager: { activeTrackId: track.id, tracks: [track] }
            }
        });
        handler.init({ subtitleOverlay: overlay });

        span.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));

        const textarea = handler._boundingBox.querySelector('textarea.subtitle-inline-ta');
        expect(textarea.value).toBe('Creado por IA');
        expect(textarea.style.webkitTextFillColor).not.toBe('transparent');
        expect(focusSubtitle).toHaveBeenCalledWith(0, false, false);
    });

    it('renders edit mirror text as text rather than executable markup', () => {
        const handler = new window.SubtitlePreviewHandler({ flow: {} });
        const box = document.createElement('div');
        const payload = '<img src=x onerror="window.__subtitleInjected=true">\nsecond line';
        window.__subtitleInjected = false;

        handler._renderTextMirror(box, {
            fontSize: '24px',
            fontFamily: 'Arial',
            fontWeight: '400',
            fontStyle: 'normal',
            color: '#fff',
            textAlign: 'center',
            lineHeight: '1.2',
            letterSpacing: '0px',
            textShadow: 'none',
            webkitTextStroke: '0',
            backgroundColor: 'transparent',
            padding: '0px'
        }, payload);

        expect(box.querySelector('img')).toBeNull();
        expect(box.querySelector('.subtitle-mirror-text').textContent).toBe(payload);
        expect(window.__subtitleInjected).toBe(false);
        delete window.__subtitleInjected;
    });
});
