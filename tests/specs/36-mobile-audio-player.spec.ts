import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Mobile Bottom Audio Player Layout & Responsive Overflow Prevention', () => {
  const cssPath = path.resolve(__dirname, '../../src/styles/site.css');
  const css = fs.readFileSync(cssPath, 'utf-8');

  it('respects device safe-area insets on .player and .site', () => {
    // .player must include padding-bottom with env(safe-area-inset-bottom)
    expect(css).toMatch(/\.player\s*\{[^}]*padding-bottom:\s*env\(safe-area-inset-bottom/);

    // .site must reserve safe space so footer is not obscured
    expect(css).toMatch(/\.site\s*\{[^}]*padding-bottom:\s*calc\(104px\s*\+\s*env\(safe-area-inset-bottom/);
  });

  it('provides a dedicated responsive controls area that cannot be pushed off-screen', () => {
    // .player-transport has flex-shrink: 0 and margin-left: auto
    const mobileSection = css.substring(css.indexOf('Mobile Bottom Audio Player'));
    expect(mobileSection).toContain('.player-transport');
    expect(mobileSection).toMatch(/\.player-transport\s*\{[^}]*flex-shrink:\s*0/);
    expect(mobileSection).toMatch(/\.player-transport\s*\{[^}]*margin-left:\s*auto/);
  });

  it('ensures track info is fully flexible with min-width 0 and width 0', () => {
    const mobileSection = css.substring(css.indexOf('Mobile Bottom Audio Player'));
    expect(mobileSection).toMatch(/\.player-id\s*\{[^}]*min-width:\s*0/);
    expect(mobileSection).toMatch(/\.player-id-text\s*\{[^}]*min-width:\s*0/);
    expect(mobileSection).toMatch(/\.player-id-text\s*\{[^}]*width:\s*0/);
  });

  it('enforces text truncation with ellipsis on both title and subtitle', () => {
    const mobileSection = css.substring(css.indexOf('Mobile Bottom Audio Player'));
    expect(mobileSection).toMatch(/\.player-station\s*\{[^}]*text-overflow:\s*ellipsis/);
    expect(mobileSection).toMatch(/\.player-station\s*\{[^}]*white-space:\s*nowrap/);
    expect(mobileSection).toMatch(/\.player-sub\s*\{[^}]*text-overflow:\s*ellipsis/);
    expect(mobileSection).toMatch(/\.player-sub\s*\{[^}]*white-space:\s*nowrap/);
  });

  it('hides secondary skip buttons and waveforms on mobile for 100% Play button prominence', () => {
    const mobileSection = css.substring(css.indexOf('Mobile Bottom Audio Player'));
    expect(mobileSection).toMatch(/\.player-skip\s*\{[^}]*display:\s*none/);
    expect(mobileSection).toMatch(/\.player-wave\s*\{[^}]*display:\s*none/);
    expect(mobileSection).toMatch(/\.player-time\s*\{[^}]*display:\s*none/);
  });

  it('scales responsive padding and button dimensions across mobile viewports (320px - 430px)', () => {
    const mobileSection = css.substring(css.indexOf('Mobile Bottom Audio Player'));

    // Standard mobile (<= 768px): 42px play button
    expect(mobileSection).toContain('@media (max-width: 768px)');
    expect(mobileSection).toMatch(/\.player-play\s*\{[^}]*width:\s*42px/);

    // Compact mobile (<= 430px): 40px play button
    expect(mobileSection).toContain('@media (max-width: 430px)');
    expect(mobileSection).toMatch(/\.player-play\s*\{[^}]*width:\s*40px/);

    // Ultra-compact mobile (<= 359px): 38px play button
    expect(mobileSection).toContain('@media (max-width: 359px)');
    expect(mobileSection).toMatch(/\.player-play\s*\{[^}]*width:\s*38px/);
  });

  it('preserves desktop and wide tablet 3-column layout above 768px', () => {
    // Desktop .player-inner retains 3-column grid
    expect(css).toMatch(/\.player-inner\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*auto\s*minmax\(0,\s*1fr\)/);
  });
});
