import { describe, expect, it } from 'vitest';
import type { AudioFileRow, EpisodeRow } from '../../src/types/database';

export type AudioFilterTab = 'all' | 'raw' | 'final' | 'old';

export interface AudioTabDef {
  key: AudioFilterTab;
  label: string;
}

export const AUDIO_TABS: AudioTabDef[] = [
  { key: 'all', label: 'All Audio' },
  { key: 'raw', label: 'Raw Audio' },
  { key: 'final', label: 'Final Audio' },
  { key: 'old', label: 'Old Takes' },
];

export interface AudioLibraryItem {
  file: AudioFileRow;
  episode: Pick<EpisodeRow, 'id' | 'title' | 'audio_file_id' | 'final_audio_file_id'> | null;
  category: 'raw' | 'final';
  isOldTake: boolean;
}

export function categorizeAudio(
  file: AudioFileRow,
  episode: Pick<EpisodeRow, 'id' | 'title' | 'audio_file_id' | 'final_audio_file_id'> | null,
): { category: 'raw' | 'final'; isOldTake: boolean } {
  if (episode) {
    if (episode.final_audio_file_id === file.id) {
      return { category: 'final', isOldTake: false };
    }
    if (episode.audio_file_id === file.id) {
      return { category: 'raw', isOldTake: false };
    }
    const nameOrPath = `${file.file_name} ${file.storage_path}`.toLowerCase();
    if (nameOrPath.includes('final')) {
      return { category: 'final', isOldTake: true };
    }
    return { category: 'raw', isOldTake: true };
  }

  const nameOrPath = `${file.file_name} ${file.storage_path}`.toLowerCase();
  if (nameOrPath.includes('final')) {
    return { category: 'final', isOldTake: false };
  }
  return { category: 'raw', isOldTake: false };
}

