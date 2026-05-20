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
  type PropagationDirection,
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

/** "auto" infers from kfA/kfB: A-only → forward, B-only → backward, both → bidirectional. */
type DirectionChoice = "auto" | "forward" | "backward" | "bidirectional";

interface PropObject {
  id: string;
  color: [number, number, number];
  kfA: KeyframeCapture | null;
  kfB: KeyframeCapture | null;
  results: Map<number, InferenceResult>;
  /** True if kfA/kfB has changed since the last successful propagation. */
  dirty: boolean;
  /** User-overridable direction; "auto" picks based on which keyframes exist. */
  direction: DirectionChoice;
  /** When true, this object's mask isn't drawn over the video. */
  hidden: boolean;
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
    direction: "auto",
    hidden: false,
  };
}

function hasMask(kf: KeyframeCapture | null): boolean {
  return !!kf?.points && kf.points.length > 0;
}

/**
 * Resolve a user direction choice + which keyframes have MASKS → the
 * direction propagation will actually use. Frame-only markers don't
 * count as seeds — they only serve as range boundaries.
 */
function effectiveDirection(o: PropObject): PropagationDirection | null {
  const maskA = hasMask(o.kfA);
  const maskB = hasMask(o.kfB);
  if (!maskA && !maskB) return null;

  if (o.direction === "auto") {
    if (maskA && maskB) return "bidirectional";
    if (maskA) return "forward";
    return "backward";
  }
  if (o.direction === "bidirectional" && (!maskA || !maskB)) {
    // Override impossible — fall back to whichever side has a mask.
    return maskA ? "forward" : "backward";
  }
  if (o.direction === "forward" && !maskA) return null;
  if (o.direction === "backward" && !maskB) return null;
  return o.direction;
}

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

function findLookerCanvas(): HTMLCanvasElement | null {
  return document.querySelector<HTMLCanvasElement>(
    '[data-cy="modal-looker-container"] canvas',
  );
}

function findLookerContainer(): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    '[data-cy="modal-looker-container"]',
  );
}

function findLookerPlayButton(): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    '[data-cy="modal-looker-container"] [data-cy="looker-video-play-button"]',
  );
}

function findLookerInnerVideo(): HTMLVideoElement | null {
  // The actual <video> element inside the looker — used for read-only
  // play-state polling (we DO NOT write currentTime here; that's owned
  // by the looker's own render loop, see seekToFrame).
  return document.querySelector<HTMLVideoElement>(
    '[data-cy="modal-looker-container"] video',
  );
}

