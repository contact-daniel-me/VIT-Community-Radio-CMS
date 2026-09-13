import type { AnnouncementRow } from '@/types/database';

export function StationAnnouncements({ announcements }: { announcements: AnnouncementRow[] }) {
  if (announcements.length === 0) return null;

  return (
    <section className="section" id="announcements" style={{ paddingTop: '2rem', paddingBottom: '0' }}>
      <div className="section-head" style={{ marginBottom: '1.5rem' }}>
        <div>
          <h2 className="section-title" style={{ fontSize: '1.8rem' }}>Station Announcements</h2>
        </div>
      </div>
      
      <div className="stack" style={{ gap: '1rem' }}>
        {announcements.map((ann) => (
          <div 
            key={ann.id}
            className="card fade-in" 
            style={{ 
              background: 'var(--surface-hover)', 
              borderLeft: '4px solid var(--accent)',
              padding: '1.5rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem'
            }}
          >
            <h3 style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>📢</span> {ann.title}
            </h3>
            <p style={{ margin: 0, color: 'var(--ink)', fontSize: '1.05rem', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
              {ann.message}
            </p>
            <div className="small muted" style={{ marginTop: '0.5rem' }}>
              {new Date(ann.published_at || ann.scheduled_at || ann.created_at).toLocaleDateString(undefined, { 
                weekday: 'long',
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
