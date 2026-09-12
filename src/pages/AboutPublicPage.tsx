import { useAsync } from '@/hooks/useAsync';
import { publicService } from '@/services/publicService';
import { SiteHeader } from '@/components/site/SiteHeader';
import { SiteFooter } from '@/components/site/CommunityCTA';
import { AboutStation } from '@/components/site/AboutStation';

export function AboutPublicPage() {
  const station = useAsync(async () => {
    const [chart, programmes] = await Promise.all([
      publicService.getFixedPointChart().catch(() => []),
      publicService.getShows(50).catch(() => []),
    ]);
    return { chart, programmes };
  }, []);

  return (
    <div className="site">
      <SiteHeader />

      <main id="main">
        {station.loading ? (
          <p className="section-empty">Loading about section&hellip;</p>
        ) : (
          <AboutStation
            chart={station.data?.chart ?? []}
            programmeCount={station.data?.programmes?.length ?? null}
          />
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
