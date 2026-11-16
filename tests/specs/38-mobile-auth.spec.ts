import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Mobile Sign In & Sign Up Responsive UI & Zero Overflow', () => {
  const authCssPath = path.resolve(__dirname, '../../src/styles/auth.css');
  const siteCssPath = path.resolve(__dirname, '../../src/styles/site.css');
  const mainTsxPath = path.resolve(__dirname, '../../src/main.tsx');
  const authShellPath = path.resolve(__dirname, '../../src/components/site/AuthShell.tsx');
  const loginPagePath = path.resolve(__dirname, '../../src/pages/LoginPage.tsx');
  const registerPagePath = path.resolve(__dirname, '../../src/pages/RegisterPage.tsx');

  const authCss = fs.readFileSync(authCssPath, 'utf-8');
  const siteCss = fs.readFileSync(siteCssPath, 'utf-8');
  const mainTsx = fs.readFileSync(mainTsxPath, 'utf-8');
  const authShell = fs.readFileSync(authShellPath, 'utf-8');
  const loginPage = fs.readFileSync(loginPagePath, 'utf-8');
  const registerPage = fs.readFileSync(registerPagePath, 'utf-8');

  it('imports auth.css in main.tsx after site.css', () => {
    expect(mainTsx).toContain("import './styles/auth.css';");
    const siteIndex = mainTsx.indexOf("import './styles/site.css';");
    const authIndex = mainTsx.indexOf("import './styles/auth.css';");
    expect(authIndex).toBeGreaterThan(siteIndex);
  });

  it('removes conflicting duplicate 2-column rules from site.css', () => {
    // site.css must not have duplicate .auth-wrap forcing 2 columns unconditionally
    const matches = siteCss.match(/grid-template-columns:\s*minmax\(0,\s*1fr\)\s*minmax\(0,\s*1fr\)/g);
    // At most 1 match inside media query in site.css
    expect(matches ? matches.length : 0).toBeLessThanOrEqual(1);
  });

  it('configures single-column mobile-first layout with overflow prevention in auth.css', () => {
    // Base layout must be flex column, 100% width, overflow-x hidden
    expect(authCss).toMatch(/\.auth-wrap\s*\{[^}]*display:\s*flex/);
    expect(authCss).toMatch(/\.auth-wrap\s*\{[^}]*flex-direction:\s*column/);
    expect(authCss).toMatch(/\.auth-wrap\s*\{[^}]*overflow-x:\s*hidden/);
  });

  it('preserves desktop two-column split layout at min-width: 960px', () => {
    expect(authCss).toContain('@media (min-width: 960px)');
    const desktopSection = authCss.substring(authCss.indexOf('@media (min-width: 960px)'));
    expect(desktopSection).toMatch(/\.auth-wrap\s*\{[^}]*display:\s*grid/);
    expect(desktopSection).toMatch(/\.auth-wrap\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1\.05fr\)\s*minmax\(0,\s*1fr\)/);
  });

  it('creates a compact mobile branding section without taking 50% width', () => {
    // Base mobile aside: 100% width, compact padding, safe-area inset top
    expect(authCss).toMatch(/\.auth-aside\s*\{[^}]*width:\s*100%/);
    expect(authCss).toMatch(/\.auth-aside\s*\{[^}]*env\(safe-area-inset-top/);

    // Responsive fluid typography for title
    expect(authCss).toMatch(/\.auth-aside-title\s*\{[^}]*font-size:\s*clamp\(/);

    // Badges and footer hidden on mobile to avoid excessive vertical space
    expect(authCss).toMatch(/\.auth-aside-features\s*\{[^}]*display:\s*none\s*!important/);
    expect(authCss).toMatch(/\.auth-aside-footer\s*\{[^}]*display:\s*none\s*!important/);
  });

  it('displays full branding features on desktop layout', () => {
    const desktopSection = authCss.substring(authCss.indexOf('@media (min-width: 960px)'));
    expect(desktopSection).toMatch(/\.auth-aside-features\s*\{[^}]*display:\s*flex\s*!important/);
    expect(desktopSection).toMatch(/\.auth-aside-footer\s*\{[^}]*display:\s*flex\s*!important/);
    expect(desktopSection).toMatch(/\.auth-aside-title\s*\{[^}]*font-size:\s*3\.5rem/);
  });

  it('provides an accessible theme switcher for both mobile top bar and desktop main card', () => {
    // Mobile theme switcher in aside top bar
    expect(authCss).toMatch(/\.auth-theme-mobile\s*\{[^}]*display:\s*flex/);
    expect(authShell).toContain('auth-theme-mobile');

    // Desktop theme switcher in main container
    const desktopSection = authCss.substring(authCss.indexOf('@media (min-width: 960px)'));
    expect(desktopSection).toMatch(/\.auth-theme-desktop\s*\{[^}]*display:\s*flex\s*!important/);
    expect(desktopSection).toMatch(/\.auth-theme-mobile\s*\{[^}]*display:\s*none\s*!important/);
  });

  it('ensures authentication form uses full available width with comfortable touch inputs', () => {
    expect(authCss).toMatch(/\.auth-card\s*\{[^}]*max-width:\s*440px/);
    expect(authCss).toMatch(/\.auth-card\s*\{[^}]*width:\s*100%/);

    // Inputs: full width, 48px height, 16px (1rem) font to prevent iOS zoom
    expect(authCss).toMatch(/\.auth-input\s*\{[^}]*width:\s*100%/);
    expect(authCss).toMatch(/\.auth-input\s*\{[^}]*height:\s*48px/);
    expect(authCss).toMatch(/\.auth-input\s*\{[^}]*font-size:\s*1rem/);
    expect(authCss).toMatch(/\.auth-input\s*\{[^}]*box-sizing:\s*border-box/);

    // Primary submit button: full width, 48px height, bold
    expect(authCss).toMatch(/\.auth-submit-btn\s*\{[^}]*width:\s*100%/);
    expect(authCss).toMatch(/\.auth-submit-btn\s*\{[^}]*height:\s*48px/);

    // Password toggle: 44x44px minimum tap target
    expect(authCss).toMatch(/\.auth-password-toggle\s*\{[^}]*width:\s*44px/);
    expect(authCss).toMatch(/\.auth-password-toggle\s*\{[^}]*height:\s*44px/);
  });

  it('includes ultra-compact screen handling down to 320px', () => {
    expect(authCss).toContain('@media (max-width: 360px)');
    const narrowSection = authCss.substring(authCss.indexOf('@media (max-width: 360px)'));
    expect(narrowSection).toContain('.auth-input');
    expect(narrowSection).toContain('.auth-aside');
  });

  it('applies the consistent responsive layout to both LoginPage and RegisterPage', () => {
    // LoginPage uses AuthShell and new responsive form classes
    expect(loginPage).toContain('<AuthShell');
    expect(loginPage).toContain('className="auth-input"');
    expect(loginPage).toContain('className="auth-submit-btn');
    expect(loginPage).toContain('className="auth-password-toggle');

    // RegisterPage uses AuthShell and new responsive form classes
    expect(registerPage).toContain('<AuthShell');
    expect(registerPage).toContain('className="auth-input"');
    expect(registerPage).toContain('className="auth-submit-btn');
    expect(registerPage).toContain('className="auth-password-toggle');
  });
});
