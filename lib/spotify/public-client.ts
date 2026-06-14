import type { SpotifyTrack } from '@/types/spotify';
import type { ImportedPlaylist } from '@/types/public-playlist';

const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';
const SPOTIFY_AUTH_BASE = 'https://accounts.spotify.com/api/token';

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getClientCredentialsToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 30_000) {
    return cachedToken.value;
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Spotify credentials are not configured');
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch(SPOTIFY_AUTH_BASE, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Spotify token request failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    value: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  };
  return data.access_token;
}

export function extractPlaylistId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/playlist\/([A-Za-z0-9]{22})/);
  if (match) return match[1];
  if (/^[A-Za-z0-9]{22}$/.test(trimmed)) return trimmed;
  return null;
}

async function spotifyFetch<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${SPOTIFY_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`Spotify ${res.status}: ${text}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return (await res.json()) as T;
}

interface PlaylistMeta {
  id: string;
  name: string;
  owner: { display_name: string };
  images: { url: string }[];
  tracks: { total: number };
}

interface PlaylistTracksPage {
  items: Array<{ track: SpotifyTrack | null; is_local?: boolean }>;
  next: string | null;
}

export async function getPublicPlaylist(
  playlistId: string,
): Promise<ImportedPlaylist> {
  const token = await getClientCredentialsToken();

  const meta = await spotifyFetch<PlaylistMeta>(
    token,
    `/playlists/${playlistId}?fields=id,name,owner(display_name),images,tracks(total)`,
  );

  const tracks: SpotifyTrack[] = [];
  let url: string | null =
    `/playlists/${playlistId}/tracks?fields=items(track(id,name,artists(id,name),album(id,name,release_date),duration_ms,external_ids,external_urls),is_local,added_at),next&limit=100`;
  while (url) {
    const page: PlaylistTracksPage = await spotifyFetch<PlaylistTracksPage>(token, url);
    for (const item of page.items) {
      if (item.is_local) continue;
      if (item.track) tracks.push(item.track);
    }
    url = page.next;
  }

  return {
    id: meta.id,
    name: meta.name,
    owner: meta.owner.display_name,
    trackCount: tracks.length,
    imageUrl: meta.images?.[0]?.url,
    tracks,
    importedAt: new Date().toISOString(),
  };
}