describe('Audio Library Tabs & Filtering', () => {
  const mockEpisode1 = {
    id: 'ep-1',
    title: 'Morning Pulse Ep 1',
    audio_file_id: 'af-1',
    final_audio_file_id: 'af-2',
  };

  const mockEpisode2 = {
    id: 'ep-2',
    title: 'Evening Drive',
    audio_file_id: 'af-4',
    final_audio_file_id: null,
  };

  const file1RawActive: AudioFileRow = {
    id: 'af-1',
    episode_id: 'ep-1',
    file_name: 'morning_pulse_take2.mp3',
    storage_path: 'episodes/ep-1/morning_pulse_take2.mp3',
    mime_type: 'audio/mpeg',
    file_size: 15000000,
    duration_seconds: 1800,
    uploaded_by: 'u-1',
    created_at: '2026-01-01T10:00:00Z',
    updated_at: '2026-01-01T10:00:00Z',
  };

  const file2FinalActive: AudioFileRow = {
    id: 'af-2',
    episode_id: 'ep-1',
    file_name: 'morning_pulse_final_master.mp3',
    storage_path: 'episodes/ep-1/morning_pulse_final_master.mp3',
    mime_type: 'audio/mpeg',
    file_size: 25000000,
    duration_seconds: 1800,
    uploaded_by: 'u-1',
    created_at: '2026-01-01T12:00:00Z',
    updated_at: '2026-01-01T12:00:00Z',
  };

  const file3RawOldTake: AudioFileRow = {
    id: 'af-3',
    episode_id: 'ep-1',
    file_name: 'morning_pulse_take1.mp3',
    storage_path: 'episodes/ep-1/morning_pulse_take1.mp3',
    mime_type: 'audio/mpeg',
    file_size: 14500000,
    duration_seconds: 1750,
    uploaded_by: 'u-1',
    created_at: '2026-01-01T09:00:00Z',
    updated_at: '2026-01-01T09:00:00Z',
  };

  const file4RawActive: AudioFileRow = {
    id: 'af-4',
    episode_id: 'ep-2',
    file_name: 'evening_drive_raw.mp3',
    storage_path: 'episodes/ep-2/evening_drive_raw.mp3',
    mime_type: 'audio/mpeg',
    file_size: 10000000,
    duration_seconds: 1200,
    uploaded_by: 'u-2',
    created_at: '2026-01-02T14:00:00Z',
    updated_at: '2026-01-02T14:00:00Z',
  };

  const file5UnlinkedFinal: AudioFileRow = {
    id: 'af-5',
    episode_id: 'ep-999',
    file_name: 'jingle_station_final.mp3',
    storage_path: 'station/jingle_station_final.mp3',
    mime_type: 'audio/mpeg',
    file_size: 2000000,
    duration_seconds: 60,
    uploaded_by: 'u-1',
    created_at: '2026-01-03T10:00:00Z',
    updated_at: '2026-01-03T10:00:00Z',
  };

  it('defines the 4 required filter tabs with correct labels', () => {
    expect(AUDIO_TABS).toHaveLength(4);
    expect(AUDIO_TABS.map((t: AudioTabDef) => t.key)).toEqual(['all', 'raw', 'final', 'old']);
    expect(AUDIO_TABS.map((t: AudioTabDef) => t.label)).toEqual([
      'All Audio',
      'Raw Audio',
      'Final Audio',
      'Old Takes',
    ]);
  });

  it('accurately categorizes audio files into active raw, active final, and old takes', () => {
    expect(categorizeAudio(file1RawActive, mockEpisode1)).toEqual({
      category: 'raw',
      isOldTake: false,
    });

    expect(categorizeAudio(file2FinalActive, mockEpisode1)).toEqual({
      category: 'final',
      isOldTake: false,
    });

    expect(categorizeAudio(file3RawOldTake, mockEpisode1)).toEqual({
      category: 'raw',
      isOldTake: true,
    });

    expect(categorizeAudio(file4RawActive, mockEpisode2)).toEqual({
      category: 'raw',
      isOldTake: false,
    });

    // Unlinked file with "final" in name
    expect(categorizeAudio(file5UnlinkedFinal, null)).toEqual({
      category: 'final',
      isOldTake: false,
    });
  });

  it('computes tab counts accurately across library items', () => {
    const items: AudioLibraryItem[] = [
      { file: file1RawActive, episode: mockEpisode1, category: 'raw', isOldTake: false },
      { file: file2FinalActive, episode: mockEpisode1, category: 'final', isOldTake: false },
      { file: file3RawOldTake, episode: mockEpisode1, category: 'raw', isOldTake: true },
      { file: file4RawActive, episode: mockEpisode2, category: 'raw', isOldTake: false },
      { file: file5UnlinkedFinal, episode: null, category: 'final', isOldTake: false },
    ];

    const counts = {
      all: items.length,
      raw: items.filter((i) => i.category === 'raw').length,
      final: items.filter((i) => i.category === 'final').length,
      old: items.filter((i) => i.isOldTake).length,
    };

    expect(counts.all).toBe(5);
    expect(counts.raw).toBe(3); // file1, file3, file4
    expect(counts.final).toBe(2); // file2, file5
    expect(counts.old).toBe(1); // file3
  });

  it('filters items by active tab selection', () => {
    const items: AudioLibraryItem[] = [
      { file: file1RawActive, episode: mockEpisode1, category: 'raw', isOldTake: false },
      { file: file2FinalActive, episode: mockEpisode1, category: 'final', isOldTake: false },
      { file: file3RawOldTake, episode: mockEpisode1, category: 'raw', isOldTake: true },
      { file: file4RawActive, episode: mockEpisode2, category: 'raw', isOldTake: false },
      { file: file5UnlinkedFinal, episode: null, category: 'final', isOldTake: false },
    ];

    const filterByTab = (tab: AudioFilterTab, list: AudioLibraryItem[]) => {
      if (tab === 'raw') return list.filter((i) => i.category === 'raw');
      if (tab === 'final') return list.filter((i) => i.category === 'final');
      if (tab === 'old') return list.filter((i) => i.isOldTake);
      return list;
    };

    expect(filterByTab('all', items)).toHaveLength(5);
    expect(filterByTab('raw', items).map((i) => i.file.id)).toEqual(['af-1', 'af-3', 'af-4']);
    expect(filterByTab('final', items).map((i) => i.file.id)).toEqual(['af-2', 'af-5']);
    expect(filterByTab('old', items).map((i) => i.file.id)).toEqual(['af-3']);
  });

  it('filters audio files by search query matching file name or episode title', () => {
    const items: AudioLibraryItem[] = [
      { file: file1RawActive, episode: mockEpisode1, category: 'raw', isOldTake: false },
      { file: file2FinalActive, episode: mockEpisode1, category: 'final', isOldTake: false },
      { file: file3RawOldTake, episode: mockEpisode1, category: 'raw', isOldTake: true },
      { file: file4RawActive, episode: mockEpisode2, category: 'raw', isOldTake: false },
      { file: file5UnlinkedFinal, episode: null, category: 'final', isOldTake: false },
    ];

    const searchAudio = (query: string, list: AudioLibraryItem[]) => {
      if (!query.trim()) return list;
      const q = query.toLowerCase().trim();
      return list.filter(
        ({ file, episode }) =>
          file.file_name.toLowerCase().includes(q) ||
          (episode?.title || '').toLowerCase().includes(q),
      );
    };

    // Search by episode title
    const searchMorning = searchAudio('Morning Pulse', items);
    expect(searchMorning).toHaveLength(3); // af-1, af-2, af-3

    // Search by file name
    const searchJingle = searchAudio('jingle', items);
    expect(searchJingle).toHaveLength(1);
    expect(searchJingle[0].file.id).toBe('af-5');

    // Search case-insensitive
    const searchEvening = searchAudio('EVENING', items);
    expect(searchEvening).toHaveLength(1);
    expect(searchEvening[0].file.id).toBe('af-4');

    // No match
    expect(searchAudio('nonexistent file query', items)).toHaveLength(0);
  });

  it('correctly calculates total storage size for category file subsets', () => {
    const items: AudioLibraryItem[] = [
      { file: file1RawActive, episode: mockEpisode1, category: 'raw', isOldTake: false },
      { file: file2FinalActive, episode: mockEpisode1, category: 'final', isOldTake: false },
      { file: file3RawOldTake, episode: mockEpisode1, category: 'raw', isOldTake: true },
      { file: file4RawActive, episode: mockEpisode2, category: 'raw', isOldTake: false },
      { file: file5UnlinkedFinal, episode: null, category: 'final', isOldTake: false },
    ];

    const rawTotal = items
      .filter((i) => i.category === 'raw')
      .reduce((sum, r) => sum + r.file.file_size, 0);

    const finalTotal = items
      .filter((i) => i.category === 'final')
      .reduce((sum, r) => sum + r.file.file_size, 0);

    const oldTotal = items
      .filter((i) => i.isOldTake)
      .reduce((sum, r) => sum + r.file.file_size, 0);

    expect(rawTotal).toBe(15000000 + 14500000 + 10000000); // 39,500,000 bytes
    expect(finalTotal).toBe(25000000 + 2000000); // 27,000,000 bytes
    expect(oldTotal).toBe(14500000); // 14,500,000 bytes
  });
});
