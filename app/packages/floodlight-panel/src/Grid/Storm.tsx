import { useEffect, useRef } from "react";
import { createStorm, type Palette } from "./stormParticles";

const token = (el: Element, name: string, fallback: string) =>
  getComputedStyle(el).getPropertyValue(name).trim() || fallback;

const paletteFor = (el: Element): Palette => ({
  far: [
    token(el, "--color-content-text-tertiary", "#6b6968"),
    token(el, "--color-content-text-muted", "#8f8d8b"),
  ],
  near: [
    token(el, "--color-brand-primary", "#ff6d04"),
    token(el, "--color-content-palette-purple", "#8b5cf6"),
    token(el, "--color-content-palette-teal", "#0d9488"),
  ],
});

/** Loading overlay: a seeded pixel storm, unique on every mount. */
const Storm = ({ className }: { className?: string }) => {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return undefined;

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let storm: ReturnType<typeof createStorm> | undefined;
    let frame = 0;
    let last = performance.now();

    const fit = () => {
      const { width, height } = canvas.getBoundingClientRect();
      if (!width || !height) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      storm = createStorm(width, height, paletteFor(canvas));
      storm.draw(ctx, performance.now() / 1000);
    };

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      // the overlay is display:none while the grid is loaded
      if (!storm || canvas.offsetParent === null) {
        last = now;
        return;
      }
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      storm.step(now / 1000, dt);
      storm.draw(ctx, now / 1000);
    };

    const observer = new ResizeObserver(fit);
    observer.observe(canvas);
    fit();
    if (!still) frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return <canvas ref={ref} className={className} />;
};

export default Storm;
