let ytPromise: Promise<any> | null = null;

/** بيحمّل YouTube IFrame API مرة واحدة ويرجّع YT */
export function loadYouTubeApi(): Promise<any> {
  const w = window as any;
  if (w.YT?.Player) return Promise.resolve(w.YT);
  if (ytPromise) return ytPromise;

  ytPromise = new Promise((resolve, reject) => {
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(w.YT);
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => {
      ytPromise = null;
      reject(new Error('YouTube API failed to load'));
    };
    document.head.appendChild(s);
  });
  return ytPromise;
}
