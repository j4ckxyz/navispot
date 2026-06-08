const FORCE_EXPORT_STORAGE_KEY = "navispot-force-export-playlists";

export function loadForceExportPlaylists(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const stored = window.localStorage.getItem(FORCE_EXPORT_STORAGE_KEY);
    return stored === "true";
  } catch {
    return false;
  }
}

export function saveForceExportPlaylists(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FORCE_EXPORT_STORAGE_KEY, String(enabled));
  } catch {
    // Ignore
  }
}
