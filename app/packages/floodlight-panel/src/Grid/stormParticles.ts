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

  const LIGHT = "205, 220, 255";
  const beams = [0.2, 0.8].map((base) => ({
    x: width * (base + (random() - 0.5) * 0.1),
    speed: 0.07 + random() * 0.06,
    phase: random() * Math.PI * 2,
  }));

  // a cone from above the stage: narrow at the lamp, wide and faint below
  const beam = (
    ctx: CanvasRenderingContext2D,
    x: number,
    angle: number,
    alpha: number,
  ) => {
    const reach = Math.hypot(width, height) * 1.1;
    ctx.save();
    ctx.translate(x, -20);
    ctx.rotate(angle);
    const fade = ctx.createLinearGradient(0, 0, 0, reach);
    fade.addColorStop(0, `rgba(${LIGHT}, ${alpha})`);
    fade.addColorStop(0.6, `rgba(${LIGHT}, ${alpha * 0.35})`);
    fade.addColorStop(1, `rgba(${LIGHT}, 0)`);
    ctx.fillStyle = fade;
    // nested cones stand in for a blur: brighter core, softer edges
    for (const spread of [0.05, 0.09, 0.14]) {
      ctx.beginPath();
      ctx.moveTo(-4, 0);
      ctx.lineTo(4, 0);
      ctx.lineTo(reach * spread, reach);
      ctx.lineTo(-reach * spread, reach);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  };

  // far behind the rain: a breathing moon glow and two sweeping floodlights
  const moonlight = (ctx: CanvasRenderingContext2D, t: number) => {
    const cx = width * (0.62 + 0.08 * Math.sin(t * 0.05 + gust[0]));
    const cy = -height * 0.15;
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, height * 1.2);
    const a = 0.06 + 0.02 * Math.sin(t * 0.31 + gust[1]);
    glow.addColorStop(0, `rgba(${LIGHT}, ${a})`);
    glow.addColorStop(1, `rgba(${LIGHT}, 0)`);
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    for (const b of beams) {
      // lean inward, sweep about +/-30 degrees
      const lean = b.x < width / 2 ? -0.25 : 0.25;
      const angle = lean + 0.52 * Math.sin(t * b.speed + b.phase);
      beam(ctx, b.x, angle, 0.012 + 0.006 * Math.sin(t * 0.4 + b.phase));
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

  const draw = (ctx: CanvasRenderingContext2D, t: number) => {
    ctx.clearRect(0, 0, width, height);
    moonlight(ctx, t);
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
