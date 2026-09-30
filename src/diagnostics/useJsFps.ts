import { useEffect, useRef, useState } from 'react';

/** JS-thread FPS only -- UI-thread FPS isn't obtainable from JS without further native plumbing; the diagnostics screen labels it "n/a" accordingly. */
export function useJsFps(active: boolean): number {
  const [fps, setFps] = useState(0);
  const frameCount = useRef(0);
  const lastSample = useRef(Date.now());
  const rafId = useRef<number | null>(null);

  useEffect(() => {
    if (!active) return undefined;
    frameCount.current = 0;
    lastSample.current = Date.now();

    const tick = () => {
      frameCount.current += 1;
      const now = Date.now();
      const elapsed = now - lastSample.current;
      if (elapsed >= 500) {
        setFps(Math.round((frameCount.current * 1000) / elapsed));
        frameCount.current = 0;
        lastSample.current = now;
      }
      rafId.current = requestAnimationFrame(tick);
    };
    rafId.current = requestAnimationFrame(tick);

    return () => {
      if (rafId.current != null) cancelAnimationFrame(rafId.current);
    };
  }, [active]);

  return fps;
}
