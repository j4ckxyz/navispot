import { SpotifyPlaylistsResponse, SpotifyTracksResponse, SpotifyUser, SpotifyToken, SpotifyPlaylist, SpotifyPlaylistTrack, SpotifySavedTracksResponse, SpotifySavedTrack, SpotifyTrack, SpotifySavedAlbumsResponse, SpotifyTopTracksResponse, SpotifyFollowedArtistsResponse, SpotifyArtist, SpotifyArtistTopTracksResponse } from '@/types';
import { isTokenExpired } from './token-storage';
import { SPOTIFY_STORAGE_KEY } from '@/types/auth-context';
import { spotifyRateLimiter } from './rate-limiter';

const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';

export class SpotifyClient {
  private token: SpotifyToken | null = null;

  setToken(token: SpotifyToken): void {
    this.token = token;
  }

  getToken(): SpotifyToken | null {
    return this.token;
  }

  async getCurrentUser(signal?: AbortSignal): Promise<SpotifyUser> {
    await spotifyRateLimiter.acquire();
    const response = await this.fetch('/me', signal);
    return response.json();
  }

  async getPlaylists(limit: number = 50, offset: number = 0, signal?: AbortSignal, bypassCache: boolean = false): Promise<SpotifyPlaylistsResponse> {
    await spotifyRateLimiter.acquire();
    const params = new URLSearchParams({ limit: limit.toString(), offset: offset.toString() });
    if (bypassCache) {
      params.append('_t', Date.now().toString());
    }
    const response = await this.fetch(`/me/playlists?${params.toString()}`, signal, {}, bypassCache);
    return response.json();
  }

  async getPlaylistTracks(playlistId: string, limit: number = 100, offset: number = 0, signal?: AbortSignal): Promise<SpotifyTracksResponse> {
    await spotifyRateLimiter.acquire();
    const params = new URLSearchParams({ limit: limit.toString(), offset: offset.toString() });
    const response = await this.fetch(`/playlists/${playlistId}/items?${params.toString()}`, signal);
    return response.json();
  }

  async getAllPlaylistTracks(playlistId: string, signal?: AbortSignal): Promise<SpotifyPlaylistTrack[]> {
    const allTracks: SpotifyPlaylistTrack[] = [];
    let offset = 0;
    const limit = 100;

    while (true) {
      const response = await this.getPlaylistTracks(playlistId, limit, offset, signal);
      allTracks.push(...response.items);

      if (!response.next) break;
      offset += limit;
    }

    return allTracks;
  }

  async getSavedTracks(limit: number = 50, offset: number = 0, signal?: AbortSignal, bypassCache: boolean = false): Promise<SpotifySavedTracksResponse> {
    await spotifyRateLimiter.acquire();
    const params = new URLSearchParams({ limit: limit.toString(), offset: offset.toString() });
    if (bypassCache) {
      params.append('_t', Date.now().toString());
    }
    const response = await this.fetch(`/me/tracks?${params.toString()}`, signal, {}, bypassCache);
    return response.json();
  }

  async getAllSavedTracks(signal?: AbortSignal): Promise<SpotifySavedTrack[]> {
    const allTracks: SpotifySavedTrack[] = [];
    let offset = 0;
    const limit = 50;

    while (true) {
      const response = await this.getSavedTracks(limit, offset, signal);
      allTracks.push(...response.items);

      if (!response.next) break;
      offset += limit;
    }

    return allTracks;
  }

  async getSavedTracksCount(signal?: AbortSignal, bypassCache: boolean = false): Promise<number> {
    await spotifyRateLimiter.acquire();
    const url = bypassCache ? `/me/tracks?limit=1&_t=${Date.now()}` : '/me/tracks?limit=1';
    const response = await this.fetch(url, signal, {}, bypassCache);
    const data: SpotifySavedTracksResponse = await response.json();
    return data.total;
  }

  // --- Saved Albums ---------------------------------------------------------

  async getSavedAlbums(limit: number = 50, offset: number = 0, signal?: AbortSignal, bypassCache: boolean = false): Promise<SpotifySavedAlbumsResponse> {
    await spotifyRateLimiter.acquire();
    const params = new URLSearchParams({ limit: limit.toString(), offset: offset.toString() });
    if (bypassCache) {
      params.append('_t', Date.now().toString());
    }
    const response = await this.fetch(`/me/albums?${params.toString()}`, signal, {}, bypassCache);
    return response.json();
  }

  async getSavedAlbumsCount(signal?: AbortSignal, bypassCache: boolean = false): Promise<number> {
    await spotifyRateLimiter.acquire();
    const url = bypassCache ? `/me/albums?limit=1&_t=${Date.now()}` : '/me/albums?limit=1';
    const response = await this.fetch(url, signal, {}, bypassCache);
    const data: SpotifySavedAlbumsResponse = await response.json();
    return data.total;
  }

