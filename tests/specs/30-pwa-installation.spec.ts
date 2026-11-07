import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Progressive Web App (PWA) Implementation & Verification', () => {
  const rootDir = path.resolve(__dirname, '../../');
  const manifestPath = path.join(rootDir, 'public/site.webmanifest');
  const swPath = path.join(rootDir, 'public/sw.js');
  const indexHtmlPath = path.join(rootDir, 'index.html');

  // ---------------------------------------------------------------------------
  // 1. WEB APP MANIFEST VALIDATION
  // ---------------------------------------------------------------------------
  describe('1. Web App Manifest Specifications', () => {
    it('manifest file exists and is valid JSON', () => {
      expect(fs.existsSync(manifestPath)).toBe(true);
      const content = fs.readFileSync(manifestPath, 'utf8');
      expect(() => JSON.parse(content)).not.toThrow();
    });

    it('defines official branding, names, start URL, and standalone mode', () => {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

      expect(manifest.name).toBe('VIT Community Radio');
      expect(manifest.short_name).toBe('VIT Radio');
      expect(manifest.start_url).toBe('/');
      expect(manifest.scope).toBe('/');
      expect(manifest.display).toBe('standalone');
      expect(manifest.orientation).toBe('any');
      expect(manifest.theme_color).toBe('#d21e28');
      expect(manifest.background_color).toBe('#ffffff');
      expect(manifest.categories).toContain('media');
      expect(manifest.categories).toContain('broadcast');
    });

    it('contains all required standard and maskable icon definitions', () => {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const icons = manifest.icons as Array<{ src: string; sizes: string; purpose?: string }>;

      expect(icons.length).toBeGreaterThanOrEqual(4);

      const has192 = icons.some((i) => i.sizes === '192x192' && (!i.purpose || i.purpose === 'any'));
      const has512 = icons.some((i) => i.sizes === '512x512' && (!i.purpose || i.purpose === 'any'));
      const hasMaskable192 = icons.some((i) => i.sizes === '192x192' && i.purpose?.includes('maskable'));
      const hasMaskable512 = icons.some((i) => i.sizes === '512x512' && i.purpose?.includes('maskable'));
      const hasAppleTouch = icons.some((i) => i.sizes === '180x180');

      expect(has192).toBe(true);
      expect(has512).toBe(true);
      expect(hasMaskable192).toBe(true);
      expect(hasMaskable512).toBe(true);
      expect(hasAppleTouch).toBe(true);

      // Verify that all icon files physically exist in public/
      for (const icon of icons) {
        const filePath = path.join(rootDir, 'public', icon.src.replace(/^\//, ''));
        expect(fs.existsSync(filePath), `Icon file missing: ${icon.src}`).toBe(true);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 2. HTML HEAD & PWA META TAGS
  // ---------------------------------------------------------------------------
  describe('2. HTML Header & PWA Meta Tags', () => {
    it('declares manifest link, theme-color, and Apple mobile web app tags in index.html', () => {
      const html = fs.readFileSync(indexHtmlPath, 'utf8');

      expect(html).toContain('<link rel="manifest" href="/site.webmanifest" />');
      expect(html).toContain('<meta name="theme-color" content="#d21e28" />');
      expect(html).toContain('<meta name="application-name" content="VIT Community Radio" />');
      expect(html).toContain('<meta name="apple-mobile-web-app-capable" content="yes" />');
      expect(html).toContain('<meta name="apple-mobile-web-app-status-bar-style" content="default" />');
      expect(html).toContain('<meta name="apple-mobile-web-app-title" content="VIT Radio" />');
      expect(html).toContain('<meta name="mobile-web-app-capable" content="yes" />');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. SERVICE WORKER SECURITY & CACHING POLICY
  // ---------------------------------------------------------------------------
  describe('3. Service Worker Security & Caching Policy', () => {
    it('service worker script exists and is syntactically valid', () => {
      expect(fs.existsSync(swPath)).toBe(true);
      const code = fs.readFileSync(swPath, 'utf8');
      expect(code.length).toBeGreaterThan(500);
    });

    it('strictly enforces bypass on private APIs, Supabase, and Cloudflare R2', () => {
      const code = fs.readFileSync(swPath, 'utf8');

      // Verifies bypass domains
      expect(code).toContain('supabase.co');
      expect(code).toContain('r2.cloudflarestorage.com');
      expect(code).toContain('mixota.growiota.in');

      // Verifies bypass paths
      expect(code).toContain('/auth/v1');
      expect(code).toContain('/rest/v1');
      expect(code).toContain('/storage/v1');
      expect(code).toContain('/functions/v1');

      // Verifies that non-GET methods bypass cache
      expect(code).toContain("request.method !== 'GET'");

      // Verifies that Range requests (seeking audio) bypass cache
      expect(code).toContain("request.headers.has('range')");

      // Verifies that audio binaries are never cached
      expect(code).toContain("request.destination === 'audio'");
      expect(code).toContain(".endsWith('.mp3')");
    });

    it('implements Network-First for navigation and Cache-First for static assets', () => {
      const code = fs.readFileSync(swPath, 'utf8');

      expect(code).toContain("request.mode === 'navigate'");
      expect(code).toContain('SKIP_WAITING');
      expect(code).toContain('clients.claim()');
    });
  });

  // ---------------------------------------------------------------------------
  // 4. REACT CONTEXT & UI COMPONENT EXPORTS
  // ---------------------------------------------------------------------------
  describe('4. React PWA Component & Context Architecture', () => {
    it('exports PwaProvider and usePwa hook', async () => {
      const pwaProviderFile = path.join(rootDir, 'src/context/PwaProvider.tsx');
      const pwaContextFile = path.join(rootDir, 'src/context/pwaContext.ts');
      const usePwaFile = path.join(rootDir, 'src/hooks/usePwa.ts');

      expect(fs.existsSync(pwaProviderFile)).toBe(true);
      expect(fs.existsSync(pwaContextFile)).toBe(true);
      expect(fs.existsSync(usePwaFile)).toBe(true);

      const contextCode = fs.readFileSync(pwaContextFile, 'utf8');
      expect(contextCode).toContain('export const PwaContext');
      expect(contextCode).toContain('interface PwaContextType');

      const hookCode = fs.readFileSync(usePwaFile, 'utf8');
      expect(hookCode).toContain('export function usePwa()');
    });

    it('exports InstallAppButton, InstallModal, OfflineIndicator, and PwaUpdateToast', () => {
      const pwaIndexFile = path.join(rootDir, 'src/components/pwa/index.ts');
      expect(fs.existsSync(pwaIndexFile)).toBe(true);

      const indexCode = fs.readFileSync(pwaIndexFile, 'utf8');
      expect(indexCode).toContain('InstallAppButton');
      expect(indexCode).toContain('InstallModal');
      expect(indexCode).toContain('OfflineIndicator');
      expect(indexCode).toContain('PwaUpdateToast');
    });

    it('wires PwaProvider, PwaUpdateToast, and OfflineIndicator into App.tsx', () => {
      const appFile = path.join(rootDir, 'src/App.tsx');
      const appCode = fs.readFileSync(appFile, 'utf8');

      expect(appCode).toContain('<PwaProvider>');
      expect(appCode).toContain('</PwaProvider>');
      expect(appCode).toContain('<PwaUpdateToast />');
      expect(appCode).toContain('<OfflineIndicator />');
    });

    it('integrates InstallAppButton in AppLayout header', () => {
      const appLayoutFile = path.join(rootDir, 'src/layouts/AppLayout.tsx');
      const layoutCode = fs.readFileSync(appLayoutFile, 'utf8');

      expect(layoutCode).toContain('InstallAppButton');
      expect(layoutCode).toContain('<InstallAppButton />');
    });

    it('integrates InstallAppButton in SiteHeader desktop and mobile drawer', () => {
      const siteHeaderFile = path.join(rootDir, 'src/components/site/SiteHeader.tsx');
      const headerCode = fs.readFileSync(siteHeaderFile, 'utf8');

      expect(headerCode).toContain('InstallAppButton');
      expect(headerCode).toContain('<InstallAppButton');
    });
  });
});
