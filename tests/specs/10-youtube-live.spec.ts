/**
 * Choosing which YouTube broadcast to show, and the rules that keep the API
 * key out of the browser.
 *
 * pickBroadcast is pure, so the interesting cases -- a stream that has already
 * ended, a scheduled slot that came and went -- are testable without a network
 * or a key, which is why the logic lives apart from the route handler.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pickBroadcast, uploadsPlaylistId, type YouTubeVideo } from '../../api/_youtube';
import handler from '../../api/youtube-live';

const hoursFromNow = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

const video = (over: Partial<YouTubeVideo> & { id: string }): YouTubeVideo => ({
  snippet: { title: 'Untitled', liveBroadcastContent: 'none' },
  ...over,
});

describe('uploadsPlaylistId', () => {
  it('turns a channel id into its uploads playlist', () => {
    expect(uploadsPlaylistId('UCnAwfsKlMCMpPg3xaAX5ZfQ')).toBe('UUnAwfsKlMCMpPg3xaAX5ZfQ');
  });

  it('refuses anything that is not a channel id', () => {
    // A playlist id or a handle here would silently return nothing rather than
    // fail, and the page would claim the station was offline all day.
    expect(() => uploadsPlaylistId('@vitradiolive')).toThrow(/not a channel id/i);
    expect(() => uploadsPlaylistId('UUnAwfsKlMCMpPg3xaAX5ZfQ')).toThrow(/not a channel id/i);
  });
});

describe('pickBroadcast', () => {
  it('finds the live broadcast', () => {
    const status = pickBroadcast([
      video({ id: 'old1' }),
      video({
        id: 'live1',
        snippet: { title: 'Morning Show', liveBroadcastContent: 'live' },
        liveStreamingDetails: { actualStartTime: hoursFromNow(-1) },
      }),
    ]);

    expect(status.state).toBe('live');
    if (status.state !== 'live') throw new Error('expected live');
    expect(status.videoId).toBe('live1');
    expect(status.title).toBe('Morning Show');
  });

  it('does not treat a finished stream as live', () => {
    // YouTube keeps liveStreamingDetails after a broadcast ends. Without the
    // actualEndTime check, this morning's stream would sit there all evening
    // still claiming to be on air.
    const status = pickBroadcast([
      video({
        id: 'ended',
        snippet: { title: 'This morning', liveBroadcastContent: 'live' },
        liveStreamingDetails: {
          actualStartTime: hoursFromNow(-6),
          actualEndTime: hoursFromNow(-4),
        },
      }),
    ]);

    expect(status.state).toBe('offline');
  });

  it('prefers the broadcast that started first', () => {
    const status = pickBroadcast([
      video({
        id: 'second',
        snippet: { title: 'Test stream', liveBroadcastContent: 'live' },
        liveStreamingDetails: { actualStartTime: hoursFromNow(-1) },
      }),
      video({
        id: 'first',
        snippet: { title: 'The real one', liveBroadcastContent: 'live' },
        liveStreamingDetails: { actualStartTime: hoursFromNow(-3) },
      }),
    ]);

    if (status.state !== 'live') throw new Error('expected live');
    expect(status.videoId).toBe('first');
  });

  it('falls back to a station title when YouTube gives none', () => {
    const status = pickBroadcast([
      video({
        id: 'x',
        snippet: { liveBroadcastContent: 'live' },
        liveStreamingDetails: { actualStartTime: hoursFromNow(-1) },
      }),
    ]);

    if (status.state !== 'live') throw new Error('expected live');
    expect(status.title).toBe('VIT Community Radio Live');
  });

  it('reports the soonest upcoming broadcast when nothing is on air', () => {
    const status = pickBroadcast([
      video({
        id: 'later',
        snippet: { title: 'Friday', liveBroadcastContent: 'upcoming' },
        liveStreamingDetails: { scheduledStartTime: hoursFromNow(48) },
      }),
      video({
        id: 'sooner',
        snippet: { title: 'Tomorrow', liveBroadcastContent: 'upcoming' },
        liveStreamingDetails: { scheduledStartTime: hoursFromNow(12) },
      }),
    ]);

    expect(status.state).toBe('upcoming');
    if (status.state !== 'upcoming') throw new Error('expected upcoming');
    expect(status.videoId).toBe('sooner');
    expect(status.title).toBe('Tomorrow');
    expect(status.scheduledStartTime).toBeTruthy();
  });

  it('ignores a scheduled slot that has already passed', () => {
    // Announced, never started. Showing it would promise a broadcast that is
    // not coming.
    const status = pickBroadcast([
      video({
        id: 'stale',
        snippet: { title: 'Yesterday', liveBroadcastContent: 'upcoming' },
        liveStreamingDetails: { scheduledStartTime: hoursFromNow(-5) },
      }),
    ]);

    expect(status.state).toBe('offline');
  });

  it('prefers a live broadcast over a scheduled one', () => {
    const status = pickBroadcast([
      video({
        id: 'soon',
        snippet: { title: 'Later', liveBroadcastContent: 'upcoming' },
        liveStreamingDetails: { scheduledStartTime: hoursFromNow(3) },
      }),
      video({
        id: 'now',
        snippet: { title: 'On air', liveBroadcastContent: 'live' },
        liveStreamingDetails: { actualStartTime: hoursFromNow(-1) },
      }),
    ]);

    if (status.state !== 'live') throw new Error('expected live');
    expect(status.videoId).toBe('now');
  });

  it('says offline for an empty channel, and still gives a link', () => {
    const status = pickBroadcast([]);
    expect(status.state).toBe('offline');
    expect(status.channelUrl).toMatch(/youtube\.com/);
  });
});

describe('the API key stays on the server', () => {
  const root = process.cwd();

  it('is never given a VITE_ prefix', () => {
    // Vite inlines VITE_* into the bundle. The absent prefix is the safeguard.
    const handler = readFileSync(join(root, 'api', 'youtube-live.ts'), 'utf8');
    expect(handler).toMatch(/process\.env\.YOUTUBE_API_KEY/);
    expect(handler).not.toMatch(/VITE_YOUTUBE/);

    const example = readFileSync(join(root, '.env.example'), 'utf8');
    expect(example).toMatch(/^YOUTUBE_API_KEY=/m);
    expect(example).not.toMatch(/VITE_YOUTUBE/);
  });

  it('is never read from browser code', () => {
    // src/ is the client bundle. Nothing there may touch the key or call
    // YouTube's API directly.
    const service = readFileSync(join(root, 'src', 'services', 'youtubeService.ts'), 'utf8');
    expect(service).toMatch(/\/api\/youtube-live/);
    expect(service).not.toMatch(/YOUTUBE_API_KEY|googleapis\.com/);
  });

  it('keeps the SPA catch-all off the API route', () => {
    // vercel.json rewrites everything to index.html for client-side routing.
    // Without the exclusion that swallows /api/* and the route returns HTML.
    const vercel = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8')) as {
      rewrites: { source: string; destination: string }[];
    };
    const spa = vercel.rewrites.find((r) => r.destination === '/index.html');
    expect(spa).toBeDefined();
    expect(spa?.source).toContain('?!api/');

    // And prove the pattern actually behaves: the regex Vercel compiles from
    // `source` must miss /api/... and match an ordinary page route.
    const re = new RegExp(`^${spa?.source}$`);
    expect(re.test('/api/youtube-live')).toBe(false);
    expect(re.test('/youtube')).toBe(true);
    expect(re.test('/studio')).toBe(true);
  });
});

/**
 * The route itself, run in process with a stubbed upstream.
 *
 * The handler cannot be deployed from here, so this is how its contract is
 * checked: status codes, cache headers, the shape handed to the browser, and
 * above all that the key never appears in a response body.
 */