  /**
   * Fetches every track from every saved album. Album track objects from the
   * Spotify API are "simplified" — they omit the `album` and `external_ids`
   * (ISRC) fields — so we re-attach the parent album here. Matching then falls
   * back to fuzzy/strict for these since ISRC is unavailable.
   */
  async getAllSavedAlbumTracks(signal?: AbortSignal): Promise<SpotifyTrack[]> {
    const allTracks: SpotifyTrack[] = [];
    let offset = 0;
    const limit = 50;

    while (true) {
      const response = await this.getSavedAlbums(limit, offset, signal);

      for (const { album } of response.items) {
        const albumRef = {
          id: album.id,
          name: album.name,
          release_date: album.release_date,
        };

        const enriched = (album.tracks?.items ?? []).map((t) => ({
          ...t,
          album: t.album ?? albumRef,
          external_ids: t.external_ids ?? {},
        }));
        allTracks.push(...enriched);

        // Albums with >50 tracks paginate their own track list.
        let trackOffset = album.tracks?.items?.length ?? 0;
        while (album.tracks?.next && trackOffset < (album.tracks?.total ?? 0)) {
          await spotifyRateLimiter.acquire();
          const params = new URLSearchParams({ limit: '50', offset: trackOffset.toString() });
          const trackResp = await this.fetch(`/albums/${album.id}/tracks?${params.toString()}`, signal);
          const trackData = await trackResp.json();
          const moreTracks = (trackData.items ?? []).map((t: SpotifyTrack) => ({
            ...t,
            album: t.album ?? albumRef,
            external_ids: t.external_ids ?? {},
          }));
          allTracks.push(...moreTracks);
          trackOffset += moreTracks.length;
          if (!trackData.next) break;
        }
      }

      if (!response.next) break;
      offset += limit;
    }

    return allTracks;
  }

  // --- Top Tracks -----------------------------------------------------------

  async getTopTracks(timeRange: 'short_term' | 'medium_term' | 'long_term' = 'medium_term', limit: number = 50, offset: number = 0, signal?: AbortSignal): Promise<SpotifyTopTracksResponse> {
    await spotifyRateLimiter.acquire();
    const params = new URLSearchParams({ time_range: timeRange, limit: limit.toString(), offset: offset.toString() });
    const response = await this.fetch(`/me/top/tracks?${params.toString()}`, signal);
    return response.json();
  }

  /**
   * Fetches the user's top tracks. The Spotify API caps this at 99 (offset
   * 0–49 over two pages); we gather the union across pages, deduped by id.
   */
  async getAllTopTracks(timeRange: 'short_term' | 'medium_term' | 'long_term' = 'medium_term', signal?: AbortSignal): Promise<SpotifyTrack[]> {
    const byId = new Map<string, SpotifyTrack>();
    const limit = 50;
    for (let offset = 0; offset <= 49; offset += limit) {
      const response = await this.getTopTracks(timeRange, Math.min(limit, 50 - offset), offset, signal);
      for (const track of response.items) {
        if (track) byId.set(track.id, track);
      }
      if (!response.next) break;
    }
    return Array.from(byId.values());
  }

  async getTopTracksCount(timeRange: 'short_term' | 'medium_term' | 'long_term' = 'medium_term', signal?: AbortSignal): Promise<number> {
    const response = await this.getTopTracks(timeRange, 1, 0, signal);
    return Math.min(response.total, 99);
  }

  // --- Followed Artists -----------------------------------------------------

  async getFollowedArtists(after?: string, limit: number = 50, signal?: AbortSignal): Promise<SpotifyFollowedArtistsResponse> {
    await spotifyRateLimiter.acquire();
    const params = new URLSearchParams({ type: 'artist', limit: limit.toString() });
    if (after) params.append('after', after);
    const response = await this.fetch(`/me/following?${params.toString()}`, signal);
    return response.json();
  }

  async getAllFollowedArtists(signal?: AbortSignal): Promise<SpotifyArtist[]> {
    const artists: SpotifyArtist[] = [];
    let after: string | undefined;

    while (true) {
      const response = await this.getFollowedArtists(after, 50, signal);
      artists.push(...response.artists.items);
      after = response.artists.cursors?.after;
      if (!after || !response.artists.next) break;
    }

    return artists;
  }

  async getFollowedArtistsCount(signal?: AbortSignal): Promise<number> {
    const response = await this.getFollowedArtists(undefined, 1, signal);
    return response.artists.total;
  }

  async getArtistTopTracks(artistId: string, market: string = 'US', signal?: AbortSignal): Promise<SpotifyTrack[]> {
    await spotifyRateLimiter.acquire();
    const params = new URLSearchParams({ market });
    const response = await this.fetch(`/artists/${artistId}/top-tracks?${params.toString()}`, signal);
    const data: SpotifyArtistTopTracksResponse = await response.json();
    return data.tracks ?? [];
  }

