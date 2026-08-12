/**
 * Decorative spinning point cloud for the upsell banner: a fixed
 * synthetic cluster scene with no controls, picking, or data
 * dependencies. three.js is imported dynamically, so rendering the
 * runs page loads no WebGL code up front; if a WebGL context is
 * unavailable (tests, headless browsers), the tinted well renders
 * empty.
 */
import { useEffect, useRef } from "react";
import "./panel.css";

// Scatter-class colors and cluster layout for the synthetic scene
const PALETTE = [
  "#FA5300",
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

      // ~420 points across 6 clusters; ~12% receive another cluster's
      // color, mimicking the class overlap of real prediction data
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
