import { buildMixotaLaunchUrl, getMixotaBaseUrl, type MixotaLaunchOptions } from '@/lib/mixota';
import { authService } from '@/services/authService';
import { audioService } from '@/services/audioService';
import { supabase } from '@/lib/supabase';

export interface OpenMixotaHandlers {
  onExportComplete?: (result: {
    audioFileId: string;
    episodeId: string;
    fileName: string;
  }) => void;
  onError?: (errMessage: string) => void;
}

export const mixotaService = {
  /**
   * Opens Mixota in a new tab and establishes a secure window-to-window
   * postMessage listener to hand off the user's active session and
   * short-lived signed playback URL.
   */
  async openInMixota(
    options: MixotaLaunchOptions,
    handlers: OpenMixotaHandlers = {},
  ): Promise<Window | null> {
    const launchUrl = buildMixotaLaunchUrl(options);
    const mixotaOrigin = new URL(getMixotaBaseUrl()).origin;

    const mixotaWindow = window.open(launchUrl, '_blank');
    if (!mixotaWindow) {
      handlers.onError?.('Pop-up was blocked. Please allow pop-ups for this site to open Mixota.');
      return null;
    }

    // Set up postMessage listener to communicate with Mixota tab securely
    const messageListener = async (event: MessageEvent) => {
      // Validate origin strictly: only trusted Mixota origin is accepted
      if (event.origin !== mixotaOrigin) {
        return;
      }

      const data = event.data;
      if (!data || typeof data !== 'object') {
        return;
      }

      if (data.type === 'MIXOTA_SESSION_REQUEST') {
        try {
          const session = await authService.getSession();

          let signedUrl: string | null = null;
          let storagePath: string | null = null;

          if (options.recordingId) {
            const { data: fileRow } = await supabase
              .from('audio_files')
              .select('storage_path, file_name')
              .eq('id', options.recordingId)
              .maybeSingle();

            if (fileRow?.storage_path) {
              storagePath = fileRow.storage_path;
              try {
                signedUrl = await audioService.getPlaybackUrl(storagePath, 3600);
              } catch (e) {
                console.warn('[mixotaService] Could not generate signed URL ahead of time', e);
              }
            }
          }

          // Reply with authenticated session and signed URL
          event.source?.postMessage(
            {
              type: 'MIXOTA_SESSION_RESPONSE',
              recordingId: options.recordingId,
              episodeId: options.episodeId,
              session: session
                ? {
                    access_token: session.access_token,
                    refresh_token: session.refresh_token,
                    expires_at: session.expires_at,
                    user: {
                      id: session.user.id,
                      email: session.user.email,
                    },
                  }
                : null,
              signedUrl,
              storagePath,
              fileName: options.fileName,
              title: options.title,
              targetField: options.targetField || 'final_audio_file_id',
            },
            { targetOrigin: event.origin },
          );
        } catch (err) {
          console.error('[mixotaService] Error during session handoff', err);
        }
      } else if (data.type === 'MIXOTA_EXPORT_COMPLETE') {
        handlers.onExportComplete?.({
          audioFileId: data.audioFileId,
          episodeId: data.episodeId,
          fileName: data.fileName,
        });
      }
    };

    window.addEventListener('message', messageListener);

    // Clean up listener after 30 minutes or when mixota window is closed
    const timer = setInterval(() => {
      if (mixotaWindow.closed) {
        clearInterval(timer);
        window.removeEventListener('message', messageListener);
      }
    }, 2000);

    setTimeout(() => {
      clearInterval(timer);
      window.removeEventListener('message', messageListener);
    }, 30 * 60 * 1000);

    return mixotaWindow;
  },
};