  /**
   * Gathers the top tracks for every followed artist, deduped by track id.
   * `market` defaults to the authenticated user's country when available.
   */
  async getAllFollowedArtistsTopTracks(
    market: string = 'US',
    signal?: AbortSignal,
    onProgress?: (completed: number, total: number) => void,
  ): Promise<SpotifyTrack[]> {
    const artists = await this.getAllFollowedArtists(signal);
    const byId = new Map<string, SpotifyTrack>();

    for (let i = 0; i < artists.length; i++) {
      if (signal?.aborted) break;
      try {
        const tracks = await this.getArtistTopTracks(artists[i].id, market, signal);
        for (const track of tracks) {
          if (track) byId.set(track.id, track);
        }
      } catch {
        // Skip artists whose top tracks fail to load
      }
      onProgress?.(i + 1, artists.length);
    }

    return Array.from(byId.values());
  }

  async getAllPlaylists(signal?: AbortSignal, bypassCache: boolean = false): Promise<SpotifyPlaylist[]> {
    const allPlaylists: SpotifyPlaylist[] = [];
    let offset = 0;
    const limit = 50;

    while (true) {
      const response = await this.getPlaylists(limit, offset, signal, bypassCache);
      allPlaylists.push(...response.items);

      if (!response.next) break;
      offset += limit;
    }

    return allPlaylists;
  }

  /**
   * Fetches the earliest `added_at` date from a playlist's tracks.
   * Uses the Spotify fields filter to minimize payload — only fetches added_at.
   * Returns the earliest date as an ISO string, or undefined if no tracks.
   */
  async getPlaylistCreatedDate(playlistId: string, signal?: AbortSignal): Promise<string | undefined> {
    await spotifyRateLimiter.acquire();
    const fields = 'items(added_at),total,next';
    let earliest: string | undefined;
    let offset = 0;
    const limit = 100;

    // Paginate to find the earliest added_at
    // Tracks are returned newest-first, so stop when a page doesn't improve the result
    while (true) {
      const params = new URLSearchParams({
        fields,
        limit: limit.toString(),
        offset: offset.toString(),
      });
      const response = await this.fetch(`/playlists/${playlistId}/items?${params.toString()}`, signal);
      const data = await response.json();

      let improved = false;
      for (const item of data.items || []) {
        if (item.added_at) {
          if (!earliest || item.added_at < earliest) {
            earliest = item.added_at;
            improved = true;
          }
        }
      }

      if (!data.next) break;
      if (!improved) break; // All dates on this page are newer — no point continuing
      offset += limit;
    }

    return earliest;
  }

  /**
   * Fetches the created date (earliest added_at) for multiple playlists.
   * Processes playlists sequentially to respect rate limits.
   * Returns a Map of playlistId → earliest ISO date string.
   */
  async getPlaylistCreatedDates(
    playlistIds: string[],
    signal?: AbortSignal,
    onProgress?: (completed: number, total: number) => void,
  ): Promise<Map<string, string>> {
    const result = new Map<string, string>();

    for (let i = 0; i < playlistIds.length; i++) {
      if (signal?.aborted) break;

      try {
        const createdDate = await this.getPlaylistCreatedDate(playlistIds[i], signal);
        if (createdDate) {
          result.set(playlistIds[i], createdDate);
        }
      } catch {
        // Skip playlists that fail (e.g., deleted or access revoked)
      }

      onProgress?.(i + 1, playlistIds.length);
    }

    return result;
  }

  async refreshAccessToken(): Promise<SpotifyToken | null> {
    if (!this.token?.refreshToken) return null;

    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: this.token.refreshToken }),
      });

      if (!response.ok) return null;

      const data = await response.json();
      const newToken: SpotifyToken = {
        accessToken: data.access_token,
        refreshToken: this.token.refreshToken,
        expiresAt: Date.now() + data.expires_in * 1000,
        tokenType: data.token_type,
        scope: data.scope,
      };

      this.setToken(newToken);
      
      const stored = localStorage.getItem(SPOTIFY_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        parsed.token = newToken;
        localStorage.setItem(SPOTIFY_STORAGE_KEY, JSON.stringify(parsed));
      }
      
      return newToken;
    } catch {
      return null;
    }
  }

  private async fetch(endpoint: string, signal?: AbortSignal, options: RequestInit = {}, bypassCache: boolean = false): Promise<Response> {
    if (!this.token) {
      this.token = this.loadTokenFromStorage();
    }

    if (!this.token) {
      throw new Error('No access token available');
    }

    if (isTokenExpired(this.token)) {
      const refreshed = await this.refreshAccessToken();
      if (!refreshed) {
        throw new Error('Token expired and refresh failed');
      }
    }

    const response = await fetch(`${SPOTIFY_API_BASE}${endpoint}`, {
      ...options,
      signal,
      headers: {
        Authorization: `Bearer ${this.token.accessToken}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (response.status === 401) {
      const refreshed = await this.refreshAccessToken();
      if (refreshed) {
        return this.fetch(endpoint, signal, options, bypassCache);
      }
    }

    return response;
  }

  clearToken(): void {
    this.token = null;
  }

  private loadTokenFromStorage(): SpotifyToken | null {
    const stored = localStorage.getItem(SPOTIFY_STORAGE_KEY);
    if (!stored) return null;
    
    const parsed = JSON.parse(stored);
    return parsed.token || null;
  }
}

export const spotifyClient = new SpotifyClient();