describe('GET /api/youtube-live', () => {
  const KEY = 'test-key-do-not-leak';

  function fakeResponse() {
    const sent: { status: number; headers: Record<string, string>; body: unknown } = {
      status: 0,
      headers: {},
      body: null,
    };
    const res = {
      setHeader(name: string, value: string) {
        sent.headers[name] = value;
        return res;
      },
      status(code: number) {
        sent.status = code;
        return res;
      },
      json(payload: unknown) {
        sent.body = payload;
        return res;
      },
    };
    return { res, sent };
  }

  /** Answers playlistItems then videos, the two calls the handler makes. */
  function stubYouTube(videos: unknown) {
    const urls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      urls.push(String(url));
      const body = String(url).includes('/playlistItems')
        ? { items: [{ contentDetails: { videoId: 'aaa' } }] }
        : videos;
      return { ok: true, status: 200, json: async () => body };
    });
    return urls;
  }

  const call = async (method = 'GET') => {
    const { res, sent } = fakeResponse();
    await handler(
      { method } as unknown as Parameters<typeof handler>[0],
      res as unknown as Parameters<typeof handler>[1],
    );
    return sent;
  };

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('reports a live broadcast', async () => {
    vi.stubEnv('YOUTUBE_API_KEY', KEY);
    const urls = stubYouTube({
      items: [
        {
          id: 'bbb',
          snippet: { title: 'Morning Drive', liveBroadcastContent: 'live' },
          liveStreamingDetails: { actualStartTime: new Date(Date.now() - 3600_000).toISOString() },
        },
      ],
    });

    const sent = await call();
    expect(sent.status).toBe(200);
    expect(sent.body).toMatchObject({ state: 'live', videoId: 'bbb', title: 'Morning Drive' });
    expect(sent.headers['Cache-Control']).toContain('s-maxage=60');
    // Two calls, not search.list: the cheap path described in _youtube.ts.
    expect(urls).toHaveLength(2);
    expect(urls.some((u) => u.includes('/search'))).toBe(false);
  });

  it('reports offline when nothing is on air', async () => {
    vi.stubEnv('YOUTUBE_API_KEY', KEY);
    stubYouTube({ items: [{ id: 'aaa', snippet: { liveBroadcastContent: 'none' } }] });

    const sent = await call();
    expect(sent.status).toBe(200);
    expect(sent.body).toMatchObject({ state: 'offline' });
  });

  it('stays offline rather than erroring when YouTube fails', async () => {
    vi.stubEnv('YOUTUBE_API_KEY', KEY);
    vi.stubGlobal('fetch', async () => {
      throw new Error('upstream exploded');
    });

    const sent = await call();
    // A visitor gets a page, not a stack trace.
    expect(sent.status).toBe(200);
    expect(sent.body).toMatchObject({ state: 'offline' });
    expect(sent.headers['Cache-Control']).toContain('s-maxage=30');
  });

  it('stays offline, and calls nothing, when no key is configured', async () => {
    vi.stubEnv('YOUTUBE_API_KEY', '');
    const called = vi.fn();
    vi.stubGlobal('fetch', called);

    const sent = await call();
    expect(sent.status).toBe(200);
    expect(sent.body).toMatchObject({ state: 'offline' });
    expect(called).not.toHaveBeenCalled();
  });

  it('refuses anything but GET', async () => {
    vi.stubEnv('YOUTUBE_API_KEY', KEY);
    const sent = await call('POST');
    expect(sent.status).toBe(405);
    expect(sent.headers.Allow).toBe('GET');
  });

  it('never puts the key in the response', async () => {
    vi.stubEnv('YOUTUBE_API_KEY', KEY);
    stubYouTube({
      items: [
        {
          id: 'bbb',
          snippet: { title: 'Live', liveBroadcastContent: 'live' },
          liveStreamingDetails: { actualStartTime: new Date(Date.now() - 60_000).toISOString() },
        },
      ],
    });

    const sent = await call();
    expect(JSON.stringify(sent)).not.toContain(KEY);
  });
});
