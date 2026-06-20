export interface SpotifyTrack {
  id: string;
  name: string;
  artists: { id: string; name: string }[];
  album: { id: string; name: string; release_date: string };
  duration_ms: number;
  external_ids: { isrc?: string };
  external_urls: { spotify: string };
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  description: string;
  images: { url: string }[];
  owner: { id: string; display_name: string };
  items: { total: number };
  snapshot_id: string;
  public: boolean | null;
}

export interface SpotifyPlaylistTrack {
  track: SpotifyTrack;
  added_at: string;
  added_by: {
    id: string;
    display_name: string;
  };
}

export interface SpotifyPlaylistsResponse {
  items: SpotifyPlaylist[];
  total: number;
  next?: string;
  previous?: string;
  offset: number;
  limit: number;
}

export interface SpotifyTracksResponse {
  items: SpotifyPlaylistTrack[];
  total: number;
  next?: string;
  offset: number;
  limit: number;
}

export interface SpotifySavedTrack {
  added_at: string;
  track: SpotifyTrack;
}

export interface SpotifyAlbum {
  id: string;
  name: string;
  artists: { id: string; name: string }[];
  images: { url: string }[];
  release_date: string;
  total_tracks: number;
  external_ids?: { upc?: string };
  tracks: {
    items: SpotifyTrack[];
    total: number;
    next?: string;
    limit: number;
    offset: number;
  };
}

export interface SpotifySavedAlbum {
  added_at: string;
  album: SpotifyAlbum;
}

export interface SpotifySavedAlbumsResponse {
  href: string;
  items: SpotifySavedAlbum[];
  limit: number;
  next?: string;
  previous?: string;
  offset: number;
  total: number;
}

export interface SpotifyArtist {
  id: string;
  name: string;
  images: { url: string }[];
  genres?: string[];
}

export interface SpotifyFollowedArtistsResponse {
  artists: {
    items: SpotifyArtist[];
    next?: string;
    total: number;
    cursors: { after?: string };
    limit: number;
  };
}

export interface SpotifyTopTracksResponse {
  items: SpotifyTrack[];
  total: number;
  limit: number;
  offset: number;
  next?: string;
}

export interface SpotifyArtistTopTracksResponse {
  tracks: SpotifyTrack[];
}

export interface SpotifySavedTracksResponse {
  href: string;
  items: SpotifySavedTrack[];
  limit: number;
  next?: string;
  previous?: string;
  offset: number;
  total: number;
}
