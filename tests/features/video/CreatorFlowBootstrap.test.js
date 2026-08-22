/** @jest-environment jsdom */

describe('CreatorFlowBootstrap', () => {
    beforeAll(() => {
        require('../../../src/features/video/flow/core/CreatorFlowBootstrap');
    });

    it('initializes quick tools without requiring timeline modules', () => {
        document.body.innerHTML = '<button id="btn-reset-video"></button>';
        window.i18n = { updateUI: jest.fn() };
        window.SilenceProcessor = class {
            init = jest.fn();
        };
        window.VideoProcessor = class {
            init = jest.fn();
        };
        window.BatchCreatorFlow = class {
            constructor() {
                this.batchFiles = [];
            }
            init = jest.fn();
        };

        const flow = {
            uiManager: { init: jest.fn() },
            previewHandler: { init: jest.fn() },
            audioHandler: { init: jest.fn() },
            loadGlobalSettings: jest.fn(),
            reset: jest.fn()
        };

        const bootstrap = new window.CreatorFlowBootstrap(flow);
        bootstrap.init();

        expect(flow.uiManager.init).toHaveBeenCalledTimes(1);
        expect(flow.previewHandler.init).toHaveBeenCalledTimes(1);
        expect(flow.audioHandler.init).toHaveBeenCalledTimes(1);
        expect(flow.videoProcessor).toBeInstanceOf(window.VideoProcessor);
        expect(flow.batchFlow).toBeInstanceOf(window.BatchCreatorFlow);
    });
});
