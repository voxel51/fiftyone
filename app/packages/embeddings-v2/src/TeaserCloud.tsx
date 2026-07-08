/**
 * Decorative spinning point cloud for the upsell aside — a vanilla-three
 * port of the lovable prototype's mini preview (same clusters, palette,
 * round sprites, and camera). Deliberately NOT the renderer: no cameras
 * adapters, no picking, no data. three.js is already this package's
 * dependency and loads lazily here, so the runs page's initial chunk
 * stays WebGL-free; without a GL context (tests, headless) the tinted
 * well simply stays empty.
 */
import { useEffect, useRef } from "react";
import "./panel.css";

// Data-viz palette + layout lifted from the lovable mock (decorative,
// palette-exempt like chart classes)
const PALETTE = [
  "#FF6D04",
  "#86B5F6",
  "#7AB87C",
  "#CBA6FF",
  "#FCCB58",
  "#FF6767",
];
const CENTERS: Array<[number, number, number]> = [
  [-6, 3, -2],
  [5, 4, 3],
  [-2, -4, 4],
  [6, -3, -4],
  [0, 5, -6],
  [-5, -5, -5],
];
const SPREAD = 2.6;

/** Deterministic PRNG so the cloud looks identical every load */
const makeRand = (seed: number) => {
  let h = seed >>> 0;
  return () => {
    h = (h * 1103515245 + 12345) & 0x7fffffff;
    return (h % 100000) / 100000;
  };
};

export function TeaserCloud() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    let disposed = false;
    let cleanup: (() => void) | null = null;

    import("three").then((THREE) => {
      if (disposed) return;
      let renderer: import("three").WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
      } catch {
        return;
      }
      const size = host.clientWidth || 112;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(size, size);
      host.appendChild(renderer.domElement);

      const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
      camera.position.set(14, 12, 16);
      camera.lookAt(0, 0, 0);

      // ~420 points in 6 clusters; ~12% get a "wrong" class color for
      // the speckle real predictions have
      const rand = makeRand(987654321);
      const positions: number[] = [];
      const colorChannels: number[] = [];
      const color = new THREE.Color();
      CENTERS.forEach(([cx, cy, cz], cluster) => {
        const n = 60 + Math.floor(rand() * 20);
        for (let i = 0; i < n; i++) {
          positions.push(
            cx + (rand() - 0.5) * SPREAD * 2,
            cy + (rand() - 0.5) * SPREAD * 2,
            cz + (rand() - 0.5) * SPREAD * 2,
          );
          const wrong = rand() < 0.12;
          color.set(
            PALETTE[wrong ? Math.floor(rand() * PALETTE.length) : cluster],
          );
          colorChannels.push(color.r, color.g, color.b);
        }
      });
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(new Float32Array(positions), 3),
      );
      geometry.setAttribute(
        "color",
        new THREE.BufferAttribute(new Float32Array(colorChannels), 3),
      );

      // Round sprites: a canvas-drawn circle with an alpha cutout
      const sprite = document.createElement("canvas");
      sprite.width = sprite.height = 64;
      const ctx = sprite.getContext("2d");
      if (ctx) {
        ctx.beginPath();
        ctx.arc(32, 32, 30, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
      }
      const texture = new THREE.CanvasTexture(sprite);

      const material = new THREE.PointsMaterial({
        vertexColors: true,
        size: 4,
        sizeAttenuation: false,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        map: texture,
        alphaTest: 0.5,
      });
      const points = new THREE.Points(geometry, material);
      const scene = new THREE.Scene();
      scene.add(points);

      let frame = 0;
      let last = performance.now();
      const tick = (now: number) => {
        points.rotation.y += ((now - last) / 1000) * 0.35;
        last = now;
        renderer.render(scene, camera);
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);

      cleanup = () => {
        cancelAnimationFrame(frame);
        geometry.dispose();
        material.dispose();
        texture.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        renderer.domElement.remove();
      };
    });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);

  return <div ref={hostRef} className="emb-teaser" aria-hidden />;
}