function findLookerRoot(): HTMLElement | null {
  // The looker root element INSIDE THE MODAL (data-cy="looker" without
  // scoping would match a grid thumbnail's looker since those are still
  // in the DOM behind the open modal). The looker root is the one wired
  // with mousemove/mouseup handlers that own seeking; see
  // elements/video.ts:789-796 + seekFn at :799.
  return document.querySelector<HTMLElement>(
    '[data-cy="modal-looker-container"] [data-cy="looker"]',
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

/** Format a frame index as M:SS:FF (minutes:seconds:frames). */
function formatTimecode(frame: number, fps: number): string {
  const f = Math.max(0, Math.floor(frame));
  const totalSec = Math.floor(f / fps);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  const sub = f % Math.max(1, Math.floor(fps));
  return `${min}:${String(sec).padStart(2, "0")}:${String(sub).padStart(2, "0")}`;
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

/** Paint a bbox outline + tint at the given bbox in canvas pixels. */
function paintBbox(
  ctx: CanvasRenderingContext2D,
  result: InferenceResult,
  rgb: [number, number, number],
  canvasW: number,
  canvasH: number,
) {
  const [r, g, b] = rgb;
  const bx = result.bbox.x * canvasW;
  const by = result.bbox.y * canvasH;
  const bw = result.bbox.w * canvasW;
  const bh = result.bbox.h * canvasH;
  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = `rgb(${r},${g},${b})`;
  ctx.strokeRect(bx, by, bw, bh);
  ctx.restore();
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
  const [totalFrames, setTotalFrames] = useState<number>(0);
  const [eagerEnabled, setEagerEnabled] = useState<boolean>(true);
  const [preEncoded, setPreEncoded] = useState<number>(0);
  const [displayMode, setDisplayMode] = useState<"mask" | "bbox">("mask");
  // Separate from `status` (which the provider also writes — "encoding" /
  // "ready" — and would flicker the Stop button if we keyed off it).
  const [isPropagating, setIsPropagating] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [strategy, setStrategy] = useState<PropagationStrategy>("centroid-5");
  const [storage, setStorage] = useState<{
    usage: number;
    quota: number;
    persistent: boolean;
  } | null>(null);

  const preEncodeCap = PRE_ENCODE_CAP_DEFAULT;

  const hiddenVideoRef = useRef<HTMLVideoElement | null>(null);
  const keyframeVideoRef = useRef<HTMLVideoElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const swimlanesRef = useRef<HTMLDivElement | null>(null);
  const providerRef = useRef<BrowserAnnotationProvider | null>(null);
  const preEncodeAbortRef = useRef<{ aborted: boolean } | null>(null);
  const propagateAbortRef = useRef<{ aborted: boolean }>({ aborted: false });
  const preEncodedRef = useRef<number>(0);
  preEncodedRef.current = preEncoded;
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
    setTotalFrames(0);
    setPreEncoded(0);
  }, [videoSrc]);

  // Pull total frame count from EITHER the looker's <video> (preferred,
  // since the looker has it ready by the time the user can see the
  // sample) or our hidden <video>. We RAF-poll so we catch the moment
  // duration becomes available — relying purely on loadedmetadata
  // missed the race where the listener attached after the metadata
  // had already loaded.
  useEffect(() => {
    if (!isVideo) return;
    let raf = 0;
    let last = 0;
    const tick = () => {
      const candidates: (HTMLVideoElement | null)[] = [
        findLookerInnerVideo(),
        hiddenVideoRef.current,
      ];
      for (const v of candidates) {
        if (v && v.duration > 0 && isFinite(v.duration)) {
          const n = Math.max(1, Math.floor(v.duration * fps));
          if (n !== last) {
            last = n;
            setTotalFrames(n);
          }
          break;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isVideo, fps, videoSrc]);

  // Same idea but synchronous — read live for onPropagate so even if
  // the polling RAF hasn't ticked yet, the propagation knows the real
  // total. This is what prevents "total=0 → start+999" runaway runs.
  const getLiveTotalFrames = useCallback((): number => {
    const candidates: (HTMLVideoElement | null)[] = [
      findLookerInnerVideo(),
      hiddenVideoRef.current,
    ];
    for (const v of candidates) {
      if (v && v.duration > 0 && isFinite(v.duration)) {
        return Math.max(1, Math.floor(v.duration * fps));
      }
    }
    return totalFrames;
  }, [fps, totalFrames]);

  // Reflect the looker's actual play state on our button. Two sources:
  //   1. The video element's play/pause events for video lookers (most
  //      reliable; fires for every cause — looker shortcuts, autoplay,
  //      buffering, our own button).
  //   2. A document-level keydown listener for spacebar — handles the
  //      case where the looker's <video> isn't accessible (imavid) and
  //      catches the toggle even when focus is outside the looker.
  useEffect(() => {
    if (!isVideo) return;
    let attached: HTMLVideoElement | null = null;
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    const tryAttach = () => {
      const v = findLookerInnerVideo();
      if (v && v !== attached) {
        if (attached) {
          attached.removeEventListener("play", onPlay);
          attached.removeEventListener("pause", onPause);
        }
        attached = v;
        attached.addEventListener("play", onPlay);
        attached.addEventListener("pause", onPause);
        setIsPlaying(!attached.paused);
      }
    };
    tryAttach();
    const interval = setInterval(tryAttach, 500);

    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" && e.key !== " ") return;
      const target = e.target as HTMLElement | null;
      // Don't hijack typing in text inputs / textareas / contenteditable.
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) {
          return;
        }
      }
      // Verify against the video right after the looker processes the
      // shortcut, falling back to optimistic toggle if no video.
      requestAnimationFrame(() => {
        const v = findLookerInnerVideo();
        if (v) setIsPlaying(!v.paused);
        else setIsPlaying((prev) => !prev);
      });
    };
    document.addEventListener("keydown", onKey);

    return () => {
      clearInterval(interval);
      document.removeEventListener("keydown", onKey);
      if (attached) {
        attached.removeEventListener("play", onPlay);
        attached.removeEventListener("pause", onPause);
      }
    };
  }, [isVideo, videoSrc]);

  // Click the looker's own play button (it toggles between play and
  // pause). The looker drives the actual playback; we also flip our
  // local state immediately so the button label updates instantly even
  // if the polling RAF hasn't caught up or the looker has no <video>
  // (imavid). Subsequent polls will correct any drift.
  const togglePlay = useCallback(() => {
    const btn = findLookerPlayButton();
    if (!btn) return;
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    setIsPlaying((prev) => !prev);
  }, []);

  // Seek the looker by simulating the user dragging the native seek bar.
  // The looker's seekFn (elements/video.ts:799) maps the mouse clientX
  // against the looker root's bounding rect to compute the target frame:
  //   frameNumber = round(((clientX + 6 - rect.left) / rect.width) * frameCount)
  // To target our frame `f` (0-indexed) we solve that backward.
  const seekToFrame = useCallback((frame: number) => {
    if (totalFrames < 1) return;
    const looker = findLookerRoot();
    const sb = findLookerSeekBar();
    if (!looker || !sb) return;
    const f = Math.max(0, Math.min(totalFrames - 1, Math.round(frame)));
    const rect = looker.getBoundingClientRect();
    // Looker uses 1-indexed frame numbers internally.
    const clientX = rect.left + ((f + 1) / totalFrames) * rect.width - 6;
    const clientY = rect.top + rect.height / 2;
    const opts: MouseEventInit = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX,
      clientY,
      button: 0,
      buttons: 1,
    };
    sb.dispatchEvent(new MouseEvent("mousedown", opts));
    looker.dispatchEvent(new MouseEvent("mousemove", opts));
    looker.dispatchEvent(new MouseEvent("mouseup", opts));
  }, [totalFrames]);

  // Pin the swimlane panel right under the painted image rect, full
  // container width. We can't anchor to the container's bottom because
  // the modal-looker-container takes most of the viewport and the
  // panel would end up below the visible area. We can't anchor to the
  // controls top either (they're position:absolute bottom:0 inside the
  // looker, ALWAYS at container.bottom). So we sit in the bottom
  // letterbox region below the image; the tracks list inside the panel
  // is capped + scrollable so we never grow tall enough to bury the
  // looker controls.
  useEffect(() => {
    if (!isVideo) return;
    let raf = 0;
    const tick = () => {
      const lookerCanvas = findLookerCanvas();
      const container = findLookerContainer();
      const panel = swimlanesRef.current;
      if (panel && lookerCanvas && container) {
        const imageRect = getImageRect(lookerCanvas, aspectRatio);
        const containerRect = container.getBoundingClientRect();
        Object.assign(panel.style, {
          position: "fixed",
          left: `${containerRect.left}px`,
          top: `${imageRect.top + imageRect.h + 8}px`,
          width: `${containerRect.width}px`,
          zIndex: "9998",
          pointerEvents: "auto",
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isVideo, aspectRatio]);

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
  // across all objects, so this work pays off per-object. Resumes from
  // wherever the last run left off (preEncodedRef) instead of restarting
  // from 0. The effect re-runs after a propagation ends (isPropagating
  // dep) so we don't leave the encoder idle once Stop / done land.
  useEffect(() => {
    if (!isVideo || !eagerEnabled || !videoSrc) return;
    if (isPropagating) return; // pause encoding while propagation runs
    const hidden = hiddenVideoRef.current;
    if (!hidden) return;

    const abort = { aborted: false };
    preEncodeAbortRef.current = abort;

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
        const start = Math.max(0, Math.min(preEncodedRef.current, cap));
        if (start >= cap) return; // already done
        log(`eager pre-encode: resuming from frame ${start} → ${cap}`);

        const provider = await ensureProvider();
        for (let f = start; f < cap; f++) {
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
  }, [isVideo, eagerEnabled, videoSrc, fps, preEncodeCap, videoKey, ensureProvider, log, isPropagating]);

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
      // Use the live video time, not the React state, so a click that
      // lands right after a scrub uses the actually-displayed frame.
      const lookerVid = findLookerInnerVideo();
      const frameIdx =
        lookerVid && lookerVid.duration > 0
          ? Math.floor(lookerVid.currentTime * fps)
          : currentFrame;
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

  // Mask overlay — split into two concerns to keep mask paint perfectly
  // in sync with the video canvas:
  //
  //  (a) RAF loop: sizes/positions the overlay to track the looker's
  //      rect, and paints with the current-frame mask. This handles
  //      the steady state and any non-frame-driven repaints (object
  //      list changes, displayMode toggle, etc.).
  //
  //  (b) requestVideoFrameCallback (when supported): paints the overlay
  //      using metadata.mediaTime exactly when the browser presents a
  //      new video frame. This eliminates the "mask leads canvas"
  //      artifact during scrubs — both surfaces use the SAME mediaTime
  //      to determine which frame to render.
  const paintOverlay = useCallback((frame: number) => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext("2d")!;
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    for (const obj of objectsRef.current) {
      if (obj.hidden) continue;
      const result = obj.results.get(frame);
      if (!result) continue;
      if (displayMode === "bbox") {
        paintBbox(ctx, result, obj.color, overlay.width, overlay.height);
      } else {
        paintMask(ctx, result, obj.color, overlay.width, overlay.height);
      }
    }
  }, [displayMode]);

  // (a) Geometry + steady-state paint
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

      const liveVideo = findLookerInnerVideo();
      let liveFrame = currentFrame;
      if (liveVideo && liveVideo.duration > 0) {
        liveFrame = Math.floor(liveVideo.currentTime * fps);
      }
      paintOverlay(liveFrame);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [isVideo, aspectRatio, displayMode, fps, currentFrame, paintOverlay]);

  // (b) Frame-locked paint via requestVideoFrameCallback.
  // The browser invokes our callback exactly when a new frame is
  // about to be presented — the same signal the looker canvas paints
  // from. metadata.mediaTime is the presented frame's video timestamp,
  // so flooring it by fps gives us the canvas's actual displayed
  // frame, never a seek target the canvas hasn't reached yet.
  useEffect(() => {
    if (!isVideo) return;
    let cancelled = false;
    let attached: HTMLVideoElement | null = null;
    let handle = 0;

    const onFrame = (
      _now: number,
      metadata: { mediaTime: number },
    ) => {
      if (cancelled || !attached) return;
      const frame = Math.floor(metadata.mediaTime * fps);
      paintOverlay(frame);
      handle = (attached as any).requestVideoFrameCallback?.(onFrame) ?? 0;
    };

    const tryAttach = () => {
      const v = findLookerInnerVideo();
      if (!v || v === attached) return;
      if (typeof (v as any).requestVideoFrameCallback !== "function") return;
      attached = v;
      handle = (v as any).requestVideoFrameCallback(onFrame);
    };
    tryAttach();
    const interval = setInterval(tryAttach, 500);

    return () => {
      cancelled = true;
      clearInterval(interval);
      if (attached && (attached as any).cancelVideoFrameCallback) {
        (attached as any).cancelVideoFrameCallback(handle);
      }
    };
  }, [isVideo, videoSrc, fps, paintOverlay]);

  const onPropagate = useCallback(async () => {
    const hidden = hiddenVideoRef.current;
    if (!hidden) return;

    // Only run objects whose keyframes have changed since their last
    // successful propagation. Clean objects keep their existing results.
    // "Ready" now means the object has AT LEAST one keyframe WITH A
    // MASK (a frame-only marker isn't a seed). The exact direction is
    // resolved via effectiveDirection() based on which masks exist
    // and any user override.
    const ready = objectsRef.current.filter((o) => effectiveDirection(o) !== null);
    const dirty = ready.filter((o) => o.dirty);
    const skipped = ready.length - dirty.length;

    if (dirty.length === 0) {
      log(`nothing to propagate — ${ready.length} object(s) all clean`);
      return;
    }
    if (skipped > 0) log(`skipping ${skipped} clean object(s)`);

    // Concrete per-object plan, so we can read the log if a run looks wrong.
    const liveTotal = getLiveTotalFrames();
    for (const o of dirty) {
      const dir = effectiveDirection(o);
      const aStr = o.kfA ? `A=${o.kfA.frameIdx}${hasMask(o.kfA) ? "" : "·"}` : "A=?";
      const bStr = o.kfB ? `B=${o.kfB.frameIdx}${hasMask(o.kfB) ? "" : "·"}` : "B=?";
      log(`track ${o.id.slice(0, 4)}: ${dir} · ${aStr} ${bStr} · total=${liveTotal}`);
    }

    if (preEncodeAbortRef.current) preEncodeAbortRef.current.aborted = true;
    propagateAbortRef.current.aborted = false;
    setStatus("running");
    setIsPropagating(true);
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
          keyframeA: o.kfA
            ? { frameIdx: o.kfA.frameIdx, points: o.kfA.points }
            : undefined,
          keyframeB: o.kfB
            ? { frameIdx: o.kfB.frameIdx, points: o.kfB.points }
            : undefined,
          strategy,
          direction: effectiveDirection(o) ?? "forward",
          totalFrames: liveTotal,
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
        shouldAbort: () => propagateAbortRef.current.aborted,
        // Resume from wherever a previous (possibly Stopped) run left off:
        // any frames already in obj.results are reused rather than redone.
        existingResults: new Map(
          dirty.map((o) => [o.id, new Map(o.results)]),
        ),
      });

      // Only mark objects clean if the run actually completed. If the
      // user hit Stop, leave them dirty so the Track button stays enabled
      // for the rest of the work.
      const aborted = propagateAbortRef.current.aborted;
      if (!aborted) {
        const dirtyIds = new Set(dirty.map((o) => o.id));
        setObjects((prev) =>
          prev.map((o) => dirtyIds.has(o.id) ? { ...o, dirty: false } : o)
        );
      }

      const totalDt = performance.now() - tAll;
      log(
        aborted
          ? `propagation stopped after ${opCount} ops in ${totalDt.toFixed(0)}ms`
          : `propagation done: ${opCount} ops across ${dirty.length} dirty object(s) in ${totalDt.toFixed(0)}ms`
      );
      setStatus("ready");
    } catch (err) {
      log(`❌ ${err instanceof Error ? err.message : String(err)}`);
      setStatus("failure");
    } finally {
      setIsPropagating(false);
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
              isPropagating ||
              !objects.some((o) => effectiveDirection(o) !== null && o.dirty)
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

      {/* Swimlanes — supplemental polished panel pinned under the video.
          Self-contained: has its own Add / Set A / Set B / Propagate / Remove
          so it doesn't depend on the right-side panel being present. */}
      <style>{SWIMLANE_KEYFRAMES}</style>
      <div ref={swimlanesRef} className="vp-swim-root">
        {/* Transport / header bar.
            Layout, matching the design's bottom-panel transport:
              LEFT  : ▶ play · [✦ Track / ■ Stop] · [+ Add]
              MID   : timecode  ·  frame N/total  ·  tracking N/M (when running)
              RIGHT : [MASK|BOX]  Strategy ▾ */}
        <div className="vp-swim-header">
          <div className="vp-swim-action-group">
            <button
              className="vp-swim-playbtn"
              onClick={(e) => { e.stopPropagation(); togglePlay(); }}
              title={isPlaying ? "Pause" : "Play"}
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? "❙❙" : "▶"}
            </button>
            {isPropagating ? (
              <button
                className="vp-swim-btn vp-swim-btn-stop"
                onClick={(e) => {
                  e.stopPropagation();
                  propagateAbortRef.current.aborted = true;
                }}
                title="Stop propagation"
              >
                ■ Stop
              </button>
            ) : (
              <button
                className="vp-swim-btn vp-swim-btn-primary"
                disabled={!objects.some((o) => effectiveDirection(o) !== null && o.dirty)}
                onClick={(e) => { e.stopPropagation(); onPropagate(); }}
                title="Run object tracking on all dirty tracks"
              >
                ✦ Track
              </button>
            )}
            <button
              className="vp-swim-btn"
              onClick={(e) => { e.stopPropagation(); addObject(); }}
              title="Add a new object track"
            >
              + Add
            </button>
          </div>

          <div className="vp-swim-status-group">
            <span className="vp-swim-title">
              <span className="vp-swim-title-dot" />
              Object tracks
            </span>
            <span className="vp-swim-tc">
              <span className="vp-swim-tc-strong">
                {formatTimecode(currentFrame, fps)}
              </span>
              <span className="vp-swim-tc-dim">
                {" / "}{formatTimecode(Math.max(0, totalFrames - 1), fps)}
              </span>
              <span className="vp-swim-tc-divider">·</span>
              <span className="vp-swim-tc-dim">frame</span>{" "}
              <span className="vp-swim-tc-strong">{currentFrame}</span>
              {totalFrames > 0 && (
                <span className="vp-swim-tc-dim">/{totalFrames}</span>
              )}
              {isPropagating && progress && (
                <>
                  <span className="vp-swim-tc-divider">·</span>
                  <span className="vp-swim-tc-pulse">
                    tracking {progress.done}/{progress.total}
                  </span>
                </>
              )}
            </span>
          </div>

          <div className="vp-swim-settings-group">
            <div className="vp-swim-seg" role="group" aria-label="Display mode">
              <button
                className={"vp-swim-seg-btn" + (displayMode === "mask" ? " active" : "")}
                onClick={(e) => { e.stopPropagation(); setDisplayMode("mask"); }}
                title="Show masks"
              >
                Mask
              </button>
              <button
                className={"vp-swim-seg-btn" + (displayMode === "bbox" ? " active" : "")}
                onClick={(e) => { e.stopPropagation(); setDisplayMode("bbox"); }}
                title="Show bounding boxes"
              >
                Box
              </button>
            </div>
            <label className="vp-swim-select">
              <span className="vp-swim-select-label">Strategy</span>
              <select
                value={strategy}
                onChange={(e) => setStrategy(e.target.value as PropagationStrategy)}
                onClick={(e) => e.stopPropagation()}
              >
                <option value="centroid-5">Centroid · 5 pts</option>
                <option value="centroid-3">Centroid · 3 pts</option>
                <option value="centroid-1">Centroid · 1 pt</option>
                <option value="lerp">Lerp (A↔B)</option>
              </select>
            </label>
          </div>
        </div>

        {/* Body: label column | timeline column */}
        <div className="vp-swim-body">
          <div className="vp-swim-labels">
            <div className="vp-swim-ruler-spacer" />
            {objects.length === 0 && (
              <div className="vp-swim-empty">
                No objects yet — click <strong>+ Add</strong>
              </div>
            )}
            {objects.map((o, idx) => (
              <LabelCell
                key={o.id}
                obj={o}
                index={idx}
                active={o.id === activeId}
                pendingFor={o.id === activeId ? pendingFor : null}
                onSelect={() => setActiveId(o.id)}
                onPickKeyframe={(which) => {
                  setActiveId(o.id);
                  // Read the LIVE playhead from the looker's <video> —
                  // React state's `currentFrame` lags by one RAF tick
                  // after a scrub, which made clicks landing right
                  // after a scrub pin the keyframe at the pre-scrub
                  // frame. Fall back to state only if the video isn't
                  // accessible (imavid).
                  const v = findLookerInnerVideo();
                  const liveFrame =
                    v && v.duration > 0
                      ? Math.floor(v.currentTime * fps)
                      : currentFrame;

                  // Click-on-Set-X behavior:
                  //   - PENDING X already → cancel pending (frame stays).
                  //   - X already at the same frame as playhead → no
                  //     churn; just enter pending so the next video
                  //     click attaches a mask.
                  //   - Else → pin X at the live frame.
                  const isToggleOff = pendingFor === which && o.id === activeId;
                  if (isToggleOff) {
                    setPendingFor(null);
                    return;
                  }
                  setObjects((prev) =>
                    prev.map((p) => {
                      if (p.id !== o.id) return p;
                      const existing = which === "A" ? p.kfA : p.kfB;
                      const sameFrame = existing?.frameIdx === liveFrame;
                      const cap: KeyframeCapture = sameFrame && existing
                        ? existing
                        : { frameIdx: liveFrame };
                      return which === "A"
                        ? { ...p, kfA: cap, dirty: !sameFrame || p.dirty }
                        : { ...p, kfB: cap, dirty: !sameFrame || p.dirty };
                    }),
                  );
                  setPendingFor(which);
                }}
                onSetDirection={(dir) => {
                  setObjects((prev) =>
                    prev.map((p) =>
                      p.id === o.id ? { ...p, direction: dir, dirty: true } : p,
                    ),
                  );
                }}
                onToggleHidden={() => {
                  setObjects((prev) =>
                    prev.map((p) =>
                      p.id === o.id ? { ...p, hidden: !p.hidden } : p,
                    ),
                  );
                }}
                onRemove={() => removeObject(o.id)}
              />
            ))}
          </div>
          <div className="vp-swim-timeline">
            <FrameRuler totalFrames={totalFrames} fps={fps} onSeek={seekToFrame} />
            <div className="vp-swim-tracks">
              {objects.map((o) => (
                <TrackCell
                  key={o.id}
                  obj={o}
                  active={o.id === activeId}
                  totalFrames={totalFrames}
                  preEncoded={preEncoded}
                  isPropagating={isPropagating}
                  onSelect={() => setActiveId(o.id)}
                  onSeek={seekToFrame}
                />
              ))}
            </div>
            {totalFrames > 0 && (
              <div
                className="vp-swim-playhead"
                style={{
                  left: `${(currentFrame / Math.max(1, totalFrames - 1)) * 100}%`,
                }}
              />
            )}
          </div>
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

// ---------------------------------------------------------------------------
// Swimlanes (supplemental panel pinned under the video)
// ---------------------------------------------------------------------------

// Row heights are constants because label / track cells need to align
// across the two-column grid layout.
const VP_LABEL_COL = 240;
const VP_RULER_H = 22;
const VP_ROW_H = 36;

const SWIMLANE_KEYFRAMES = `
@keyframes vp-swim-pulse {
  0%   { opacity: 0.40; }
  50%  { opacity: 0.95; }
  100% { opacity: 0.40; }
}
@keyframes vp-swim-shimmer {
  0%   { background-position: 0px 0; }
  100% { background-position: 32px 0; }
}
@keyframes vp-swim-pop {
  0%   { transform: scale(0.55); opacity: 0; }
  60%  { transform: scale(1.18); opacity: 1; }
  100% { transform: scale(1.0);  opacity: 1; }
}
.vp-swim-root {
  font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
  color: #e5e7eb;
  background: linear-gradient(180deg, rgba(18,20,28,0.92), rgba(12,14,20,0.92));
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 10px;
  padding: 10px 12px 12px 12px;
  box-shadow: 0 12px 32px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.02) inset;
  backdrop-filter: blur(6px);
}
.vp-swim-header {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 14px;
  margin-bottom: 8px;
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.vp-swim-action-group {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.vp-swim-status-group {
  display: inline-flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}
.vp-swim-settings-group {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  justify-self: end;
}
.vp-swim-dirbtn {
  font: inherit;
  font-size: 11px;
  font-weight: 700;
  color: #cbd5e1;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.10);
  border-radius: 5px;
  padding: 2px 7px;
  cursor: pointer;
  text-transform: none;
  letter-spacing: 0;
  transition: background 120ms ease, border-color 120ms ease;
  min-width: 32px;
}
.vp-swim-dirbtn:hover {
  background: rgba(255,255,255,0.08);
  border-color: rgba(255,255,255,0.18);
}
.vp-swim-dirbtn.disabled-state {
  color: #475569;
  border-color: rgba(255,255,255,0.05);
}
.vp-swim-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #cbd5e1;
  font-weight: 600;
}
.vp-swim-title-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: #38bdf8;
  box-shadow: 0 0 8px #38bdf8;
}
.vp-swim-empty {
  font-size: 11px; color: #64748b; padding: 8px 4px;
}

/* Transport / header */
.vp-swim-spacer { flex: 1 1 auto; }

.vp-swim-select {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  text-transform: none;
  color: #94a3b8;
}
.vp-swim-select-label {
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-weight: 600;
  color: #94a3b8;
}
.vp-swim-select select {
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  color: #e5e7eb;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.10);
  border-radius: 5px;
  padding: 3px 6px;
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
  background-image: linear-gradient(45deg, transparent 50%, #94a3b8 50%),
                    linear-gradient(135deg, #94a3b8 50%, transparent 50%);
  background-position: calc(100% - 12px) 50%, calc(100% - 8px) 50%;
  background-size: 4px 4px;
  background-repeat: no-repeat;
  padding-right: 20px;
}
.vp-swim-select select:hover {
  background-color: rgba(255,255,255,0.09);
  border-color: rgba(255,255,255,0.16);
}

.vp-swim-playbtn {
  font: inherit;
  font-size: 10px;
  line-height: 1;
  color: #e5e7eb;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.10);
  border-radius: 5px;
  width: 26px;
  height: 22px;
  padding: 0;
  margin-left: 10px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 120ms ease, border-color 120ms ease;
}
.vp-swim-playbtn:hover {
  background: rgba(255,255,255,0.10);
  border-color: rgba(255,255,255,0.18);
}
.vp-swim-tc {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  font-size: 11px;
  letter-spacing: 0.02em;
  text-transform: none;
  font-variant-numeric: tabular-nums;
  color: #94a3b8;
  margin-left: 14px;
}
.vp-swim-tc-strong { color: #e5e7eb; font-weight: 600; }
.vp-swim-tc-dim    { color: #94a3b8; }
.vp-swim-tc-divider { color: #475569; margin: 0 2px; }
.vp-swim-tc-pulse {
  color: #67e8f9;
  animation: vp-swim-pulse 1.1s ease-in-out infinite;
}
.vp-swim-zoom {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  text-transform: none;
  color: #94a3b8;
  font-variant-numeric: tabular-nums;
  margin-left: 8px;
}
.vp-swim-zoombtn {
  font: inherit;
  font-size: 11px;
  color: #94a3b8;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 4px;
  width: 20px; height: 20px;
  padding: 0;
  cursor: pointer;
}
.vp-swim-zoombtn:disabled { opacity: 0.4; cursor: not-allowed; }
.vp-swim-zoom-val {
  min-width: 36px; text-align: center; color: #cbd5e1;
}

/* Body: two-column grid (labels | timeline).
   Capped height + overflow so an unbounded number of tracks doesn't
   push the panel down over the looker controls. */
.vp-swim-body {
  display: grid;
  grid-template-columns: ${VP_LABEL_COL}px 1fr;
  position: relative;
  max-height: 280px;
  overflow-y: auto;
}
.vp-swim-body::-webkit-scrollbar { width: 8px; }
.vp-swim-body::-webkit-scrollbar-thumb {
  background: rgba(255,255,255,0.08);
  border-radius: 4px;
}
.vp-swim-body::-webkit-scrollbar-thumb:hover {
  background: rgba(255,255,255,0.16);
}

/* Left label column */
.vp-swim-labels {
  display: flex;
  flex-direction: column;
  border-right: 1px solid rgba(255,255,255,0.05);
}
.vp-swim-ruler-spacer {
  height: ${VP_RULER_H}px;
  flex: 0 0 ${VP_RULER_H}px;
}

/* Per-object label row (in the left column) */
.vp-swim-label-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  height: ${VP_ROW_H}px;
  padding: 0 10px 0 8px;
  cursor: pointer;
  border-radius: 6px;
  margin: 1px 0;
  border: 1px solid transparent;
  transition: background 140ms ease, border-color 140ms ease;
  position: relative;
}
.vp-swim-label-cell:hover { background: rgba(255,255,255,0.03); }
.vp-swim-label-cell.active { background: rgba(255,255,255,0.05); }
.vp-swim-label-swatch {
  width: 10px; height: 10px; border-radius: 50%;
  flex: 0 0 auto;
  box-shadow: 0 0 0 2px rgba(255,255,255,0.08), 0 0 10px currentColor;
}
.vp-swim-label-name {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: #e5e7eb;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  min-width: 0;
}
.vp-swim-label-status {
  font-size: 10px;
  color: #94a3b8;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  margin-left: auto;
  margin-right: 4px;
}
/* Per-row action cluster — always visible. (Earlier I hid them on
   non-hover, which made the × button effectively unreachable on
   inactive rows. Just keep them shown.) */
.vp-swim-label-actions {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}
.vp-swim-eyebtn {
  margin-right: 4px;
  /* Sits on the FAR LEFT of the row, before the color swatch, so it's
     visually separate from the × close button on the far right. */
}

/* Right timeline column (ruler + track strips + playhead) */
.vp-swim-timeline {
  position: relative;
  padding: 0 10px;
}
.vp-swim-ruler {
  position: relative;
  height: ${VP_RULER_H}px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
}
.vp-swim-rtick {
  position: absolute;
  bottom: 0;
  width: 1px;
  background: rgba(255,255,255,0.08);
  pointer-events: none;
}
.vp-swim-rtick.major {
  height: 8px;
  background: rgba(255,255,255,0.20);
}
.vp-swim-rtick.minor { height: 4px; }
.vp-swim-rtick-label {
  position: absolute;
  bottom: 9px;
  transform: translateX(-50%);
  font-size: 9px;
  font-weight: 600;
  color: #64748b;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
  pointer-events: none;
  white-space: nowrap;
}
.vp-swim-tracks {
  display: flex;
  flex-direction: column;
}

/* Per-object track cell (in the right column) */
.vp-swim-track-cell {
  position: relative;
  height: ${VP_ROW_H}px;
  margin: 1px 0;
  border-radius: 6px;
  background:
    linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.01)),
    rgba(0,0,0,0.28);
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.03);
  overflow: hidden;
  cursor: pointer;
  transition: box-shadow 160ms ease;
}
.vp-swim-track-cell.active {
  box-shadow:
    inset 0 0 0 1px rgba(255,255,255,0.08),
    0 0 0 1px rgba(56,189,248,0.20),
    0 0 16px rgba(56,189,248,0.10);
}

.vp-swim-encoded {
  position: absolute; left: 0; top: 0; bottom: 0;
  background-image: repeating-linear-gradient(
    -45deg,
    rgba(120,180,255,0.08) 0px, rgba(120,180,255,0.08) 4px,
    transparent 4px, transparent 8px
  );
  animation: vp-swim-shimmer 1.6s linear infinite;
  pointer-events: none;
}

/* The continuous range bar (replaces per-frame cells). Layered:
   .range = outline / faint tint of [A..B]
   .range-fill = solid color portion (grows as propagation completes)
   .range-pending = pulsing overlay during active propagation */
.vp-swim-range {
  position: absolute; top: 6px; bottom: 6px;
  border-radius: 5px;
  pointer-events: none;
  overflow: hidden;
  box-shadow: 0 0 0 1px rgba(255,255,255,0.08) inset;
}
.vp-swim-range-fill {
  position: absolute; top: 0; bottom: 0; left: 0;
  transition: width 220ms ease-out;
  box-shadow: 0 0 18px currentColor;
}
.vp-swim-range-fill::after {
  /* subtle inner stripes hinting at frame discreteness */
  content: "";
  position: absolute; inset: 0;
  background-image: repeating-linear-gradient(
    90deg,
    rgba(255,255,255,0.10) 0 1px,
    transparent 1px 6px
  );
  opacity: 0.45;
  pointer-events: none;
}
.vp-swim-range-pending {
  position: absolute; top: 0; bottom: 0;
  animation: vp-swim-pulse 1.1s ease-in-out infinite;
  pointer-events: none;
  background: linear-gradient(
    90deg,
    transparent,
    currentColor,
    transparent
  );
}
.vp-swim-range-arrow {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 12px;
  font-weight: 700;
  color: #f1f5f9;
  text-shadow: 0 0 6px rgba(0,0,0,0.65);
  pointer-events: none;
  z-index: 2;
  letter-spacing: 0;
  line-height: 1;
}
.vp-swim-marker {
  position: absolute;
  top: 50%;
  width: 12px; height: 12px;
  transform: translate(-50%, -50%) rotate(45deg);
  border: 2px solid #0b0d14;
  border-radius: 2px;
  z-index: 3;
  box-shadow: 0 0 10px rgba(255,255,255,0.08);
  pointer-events: none;
}
.vp-swim-marker-label {
  position: absolute;
  top: 2px;
  transform: translateX(-50%);
  font-size: 9px;
  font-weight: 700;
  color: #e5e7eb;
  background: rgba(0,0,0,0.55);
  padding: 1px 4px;
  border-radius: 2px;
  pointer-events: none;
  z-index: 3;
  letter-spacing: 0.04em;
}

/* Panel-level playhead: a single vertical line crossing the ruler and
   every track row. Lives inside .vp-swim-timeline (which is relative). */
.vp-swim-playhead {
  position: absolute;
  top: 0; bottom: 0;
  width: 2px;
  margin-left: -1px;
  background: linear-gradient(180deg, #fef9c3 0%, #f9fafb 100%);
  box-shadow: 0 0 12px rgba(254,249,195,0.55);
  pointer-events: none;
  z-index: 4;
  transition: left 70ms linear;
}
.vp-swim-playhead::before {
  content: "";
  position: absolute;
  top: -2px;
  left: -4px;
  width: 10px; height: 6px;
  background: #fef9c3;
  border-radius: 1px;
  box-shadow: 0 0 6px rgba(254,249,195,0.55);
}
.vp-swim-clickplane {
  position: absolute; inset: 0;
  cursor: pointer;
  z-index: 2;
}
.vp-swim-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: 10px;
}
.vp-swim-btn {
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: #e5e7eb;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.10);
  border-radius: 5px;
  padding: 4px 9px;
  cursor: pointer;
  text-transform: none;
  transition: background 120ms ease, border-color 120ms ease;
}
.vp-swim-btn:hover:not(:disabled) {
  background: rgba(255,255,255,0.09);
  border-color: rgba(255,255,255,0.16);
}
.vp-swim-btn:active:not(:disabled) { transform: translateY(0.5px); }
.vp-swim-btn:disabled {
  opacity: 0.40;
  cursor: not-allowed;
}
.vp-swim-btn-primary {
  color: #ffffff;
  background: #2563eb;
  border-color: rgba(96,165,250,0.6);
}
.vp-swim-btn-primary:hover:not(:disabled) {
  background: #1d4ed8;
  border-color: rgba(96,165,250,0.85);
}
.vp-swim-btn-stop {
  color: #ffffff;
  background: #dc2626;
  border-color: rgba(248,113,113,0.55);
}
.vp-swim-btn-stop:hover:not(:disabled) {
  background: #b91c1c;
  border-color: rgba(248,113,113,0.85);
}

/* Segmented "Mask | Box" control */
.vp-swim-seg {
  display: inline-flex;
  align-items: center;
  padding: 2px;
  margin-left: auto;
  background: rgba(0,0,0,0.30);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 6px;
  gap: 1px;
}
.vp-swim-seg-btn {
  font: inherit;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #94a3b8;
  background: transparent;
  border: 0;
  padding: 3px 9px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease;
}
.vp-swim-seg-btn:hover { color: #cbd5e1; background: rgba(255,255,255,0.04); }
.vp-swim-seg-btn.active {
  color: #f1f5f9;
  background: rgba(255,255,255,0.10);
  box-shadow: 0 1px 2px rgba(0,0,0,0.4);
}

/* Per-frame keyframe markers added as propagation lands each frame.
   Same diamond shape as the A/B markers, smaller, no border ring. */
.vp-swim-mini-kf {
  position: absolute;
  top: 50%;
  width: 7px; height: 7px;
  margin-left: -3.5px;
  margin-top: -3.5px;
  transform: rotate(45deg);
  background: currentColor;
  border: 1px solid rgba(0,0,0,0.45);
  border-radius: 1px;
  z-index: 2;
  pointer-events: none;
  box-shadow: 0 0 6px currentColor;
  animation: vp-swim-pop 320ms ease-out;
}
.vp-swim-row-actions {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: 0 0 auto;
}
.vp-swim-kf {
  font: inherit;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: #cbd5e1;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.10);
  border-radius: 5px;
  padding: 2px 7px;
  min-width: 28px;
  cursor: pointer;
  transition:
    background 180ms ease,
    border-color 180ms ease,
    color 180ms ease,
    box-shadow 180ms ease;
}
.vp-swim-kf:hover { background: rgba(255,255,255,0.08); }
.vp-swim-kf.set {
  color: #0b0d14;
  font-weight: 800;
  border-color: rgba(0,0,0,0.4);
}
/* "Set but mask not yet attached" — keep the outline color but no fill
   so the user can see at a glance which side still needs a mask. */
.vp-swim-kf.set.no-mask {
  color: #cbd5e1;
  font-weight: 700;
  background: transparent;
  border-style: dashed;
}
.vp-swim-kf.pending {
  animation: vp-swim-pulse 0.9s ease-in-out infinite;
  box-shadow: 0 0 0 2px rgba(255,255,255,0.08), 0 0 12px currentColor;
}
.vp-swim-kf-frame {
  margin-left: 4px;
  font-weight: 600;
  opacity: 0.9;
  font-variant-numeric: tabular-nums;
}
.vp-swim-iconbtn {
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  color: #94a3b8;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 5px;
  width: 22px;
  height: 22px;
  padding: 0;
  cursor: pointer;
  transition: color 140ms ease, background 140ms ease, border-color 140ms ease;
  display: inline-flex; align-items: center; justify-content: center;
}
.vp-swim-iconbtn:hover {
  color: #f1f5f9;
  background: rgba(255,255,255,0.06);
  border-color: rgba(255,255,255,0.14);
}
.vp-swim-iconbtn-active {
  color: #f8c557;
  background: rgba(248,197,87,0.10);
  border-color: rgba(248,197,87,0.30);
}
.vp-swim-iconbtn-active:hover {
  color: #fbbf24;
  background: rgba(248,197,87,0.14);
  border-color: rgba(248,197,87,0.45);
}
.vp-swim-iconbtn-danger:hover {
  color: #fb7185;
  background: rgba(251,113,133,0.10);
  border-color: rgba(251,113,133,0.30);
}
`;

interface KeyframeButtonProps {
  which: "A" | "B";
  frame: number | null;
  hasMask: boolean;
  pending: boolean;
  rgb: string;
  onClick: (e: React.MouseEvent) => void;
}

function KeyframeButton({
  which, frame, hasMask, pending, rgb, onClick,
}: KeyframeButtonProps) {
  const isSet = frame !== null;
  const cls =
    "vp-swim-kf" +
    (isSet ? " set" : "") +
    (isSet && !hasMask ? " no-mask" : "") +
    (pending ? " pending" : "");
  // Three visual states:
  //   - unset:              empty pill with subtle border
  //   - set, no mask yet:   colored border, transparent body (frame
  //                         boundary only — propagation can use it but
  //                         only as a range cap unless this side has
  //                         the seed mask)
  //   - set + mask:         solid colored body (real seed)
  const style: React.CSSProperties = isSet
    ? hasMask
      ? { background: rgb, borderColor: rgb }
      : { borderColor: rgb, color: rgb, background: "transparent" }
    : pending
    ? { borderColor: rgb, color: rgb, background: "rgba(0,0,0,0.2)" }
    : {};
  const title = pending
    ? `Pinned at frame ${frame}. Click the video to attach the mask, or click ${which} again to cancel.`
    : isSet
    ? hasMask
      ? `Keyframe ${which} at frame ${frame} (with mask). Click to re-pin.`
      : `Keyframe ${which} at frame ${frame} (frame only, no mask yet). Click to re-pin and add mask.`
    : `Set keyframe ${which} at the current frame`;
  return (
    <button className={cls} style={style} onClick={onClick} title={title}>
      {which}
      {isSet && <span className="vp-swim-kf-frame">{frame}{!hasMask ? "·" : ""}</span>}
      {pending && !isSet && <span className="vp-swim-kf-frame">…</span>}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Frame ruler (top of timeline column)
// ---------------------------------------------------------------------------

interface FrameRulerProps {
  totalFrames: number;
  fps: number;
  onSeek: (frame: number) => void;
}

function FrameRuler({ totalFrames, fps, onSeek }: FrameRulerProps) {
  const scrubToEvent = (e: React.PointerEvent<HTMLDivElement>) => {
    if (totalFrames < 1) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const p = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onSeek(Math.round(p * (totalFrames - 1)));
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (totalFrames < 1) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
    scrubToEvent(e);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons === 1) scrubToEvent(e);
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
  };

  if (totalFrames < 2) {
    return (
      <div
        className="vp-swim-ruler"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
    );
  }

  // Major ticks roughly every ~120 px assuming the timeline column is at
  // least 600 px wide. We can't know the exact pixel width at render time
  // so we pick a sane frame stride based on duration: aim for ~8 major
  // ticks across the video.
  const targetMajors = 8;
  const rawStride = Math.max(1, Math.round(totalFrames / targetMajors));
  // Snap stride to a "nice" value in seconds (1s, 2s, 5s, 10s, 30s, 60s...)
  const niceSeconds = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  const targetSec = rawStride / fps;
  const majorSec =
    niceSeconds.find((s) => s >= targetSec) ?? niceSeconds[niceSeconds.length - 1];
  const majorStride = Math.max(1, Math.round(majorSec * fps));
  const minorStride = Math.max(1, Math.round(majorStride / 5));

  const ticks: JSX.Element[] = [];
  for (let f = 0; f < totalFrames; f += minorStride) {
    const isMajor = f % majorStride === 0;
    const left = (f / (totalFrames - 1)) * 100;
    ticks.push(
      <div
        key={f}
        className={`vp-swim-rtick ${isMajor ? "major" : "minor"}`}
        style={{ left: `${left}%` }}
      />
    );
    if (isMajor && f > 0) {
      ticks.push(
        <span
          key={`l${f}`}
          className="vp-swim-rtick-label"
          style={{ left: `${left}%` }}
        >
          {formatTimecode(f, fps)}
        </span>
      );
    }
  }

  return (
    <div
      className="vp-swim-ruler"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {ticks}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-object label cell (left column)
// ---------------------------------------------------------------------------

interface DirectionPickerProps {
  direction: DirectionChoice;
  /** Whether kfA has a MASK (not just a frame marker). */
  hasMaskA: boolean;
  /** Whether kfB has a MASK. */
  hasMaskB: boolean;
  onSet: (dir: DirectionChoice) => void;
}

function DirectionPicker({
  direction, hasMaskA, hasMaskB, onSet,
}: DirectionPickerProps) {
  // What propagation will actually do given the masks present.
  // Frame-only markers don't count as seeds — they're just boundaries.
  const effective: DirectionChoice =
    direction === "auto"
      ? hasMaskA && hasMaskB ? "bidirectional"
        : hasMaskA ? "forward"
        : hasMaskB ? "backward"
        : "auto"
      // Explicit choice with no compatible seed — show what we'll
      // actually do (downgrade) so the user isn't lied to.
      : direction === "bidirectional" && (!hasMaskA || !hasMaskB)
        ? hasMaskA ? "forward" : hasMaskB ? "backward" : "auto"
        : direction === "forward" && !hasMaskA
          ? hasMaskB ? "backward" : "auto"
          : direction === "backward" && !hasMaskB
            ? hasMaskA ? "forward" : "auto"
            : direction;

  const noSeed = !hasMaskA && !hasMaskB;
  const glyph = (d: DirectionChoice) =>
    d === "forward" ? "→" : d === "backward" ? "←" : d === "bidirectional" ? "↔" : "·";
  const cycle: DirectionChoice[] = ["auto", "forward", "backward", "bidirectional"];
  const next = cycle[(cycle.indexOf(direction) + 1) % cycle.length];
  const label = noSeed
    ? "—" // explicit "no direction available — add a mask first"
    : direction === "auto"
      ? `auto ${glyph(effective)}`
      : direction !== effective
        ? `${glyph(direction)}→${glyph(effective)}`
        : glyph(direction);
  return (
    <button
      className={"vp-swim-dirbtn" + (noSeed ? " disabled-state" : "")}
      title={
        noSeed
          ? "No mask set yet — click on the video while A or B is pending to attach a mask."
          : `Direction: ${direction}` +
            (direction !== effective ? ` (resolves to ${effective})` : "") +
            `\nClick to cycle (auto → → ← ↔).`
      }
      onClick={(e) => { e.stopPropagation(); onSet(next); }}
    >
      {label}
    </button>
  );
}

interface LabelCellProps {
  obj: PropObject;
  index: number;
  active: boolean;
  pendingFor: "A" | "B" | null;
  onSelect: () => void;
  onPickKeyframe: (which: "A" | "B") => void;
  onSetDirection: (dir: DirectionChoice) => void;
  onToggleHidden: () => void;
  onRemove: () => void;
}

function LabelCell({
  obj, index, active, pendingFor,
  onSelect, onPickKeyframe, onSetDirection, onToggleHidden, onRemove,
}: LabelCellProps) {
  const [r, g, b] = obj.color;
  const rgb = `rgb(${r},${g},${b})`;

  const aFrame = obj.kfA?.frameIdx ?? null;
  const bFrame = obj.kfB?.frameIdx ?? null;

  let rangeLen = 0;
  let doneInRange = 0;
  if (aFrame !== null && bFrame !== null) {
    const lo = Math.min(aFrame, bFrame);
    const hi = Math.max(aFrame, bFrame);
    rangeLen = hi - lo + 1;
    for (let f = lo; f <= hi; f++) if (obj.results.has(f)) doneInRange++;
  }

  return (
    <div
      className={active ? "vp-swim-label-cell active" : "vp-swim-label-cell"}
      onClick={onSelect}
    >
      <button
        className={"vp-swim-iconbtn vp-swim-eyebtn" + (obj.hidden ? " vp-swim-iconbtn-active" : "")}
        title={obj.hidden ? "Show this track's mask" : "Hide this track's mask"}
        onClick={(e) => { e.stopPropagation(); onToggleHidden(); }}
      >
        {obj.hidden ? "⊘" : "◉"}
      </button>
      <span
        className="vp-swim-label-swatch"
        style={{ background: rgb, color: rgb }}
      />
      <span className="vp-swim-label-name">Track {index + 1}</span>
      <span className="vp-swim-label-status">
        {aFrame !== null && bFrame !== null ? (
          <>
            {doneInRange}/{rangeLen}
            {obj.dirty && doneInRange > 0 && (
              <span style={{ color: "#fb923c", marginLeft: 4 }}>•</span>
            )}
          </>
        ) : null}
      </span>
      <div className="vp-swim-label-actions">
        <KeyframeButton
          which="A"
          frame={aFrame}
          hasMask={hasMask(obj.kfA)}
          pending={pendingFor === "A"}
          rgb={rgb}
          onClick={(e) => { e.stopPropagation(); onPickKeyframe("A"); }}
        />
        <KeyframeButton
          which="B"
          frame={bFrame}
          hasMask={hasMask(obj.kfB)}
          pending={pendingFor === "B"}
          rgb={rgb}
          onClick={(e) => { e.stopPropagation(); onPickKeyframe("B"); }}
        />
        <DirectionPicker
          direction={obj.direction}
          hasMaskA={hasMask(obj.kfA)}
          hasMaskB={hasMask(obj.kfB)}
          onSet={(d) => { onSetDirection(d); }}
        />
        <button
          className="vp-swim-iconbtn vp-swim-iconbtn-danger"
          title="Remove this track"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
        >
          ×
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-object track cell (right column — the swimlane bar)
// ---------------------------------------------------------------------------

interface TrackCellProps {
  obj: PropObject;
  active: boolean;
  totalFrames: number;
  preEncoded: number;
  isPropagating: boolean;
  onSelect: () => void;
  onSeek: (frame: number) => void;
}

function TrackCell({
  obj, active, totalFrames, preEncoded, isPropagating, onSelect, onSeek,
}: TrackCellProps) {
  const [r, g, b] = obj.color;
  const rgb = `rgb(${r},${g},${b})`;
  const rgba = (a: number) => `rgba(${r},${g},${b},${a})`;

  const aFrame = obj.kfA?.frameIdx ?? null;
  const bFrame = obj.kfB?.frameIdx ?? null;

  // Resolve the actual propagation range from the EFFECTIVE direction
  // (mask presence + user choice), not raw frame positions. This is
  // what the swimlane range bar visualizes.
  const eff = effectiveDirection(obj);
  let lo: number | null = null;
  let hi: number | null = null;
  if (eff === "bidirectional" && aFrame !== null && bFrame !== null) {
    lo = Math.min(aFrame, bFrame);
    hi = Math.max(aFrame, bFrame);
  } else if (eff === "forward" && aFrame !== null) {
    lo = aFrame;
    // No fixed "+30 frames" any more. The forward range goes from A to
    // EITHER the user-pinned kfB frame (if set) OR the last frame of
    // the video. Same idea for backward below.
    const boundary = bFrame ?? totalFrames - 1;
    hi = Math.min(boundary, totalFrames - 1);
    if (hi < lo) hi = lo;
  } else if (eff === "backward" && bFrame !== null) {
    hi = bFrame;
    const boundary = aFrame ?? 0;
    lo = Math.max(0, boundary);
    if (lo > hi) lo = hi;
  }
  const rangeLen = lo !== null && hi !== null ? hi - lo + 1 : 0;

  let doneInRange = 0;
  if (lo !== null && hi !== null) {
    for (let f = lo; f <= hi; f++) if (obj.results.has(f)) doneInRange++;
  }
  // Total done-fraction (used for single-direction fills).
  const fillFraction = rangeLen > 0 ? doneInRange / rangeLen : 0;

  // For bidir runs we render TWO fills meeting in the middle —
  // one growing from A (the forward chain's progress), one growing
  // from B (the backward chain's progress). "Progress from A" =
  // length of the contiguous done streak starting at lo; "progress
  // from B" = length of the contiguous done streak ending at hi.
  // This matches what propagateMulti actually does in its two-pass
  // form (forward A→B then backward B→A overwriting the half closer
  // to B), so the bar visually splits at the boundary the merge
  // picks.
  let forwardFill = 0;
  let backwardFill = 0;
  if (eff === "bidirectional" && lo !== null && hi !== null) {
    for (let f = lo; f <= hi; f++) {
      if (obj.results.has(f)) forwardFill++;
      else break;
    }
    for (let f = hi; f >= lo; f--) {
      if (obj.results.has(f)) backwardFill++;
      else break;
    }
  }
  const forwardFrac = rangeLen > 0 ? forwardFill / rangeLen : 0;
  const backwardFrac = rangeLen > 0 ? backwardFill / rangeLen : 0;

  const pct = (f: number) =>
    totalFrames > 0 ? (f / Math.max(1, totalFrames - 1)) * 100 : 0;

  const scrubToEvent = (
    e: React.PointerEvent<HTMLDivElement> | PointerEvent,
    el: HTMLElement,
  ) => {
    if (totalFrames < 1) return;
    const rect = el.getBoundingClientRect();
    const p = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onSeek(Math.round(p * (totalFrames - 1)));
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (totalFrames < 1) return;
    // Capture so subsequent moves keep firing on this element even if
    // the pointer leaves it (proper drag-scrub behavior).
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
    scrubToEvent(e, e.currentTarget);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    // buttons === 1 means the primary mouse button is being held.
    if (e.buttons === 1) {
      scrubToEvent(e, e.currentTarget);
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  };

  return (
    <div
      className={active ? "vp-swim-track-cell active" : "vp-swim-track-cell"}
      onClick={onSelect}
      style={active ? { boxShadow: `inset 0 0 0 1px ${rgba(0.30)}, 0 0 16px ${rgba(0.15)}` } : undefined}
    >
      {/* Pre-encoded coverage shimmer (across the whole track, not just range) */}
      {preEncoded > 0 && totalFrames > 0 && (
        <div
          className="vp-swim-encoded"
          style={{ width: `${(preEncoded / totalFrames) * 100}%` }}
        />
      )}

      {/* Per-frame keyframe markers — each propagated frame pops a small
          diamond onto the swimlane as soon as its mask lands. A and B
          themselves are excluded (they get the larger labeled markers
          below). */}
      {lo !== null && hi !== null && totalFrames > 0 && rangeLen <= 800 &&
        Array.from(obj.results.keys())
          .filter((f) => f >= lo && f <= hi && f !== aFrame && f !== bFrame)
          .map((f) => (
            <div
              key={`kf${f}`}
              className="vp-swim-mini-kf"
              style={{ left: `${pct(f)}%`, color: rgb }}
            />
          ))}

      {/* Continuous range bar reflecting the resolved propagation
          direction. For backward runs we flip the fill so it grows
          from B toward A (matching the actual chain direction). */}
      {lo !== null && hi !== null && totalFrames > 0 && (
        <div
          className="vp-swim-range"
          style={{
            left: `${pct(lo)}%`,
            width: `${((hi - lo + 1) / totalFrames) * 100}%`,
            background: `linear-gradient(180deg, ${rgba(0.18)}, ${rgba(0.32)})`,
          }}
        >
          {/* Single-direction fill (forward grows left→right, backward
              grows right→left). Bidir uses the pair of fills below
              instead. Important: with .vp-swim-range-fill defaulting to
              left:0 in CSS, we have to explicitly clear left when
              anchoring right (and vice versa) or the browser stretches
              the div between both edges. */}
          {eff !== "bidirectional" && (
            <div
              className="vp-swim-range-fill"
              style={{
                left:  eff === "backward" ? "auto" : 0,
                right: eff === "backward" ? 0      : "auto",
                width: `${fillFraction * 100}%`,
                background: rgb,
                color: rgba(0.55),
              }}
            />
          )}
          {/* Bidir: TWO fills meeting in the middle. The left band is
              the forward (A→) chain's contiguous progress; the right
              band is the backward (B→) chain. */}
          {eff === "bidirectional" && (
            <>
              <div
                className="vp-swim-range-fill"
                style={{
                  left: 0,
                  right: "auto",
                  width: `${forwardFrac * 100}%`,
                  background: rgb,
                  color: rgba(0.55),
                }}
              />
              <div
                className="vp-swim-range-fill"
                style={{
                  left: "auto",
                  right: 0,
                  width: `${backwardFrac * 100}%`,
                  background: rgb,
                  color: rgba(0.55),
                }}
              />
            </>
          )}
          {/* Pulsing sweep on the un-done middle portion during
              active propagation. */}
          {isPropagating && (
            eff === "bidirectional"
              ? forwardFrac + backwardFrac < 1 && (
                  <div
                    className="vp-swim-range-pending"
                    style={{
                      left: `${forwardFrac * 100}%`,
                      right: "auto",
                      width: `${(1 - forwardFrac - backwardFrac) * 100}%`,
                      color: rgba(0.35),
                    }}
                  />
                )
              : fillFraction < 1 && (
                  <div
                    className="vp-swim-range-pending"
                    style={{
                      left:  eff === "backward" ? "auto" : `${fillFraction * 100}%`,
                      right: eff === "backward" ? `${fillFraction * 100}%` : "auto",
                      width: `${(1 - fillFraction) * 100}%`,
                      color: rgba(0.35),
                    }}
                  />
                )
          )}
          {/* Direction arrow centered on the bar. */}
          {eff && (
            <span className="vp-swim-range-arrow" aria-hidden>
              {eff === "forward" ? "→" : eff === "backward" ? "←" : "↔"}
            </span>
          )}
        </div>
      )}

      {/* Keyframe diamonds + labels */}
      {aFrame !== null && totalFrames > 0 && (
        <>
          <div
            className="vp-swim-marker"
            style={{ left: `${pct(aFrame)}%`, background: rgb }}
          />
          <span
            className="vp-swim-marker-label"
            style={{ left: `${pct(aFrame)}%` }}
          >
            A
          </span>
        </>
      )}
      {bFrame !== null && totalFrames > 0 && (
        <>
          <div
            className="vp-swim-marker"
            style={{ left: `${pct(bFrame)}%`, background: rgb }}
          />
          <span
            className="vp-swim-marker-label"
            style={{ left: `${pct(bFrame)}%` }}
          >
            B
          </span>
        </>
      )}

      {/* Drag-to-scrub overlay (also catches single clicks) */}
      <div
        className="vp-swim-clickplane"
        onPointerDown={(e) => { e.stopPropagation(); onPointerDown(e); }}
        onPointerMove={(e) => { e.stopPropagation(); onPointerMove(e); }}
        onPointerUp={(e) => { e.stopPropagation(); onPointerUp(e); }}
        onPointerCancel={(e) => { e.stopPropagation(); onPointerUp(e); }}
      />
    </div>
  );
}
