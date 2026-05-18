// ----- Video Propagation Test (not for committing) -----
// Iter 3 — multi-object with per-object color + centroid-follow tracking.
// Each object has its own [kfA, kfB] and results map. Eager pre-encode
// fills a shared per-frame embedding cache so propagation across multiple
// objects only pays decoder cost per object per frame.

import {
  BrowserAnnotationProvider,
  PointLabel,
  type InferenceResult,
  type PromptPoint,
  type ProviderStatus,
} from "@fiftyone/annotation";
import {
  propagateMulti,
  type Keyframe,
  type PropagationStrategy,
} from "@fiftyone/annotation/src/providers/videoPropagation";
import { getSampleSrc, mediaType, useModalSample } from "@fiftyone/state";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRecoilValue } from "recoil";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FPS_DEFAULT = 30;
const PRE_ENCODE_CAP_DEFAULT = 150;

const COLOR_PALETTE: [number, number, number][] = [
  [0, 200, 0],     // green
  [200, 0, 200],   // magenta
  [0, 150, 255],   // blue
  [255, 165, 0],   // orange
  [255, 255, 0],   // yellow
  [0, 255, 255],   // cyan
  [255, 80, 80],   // red
  [128, 255, 128], // light green
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface KeyframeCapture extends Keyframe {
  result?: InferenceResult;
}

interface PropObject {
  id: string;
  color: [number, number, number];
  kfA: KeyframeCapture | null;
  kfB: KeyframeCapture | null;
  results: Map<number, InferenceResult>;
  /** True if kfA/kfB has changed since the last successful propagation. */
  dirty: boolean;
}

function newObjectId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function makeObject(idx: number): PropObject {
  return {
    id: newObjectId(),
    color: COLOR_PALETTE[idx % COLOR_PALETTE.length],
    kfA: null,
    kfB: null,
    results: new Map(),
    dirty: true,
  };
}

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

function findLookerCanvas(): HTMLCanvasElement | null {
  return document.querySelector<HTMLCanvasElement>(
    '[data-cy="modal-looker-container"] canvas',
  );
}

function findLookerTimeEl(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-cy="looker-video-time"]');
}

function findLookerSeekBar(): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>(
    '[data-cy="modal-looker-container"] input[type="range"]',
  );
}

function getImageRect(canvas: HTMLCanvasElement, aspectRatio: number) {
  const rect = canvas.getBoundingClientRect();
  const ar = rect.width / rect.height;
  let w = rect.width, h = rect.height, left = rect.left, top = rect.top;
  if (ar > aspectRatio) {
    w = rect.height * aspectRatio;
    left = rect.left + (rect.width - w) / 2;
  } else {
    h = rect.width / aspectRatio;
    top = rect.top + (rect.height - h) / 2;
  }
  return { left, top, w, h };
}

