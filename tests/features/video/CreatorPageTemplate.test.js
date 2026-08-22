const fs = require('fs');
const path = require('path');

describe('Creator quick-tools page', () => {
    const html = fs.readFileSync(
        path.join(__dirname, '../../../src/pages/creator.html'),
        'utf8'
    );
    const css = fs.readFileSync(
        path.join(__dirname, '../../../src/styles/creator.css'),
        'utf8'
    );

    test('keeps quick and batch tools while removing the legacy timeline workspace', () => {
        expect(html).toContain('id="creator-quick-tools"');
        expect(html).toContain('id="creator-batch-view"');
        expect(html).toContain('id="prop-section-audio"');
        expect(html).toContain('id="prop-section-separation"');

        expect(html).not.toContain('id="creator-timeline-workspace"');
        expect(html).not.toContain('id="creator-timeline-container"');
        expect(html).not.toContain('id="creator-export-modal"');
        expect(html).not.toContain('id="btn-creator-export-dialog"');
    });

    test('keeps the media metadata toolbar layout', () => {
        expect(css).toMatch(/#page-creator \.video-meta-bar\s*{[^}]*display:\s*flex;/s);
    });
});
