export interface EmbedInfo {
  kind: 'youtube' | 'iframe' | 'video';
  url: string;
  youtubeId?: string;
}

/**
 * بيحوّل أي رابط فيديو (يوتيوب / فيميو / جوجل درايف / ملف mp4 مباشر)
 * لرابط صالح للتشغيل جوه الصفحة. بيرجّع null لو الرابط مش معروف.
 */
export function toEmbed(raw: string | undefined | null): EmbedInfo | null {
  const input = (raw ?? '').trim();
  if (!input) return null;

  let u: URL;
  try {
    u = new URL(input);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;

  const host = u.hostname.replace(/^www\./, '');

  // ---------- YouTube ----------
  let ytId: string | null = null;
  if (host === 'youtu.be') {
    ytId = u.pathname.slice(1).split('/')[0];
  } else if (['youtube.com', 'm.youtube.com', 'youtube-nocookie.com'].includes(host)) {
    if (u.pathname === '/watch') {
      ytId = u.searchParams.get('v');
    } else {
      const m = u.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]+)/);
      ytId = m ? m[1] : null;
    }
  }
  if (ytId && /^[\w-]{6,20}$/.test(ytId)) {
    return { kind: 'youtube', youtubeId: ytId, url: `https://www.youtube-nocookie.com/embed/${ytId}?rel=0` };
  }

  // ---------- Vimeo ----------
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const m = u.pathname.match(/(\d{6,})/);
    if (m) return { kind: 'iframe', url: `https://player.vimeo.com/video/${m[1]}` };
  }

  // ---------- Google Drive ----------
  if (host === 'drive.google.com') {
    const m = u.pathname.match(/\/file\/d\/([\w-]+)/);
    const id = m ? m[1] : u.searchParams.get('id');
    if (id && /^[\w-]+$/.test(id)) {
      return { kind: 'iframe', url: `https://drive.google.com/file/d/${id}/preview` };
    }
  }

  // ---------- ملف فيديو مباشر ----------
  if (/\.(mp4|webm|ogg)$/i.test(u.pathname)) {
    return { kind: 'video', url: u.toString() };
  }

  return null;
}