function formatBytes(n: number): string {
  if (!n) return "0 B";
  const units = ["B", "kB", "MB", "GB", "TB"];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

function parseFrameFromTimeText(text: string | null, fps: number): number | null {
  if (!text) return null;
  const lhs = text.split("/")[0].trim();
  if (!lhs) return null;
  if (/^\d+$/.test(lhs)) return parseInt(lhs, 10);
  const parts = lhs.split(":").map((s) => parseFloat(s));
  if (parts.some(isNaN)) return null;
  let secs = 0;
  for (let i = 0; i < parts.length; i++) secs = secs * 60 + parts[i];
  return Math.round(secs * fps);
}

/** Paint a mask onto a 2D context at the given bbox in canvas pixels. */
function paintMask(
  ctx: CanvasRenderingContext2D,
  result: InferenceResult,
  rgb: [number, number, number],
  canvasW: number,
  canvasH: number,
) {
  const off = document.createElement("canvas");
  off.width = result.maskWidth;
  off.height = result.maskHeight;
  const offCtx = off.getContext("2d")!;
  const img = offCtx.createImageData(result.maskWidth, result.maskHeight);
  const [r, g, b] = rgb;
  for (let i = 0; i < result.mask.length; i++) {
    const v = result.mask[i] > 0.5 ? 140 : 0;
    img.data[i * 4] = r;
    img.data[i * 4 + 1] = g;
    img.data[i * 4 + 2] = b;
    img.data[i * 4 + 3] = v;
  }
  offCtx.putImageData(img, 0, 0);

  const bx = result.bbox.x * canvasW;
  const by = result.bbox.y * canvasH;
  const bw = result.bbox.w * canvasW;
  const bh = result.bbox.h * canvasH;
  ctx.drawImage(off, bx, by, bw, bh);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function VideoPropagateTest() {
  const sample = useModalSample();
  const currentMediaType = useRecoilValue(mediaType);
  const isVideo = currentMediaType === "video";

  const videoSrc = useMemo(() => {
    const raw = sample?.urls?.[0]?.url;
    return raw ? getSampleSrc(raw) : null;
  }, [sample]);

  const fps = (sample as any)?.metadata?.frame_rate ?? FPS_DEFAULT;
  const aspectRatio = (sample as any)?.aspectRatio ?? 16 / 9;

  // Cache key must be stable across reloads so the IDB embedding cache
  // hits. Signed URLs have rotating query params, so we either use the
  // sample id (preferred — stable forever) or strip the query string
  // off the URL (path is stable across sessions).
  const videoKey = useMemo(() => {
    const inner = (sample as any)?.sample ?? sample;
    const id = inner?._id ?? inner?.id;
    if (id) return String(id);
    if (!videoSrc) return "video";
    try {
      const u = new URL(videoSrc, window.location.origin);
      return u.origin + u.pathname;
    } catch {
      return videoSrc.split("?")[0];
    }
  }, [sample, videoSrc]);

  const [status, setStatus] = useState<ProviderStatus | "idle" | "running">("idle");
  const [logs, setLogs] = useState<string[]>([]);
  const [objects, setObjects] = useState<PropObject[]>(() => [makeObject(0)]);
  const [activeId, setActiveId] = useState<string>(() => objects[0].id);
  const [pendingFor, setPendingFor] = useState<"A" | "B" | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [timing, setTiming] = useState<{ totalMs: number; count: number } | null>(null);
  const [currentFrame, setCurrentFrame] = useState<number>(0);
  const [eagerEnabled, setEagerEnabled] = useState<boolean>(true);
  const [preEncoded, setPreEncoded] = useState<number>(0);
  const [strategy] = useState<PropagationStrategy>("centroid");
  const [storage, setStorage] = useState<{
    usage: number;
    quota: number;
    persistent: boolean;
  } | null>(null);

  const preEncodeCap = PRE_ENCODE_CAP_DEFAULT;

  const hiddenVideoRef = useRef<HTMLVideoElement | null>(null);
  const keyframeVideoRef = useRef<HTMLVideoElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const providerRef = useRef<BrowserAnnotationProvider | null>(null);
  const preEncodeAbortRef = useRef<{ aborted: boolean } | null>(null);
  const objectsRef = useRef(objects);
  objectsRef.current = objects;

  const log = useCallback((m: string) => {
    console.log("[VID-PROP]", m);
    setLogs((p) => [...p.slice(-49), m]);
  }, []);

  const ensureProvider = useCallback(async () => {
    if (providerRef.current) return providerRef.current;
    setStatus("loading");
    const p = new BrowserAnnotationProvider({
      onStatus: (s) => { setStatus(s); log(`provider: ${s}`); },
      onWarning: (m) => log(`⚠ ${m}`),
      onError: (e) => log(`❌ ${e.kind}: ${e.message}`),
    });
    await p.initialize();
    providerRef.current = p;
    return p;
  }, [log]);

  // Reset on sample change.
  useEffect(() => {
    if (preEncodeAbortRef.current) preEncodeAbortRef.current.aborted = true;
    const fresh = makeObject(0);
    setObjects([fresh]);
    setActiveId(fresh.id);
    setProgress(null);
    setPendingFor(null);
    setTiming(null);
    setCurrentFrame(0);
    setPreEncoded(0);
  }, [videoSrc]);

  useEffect(() => () => { providerRef.current?.dispose(); }, []);

  // Poll the Storage API so the panel shows how fat the cache has grown
  // and whether the origin is on best-effort or persistent eviction.
  useEffect(() => {
    if (!navigator.storage?.estimate) return;
    let cancelled = false;
    const tick = async () => {
      const est = await navigator.storage.estimate().catch(() => null);
      const persistent = await navigator.storage.persisted?.().catch(() => false) ?? false;
      if (cancelled || !est) return;
      setStorage({
        usage: est.usage ?? 0,
        quota: est.quota ?? 0,
        persistent,
      });
    };
    tick();
    const id = setInterval(tick, 3000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const clearEmbeddingCache = useCallback(async () => {
    // Delete the entire embedding IDB. Forces a re-encode next session.
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase("fiftyone-embeddings");
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
    log("cache cleared (reload to re-init the cache)");
    // Refresh the size readout immediately.
    const est = await navigator.storage.estimate?.().catch(() => null);
    if (est) setStorage((s) => s ? {
      ...s,
      usage: est.usage ?? 0,
      quota: est.quota ?? 0,
    } : s);
  }, [log]);

  const requestPersistent = useCallback(async () => {
    if (!navigator.storage?.persist) { log("⚠ Storage.persist() unavailable"); return; }
    const granted = await navigator.storage.persist();
    log(`persistent storage: ${granted ? "granted" : "denied / deferred"}`);
    const est = await navigator.storage.estimate().catch(() => null);
    if (est) setStorage({
      usage: est.usage ?? 0,
      quota: est.quota ?? 0,
      persistent: granted,
    });
  }, [log]);

  // Frame tracking via the looker seek bar.
  useEffect(() => {
    if (!isVideo) return;
    const hidden = hiddenVideoRef.current;
    let raf = 0;
    let lastFrame = -1;
    const tick = () => {
      const sb = findLookerSeekBar();
      if (sb && hidden && hidden.duration > 0) {
        const pct = parseFloat(sb.value);
        if (!isNaN(pct)) {
          const total = Math.max(1, Math.floor(hidden.duration * fps));
          const f = Math.round((pct / 100) * (total - 1));
          if (f !== lastFrame) { lastFrame = f; setCurrentFrame(f); }
        }
      } else {
        const t = findLookerTimeEl()?.textContent ?? null;
        const f = parseFrameFromTimeText(t, fps);
        if (f !== null && f !== lastFrame) { lastFrame = f; setCurrentFrame(f); }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isVideo, fps, videoSrc]);

  // Eager pre-encode against the hidden video — embedding cache is shared
  // across all objects, so this work pays off per-object.
  useEffect(() => {
    if (!isVideo || !eagerEnabled || !videoSrc) return;
    const hidden = hiddenVideoRef.current;
    if (!hidden) return;

    const abort = { aborted: false };
    preEncodeAbortRef.current = abort;
    setPreEncoded(0);

    (async () => {
      try {
        if (hidden.readyState < 1) {
          await new Promise<void>((res, rej) => {
            const ok = () => { hidden.removeEventListener("loadedmetadata", ok); hidden.removeEventListener("error", err); res(); };
            const err = () => { hidden.removeEventListener("loadedmetadata", ok); hidden.removeEventListener("error", err); rej(new Error("hidden video load failed")); };
            hidden.addEventListener("loadedmetadata", ok, { once: true });
            hidden.addEventListener("error", err, { once: true });
          });
        }
        if (abort.aborted) return;

        const total = Math.floor((hidden.duration || 0) * fps);
        const cap = Math.min(preEncodeCap, total || preEncodeCap);
        log(`eager pre-encode: target ${cap} frames`);

        const provider = await ensureProvider();
        for (let f = 0; f < cap; f++) {
          if (abort.aborted) break;
          hidden.currentTime = (f + 0.5) / fps;
          await new Promise<void>((res, rej) => {
            const ok = () => { hidden.removeEventListener("seeked", ok); hidden.removeEventListener("error", err); res(); };
            const err = () => { hidden.removeEventListener("seeked", ok); hidden.removeEventListener("error", err); rej(new Error("seek failed")); };
            hidden.addEventListener("seeked", ok, { once: true });
            hidden.addEventListener("error", err, { once: true });
          });
          if (abort.aborted) break;
          const bitmap = await createImageBitmap(hidden);
          await provider.encodeBitmap({ bitmap, cacheKey: `${videoKey}#frame=${f}` });
          setPreEncoded(f + 1);
          await new Promise<void>((r) => setTimeout(r, 30));
        }
        if (!abort.aborted) log("eager pre-encode: done");
      } catch (e) {
        if (!abort.aborted) log(`⚠ pre-encode error: ${e instanceof Error ? e.message : String(e)}`);
      }
    })();

    return () => { abort.aborted = true; };
  }, [isVideo, eagerEnabled, videoSrc, fps, preEncodeCap, videoKey, ensureProvider, log]);

  // Click on the looker → keyframe for the active object.
  useEffect(() => {
    if (!pendingFor || !isVideo) return;

    const onClick = async (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName !== "CANVAS") return;
      const canvas = target as HTMLCanvasElement;
      if (!canvas.closest('[data-cy="modal-looker-container"]')) return;

      const rect = getImageRect(canvas, aspectRatio);
      const x = (e.clientX - rect.left) / rect.w;
      const y = (e.clientY - rect.top) / rect.h;
      if (x < 0 || x > 1 || y < 0 || y > 1) return;

      e.preventDefault();
      e.stopPropagation();

      const point: PromptPoint = { x, y, label: PointLabel.POSITIVE };
      const frameIdx = currentFrame;
      log(`pin ${pendingFor} for object ${activeId.slice(0, 4)}: frame=${frameIdx} pt=(${x.toFixed(2)},${y.toFixed(2)})`);

      try {
        const provider = await ensureProvider();
        const kfVid = keyframeVideoRef.current;
        if (!kfVid) throw new Error("keyframe video not mounted");
        if (kfVid.readyState < 1) {
          await new Promise<void>((res, rej) => {
            const ok = () => { kfVid.removeEventListener("loadedmetadata", ok); kfVid.removeEventListener("error", err); res(); };
            const err = () => { kfVid.removeEventListener("loadedmetadata", ok); kfVid.removeEventListener("error", err); rej(new Error("kf load failed")); };
            kfVid.addEventListener("loadedmetadata", ok, { once: true });
            kfVid.addEventListener("error", err, { once: true });
          });
        }
        kfVid.currentTime = (frameIdx + 0.5) / fps;
        await new Promise<void>((res, rej) => {
          const ok = () => { kfVid.removeEventListener("seeked", ok); kfVid.removeEventListener("error", err); res(); };
          const err = () => { kfVid.removeEventListener("seeked", ok); kfVid.removeEventListener("error", err); rej(new Error("kf seek failed")); };
          kfVid.addEventListener("seeked", ok, { once: true });
          kfVid.addEventListener("error", err, { once: true });
        });
        const bitmap = await createImageBitmap(kfVid);
        const t0 = performance.now();
        const result = await provider.inferBitmap({
          bitmap, cacheKey: `${videoKey}#frame=${frameIdx}`, points: [point],
        });
        const dt = performance.now() - t0;
        setTiming((prev) => ({
          totalMs: (prev?.totalMs ?? 0) + dt,
          count: (prev?.count ?? 0) + 1,
        }));
        log(`infer: ${dt.toFixed(0)}ms`);

        setObjects((prev) => prev.map((o) => {
          if (o.id !== activeId) return o;
          const cap: KeyframeCapture = { frameIdx, points: [point], result };
          const results = new Map(o.results);
          results.set(frameIdx, result);
          return pendingFor === "A"
            ? { ...o, kfA: cap, results, dirty: true }
            : { ...o, kfB: cap, results, dirty: true };
        }));
        setPendingFor(null);
      } catch (err) {
        log(`❌ ${err instanceof Error ? err.message : String(err)}`);
      }
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [pendingFor, isVideo, aspectRatio, currentFrame, videoKey, ensureProvider, log, activeId, fps]);

  // Mask overlay — draws ALL objects' masks at current frame, each in its color.
  useEffect(() => {
    if (!isVideo) return;
    let raf = 0;
    const draw = () => {
      const lookerCanvas = findLookerCanvas();
      const overlay = overlayRef.current;
      if (!overlay || !lookerCanvas) {
        raf = requestAnimationFrame(draw);
        return;
      }
      const rect = getImageRect(lookerCanvas, aspectRatio);
      const dpr = window.devicePixelRatio || 1;
      Object.assign(overlay.style, {
        position: "fixed",
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.w}px`,
        height: `${rect.h}px`,
        pointerEvents: "none",
        zIndex: "9998",
      });
      const targetW = Math.round(rect.w * dpr);
      const targetH = Math.round(rect.h * dpr);
      if (overlay.width !== targetW) overlay.width = targetW;
      if (overlay.height !== targetH) overlay.height = targetH;

      const ctx = overlay.getContext("2d")!;
      ctx.clearRect(0, 0, overlay.width, overlay.height);
      for (const obj of objectsRef.current) {
        const result = obj.results.get(currentFrame);
        if (!result) continue;
        paintMask(ctx, result, obj.color, overlay.width, overlay.height);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [isVideo, aspectRatio, currentFrame]);

  const onPropagate = useCallback(async () => {
    const hidden = hiddenVideoRef.current;
    if (!hidden) return;

    // Only run objects whose keyframes have changed since their last
    // successful propagation. Clean objects keep their existing results.
    const ready = objectsRef.current.filter((o) => o.kfA && o.kfB);
    const dirty = ready.filter((o) => o.dirty);
    const skipped = ready.length - dirty.length;

    if (dirty.length === 0) {
      log(`nothing to propagate — ${ready.length} object(s) all clean`);
      return;
    }
    if (skipped > 0) log(`skipping ${skipped} clean object(s)`);

    if (preEncodeAbortRef.current) preEncodeAbortRef.current.aborted = true;
    setStatus("running");
    setProgress({ done: 0, total: 0 });
    setTiming(null);

    let lastFrameStart = performance.now();
    try {
      const provider = await ensureProvider();
      const tAll = performance.now();
      let opCount = 0;

      await propagateMulti(provider, {
        videoEl: hidden,
        frameRate: fps,
        videoKey,
        objects: dirty.map((o) => ({
          objectId: o.id,
          keyframeA: { frameIdx: o.kfA!.frameIdx, points: o.kfA!.points },
          keyframeB: { frameIdx: o.kfB!.frameIdx, points: o.kfB!.points },
          strategy,
        })),
        onFrame: (frameIdx, objectId, result) => {
          const now = performance.now();
          const dt = now - lastFrameStart;
          lastFrameStart = now;
          opCount++;
          setObjects((prev) => prev.map((o) => {
            if (o.id !== objectId) return o;
            const results = new Map(o.results);
            results.set(frameIdx, result);
            return { ...o, results };
          }));
          setTiming((prev) => ({
            totalMs: (prev?.totalMs ?? 0) + dt,
            count: (prev?.count ?? 0) + 1,
          }));
        },
        onProgress: (done, total) => setProgress({ done, total }),
      });

      // Mark the objects we just propagated clean.
      const dirtyIds = new Set(dirty.map((o) => o.id));
      setObjects((prev) => prev.map((o) => dirtyIds.has(o.id) ? { ...o, dirty: false } : o));

      const totalDt = performance.now() - tAll;
      log(`propagation done: ${opCount} ops across ${dirty.length} dirty object(s) in ${totalDt.toFixed(0)}ms`);
      setStatus("ready");
    } catch (err) {
      log(`❌ ${err instanceof Error ? err.message : String(err)}`);
      setStatus("failure");
    }
  }, [fps, videoKey, ensureProvider, log, strategy]);

  if (!isVideo || !videoSrc) return null;

  const addObject = () => {
    setObjects((prev) => {
      const next = [...prev, makeObject(prev.length)];
      setActiveId(next[next.length - 1].id);
      return next;
    });
  };

  const removeObject = (id: string) => {
    setObjects((prev) => {
      const next = prev.filter((o) => o.id !== id);
      if (id === activeId) setActiveId(next[0]?.id ?? "");
      return next;
    });
  };

  return (
    <>
      <video ref={hiddenVideoRef} src={videoSrc} preload="auto" muted playsInline crossOrigin="anonymous" style={{ display: "none" }} />
      <video ref={keyframeVideoRef} src={videoSrc} preload="auto" muted playsInline crossOrigin="anonymous" style={{ display: "none" }} />
      <canvas ref={overlayRef} />

      <div style={{
        position: "fixed", bottom: 8, right: 8, width: 340,
        background: "rgba(20,20,20,0.95)", color: "#ddd",
        border: "1px solid #444", borderRadius: 6, padding: 10,
        fontFamily: "monospace", fontSize: 11, zIndex: 9999,
      }}>
        <div style={{ fontWeight: "bold", marginBottom: 6 }}>
          Video Propagate (iter 3) — {status} · frame {currentFrame}
        </div>

        <div style={{ marginBottom: 8, borderTop: "1px dashed #444", paddingTop: 6 }}>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
            <span style={{ flex: 1, color: "#aaa" }}>objects:</span>
            <button onClick={addObject} style={btnStyle}>+ add</button>
          </div>
          {objects.length === 0 && (
            <div style={{ color: "#777", fontSize: 10, padding: "4px 0" }}>
              no objects — click + add to begin
            </div>
          )}
          {objects.map((o) => (
            <ObjectRow
              key={o.id}
              obj={o}
              active={o.id === activeId}
              onSelect={() => setActiveId(o.id)}
              onRemove={() => removeObject(o.id)}
            />
          ))}
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
          <button disabled={!!pendingFor || !activeId} onClick={() => setPendingFor("A")} style={btnStyle}>
            {pendingFor === "A" ? "click looker…" : "Set A"}
          </button>
          <button disabled={!!pendingFor || !activeId} onClick={() => setPendingFor("B")} style={btnStyle}>
            {pendingFor === "B" ? "click looker…" : "Set B"}
          </button>
          <button
            disabled={
              status === "running" ||
              !objects.some((o) => o.kfA && o.kfB && o.dirty)
            }
            onClick={onPropagate}
            style={{ ...btnStyle, marginLeft: "auto" }}
          >
            Propagate
          </button>
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, fontSize: 10, color: "#aaa" }}>
          <input
            type="checkbox"
            checked={eagerEnabled}
            onChange={(e) => setEagerEnabled(e.target.checked)}
          />
          eager pre-encode (cap {preEncodeCap})
        </label>

        {eagerEnabled && (
          <div style={{ marginBottom: 6, color: "#7af", fontSize: 10 }}>
            pre-encoded: {preEncoded} / {preEncodeCap}
          </div>
        )}

        {storage && (
          <div style={{ marginBottom: 6, fontSize: 10, color: "#aaa", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ flex: 1 }}>
              cache: {formatBytes(storage.usage)} / {formatBytes(storage.quota)}
              {" "}({((storage.usage / storage.quota) * 100).toFixed(1)}%) ·{" "}
              <span style={{ color: storage.persistent ? "#9c9" : "#fc6" }}>
                {storage.persistent ? "persistent" : "best-effort"}
              </span>
            </span>
            {!storage.persistent && (
              <button
                onClick={requestPersistent}
                style={{ ...btnStyle, padding: "1px 5px", fontSize: 10 }}
              >
                persist
              </button>
            )}
            <button
              onClick={clearEmbeddingCache}
              style={{ ...btnStyle, padding: "1px 5px", fontSize: 10 }}
            >
              clear
            </button>
          </div>
        )}

        {progress && (
          <div style={{ marginBottom: 6 }}>
            propagate: {progress.done}/{progress.total} frames
          </div>
        )}

        {timing && (
          <div style={{ marginBottom: 6, color: "#9c9", fontSize: 10 }}>
            {timing.count} infer · total {timing.totalMs.toFixed(0)}ms · avg{" "}
            {(timing.totalMs / timing.count).toFixed(0)}ms/frame
          </div>
        )}

        <div style={{
          marginTop: 8, maxHeight: 100, overflowY: "auto",
          fontSize: 10, color: "#888",
        }}>
          {logs.slice(-12).map((l, i) => <div key={i}>{l}</div>)}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Object list row
// ---------------------------------------------------------------------------

function ObjectRow({
  obj, active, onSelect, onRemove,
}: {
  obj: PropObject;
  active: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const [r, g, b] = obj.color;
  return (
    <div
      onClick={onSelect}
      style={{
        display: "flex", alignItems: "center", gap: 6, padding: "3px 4px",
        background: active ? "rgba(255,255,255,0.08)" : "transparent",
        border: active ? "1px solid #777" : "1px solid transparent",
        borderRadius: 3, marginBottom: 2, cursor: "pointer",
      }}
    >
      <span style={{
        width: 10, height: 10, borderRadius: 2,
        background: `rgb(${r},${g},${b})`, flex: "0 0 auto",
      }} />
      <span style={{ flex: 1, color: active ? "#fff" : "#ccc", fontSize: 10 }}>
        {obj.id.slice(0, 6)}{" "}
        <span style={{ color: "#888" }}>
          {obj.kfA ? `A=${obj.kfA.frameIdx}` : "A=?"}
          {" "}
          {obj.kfB ? `B=${obj.kfB.frameIdx}` : "B=?"}
        </span>
        {obj.dirty && obj.kfA && obj.kfB && (
          <span style={{ color: "#fa3", marginLeft: 4 }}>•</span>
        )}
      </span>
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        style={{ ...btnStyle, padding: "1px 5px", fontSize: 10 }}
      >
        ×
      </button>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  background: "#333", color: "#ddd", border: "1px solid #555",
  borderRadius: 3, padding: "4px 8px", fontFamily: "inherit",
  fontSize: 11, cursor: "pointer",
};
