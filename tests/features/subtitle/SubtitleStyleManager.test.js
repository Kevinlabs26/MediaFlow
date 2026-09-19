/** @jest-environment jsdom */

describe('SubtitleStyleManager', () => {
    beforeAll(() => {
        window.i18n = { t: jest.fn((key) => key) };
        window.SubtitleTemplateManager = class {
            init() {}
            loadCustomTemplates() {}
        };
        window.SubtitlePreviewHandler = class {
            init() {}
        };
        require('../../../src/features/subtitle/SubtitleStyleManager');
    });

    beforeEach(() => {
        document.body.innerHTML = `
            <button id="btn-import-template" type="button"></button>
            <button id="btn-export-template" type="button"></button>
        `;
    });

    afterAll(() => {
        delete window.i18n;
        delete window.SubtitleTemplateManager;
        delete window.SubtitlePreviewHandler;
        delete window.SubtitleStyleManager;
    });

    test('binds visible template import and export buttons to preset actions', () => {
        const manager = new window.SubtitleStyleManager({});
        manager.importPreset = jest.fn();
        manager.exportPreset = jest.fn();

        manager.cacheElements();
        manager.bindEvents();

        document.getElementById('btn-import-template').click();
        document.getElementById('btn-export-template').click();

        expect(manager.importPreset).toHaveBeenCalledTimes(1);
        expect(manager.exportPreset).toHaveBeenCalledTimes(1);
    });

    test('keeps decimal style values from number inputs', () => {
        const manager = new window.SubtitleStyleManager({});
        manager.lineHeight = document.createElement('input');
        manager.lineHeight.type = 'number';
        manager.updateStyle = jest.fn();
        manager.bindStyleInputs();

        manager.lineHeight.value = '1.35';
        manager.lineHeight.dispatchEvent(new Event('input', { bubbles: true }));

        expect(manager.updateStyle).toHaveBeenCalledWith({ lineHeight: 1.35 });
    });

});
