// mulberry32: tiny seeded PRNG, so one seed reproduces one storm
export const prng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export type Palette = { far: string[]; near: string[] };

type Drop = {
  x: number;
  y: number;
  z: number;
  drift: number;
  wobble: number;
  phase: number;
  color: string;
  vx: number;
  vy: number;
};

type Splash = { x: number; y: number; vx: number; vy: number; color: string };

const GRAVITY = 420;
const MAX_DROPS = 1100;

export const createStorm = (
  width: number,
  height: number,
  palette: Palette,
  seed = Date.now(),
) => {
  const random = prng(seed);
  const pick = <T>(values: T[]) => values[Math.floor(random() * values.length)];
  const gust = [0, 1, 2].map(() => random() * Math.PI * 2);
  const drops: Drop[] = [];
  const splashes: Splash[] = [];

  const spawn = (drop: Partial<Drop>, top: boolean): Drop => {
    const z = random() ** 1.6;
    return Object.assign(drop, {
      x: random() * width,
      y: top ? -4 : random() * height,
      z,
      drift: (random() - 0.5) * 50 * (0.4 + z),
      wobble: 0.3 + random() * 1.4,
      phase: random() * Math.PI * 2,
      color: z > 0.55 ? pick(palette.near) : pick(palette.far),
      vx: 0,
      vy: 0,
    }) as Drop;
  };

  const count = Math.min(MAX_DROPS, Math.floor((width * height) / 1300));
  for (let i = 0; i < count; i++) drops.push(spawn({}, false));

  // three incommensurate waves read as gusts rather than a loop
  const wind = (t: number) =>
    14 * Math.sin(t * 0.19 + gust[0]) +
    8 * Math.sin(t * 0.47 + gust[1]) +
    4 * Math.sin(t * 1.3 + gust[2]);

  const step = (t: number, dt: number) => {
    const w = wind(t);
    for (const d of drops) {
      d.vy = 30 + d.z * 110;
      d.vx = d.drift + w * (0.3 + d.z) + 6 * Math.sin(t * d.wobble + d.phase);
      d.y += d.vy * dt;
      d.x += d.vx * dt;
      if (d.x < -8) d.x += width + 16;
      else if (d.x > width + 8) d.x -= width + 16;

      if (d.y >= height) {
        if (d.z > 0.45) {
          const n = 2 + Math.floor(random() * 2);
          for (let i = 0; i < n; i++) {
            splashes.push({
              x: d.x,
              y: height - 1,
              vx: (random() - 0.5) * 70 * d.z,
              vy: -(40 + random() * 90) * d.z,
              color: d.color,
            });
          }
        }
        spawn(d, true);
      }
    }
    for (let i = splashes.length - 1; i >= 0; i--) {
      const s = splashes[i];
      s.vy += GRAVITY * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.y > height) splashes.splice(i, 1);
    }
  };

  // pixel-art drop as [column offset, width] runs; the tip row leans upwind
  const DROP_ROWS: [number, number][] = [
    [1, 1],
    [0, 3],
    [0, 3],
  ];

  const teardrop = (ctx: CanvasRenderingContext2D, d: Drop) => {
    const cell = 1;
    const x = Math.round(d.x) - cell;
    const y = Math.round(d.y) - 2 * cell;
    const lean = Math.abs(d.vx) > 12 ? -Math.sign(d.vx) : 0;
    DROP_ROWS.forEach(([offset, run], row) => {
      const shift = row === 0 ? lean : 0;
      ctx.fillRect(
        x + (offset + shift) * cell,
        y + row * cell,
        run * cell,
        cell,
      );
    });
  };

  const draw = (ctx: CanvasRenderingContext2D) => {
    ctx.clearRect(0, 0, width, height);
    for (const d of drops) {
      const size = 1 + d.z * 3;
      ctx.globalAlpha = 0.25 + d.z * 0.6;
      ctx.fillStyle = d.color;
      if (d.z > 0.55) teardrop(ctx, d);
      else ctx.fillRect(d.x, d.y, size, size);
    }
    ctx.globalAlpha = 0.7;
    for (const s of splashes) {
      ctx.fillStyle = s.color;
      ctx.fillRect(s.x, s.y, 1.5, 1.5);
    }
    ctx.globalAlpha = 1;
  };

  return { step, draw };
};
