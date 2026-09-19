/** @jest-environment jsdom */

describe('UpdateWelcome', () => {
    let UpdateWelcome;
    let values;

    beforeEach(() => {
        jest.resetModules();
        document.body.innerHTML = `
            <section id="page-donation">
                <a class="donation-card" data-qr href="https://example.com/coffee">
                    <span class="donation-card-title">Coffee</span>
                    <span class="donation-card-desc">One-time support</span>
                    <img data-qr-img src="data:image/png;base64,coffee" />
                </a>
                <a class="donation-card" data-qr href="https://example.com/monthly">
                    <span class="donation-card-title">Monthly</span>
                    <span class="donation-card-desc">Monthly support</span>
                    <img data-qr-img />
                </a>
                <div class="donation-footer"><a href="https://github.com/DavidNovainte/MediaFlow">GitHub</a></div>
            </section>
        `;
        values = { onboardingComplete: true, 'mediaflow.updateWelcomeVersion': '2.4.8' };
        window.mediaflow = {
            app: {
                getVersion: jest.fn().mockResolvedValue('2.4.9'),
                generateQr: jest.fn().mockResolvedValue({ success: true, dataUrl: 'data:image/png;base64,monthly' })
            },
            shell: { openExternal: jest.fn() },
            store: {
                get: jest.fn((key, fallback) => Promise.resolve(Object.prototype.hasOwnProperty.call(values, key) ? values[key] : fallback)),
                set: jest.fn((key, value) => {
                    values[key] = value;
                    return Promise.resolve();
                })
            }
        };
        window.PageLoader = { ensurePage: jest.fn().mockResolvedValue(undefined) };
        window.DonationFlow = { init: jest.fn() };
        require('../../src/components/common/UpdateWelcome');
        UpdateWelcome = window.UpdateWelcome;
    });

    afterEach(() => {
        delete window.mediaflow;
        delete window.PageLoader;
        delete window.DonationFlow;
    });

    test('shows once for a new version and reuses support-page links', async () => {
        const welcome = new UpdateWelcome({});

        await expect(welcome.showIfNeeded()).resolves.toBe(true);
        expect(document.querySelector('#update-welcome-overlay')).not.toBeNull();
        expect(document.querySelectorAll('.update-welcome-method')).toHaveLength(2);
        expect(document.querySelector('.update-welcome-qr').src).toContain('coffee');
        expect(document.querySelector('.onboarding-desc').textContent).toContain('v2.4.9');
        expect(document.querySelector('.onboarding-desc').textContent).not.toContain('vv2.4.9');

        document.querySelectorAll('.update-welcome-method')[1].click();
        await Promise.resolve();
        expect(window.mediaflow.app.generateQr).toHaveBeenCalledWith('https://example.com/monthly');
        expect(document.querySelector('.update-welcome-qr').src).toContain('monthly');

        document.querySelector('[data-update-welcome-github]').click();
        expect(window.mediaflow.shell.openExternal).toHaveBeenCalledWith('https://github.com/DavidNovainte/MediaFlow');
        document.querySelector('[data-update-welcome-close]').click();
        expect(document.querySelector('#update-welcome-overlay')).toBeNull();
    });

    test('does not show again for the same version', async () => {
        values['mediaflow.updateWelcomeVersion'] = '2.4.9';
        const welcome = new UpdateWelcome({});

        await expect(welcome.showIfNeeded()).resolves.toBe(false);
        expect(document.querySelector('#update-welcome-overlay')).toBeNull();
    });
});
