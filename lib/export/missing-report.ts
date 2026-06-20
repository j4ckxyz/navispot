import { SpotifyTrack } from '@/types/spotify';
import { TrackMatch } from '@/types/matching';

/**
 * Builds a consolidated, deduplicated "what's missing from Navidrome" report
 * across an entire export batch. Tracks that failed to match (and, optionally,
 * ambiguous ones) are deduped by ISRC — or title+artist as a fallback — and
 * grouped by artist → album so the user gets an actionable shopping list of
 * what they still need to acquire.
 */

export type MissingStatus = 'unmatched' | 'ambiguous';

export interface MissingTrackInput {
  track: SpotifyTrack;
  sourceName: string;
  status: MissingStatus;
}

export interface MissingTrack {
  title: string;
  artist: string;
  album: string;
  isrc?: string;
  spotifyUrl?: string;
  durationMs: number;
  status: MissingStatus;
  /** Names of the playlists / library sources this track came from. */
  sources: string[];
}

export interface MissingAlbumGroup {
  album: string;
  artist: string;
  tracks: MissingTrack[];
}

export interface MissingArtistGroup {
  artist: string;
  trackCount: number;
  albums: MissingAlbumGroup[];
}

export interface MissingReport {
  generatedAt: string;
  /** Unique tracks missing (deduped across the batch). */
  totalMissing: number;
  unmatchedCount: number;
  ambiguousCount: number;
  artists: MissingArtistGroup[];
}

const normalize = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics
    .replace(/\([^)]*\)|\[[^\]]*\]/g, '') // drop "(feat. ...)", "[remix]" etc.
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const artistsToString = (track: SpotifyTrack): string =>
  track.artists?.map((a) => a.name).join(', ') || 'Unknown Artist';

const primaryArtist = (track: SpotifyTrack): string =>
  track.artists?.[0]?.name || 'Unknown Artist';

const dedupeKey = (track: SpotifyTrack): string => {
  const isrc = track.external_ids?.isrc;
  if (isrc) return `isrc:${isrc.toUpperCase()}`;
  return `ta:${normalize(track.name)}|${normalize(primaryArtist(track))}`;
};

/**
 * Convenience: derive report inputs from raw matches plus the source name.
 * `includeAmbiguous` controls whether ambiguous matches are treated as missing.
 */
export function matchesToMissingInputs(
  matches: TrackMatch[],
  sourceName: string,
  includeAmbiguous = true,
): MissingTrackInput[] {
  const inputs: MissingTrackInput[] = [];
  for (const m of matches) {
    if (m.status === 'unmatched') {
      inputs.push({ track: m.spotifyTrack, sourceName, status: 'unmatched' });
    } else if (m.status === 'ambiguous' && includeAmbiguous) {
      inputs.push({ track: m.spotifyTrack, sourceName, status: 'ambiguous' });
    }
  }
  return inputs;
}

export function buildMissingReport(inputs: MissingTrackInput[]): MissingReport {
  const byKey = new Map<string, MissingTrack>();

  for (const { track, sourceName, status } of inputs) {
    const key = dedupeKey(track);
    const existing = byKey.get(key);
    if (existing) {
      if (sourceName && !existing.sources.includes(sourceName)) {
        existing.sources.push(sourceName);
      }
      // "unmatched" (no candidate at all) is the more severe state — prefer it.
      if (status === 'unmatched') existing.status = 'unmatched';
      continue;
    }
    byKey.set(key, {
      title: track.name,
      artist: artistsToString(track),
      album: track.album?.name || 'Unknown Album',
      isrc: track.external_ids?.isrc,
      spotifyUrl: track.external_urls?.spotify,
      durationMs: track.duration_ms ?? 0,
      status,
      sources: sourceName ? [sourceName] : [],
    });
  }

  // Group by primary artist → album.
  const artistMap = new Map<string, Map<string, MissingTrack[]>>();
  let unmatchedCount = 0;
  let ambiguousCount = 0;

  for (const t of byKey.values()) {
    if (t.status === 'unmatched') unmatchedCount++;
    else ambiguousCount++;

    const artistKey = t.artist.split(',')[0].trim() || 'Unknown Artist';
    let albums = artistMap.get(artistKey);
    if (!albums) {
      albums = new Map();
      artistMap.set(artistKey, albums);
    }
    const albumKey = t.album;
    const tracks = albums.get(albumKey);
    if (tracks) tracks.push(t);
    else albums.set(albumKey, [t]);
  }

  const artists: MissingArtistGroup[] = Array.from(artistMap.entries())
    .map(([artist, albums]) => {
      const albumGroups: MissingAlbumGroup[] = Array.from(albums.entries())
        .map(([album, tracks]) => ({
          album,
          artist,
          tracks: tracks.sort((a, b) => a.title.localeCompare(b.title)),
        }))
        .sort((a, b) => a.album.localeCompare(b.album));
      const trackCount = albumGroups.reduce((n, g) => n + g.tracks.length, 0);
      return { artist, trackCount, albums: albumGroups };
    })
    .sort((a, b) => b.trackCount - a.trackCount || a.artist.localeCompare(b.artist));

  return {
    generatedAt: new Date().toISOString(),
    totalMissing: byKey.size,
    unmatchedCount,
    ambiguousCount,
    artists,
  };
}

export function missingReportToJSON(report: MissingReport): string {
  return JSON.stringify(report, null, 2);
}

const csvEscape = (value: string): string => {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
};

export function missingReportToCSV(report: MissingReport): string {
  const header = ['Artist', 'Album', 'Title', 'ISRC', 'Status', 'Sources', 'Spotify URL'];
  const rows: string[] = [header.join(',')];
  for (const artistGroup of report.artists) {
    for (const albumGroup of artistGroup.albums) {
      for (const t of albumGroup.tracks) {
        rows.push(
          [
            t.artist,
            t.album,
            t.title,
            t.isrc ?? '',
            t.status,
            t.sources.join('; '),
            t.spotifyUrl ?? '',
          ]
            .map((v) => csvEscape(String(v)))
            .join(','),
        );
      }
    }
  }
  return rows.join('\n');
}

export function missingReportToText(report: MissingReport): string {
  const lines: string[] = [];
  lines.push(`Missing from Navidrome — ${report.totalMissing} track(s)`);
  lines.push(
    `${report.unmatchedCount} not found · ${report.ambiguousCount} uncertain · generated ${report.generatedAt}`,
  );
  lines.push('');
  for (const artistGroup of report.artists) {
    lines.push(`${artistGroup.artist} (${artistGroup.trackCount})`);
    for (const albumGroup of artistGroup.albums) {
      lines.push(`  ${albumGroup.album}`);
      for (const t of albumGroup.tracks) {
        const flag = t.status === 'ambiguous' ? ' [uncertain]' : '';
        lines.push(`    - ${t.title}${flag}`);
      }
    }
    lines.push('');
  }
  return lines.join('\n').trimEnd() + '\n';
}

export function downloadMissingReport(
  report: MissingReport,
  format: 'json' | 'csv' | 'txt',
): void {
  const map = {
    json: { content: missingReportToJSON(report), mime: 'application/json' },
    csv: { content: missingReportToCSV(report), mime: 'text/csv' },
    txt: { content: missingReportToText(report), mime: 'text/plain' },
  } as const;
  const { content, mime } = map[format];
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const date = report.generatedAt.split('T')[0];
  a.href = url;
  a.download = `navispot-missing-${date}.${format}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
