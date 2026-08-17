/**
 * YouTube/Vimeo URL parsing for video showcase albums (db/016). Used both
 * client-side (inline validation while an admin pastes a URL) and
 * server-side (the only trust boundary that matters — never accept a
 * client's own judgment that a URL parsed correctly).
 */
export type VideoRef = { platform: "youtube" | "vimeo"; id: string };

export function parseVideoUrl(url: string): VideoRef | null {
  let u: URL;
  try { u = new URL(url.trim()); } catch { return null; }
  const host = u.hostname.replace(/^www\./, "");

  if (host === "youtube.com" || host === "m.youtube.com" || host === "youtu.be") {
    if (host === "youtu.be") {
      const id = u.pathname.slice(1);
      return id ? { platform: "youtube", id } : null;
    }
    if (u.pathname === "/watch") {
      const id = u.searchParams.get("v");
      return id ? { platform: "youtube", id } : null;
    }
    const embedMatch = u.pathname.match(/^\/(embed|shorts)\/([^/]+)/);
    if (embedMatch) return { platform: "youtube", id: embedMatch[2] };
    return null;
  }

  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const m = u.pathname.match(/(\d+)/);
    return m ? { platform: "vimeo", id: m[1] } : null;
  }

  return null;
}

export function embedSrc(ref: VideoRef, autoplay: boolean): string {
  if (ref.platform === "youtube") {
    const params = autoplay ? "autoplay=1&mute=1" : "";
    return `https://www.youtube-nocookie.com/embed/${ref.id}${params ? `?${params}` : ""}`;
  }
  const params = autoplay ? "autoplay=1&muted=1" : "";
  return `https://player.vimeo.com/video/${ref.id}${params ? `?${params}` : ""}`;
}
