'use client';

import { useMemo, useState } from 'react';
import {
  MissingReport as MissingReportData,
  downloadMissingReport,
} from '@/lib/export/missing-report';

interface MissingReportProps {
  report: MissingReportData;
  onClose?: () => void;
}

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function MissingReport({ report, onClose }: MissingReportProps) {
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return report.artists;
    return report.artists
      .map((artist) => {
        const albums = artist.albums
          .map((album) => ({
            ...album,
            tracks: album.tracks.filter(
              (t) =>
                t.title.toLowerCase().includes(q) ||
                t.album.toLowerCase().includes(q) ||
                t.artist.toLowerCase().includes(q),
            ),
          }))
          .filter((album) => album.tracks.length > 0);
        return { ...artist, albums };
      })
      .filter(
        (artist) =>
          artist.albums.length > 0 || artist.artist.toLowerCase().includes(q),
      );
  }, [report.artists, query]);

  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  if (report.totalMissing === 0) {
    return (
      <div className="rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-6 text-center">
        <svg
          className="w-10 h-10 mx-auto text-green-500 mb-3"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
        </svg>
        <h3 className="text-base font-semibold text-green-800 dark:text-green-300">
          Nothing missing
        </h3>
        <p className="text-sm text-green-700 dark:text-green-400 mt-1">
          Every track in this export was found in your Navidrome library.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden flex flex-col max-h-[80vh]">
      {/* Header */}
      <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800 flex-shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              Still need to get
            </h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">
                {report.totalMissing.toLocaleString()}
              </span>{' '}
              unique track{report.totalMissing === 1 ? '' : 's'} not in Navidrome
              {report.ambiguousCount > 0 && (
                <>
                  {' · '}
                  <span className="text-amber-600 dark:text-amber-400">
                    {report.ambiguousCount.toLocaleString()} uncertain
                  </span>
                </>
              )}
            </p>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              aria-label="Close report"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-3">
          <div className="relative flex-1 min-w-[200px]">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by artist, album, or title…"
              className="w-full pl-9 pr-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <div className="flex items-center gap-1.5">
            {(['csv', 'txt', 'json'] as const).map((fmt) => (
              <button
                key={fmt}
                onClick={() => downloadMissingReport(report, fmt)}
                className="px-3 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition-colors uppercase"
                title={`Download as ${fmt.toUpperCase()}`}
              >
                {fmt}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Grouped list */}
      <div className="overflow-y-auto flex-1 divide-y divide-zinc-100 dark:divide-zinc-800">
        {filtered.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
            No tracks match “{query}”.
          </p>
        ) : (
          filtered.map((artist) => {
            const artistCollapsed = collapsed.has(artist.artist);
            return (
              <div key={artist.artist}>
                <button
                  onClick={() => toggle(artist.artist)}
                  className="w-full px-5 py-3 flex items-center gap-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                >
                  <svg
                    className={`w-4 h-4 text-zinc-400 transition-transform flex-shrink-0 ${artistCollapsed ? '-rotate-90' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                  <span className="font-medium text-zinc-900 dark:text-zinc-100 truncate">
                    {artist.artist}
                  </span>
                  <span className="ml-auto flex-shrink-0 text-xs font-medium text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 rounded-full px-2 py-0.5">
                    {artist.albums.reduce((n, a) => n + a.tracks.length, 0)}
                  </span>
                </button>

                {!artistCollapsed && (
                  <div className="pb-2">
                    {artist.albums.map((album) => (
                      <div key={`${artist.artist}::${album.album}`} className="px-5 pb-2">
                        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500 pl-6 py-1">
                          {album.album}
                        </div>
                        <ul className="space-y-0.5">
                          {album.tracks.map((t, i) => (
                            <li
                              key={`${t.title}-${i}`}
                              className="flex items-center gap-2 pl-6 pr-2 py-1 text-sm"
                            >
                              <span className="text-zinc-700 dark:text-zinc-300 truncate flex-1" title={t.title}>
                                {t.title}
                              </span>
                              {t.status === 'ambiguous' && (
                                <span className="flex-shrink-0 text-[10px] font-medium uppercase text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded px-1.5 py-0.5">
                                  uncertain
                                </span>
                              )}
                              {t.sources.length > 1 && (
                                <span
                                  className="flex-shrink-0 text-[10px] text-zinc-400"
                                  title={t.sources.join(', ')}
                                >
                                  ×{t.sources.length}
                                </span>
                              )}
                              <span className="flex-shrink-0 text-xs text-zinc-400 tabular-nums">
                                {formatDuration(t.durationMs)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default MissingReport;
