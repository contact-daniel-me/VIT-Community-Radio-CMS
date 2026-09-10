import { useEffect, useState } from 'react';
import { audioService } from '@/services/audioService';
import { errorMessage } from '@/lib/errors';

/**
 * The bucket is private, so playback needs a signed URL. It is fetched only
 * when a player is actually rendered, and it expires after an hour.
 */
export function AudioPlayer({
  storagePath,
  label,
}: {
  storagePath: string | null | undefined;
  label?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setUrl(null);
    setError(null);

    if (!storagePath) return;

    audioService
      .getPlaybackUrl(storagePath)
      .then((signed) => active && setUrl(signed))
      .catch((cause) => active && setError(errorMessage(cause)));

    return () => {
      active = false;
    };
  }, [storagePath]);

  if (!storagePath) return <p className="small muted">No audio uploaded.</p>;
  if (error) return <p className="small muted">{error}</p>;
  if (!url) return <p className="small muted">Preparing audio...</p>;

  return (
    <>
      {label && <p className="small muted">{label}</p>}
      <audio controls preload="none" src={url}>
        Your browser cannot play audio files.
      </audio>
    </>
  );
}
