/**
 * The header's mobile rules.
 *
 * These are source assertions rather than layout assertions, deliberately. The
 * bug was a real measurement -- the header needed 486px of width, so the page
 * scrolled sideways at every phone size and scrollWidth sat at 462 whether the
 * viewport was 320px or 430px -- and jsdom performs no layout, so it cannot
 * reproduce that. Measuring it needs a real browser, which this suite does not
 * run.
 *
 * What these can do is stop the fix being quietly undone, and stop it being
 * replaced by the band-aid it was chosen over: `overflow-x: hidden` hides a
 * sideways scroll without making anything fit.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(process.cwd(), 'src', 'styles', 'site.css'), 'utf8');

/** Return the body of the first `@media (max-width: <px>)` block. */
function mediaBlock(maxWidth: number): string {
  const marker = `@media (max-width: ${maxWidth}px)`;
  const start = css.indexOf(marker);
  if (start < 0) throw new Error(`no ${marker} block in site.css`);

  const open = css.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') {
      depth--;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  throw new Error(`unbalanced braces after ${marker}`);
}

describe('header at phone widths', () => {
  const phone = mediaBlock(620);

  it('drops the widest item from the bar', () => {
    // "Request access" measured 142px, the largest single contributor.
    expect(phone).toMatch(/\.site-actions\s+\.btn\s*\{[^}]*display:\s*none/);
  });

  it('lets the brand shrink instead of forcing the row wider', () => {
    // Flex items default to min-width:auto and refuse to shrink below their
    // content, and the brand is nowrap text.
    expect(phone).toMatch(/\.site-brand[^{]*\{[^}]*min-width:\s*0/);
  });

  it('tightens the padding and gap that cost 72px', () => {
    expect(phone).toMatch(/\.site-header-inner\s*\{[^}]*padding-left:\s*1rem/);
    expect(phone).toMatch(/\.site-header-inner\s*\{[^}]*padding-right:\s*1rem/);
    expect(phone).toMatch(/\.site-header-inner\s*\{[^}]*gap:\s*0\.75rem/);
  });

  it('allows the wordmark to clip rather than overflow', () => {
    expect(phone).toMatch(/\.logo-name\s*\{[^}]*text-overflow:\s*ellipsis/);
  });

  it('does not hide the overflow instead of fixing it', () => {
    // A page-level overflow-x:hidden would make the symptom disappear while
    // the header still did not fit.
    expect(css).not.toMatch(/(?:^|[\s,])(?:html|body)[^{]*\{[^}]*overflow-x:\s*hidden/m);
  });

  it('leaves the desktop header alone', () => {
    // The call to action and the nav belong in the bar above 620px; only the
    // phone block may take them out.
    for (const width of [1040, 860]) {
      expect(mediaBlock(width)).not.toMatch(/\.site-actions\s+\.btn\s*\{[^}]*display:\s*none/);
    }
  });
});
