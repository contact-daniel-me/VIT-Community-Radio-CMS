import { useState } from 'react';
import { useAsync } from '@/hooks/useAsync';
import { badgeService, type BadgeDefinition } from '@/services/badgeService';
import { BADGE_ICON_MAP } from '@/components/badges/BadgeIcons';
import { Loading } from '@/components/ui';
import { supabase } from '@/lib/supabase';

export function BadgeManagement() {
  const [isEditing, setIsEditing] = useState<BadgeDefinition | Partial<BadgeDefinition> | null>(null);
  
  const badgesData = useAsync(() => badgeService.getBadgeDefinitions(), []);

  const handleSave = async (badge: Partial<BadgeDefinition>) => {
    try {
      // In a real implementation with DB connectivity, we would UPSERT here
      const toSave = {
        badge_key: badge.badge_key || badge.name?.toLowerCase().replace(/\s+/g, '-'),
        name: badge.name,
        description: badge.description,
        requirement: badge.requirement,
        icon: badge.icon,
        rarity: badge.rarity,
        xp: badge.xp,
        threshold: badge.threshold,
        metric: badge.metric,
        active: true
      };
      
      if (badge.id && badge.id !== 'new') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await supabase.from('gamification_badges').update(toSave as any).eq('id', badge.id);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await supabase.from('gamification_badges').insert(toSave as any);
      }
      
      setIsEditing(null);
      badgesData.reload();
      alert('Badge saved successfully!');
    } catch (e: unknown) {
      alert(`Error saving badge: ${(e as Error).message}`);
    }
  };

  if (badgesData.loading) return <Loading label="Loading badges..." />;

  return (
    <div className="admin-gamification-badges">
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1.5rem' }}>
        <button 
          className="btn btn-solid"
          onClick={() => setIsEditing({ 
            id: 'new', name: '', description: '', requirement: '', icon: 'mic', rarity: 'COMMON', xp: 100, threshold: 1, metric: 'episodeCount'
          })}
        >
          + Create Badge
        </button>
      </div>

      <div className="admin-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
        {badgesData.data?.map(badge => {
          const Icon = BADGE_ICON_MAP[badge.icon] || BADGE_ICON_MAP['mic'];
          return (
            <div key={badge.id} className="admin-card" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <div style={{ width: 60, height: 60, background: 'var(--surface-sunken)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink)' }}>
                <Icon size={32} />
              </div>
              <div style={{ flex: 1 }}>
                <h4 style={{ margin: '0 0 0.25rem 0' }}>{badge.name}</h4>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--ink-muted)' }}>{badge.xp} XP • {badge.rarity}</p>
                <p style={{ margin: 0, fontSize: '0.75rem', marginTop: '0.5rem', color: 'var(--ink-muted)' }}>{badge.requirement}</p>
              </div>
              <div>
                <button className="btn btn-outline btn-sm" onClick={() => setIsEditing(badge)}>Edit</button>
              </div>
            </div>
          );
        })}
      </div>

      {isEditing && (
        <BadgeEditModal 
          badge={isEditing} 
          onClose={() => setIsEditing(null)} 
          onSave={handleSave} 
        />
      )}
    </div>
  );
}

function BadgeEditModal({ badge, onClose, onSave }: { badge: BadgeDefinition | Partial<BadgeDefinition>; onClose: () => void; onSave: (badge: Partial<BadgeDefinition>) => void }) {
  const [formData, setFormData] = useState(badge);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData((prev: BadgeDefinition | Partial<BadgeDefinition>) => ({
      ...prev,
      [name]: type === 'number' ? Number(value) : value
    }));
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: 500 }}>
        <button className="modal-close" onClick={onClose}>×</button>
        <h2>{badge.id === 'new' ? 'Create Badge' : 'Edit Badge'}</h2>
        
        <form onSubmit={e => { e.preventDefault(); onSave(formData); }} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
          <div>
            <label className="admin-label">Name</label>
            <input name="name" value={formData.name || ''} onChange={handleChange} className="admin-input" required />
          </div>
          <div>
            <label className="admin-label">Description</label>
            <textarea name="description" value={formData.description || ''} onChange={handleChange} className="admin-input" required rows={2} />
          </div>
          <div>
            <label className="admin-label">Requirement (Text)</label>
            <input name="requirement" value={formData.requirement || ''} onChange={handleChange} className="admin-input" required />
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <div style={{ flex: 1 }}>
              <label className="admin-label">Icon Identifier</label>
              <select name="icon" value={formData.icon} onChange={handleChange} className="admin-input">
                {Object.keys(BADGE_ICON_MAP).map(key => <option key={key} value={key}>{key}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label className="admin-label">Rarity</label>
              <select name="rarity" value={formData.rarity} onChange={handleChange} className="admin-input">
                <option value="COMMON">Common</option>
                <option value="UNCOMMON">Uncommon</option>
                <option value="RARE">Rare</option>
                <option value="EPIC">Epic</option>
                <option value="LEGENDARY">Legendary</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <div style={{ flex: 1 }}>
              <label className="admin-label">XP Reward</label>
              <input type="number" name="xp" value={formData.xp || 0} onChange={handleChange} className="admin-input" required />
            </div>
            <div style={{ flex: 1 }}>
              <label className="admin-label">Threshold (count)</label>
              <input type="number" name="threshold" value={formData.threshold || 0} onChange={handleChange} className="admin-input" required />
            </div>
          </div>
          <div>
            <label className="admin-label">Metric (Activity trigger)</label>
            <select name="metric" value={formData.metric} onChange={handleChange} className="admin-input">
              <option value="episodeCount">Shows Created</option>
              <option value="approvedCount">Shows Approved</option>
              <option value="submittedCount">Shows Submitted</option>
              <option value="bookingCount">Studio Bookings</option>
            </select>
          </div>
          
          <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-solid">Save Badge</button>
          </div>
        </form>
      </div>
    </div>
  );
}
