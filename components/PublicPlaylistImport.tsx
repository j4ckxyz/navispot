"use client"

import { useState } from "react"
import type { ImportedPlaylist, PublicPlaylistError } from "@/types/public-playlist"

type Status =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string; code: PublicPlaylistError["code"] }
  | { kind: "success"; playlist: ImportedPlaylist }

interface Props {
  onImported: (playlist: ImportedPlaylist) => void
}

export function PublicPlaylistImport({ onImported }: Props) {
  const [url, setUrl] = useState("")
  const [status, setStatus] = useState<Status>({ kind: "idle" })

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim() || status.kind === "loading") return
    setStatus({ kind: "loading" })
    try {
      const res = await fetch("/api/spotify/public-playlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setStatus({
          kind: "error",
          message: data?.error?.message ?? `Request failed (${res.status})`,
          code: data?.error?.code ?? "internal_error",
        })
        return
      }
      const playlist: ImportedPlaylist = data.playlist
      onImported(playlist)
      setStatus({ kind: "success", playlist })
      setUrl("")
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "Network error",
        code: "internal_error",
      })
    }
  }

  const spotifyAvailable = (() => {
    if (typeof window === "undefined") return false
    try {
      return !!window.localStorage.getItem("navispot_spotify_auth")
    } catch {
      return false
    }
  })()

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Import a public Spotify playlist
        </h3>
        {!spotifyAvailable && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-900 dark:text-amber-200">
            Free tier
          </span>
        )}
      </div>
      <form onSubmit={submit} className="flex gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://open.spotify.com/playlist/..."
          className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          disabled={status.kind === "loading"}
        />
        <button
          type="submit"
          disabled={status.kind === "loading" || !url.trim()}
          className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status.kind === "loading" ? "Loading..." : "Import"}
        </button>
      </form>
      {status.kind === "error" && (
        <div className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          <p>{status.message}</p>
          {status.code === "private_or_missing" && (
            <p className="mt-1 text-xs">
              Tip: connect Spotify on the login page if you need private playlists.
            </p>
          )}
        </div>
      )}
      {status.kind === "success" && (
        <p className="mt-3 text-sm text-green-700 dark:text-green-400">
          Added &ldquo;{status.playlist.name}&rdquo; ({status.playlist.trackCount} tracks)
        </p>
      )}
    </div>
  )
}
