import { NavidromeApiClient } from '@/lib/navidrome/client';
import { TrackMatch } from '@/types/matching';
import {
  FavoritesExportProgress,
  FavoritesExportError,
  FavoritesExportResult,
  FavoritesExporterOptions,
  FavoritesExporter,
} from '@/types/favorites';

export class DefaultFavoritesExporter implements FavoritesExporter {
  private navidromeClient: NavidromeApiClient;

  constructor(navidromeClient: NavidromeApiClient) {
    this.navidromeClient = navidromeClient;
  }

  async exportFavorites(
    matches: TrackMatch[],
    options: FavoritesExporterOptions = {}
  ): Promise<FavoritesExportResult> {
    const startTime = Date.now();
    const skipUnmatched = options.skipUnmatched ?? false;
    const onProgress = options.onProgress;
    const { signal } = options;

    const errors: FavoritesExportError[] = [];
    let starred = 0;
    let failed = 0;
    let skipped = 0;

    const checkAbort = () => {
      if (signal?.aborted) {
        throw new DOMException('Export was cancelled', 'AbortError');
      }
    };

    const matchedTracks = matches.filter((m) => m.status === 'matched' && m.navidromeSong);

    if (onProgress) {
      checkAbort();
      await onProgress({
        current: 0,
        total: matchedTracks.length,
        percent: 0,
        status: 'preparing',
      });
    }

    if (matchedTracks.length === 0) {
      const unmatched = matches.filter((m) => m.status !== 'matched' || !m.navidromeSong);
      skipped = skipUnmatched ? unmatched.length : 0;

      return {
        success: true,
        statistics: {
          total: matches.length,
          starred: 0,
          failed: 0,
          skipped,
        },
        errors: [],
        duration: Date.now() - startTime,
      };
    }

    const ids = matchedTracks.map((m) => m.navidromeSong!.id);

    let starResult: { success: boolean; processed: number; error?: string };
    try {
      starResult = await this.navidromeClient.starSongs(
        ids,
        (processed, total) => {
          if (!onProgress) return;
          const idx = Math.max(0, Math.min(processed - 1, matchedTracks.length - 1));
          const match = matchedTracks[idx];
          const trackName = match.spotifyTrack.name;
          const artistName = match.spotifyTrack.artists?.[0]?.name || 'Unknown';
          void Promise.resolve(
            onProgress({
              current: processed,
              total,
              percent: Math.round((processed / total) * 100),
              currentTrack: `${trackName} - ${artistName}`,
              status: 'exporting',
            }),
          );
        },
        signal,
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw error;
      }
      starResult = {
        success: false,
        processed: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }

    if (starResult.success) {
      starred = matchedTracks.length;
    } else {
      starred = starResult.processed;
      failed = matchedTracks.length - starResult.processed;
      const reason = starResult.error || 'Failed to star song';
      for (let i = starResult.processed; i < matchedTracks.length; i++) {
        const match = matchedTracks[i];
        errors.push({
          trackName: match.spotifyTrack.name,
          artistName: match.spotifyTrack.artists?.[0]?.name || 'Unknown',
          reason,
        });
      }
    }

    const unmatched = matches.filter((m) => m.status !== 'matched' || !m.navidromeSong);
    skipped = skipUnmatched ? unmatched.length : 0;

    if (onProgress) {
      checkAbort();
      await onProgress({
        current: matchedTracks.length,
        total: matchedTracks.length,
        percent: 100,
        status: starred > 0 || skipped > 0 ? 'completed' : 'failed',
      });
    }

    const success = errors.length === 0 && starred > 0;

    return {
      success,
      statistics: {
        total: matches.length,
        starred,
        failed,
        skipped,
      },
      errors,
      duration: Date.now() - startTime,
    };
  }

  async starSong(songId: string, signal?: AbortSignal): Promise<{ success: boolean }> {
    const result = await this.navidromeClient.starSong(songId, signal);
    return {
      success: result.success,
    };
  }

  async starSongs(songIds: string[], signal?: AbortSignal): Promise<{ success: boolean; failedIds: string[] }> {
    if (songIds.length === 0) {
      return { success: true, failedIds: [] };
    }

    const result = await this.navidromeClient.starSongs(songIds, undefined, signal);
    if (result.success) {
      return { success: true, failedIds: [] };
    }

    const failedIds = songIds.slice(result.processed);
    return { success: false, failedIds };
  }
}

export function createFavoritesExporter(navidromeClient: NavidromeApiClient): FavoritesExporter {
  return new DefaultFavoritesExporter(navidromeClient);
}

export default createFavoritesExporter;
