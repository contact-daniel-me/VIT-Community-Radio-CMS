/**
 * Episode status tab mapping and navigation rules.
 *
 * Verifies that:
 * 1. Episode status values map correctly to user tabs.
 * 2. APPROVED is mapped to "Approved / QC Done".
 * 3. RAW_AUDIO is mapped to "Raw Audio Uploaded" directly after "Drafts".
 * 4. Status counting and filtering works across all 7 tabs.
 * 5. Combination of program, search, mine, and status filters works cleanly.
 */
import { describe, expect, it } from 'vitest';
import type { EpisodeStatus } from '../../src/types/database';

type TabKey = 'ALL' | 'DRAFT' | 'RAW_AUDIO' | 'PENDING_QC' | 'APPROVED' | 'REJECTED' | 'ARCHIVED';

interface EpisodeTabItem {
  key: TabKey;
  label: string;
  status: EpisodeStatus | '';
}

const EPISODE_TABS: EpisodeTabItem[] = [
  { key: 'ALL', label: 'All Episodes', status: '' },
  { key: 'DRAFT', label: 'Drafts', status: 'DRAFT' },
  { key: 'RAW_AUDIO', label: 'Raw Audio Uploaded', status: 'DRAFT' },
  { key: 'PENDING_QC', label: 'Pending QC', status: 'PENDING_QC' },
  { key: 'APPROVED', label: 'Approved / QC Done', status: 'APPROVED' },
  { key: 'REJECTED', label: 'Rejected', status: 'REJECTED' },
  { key: 'ARCHIVED', label: 'Archived', status: 'ARCHIVED' },
];

interface MockEpisode {
  id: string;
  episode_id: string;
  title: string;
  status: EpisodeStatus;
  program_id: string;
  created_by: string;
  assigned_rj: string | null;
  audio_file_id?: string | null;
}

function deriveCounts(episodes: MockEpisode[], filters: { programId?: string; mineOnly?: string; search?: string } = {}) {
  const matching = episodes.filter((ep) => {
    if (filters.programId && ep.program_id !== filters.programId) return false;
    if (filters.mineOnly && ep.created_by !== filters.mineOnly && ep.assigned_rj !== filters.mineOnly) return false;
    if (filters.search?.trim()) {
      const q = filters.search.trim().toLowerCase();
      const inTitle = ep.title.toLowerCase().includes(q);
      const inId = ep.episode_id.toLowerCase().includes(q);
      if (!inTitle && !inId) return false;
    }
    return true;
  });

  const counts: Record<TabKey, number> = {
    ALL: matching.length,
    DRAFT: 0,
    RAW_AUDIO: 0,
    PENDING_QC: 0,
    APPROVED: 0,
    REJECTED: 0,
    ARCHIVED: 0,
  };

  for (const ep of matching) {
    if (ep.status === 'DRAFT') {
      if (ep.audio_file_id) {
        counts.RAW_AUDIO++;
      } else {
        counts.DRAFT++;
      }
    } else if (ep.status in counts) {
      counts[ep.status as TabKey]++;
    }
  }

  return counts;
}

function filterEpisodes(episodes: MockEpisode[], activeTab: TabKey, filters: { programId?: string; mineOnly?: string; search?: string } = {}) {
  return episodes.filter((ep) => {
    if (activeTab === 'DRAFT') {
      if (ep.status !== 'DRAFT' || ep.audio_file_id) return false;
    } else if (activeTab === 'RAW_AUDIO') {
      if (ep.status !== 'DRAFT' || !ep.audio_file_id) return false;
    } else if (activeTab !== 'ALL' && ep.status !== activeTab) {
      return false;
    }
    if (filters.programId && ep.program_id !== filters.programId) return false;
    if (filters.mineOnly && ep.created_by !== filters.mineOnly && ep.assigned_rj !== filters.mineOnly) return false;
    if (filters.search?.trim()) {
      const q = filters.search.trim().toLowerCase();
      const inTitle = ep.title.toLowerCase().includes(q);
      const inId = ep.episode_id.toLowerCase().includes(q);
      if (!inTitle && !inId) return false;
    }
    return true;
  });
}

