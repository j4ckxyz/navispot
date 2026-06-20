import { SpotifyClient } from '@/lib/spotify/client';
import { SpotifyTrack } from '@/types/spotify';

/**
 * "Library sources" are pseudo-playlists that pull tracks straight from a
 * user's Spotify library rather than a single playlist. They all export
 * favorites-style (matched tracks are starred in Navidrome) and feed the
 * consolidated "missing from Navidrome" report.
 */

export const LIBRARY_SOURCE_IDS = {
  LIKED: 'liked-songs',
  ALBUMS: 'saved-albums',
  TOP: 'top-tracks',
  ARTISTS: 'followed-artists',
} as const;

export type LibrarySourceId =
  (typeof LIBRARY_SOURCE_IDS)[keyof typeof LIBRARY_SOURCE_IDS];

export interface LibrarySourceFetchContext {
  signal?: AbortSignal;
  /** ISO country code for artist top-track market resolution. */
  market?: string;
  /** Reports incremental progress for multi-request sources. */
  onProgress?: (completed: number, total: number) => void;
}

export interface LibrarySource {
  id: LibrarySourceId;
  name: string;
  description: string;
  /** What the table's "Tracks" column count represents for this source. */
  countUnit: 'tracks' | 'albums' | 'artists';
  /** Tailwind gradient classes for the table/art tile. */
  gradient: string;
  /** SVG path drawn inside the art tile (24x24 viewBox, currentColor fill). */
  iconPath: string;
  fetchCount: (client: SpotifyClient, signal?: AbortSignal) => Promise<number>;
  fetchTracks: (
    client: SpotifyClient,
    ctx: LibrarySourceFetchContext,
  ) => Promise<SpotifyTrack[]>;
}

export const LIBRARY_SOURCES: LibrarySource[] = [
  {
    id: LIBRARY_SOURCE_IDS.LIKED,
    name: 'Liked Songs',
    description: 'Every track you have liked on Spotify',
    countUnit: 'tracks',
    gradient: 'from-purple-500 to-blue-500',
    iconPath:
      'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z',
    fetchCount: (client, signal) => client.getSavedTracksCount(signal),
    fetchTracks: async (client, { signal }) => {
      const saved = await client.getAllSavedTracks(signal);
      return saved.map((t) => t.track).filter((t): t is SpotifyTrack => t != null);
    },
  },
  {
    id: LIBRARY_SOURCE_IDS.ALBUMS,
    name: 'Saved Albums',
    description: 'Tracks from every album in your library',
    countUnit: 'albums',
    gradient: 'from-amber-500 to-orange-500',
    iconPath:
      'M12 3v10.55A4 4 0 1014 17V7h4V3h-6zm0 14a2 2 0 11-2-2 2 2 0 012 2z',
    fetchCount: (client, signal) => client.getSavedAlbumsCount(signal),
    fetchTracks: (client, { signal }) => client.getAllSavedAlbumTracks(signal),
  },
  {
    id: LIBRARY_SOURCE_IDS.TOP,
    name: 'Top Tracks',
    description: 'Your most-played tracks (last 6 months)',
    countUnit: 'tracks',
    gradient: 'from-emerald-500 to-teal-500',
    iconPath:
      'M3 13h2v8H3v-8zm4-6h2v14H7V7zm4-4h2v18h-2V3zm4 8h2v10h-2V11zm4-4h2v14h-2V7z',
    fetchCount: (client, signal) => client.getTopTracksCount('medium_term', signal),
    fetchTracks: (client, { signal }) =>
      client.getAllTopTracks('medium_term', signal),
  },
  {
    id: LIBRARY_SOURCE_IDS.ARTISTS,
    name: 'Followed Artists',
    description: "Top tracks from every artist you follow",
    countUnit: 'artists',
    gradient: 'from-pink-500 to-rose-500',
    iconPath:
      'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z',
    fetchCount: (client, signal) => client.getFollowedArtistsCount(signal),
    fetchTracks: (client, { signal, market, onProgress }) =>
      client.getAllFollowedArtistsTopTracks(market ?? 'US', signal, onProgress),
  },
];

const SOURCE_BY_ID = new Map<string, LibrarySource>(
  LIBRARY_SOURCES.map((s) => [s.id, s]),
);

export function isLibrarySource(id: string): id is LibrarySourceId {
  return SOURCE_BY_ID.has(id);
}

export function getLibrarySource(id: string): LibrarySource | undefined {
  return SOURCE_BY_ID.get(id);
}
