import { useState } from 'react';
import { useAsync } from '@/hooks/useAsync';
import { badgeService, type XpRule } from '@/services/badgeService';
import { Loading } from '@/components/ui';

export function XpManagement() {
  const { data: rules, loading, error, reload } = useAsync(() => badgeService.getXpRules(), []);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  if (loading) return <Loading label="Loading XP Rules..." />;
  if (error || !rules) return <p className="error">Failed to load XP Rules.</p>;

  const handleEdit = (rule: XpRule) => {
    setEditingId(rule.id);
    setEditValue(rule.xp_reward.toString());
    setErrorMessage('');
  };

  const handleSave = async (rule: XpRule) => {
    const val = parseInt(editValue, 10);
    if (isNaN(val) || val < 0) {
      setErrorMessage('XP Reward must be a valid positive number.');
      return;
    }
    
    try {
      setIsSaving(true);
      await badgeService.updateXpRule(rule.id, { xp_reward: val });
      setEditingId(null);
      await reload();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update XP rule.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async (rule: XpRule) => {
    try {
      setIsSaving(true);
      await badgeService.updateXpRule(rule.id, { active: !rule.active });
      await reload();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to toggle rule state.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="admin-gamification-xp">
      <div className="admin-controls" style={{ marginBottom: '1.5rem' }}>
        <h3>XP Rules Configuration</h3>
        <p className="text-sm text-gray-500">Configure how much XP users earn for platform activities.</p>
      </div>

      {errorMessage && <p className="error" style={{ marginBottom: '1rem' }}>{errorMessage}</p>}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Action</th>
              <th>Description</th>
              <th>XP Reward</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => (
              <tr key={rule.id}>
                <td>
                  <code style={{ background: '#f1f5f9', padding: '0.25rem 0.5rem', borderRadius: '4px' }}>
                    {rule.action}
                  </code>
                </td>
                <td>{rule.description}</td>
                <td>
                  {editingId === rule.id ? (
                    <input 
                      type="number" 
                      className="admin-input" 
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      style={{ width: '100px' }}
                      min="0"
                    />
                  ) : (
                    <strong>+{rule.xp_reward} XP</strong>
                  )}
                </td>
                <td>
                  <span className={`badge ${rule.active ? 'active' : ''}`} style={{ background: rule.active ? '#dcfce7' : '#fee2e2', color: rule.active ? '#166534' : '#991b1b', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '12px' }}>
                    {rule.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td>
                  {editingId === rule.id ? (
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button 
                        className="btn btn-primary btn-sm"
                        onClick={() => handleSave(rule)}
                        disabled={isSaving}
                      >
                        Save
                      </button>
                      <button 
                        className="btn btn-outline btn-sm"
                        onClick={() => setEditingId(null)}
                        disabled={isSaving}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button 
                        className="btn btn-outline btn-sm"
                        onClick={() => handleEdit(rule)}
                        disabled={isSaving}
                      >
                        Edit
                      </button>
                      <button 
                        className="btn btn-outline btn-sm"
                        onClick={() => handleToggleActive(rule)}
                        disabled={isSaving}
                        style={{ color: rule.active ? '#dc2626' : '#16a34a', borderColor: 'currentColor' }}
                      >
                        {rule.active ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {rules.length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '2rem' }}>
                  No XP rules configured.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
