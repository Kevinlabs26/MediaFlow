/**
 * Shows a one-time welcome card after an existing installation moves to a
 * new app version. Donation links and QR data come from the support page so
 * the two surfaces never drift apart.
 */
class UpdateWelcome {
    constructor(app) {
        this.app = app;
        this.overlay = null;
        this.versionKey = 'mediaflow.updateWelcomeVersion';
    }

    _t(key, fallback, params = {}) {
        const translated = window.i18n?.t?.(key, params);
        if (translated && translated !== key) return translated;
        return Object.keys(params).reduce(
            (text, name) => text.replace(new RegExp(`\\{${name}\\}`, 'g'), params[name]),
            fallback
        );
    }

    async showIfNeeded() {
        const version = await window.mediaflow?.app?.getVersion?.();
        if (!version) return false;

        const previousVersion = await window.mediaflow?.store?.get?.(this.versionKey, null);
        const onboardingComplete = await window.mediaflow?.store?.get?.('onboardingComplete', false);
        await window.mediaflow?.store?.set?.(this.versionKey, version);

        // First-run onboarding already welcomes new users. Existing installs
        // get the version welcome once, then it stays quiet until the next one.
        if (previousVersion === version || (previousVersion == null && !onboardingComplete)) {
            return false;
        }

        await window.PageLoader?.ensurePage?.('donation');
        window.DonationFlow?.init?.();
        this.show(version);
        return true;
    }

    show(version) {
        if (this.overlay) return;

        const supportPage = document.getElementById('page-donation');
        const entries = Array.from(supportPage?.querySelectorAll('.donation-card[data-qr]') || [])
            .map((card) => ({
                title: card.querySelector('.donation-card-title')?.textContent?.trim() || 'Support the project',
                description: card.querySelector('.donation-card-desc')?.textContent?.trim() || '',
                href: card.getAttribute('href') || '',
                qr: card.querySelector('[data-qr-img]')?.src || ''
            }))
            .filter((entry) => entry.href);
        const github = supportPage?.querySelector('.donation-footer a[href*="github.com"]');

        const overlay = document.createElement('div');
        overlay.className = 'onboarding-overlay update-welcome-overlay';
        overlay.id = 'update-welcome-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');

        const card = document.createElement('div');
        card.className = 'onboarding-card update-welcome-card';
        card.innerHTML = `
            <button type="button" class="onboarding-skip" data-update-welcome-close>×</button>
            <div class="update-welcome-mark" aria-hidden="true">✦</div>
            <h2 class="onboarding-title">${this._esc(this._t('donation.updateWelcome.title', 'Welcome to MediaFlow'))}</h2>
            <p class="onboarding-desc">${this._esc(this._t('donation.updateWelcome.versionMessage', 'Updated to v{version}. Thanks for your support.', { version }))}</p>
            <div class="update-welcome-actions">
                <button type="button" class="btn btn-primary" data-update-welcome-github>${this._esc(this._t('donation.github', 'GitHub Repository'))}</button>
                <div class="update-welcome-methods" role="tablist" aria-label="${this._esc(this._t('donation.updateWelcome.methodsLabel', 'Support methods'))}"></div>
            </div>
            <div class="update-welcome-qr-panel">
                <div class="update-welcome-qr-title"></div>
                <p class="update-welcome-qr-desc"></p>
                <img class="update-welcome-qr" alt="${this._esc(this._t('donation.updateWelcome.qrAlt', 'Support QR code'))}" />
                <a class="update-welcome-open" target="_blank" rel="noopener">${this._esc(this._t('donation.updateWelcome.open', 'Open support page'))}</a>
            </div>
            <button type="button" class="btn btn-secondary update-welcome-done" data-update-welcome-close>${this._esc(this._t('donation.updateWelcome.done', 'Get started'))}</button>
        `;

        overlay.appendChild(card);
        document.body.appendChild(overlay);
        this.overlay = overlay;

        card.querySelectorAll('[data-update-welcome-close]').forEach((button) => {
            button.addEventListener('click', () => this.close());
        });
        card.querySelector('[data-update-welcome-github]')?.addEventListener('click', () => {
            if (github?.href) window.mediaflow?.shell?.openExternal?.(github.href);
        });
        card.querySelector('.update-welcome-open')?.addEventListener('click', (event) => {
            event.preventDefault();
            window.mediaflow?.shell?.openExternal?.(event.currentTarget.href);
        });

        const methodContainer = card.querySelector('.update-welcome-methods');
        entries.forEach((entry, index) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'update-welcome-method';
            button.textContent = entry.title;
            button.setAttribute('role', 'tab');
            button.addEventListener('click', () => this.selectEntry(entry, button));
            methodContainer?.appendChild(button);
            if (index === 0) this.selectEntry(entry, button);
        });
    }

    async selectEntry(entry, button) {
        if (!this.overlay) return;
        this.overlay.querySelectorAll('.update-welcome-method').forEach((item) => {
            item.classList.toggle('active', item === button);
            item.setAttribute('aria-selected', item === button ? 'true' : 'false');
        });

        const title = this.overlay.querySelector('.update-welcome-qr-title');
        const description = this.overlay.querySelector('.update-welcome-qr-desc');
        const image = this.overlay.querySelector('.update-welcome-qr');
        const open = this.overlay.querySelector('.update-welcome-open');
        title.textContent = entry.title;
        description.textContent = entry.description;
        open.href = entry.href;

        if (entry.qr?.startsWith('data:')) {
            image.src = entry.qr;
            return;
        }

        try {
            const result = await window.mediaflow?.app?.generateQr?.(entry.href);
            if (result?.success && result.dataUrl) image.src = result.dataUrl;
        } catch (error) {
            console.warn('[UpdateWelcome] QR generation failed:', error);
        }
    }

    close() {
        this.overlay?.remove();
        this.overlay = null;
    }

    _esc(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
}

window.UpdateWelcome = UpdateWelcome;