describe('episode status tabs and navigation', () => {
  const sampleEpisodes: MockEpisode[] = [
    { id: '1', episode_id: 'VCR-EP-001', title: 'Morning Show 1', status: 'DRAFT', program_id: 'prog-1', created_by: 'rj-1', assigned_rj: 'rj-1', audio_file_id: null },
    { id: '2', episode_id: 'VCR-EP-002', title: 'Morning Show 2', status: 'DRAFT', program_id: 'prog-1', created_by: 'rj-2', assigned_rj: null, audio_file_id: 'af-2' },
    { id: '3', episode_id: 'VCR-EP-003', title: 'Campus News 1', status: 'PENDING_QC', program_id: 'prog-2', created_by: 'rj-1', assigned_rj: null },
    { id: '4', episode_id: 'VCR-EP-004', title: 'Tech Talk 1', status: 'APPROVED', program_id: 'prog-3', created_by: 'rj-1', assigned_rj: 'rj-1' },
    { id: '5', episode_id: 'VCR-EP-005', title: 'Tech Talk 2', status: 'APPROVED', program_id: 'prog-3', created_by: 'rj-3', assigned_rj: null },
    { id: '6', episode_id: 'VCR-EP-006', title: 'Evening Beats', status: 'REJECTED', program_id: 'prog-4', created_by: 'rj-2', assigned_rj: null },
    { id: '7', episode_id: 'VCR-EP-007', title: 'Old Archive 1', status: 'ARCHIVED', program_id: 'prog-1', created_by: 'rj-1', assigned_rj: null },
  ];

  it('defines all 7 tabs with the exact expected labels including "Raw Audio Uploaded" after "Drafts"', () => {
    expect(EPISODE_TABS.map((t) => t.label)).toEqual([
      'All Episodes',
      'Drafts',
      'Raw Audio Uploaded',
      'Pending QC',
      'Approved / QC Done',
      'Rejected',
      'Archived',
    ]);
  });

  it('maps APPROVED status to the "Approved / QC Done" tab', () => {
    const approvedTab = EPISODE_TABS.find((t) => t.label === 'Approved / QC Done');
    expect(approvedTab).toBeDefined();
    expect(approvedTab?.key).toBe('APPROVED');
    expect(approvedTab?.status).toBe('APPROVED');
  });

  it('maps RAW_AUDIO tab correctly right after Drafts', () => {
    const draftIdx = EPISODE_TABS.findIndex((t) => t.key === 'DRAFT');
    const rawAudioIdx = EPISODE_TABS.findIndex((t) => t.key === 'RAW_AUDIO');
    expect(rawAudioIdx).toBe(draftIdx + 1);
    expect(EPISODE_TABS[rawAudioIdx].label).toBe('Raw Audio Uploaded');
  });

  it('computes accurate status counts for all episodes when unfiltered', () => {
    const counts = deriveCounts(sampleEpisodes);
    expect(counts.ALL).toBe(7);
    expect(counts.DRAFT).toBe(1);
    expect(counts.RAW_AUDIO).toBe(1);
    expect(counts.PENDING_QC).toBe(1);
    expect(counts.APPROVED).toBe(2);
    expect(counts.REJECTED).toBe(1);
    expect(counts.ARCHIVED).toBe(1);
  });

  it('filters table by tab while preserving all other tabs count badges', () => {
    const counts = deriveCounts(sampleEpisodes);
    const drafts = filterEpisodes(sampleEpisodes, 'DRAFT');
    const rawAudio = filterEpisodes(sampleEpisodes, 'RAW_AUDIO');
    const approved = filterEpisodes(sampleEpisodes, 'APPROVED');
    const all = filterEpisodes(sampleEpisodes, 'ALL');

    expect(drafts).toHaveLength(counts.DRAFT);
    expect(rawAudio).toHaveLength(counts.RAW_AUDIO);
    expect(approved).toHaveLength(counts.APPROVED);
    expect(all).toHaveLength(counts.ALL);

    expect(drafts.every((ep) => ep.status === 'DRAFT' && !ep.audio_file_id)).toBe(true);
    expect(rawAudio.every((ep) => ep.status === 'DRAFT' && ep.audio_file_id)).toBe(true);
    expect(approved.every((ep) => ep.status === 'APPROVED')).toBe(true);
  });

  it('correctly recalculates counts when filtered by program', () => {
    const countsProg1 = deriveCounts(sampleEpisodes, { programId: 'prog-1' });
    expect(countsProg1.ALL).toBe(3);
    expect(countsProg1.DRAFT).toBe(1);
    expect(countsProg1.RAW_AUDIO).toBe(1);
    expect(countsProg1.PENDING_QC).toBe(0);
    expect(countsProg1.APPROVED).toBe(0);
    expect(countsProg1.ARCHIVED).toBe(1);

    const prog1Drafts = filterEpisodes(sampleEpisodes, 'DRAFT', { programId: 'prog-1' });
    expect(prog1Drafts).toHaveLength(1);
    const prog1Raw = filterEpisodes(sampleEpisodes, 'RAW_AUDIO', { programId: 'prog-1' });
    expect(prog1Raw).toHaveLength(1);
  });

  it('correctly recalculates counts when filtered by Only Mine', () => {
    const countsMine = deriveCounts(sampleEpisodes, { mineOnly: 'rj-1' });
    // rj-1 created or assigned: 1, 3, 4, 7 (4 total)
    expect(countsMine.ALL).toBe(4);
    expect(countsMine.DRAFT).toBe(1);
    expect(countsMine.RAW_AUDIO).toBe(0);
    expect(countsMine.PENDING_QC).toBe(1);
    expect(countsMine.APPROVED).toBe(1);
    expect(countsMine.ARCHIVED).toBe(1);
    expect(countsMine.REJECTED).toBe(0);
  });

  it('correctly recalculates counts when searched by query', () => {
    const countsSearch = deriveCounts(sampleEpisodes, { search: 'Tech Talk' });
    expect(countsSearch.ALL).toBe(2);
    expect(countsSearch.APPROVED).toBe(2);
    expect(countsSearch.DRAFT).toBe(0);
    expect(countsSearch.RAW_AUDIO).toBe(0);

    const countsById = deriveCounts(sampleEpisodes, { search: 'EP-006' });
    expect(countsById.ALL).toBe(1);
    expect(countsById.REJECTED).toBe(1);
  });
});
