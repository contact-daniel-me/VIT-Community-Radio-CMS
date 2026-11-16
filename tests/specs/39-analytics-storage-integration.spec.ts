import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { can } from '../../src/lib/permissions';

describe('CMS Navigation Restructuring: Storage Integrated into Analytics Center', () => {
  const rootDir = path.resolve(__dirname, '../../');

  describe('1. Top-Level Navigation Verification', () => {
    it('removes Storage from top-level NAV in AppLayout.tsx', () => {
      const appLayoutContent = fs.readFileSync(
        path.join(rootDir, 'src/layouts/AppLayout.tsx'),
        'utf-8',
      );

      // Verify NAV list definition does not have /admin/storage
      expect(appLayoutContent).not.toMatch(/to:\s*['"]\/admin\/storage['"]/);
      expect(appLayoutContent).not.toMatch(/label:\s*['"]Storage['"]/);

      // Verify Analytics is still present
      expect(appLayoutContent).toMatch(/to:\s*['"]\/admin\/analytics['"]/);
      expect(appLayoutContent).toMatch(/label:\s*['"]Analytics['"]/);
    });
  });

  describe('2. Analytics Center Tabs Structure & Order', () => {
    it('defines all 8 required sub-tabs in the exact specified order', () => {
      const analyticsPageContent = fs.readFileSync(
        path.join(rootDir, 'src/pages/admin/AnalyticsPage.tsx'),
        'utf-8',
      );

      // Verify type definition includes storage
      expect(analyticsPageContent).toMatch(/\|\s*'storage'/);

      // Verify the 8 tabs order in VALID_TABS
      const expectedTabs = [
        'overview',
        'live',
        'activity',
        'audio',
        'booking',
        'traffic',
        'storage',
        'reports',
      ];

      for (const tab of expectedTabs) {
        expect(analyticsPageContent).toContain(`'${tab}'`);
      }

      // Check button order in the nav element
      const overviewIdx = analyticsPageContent.indexOf("handleTabChange('overview')");
      const liveIdx = analyticsPageContent.indexOf("handleTabChange('live')");
      const activityIdx = analyticsPageContent.indexOf("handleTabChange('activity')");
      const audioIdx = analyticsPageContent.indexOf("handleTabChange('audio')");
      const bookingIdx = analyticsPageContent.indexOf("handleTabChange('booking')");
      const trafficIdx = analyticsPageContent.indexOf("handleTabChange('traffic')");
      const storageIdx = analyticsPageContent.indexOf("handleTabChange('storage')");
      const reportsIdx = analyticsPageContent.indexOf("handleTabChange('reports')");

      expect(overviewIdx).toBeGreaterThan(0);
      expect(liveIdx).toBeGreaterThan(overviewIdx);
      expect(activityIdx).toBeGreaterThan(liveIdx);
      expect(audioIdx).toBeGreaterThan(activityIdx);
      expect(bookingIdx).toBeGreaterThan(audioIdx);
      expect(trafficIdx).toBeGreaterThan(bookingIdx);
      expect(storageIdx).toBeGreaterThan(trafficIdx);
      expect(reportsIdx).toBeGreaterThan(storageIdx);
    });

    it('renders StorageTab when activeTab is storage', () => {
      const analyticsPageContent = fs.readFileSync(
        path.join(rootDir, 'src/pages/admin/AnalyticsPage.tsx'),
        'utf-8',
      );

      expect(analyticsPageContent).toContain("activeTab === 'storage'");
      expect(analyticsPageContent).toContain('<StorageTab />');
    });

    it('supports URL search params for deep linking and browser navigation', () => {
      const analyticsPageContent = fs.readFileSync(
        path.join(rootDir, 'src/pages/admin/AnalyticsPage.tsx'),
        'utf-8',
      );

      expect(analyticsPageContent).toContain('useSearchParams');
      expect(analyticsPageContent).toContain("searchParams.get('tab')");
      expect(analyticsPageContent).toContain('handleTabChange');
    });
  });

  describe('3. Route Compatibility & Redirects', () => {
    it('redirects /admin/storage to /admin/analytics?tab=storage in App.tsx', () => {
      const appContent = fs.readFileSync(
        path.join(rootDir, 'src/App.tsx'),
        'utf-8',
      );

      expect(appContent).toContain('path="admin/storage"');
      expect(appContent).toContain('to="/admin/analytics?tab=storage"');
    });

    it('redirects in legacy StoragePage component', () => {
      const storagePageContent = fs.readFileSync(
        path.join(rootDir, 'src/pages/StoragePage.tsx'),
        'utf-8',
      );

      expect(storagePageContent).toContain('to="/admin/analytics?tab=storage"');
    });
  });

  describe('4. RBAC & Security Preservation', () => {
    it('maintains strict ADMIN-only permissions for viewStorage and viewAnalytics', () => {
      expect(can.viewStorage('ADMIN')).toBe(true);
      expect(can.viewStorage('PRODUCER')).toBe(false);
      expect(can.viewStorage('RJ')).toBe(false);
      expect(can.viewStorage('QC')).toBe(false);
      expect(can.viewStorage('EDITOR')).toBe(false);
      expect(can.viewStorage('SECTION_HEAD')).toBe(false);

      expect(can.viewAnalytics('ADMIN')).toBe(true);
      expect(can.viewAnalytics('PRODUCER')).toBe(false);
      expect(can.viewAnalytics('RJ')).toBe(false);
      expect(can.viewAnalytics('QC')).toBe(false);
      expect(can.viewAnalytics('EDITOR')).toBe(false);
      expect(can.viewAnalytics('SECTION_HEAD')).toBe(false);
    });
  });
});
