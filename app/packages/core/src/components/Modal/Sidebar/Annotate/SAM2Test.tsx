import {
  BrowserAnnotationProvider,
  PointLabel,
  type InferenceResult,
  type PromptPoint,
  type ProviderStatus,
} from "@fiftyone/annotation";
import { getSampleSrc, useModalSample, useCurrentDatasetId } from "@fiftyone/state";
import { getFetchFunction } from "@fiftyone/utilities";
import { useCallback, useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MASK_COLORS = [
  [0, 200, 0],    // green
  [200, 0, 200],  // magenta
  [0, 150, 255],  // blue
  [255, 165, 0],  // orange
  [255, 255, 0],  // yellow
  [0, 255, 255],  // cyan
  [255, 80, 80],  // red
  [128, 255, 128], // light green
];

// ---------------------------------------------------------------------------
// Letterbox helpers
// ---------------------------------------------------------------------------

function getImageRect(canvas: HTMLCanvasElement, aspectRatio: number) {
  const rect = canvas.getBoundingClientRect();
  const canvasAR = rect.width / rect.height;
  let imgW = rect.width, imgH = rect.height, imgLeft = rect.left, imgTop = rect.top;
  if (canvasAR > aspectRatio) {
    imgW = rect.height * aspectRatio;
    imgLeft = rect.left + (rect.width - imgW) / 2;
  } else {
    imgH = rect.width / aspectRatio;
    imgTop = rect.top + (rect.height - imgH) / 2;
  }
  return { imgLeft, imgTop, imgW, imgH };
}

// ---------------------------------------------------------------------------
// Overlay renderers
// ---------------------------------------------------------------------------

function renderMaskOverlay(
  canvas: HTMLCanvasElement,
  result: InferenceResult,
  aspectRatio: number,
  color = MASK_COLORS[0],
): HTMLCanvasElement {
  const { imgLeft, imgTop, imgW, imgH } = getImageRect(canvas, aspectRatio);
  const { mask, bbox } = result;
  const pw = Math.round(bbox.w * imgW);
  const ph = Math.round(bbox.h * imgH);

  const overlay = document.createElement("canvas");
  overlay.width = pw;
  overlay.height = ph;
  Object.assign(overlay.style, {
    position: "fixed",
    left: `${imgLeft + bbox.x * imgW}px`,
    top: `${imgTop + bbox.y * imgH}px`,
    width: `${pw}px`,
    height: `${ph}px`,
    pointerEvents: "none",
    zIndex: "9999",
  });

  const ctx = overlay.getContext("2d");
  if (!ctx) return overlay;

  const maskW = result.maskWidth;
  const maskH = result.maskHeight;
  const imgData = ctx.createImageData(pw, ph);

  for (let y = 0; y < ph; y++) {
    for (let x = 0; x < pw; x++) {
      const mx = Math.floor((x / pw) * maskW);
      const my = Math.floor((y / ph) * maskH);
      const v = mask[my * maskW + mx];
      if (v > 0.5) {
        const i = (y * pw + x) * 4;
        imgData.data[i] = color[0];
        imgData.data[i + 1] = color[1];
        imgData.data[i + 2] = color[2];
        imgData.data[i + 3] = 120;
      }
    }
  }
  ctx.putImageData(imgData, 0, 0);
  return overlay;
}

function renderPointMarkers(
  canvas: HTMLCanvasElement,
  points: PromptPoint[],
  aspectRatio: number,
): HTMLCanvasElement {
  const { imgLeft, imgTop, imgW, imgH } = getImageRect(canvas, aspectRatio);
  const overlay = document.createElement("canvas");
  overlay.width = imgW;
  overlay.height = imgH;
  Object.assign(overlay.style, {
    position: "fixed",
    left: `${imgLeft}px`,
    top: `${imgTop}px`,
    width: `${imgW}px`,
    height: `${imgH}px`,
    pointerEvents: "none",
    zIndex: "10000",
  });

  const ctx = overlay.getContext("2d");
  if (!ctx) return overlay;

  for (const p of points) {
    const px = p.x * imgW;
    const py = p.y * imgH;
    const isPositive = p.label === PointLabel.POSITIVE;

    // Outer glow
    ctx.beginPath();
    ctx.arc(px, py, 8, 0, Math.PI * 2);
    ctx.fillStyle = isPositive ? "rgba(0, 255, 0, 0.2)" : "rgba(255, 0, 0, 0.2)";
    ctx.fill();

    // Inner dot
    ctx.beginPath();
    ctx.arc(px, py, 4, 0, Math.PI * 2);
    ctx.fillStyle = isPositive ? "#00ff00" : "#ff4444";
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // +/- label
    ctx.font = "bold 10px monospace";
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.fillText(isPositive ? "+" : "-", px, py - 10);
  }
  return overlay;
}

// ---------------------------------------------------------------------------
// Canvas finders
// ---------------------------------------------------------------------------

function findCanvas(): HTMLCanvasElement | null {
  return document.querySelector<HTMLCanvasElement>(
    '[data-cy="modal-looker-container"] canvas, [data-cy="lighter-sample-renderer-canvas"]'
  );
}

function findContainer(el: HTMLElement): Element | null {
  return el.closest('[data-cy="modal-looker-container"]')
    ?? el.closest('[data-cy="lighter-sample-renderer-canvas"]')?.parentElement
    ?? null;
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function statusColor(s: ProviderStatus | "idle" | "inferring"): string {
  switch (s) {
    case "ready": return "#4caf50";
    case "loading": case "encoding": return "#ff9800";
    case "failure": return "#f44336";
    case "inferring": return "#2196f3";
    default: return "#666";
  }
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span style={{
      display: "inline-block",
      width: 8,
      height: 8,
      borderRadius: "50%",
      background: statusColor(status as any),
      marginRight: 6,
      verticalAlign: "middle",
      boxShadow: `0 0 4px ${statusColor(status as any)}`,
    }} />
  );
}

// ---------------------------------------------------------------------------
// Log entry with color coding
// ---------------------------------------------------------------------------

function logColor(msg: string): string {
  if (msg.startsWith("❌")) return "#f44336";
  if (msg.startsWith("⚠")) return "#ff9800";
  if (msg.includes("(cached)")) return "#4caf50";
  if (msg.startsWith("Status:")) return "#2196f3";
  if (msg.startsWith("Download")) return "#9c27b0";
  if (msg.startsWith("Inference:")) return "#4caf50";
  return "#777";
}

// ---------------------------------------------------------------------------
// Progress bar
// ---------------------------------------------------------------------------

function ProgressBar({ value, label }: { value: number; label: string }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#aaa", marginBottom: 2 }}>
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <div style={{ height: 3, background: "#333", borderRadius: 2, overflow: "hidden" }}>
        <div style={{
          width: `${value}%`,
          height: "100%",
          background: "linear-gradient(90deg, #9c27b0, #2196f3)",
          transition: "width 0.2s ease",
          borderRadius: 2,
        }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const SAM2Test = () => {
  const [active, setActive] = useState(false);
  const [providerStatus, setProviderStatus] = useState<string>("idle");
  const [statusText, setStatusText] = useState("SAM2 ready. Click to enable.");
  const [points, setPoints] = useState<PromptPoint[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [downloadProgress, setDownloadProgress] = useState<{ file: string; pct: number } | null>(null);
  const [inferenceTime, setInferenceTime] = useState<string | null>(null);

  const providerRef = useRef<BrowserAnnotationProvider | null>(null);
  const overlaysRef = useRef<HTMLCanvasElement[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const modalSample = useModalSample();
  const datasetId = useCurrentDatasetId();

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const addLog = useCallback((msg: string) => {
    console.log("[SAM2]", msg);
    setLogs((prev) => [...prev.slice(-49), msg]);
  }, []);

  const clearOverlays = useCallback(() => {
    for (const el of overlaysRef.current) el.remove();
    overlaysRef.current = [];
    setInferenceTime(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      providerRef.current?.dispose();
      clearOverlays();
    };
  }, [clearOverlays]);

  // --- SAM2 Provider ---

  const ensureProvider = useCallback(async () => {
    if (providerRef.current) return providerRef.current;
    setProviderStatus("loading");
    const provider = new BrowserAnnotationProvider({
      onProgress: (p) => {
        const pct = p.total ? Math.round(p.loaded / p.total * 100) : 0;
        setDownloadProgress({ file: p.file, pct });
        setStatusText(`Downloading ${p.file}...`);
        if (pct === 100) addLog(`Downloaded ${p.file}`);
      },
      onWarning: (msg) => addLog(`⚠ ${msg}`),
      onStatus: (s) => {
        setProviderStatus(s);
        addLog(`Status: ${s}`);
      },
      onError: (e) => addLog(`❌ ${e.kind}: ${e.message}`),
    });
    await provider.initialize();
    setDownloadProgress(null);
    addLog("SAM2 models loaded");
    setProviderStatus("ready");
    setStatusText("Ready. Click image to segment.");
    providerRef.current = provider;
    return provider;
  }, [addLog]);

  // --- Point-prompt inference ---

  const runInference = useCallback(async (pts: PromptPoint[]) => {
    const rawUrl = modalSample?.urls[0]?.url;
    if (!rawUrl) { addLog("⚠ No image URL"); return; }

    const canvas = findCanvas();
    if (!canvas) { setStatusText("No canvas found"); return; }

    try {
      setProviderStatus("inferring");
      setStatusText(`Inferring (${pts.length} point${pts.length > 1 ? "s" : ""})...`);
      const provider = await ensureProvider();
      const t0 = performance.now();
      const result = await provider.infer({
        imageUrl: getSampleSrc(rawUrl),
        points: pts,
      });
      const ms = (performance.now() - t0).toFixed(0);
      const cached = Number(ms) < 500;
      setInferenceTime(`${ms}ms${cached ? " (cached)" : ""}`);
      addLog(`Inference: ${ms}ms${cached ? " (cached)" : ""} | ${result.maskWidth}x${result.maskHeight}`);

      clearOverlays();
      const ar = modalSample?.aspectRatio ?? 1;
      const maskEl = renderMaskOverlay(canvas, result, ar);
      const markersEl = renderPointMarkers(canvas, pts, ar);
      document.body.appendChild(maskEl);
      document.body.appendChild(markersEl);
      overlaysRef.current = [maskEl, markersEl];

      setProviderStatus("ready");
      setStatusText(`Mask: ${result.bbox.w.toFixed(2)}x${result.bbox.h.toFixed(2)} | ${ms}ms`);
    } catch (err) {
      if (err instanceof Error && err.message.includes("aborted")) return;
      const msg = err instanceof Error ? err.message : String(err);
      addLog(`❌ ${msg}`);
      setProviderStatus("failure");
      setStatusText(`Error: ${msg}`);
    }
  }, [modalSample, ensureProvider, clearOverlays, addLog]);

  // --- Click handler ---

  useEffect(() => {
    if (!active) return;

    const handleClick = async (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName !== "CANVAS") return;
      if (!findContainer(target)) return;

      e.preventDefault();
      e.stopPropagation();

      const canvas = target as HTMLCanvasElement;
      const rect = canvas.getBoundingClientRect();
      const imgAR = modalSample?.aspectRatio ?? rect.width / rect.height;
      const canvasAR = rect.width / rect.height;

      let imgLeft = 0, imgTop = 0, imgW = rect.width, imgH = rect.height;
      if (canvasAR > imgAR) {
        imgW = rect.height * imgAR;
        imgLeft = (rect.width - imgW) / 2;
      } else {
        imgH = rect.width / imgAR;
        imgTop = (rect.height - imgH) / 2;
      }

      const x = (e.clientX - rect.left - imgLeft) / imgW;
      const y = (e.clientY - rect.top - imgTop) / imgH;
      if (x < 0 || x > 1 || y < 0 || y > 1) return;

      const label = e.shiftKey ? PointLabel.NEGATIVE : PointLabel.POSITIVE;
      addLog(`Click (${x.toFixed(3)}, ${y.toFixed(3)}) ${label === PointLabel.POSITIVE ? "+" : "-"}`);

      const newPoints = [...points, { x, y, label }];
      setPoints(newPoints);
      await runInference(newPoints);
    };

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [active, points, runInference, modalSample, addLog]);

  // --- Toggle ---

  const toggle = () => {
    if (active) {
      setActive(false);
      setPoints([]);
      clearOverlays();
      setStatusText("SAM2 ready. Click to enable.");
      setProviderStatus("idle");
    } else {
      setActive(true);
      setStatusText("Click image to add points. Shift+click for negative.");
    }
  };

  // --- Commit mask to disk (temp test button) ---

  const commitMask = useCallback(async () => {
    if (!datasetId || !modalSample) {
      addLog("⚠ No dataset or sample");
      return;
    }

    const sampleId = modalSample.sample._id;
    const sample = modalSample.sample;

    // Find all detection fields that might have mask_path
    const detectionFields: string[] = [];
    for (const [key, value] of Object.entries(sample)) {
      if (value && typeof value === "object" && "detections" in (value as any)) {
        detectionFields.push(key);
      }
    }

    if (detectionFields.length === 0) {
      addLog("⚠ No detection fields found on sample");
      return;
    }

    const fetchFn = getFetchFunction();
    let committed = 0;

    for (const field of detectionFields) {
      const fieldData = sample[field] as any;
      const detections = fieldData?.detections ?? [];
      for (const det of detections) {
        if (det.mask_path && det.mask) {
          addLog(`Committing ${det.label ?? "?"} (${det._id}) to ${det.mask_path}...`);
          try {
            const resp = await fetchFn(
              "POST",
              `/dataset/${datasetId}/sample/${sampleId}/commit-mask`,
              { field, detection_id: det._id }
            );
            addLog(`✓ Committed to ${resp.mask_path}`);
            committed++;
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            addLog(`❌ Commit failed: ${msg}`);
          }
        }
      }
    }

    if (committed === 0) {
      addLog("⚠ No masks with mask_path to commit");
    } else {
      addLog(`Committed ${committed} mask${committed !== 1 ? "s" : ""} to disk`);
    }
  }, [datasetId, modalSample, addLog]);

  // --- Render ---

  return (
    <div style={{
      padding: "0.5rem 0.75rem",
      fontSize: 12,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      borderTop: "1px solid #333",
    }}>
      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 8,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <StatusBadge status={providerStatus} />
          <span style={{ fontWeight: 600, color: "#ddd", fontSize: 13 }}>SAM2</span>
          {inferenceTime && (
            <span style={{ color: "#666", fontSize: 10 }}>{inferenceTime}</span>
          )}
        </div>
        {active && (
          <button
            onClick={() => { clearOverlays(); setPoints([]); addLog("Cleared"); setStatusText("Cleared"); }}
            style={{
              background: "none",
              border: "1px solid #555",
              color: "#aaa",
              fontSize: 10,
              padding: "2px 8px",
              borderRadius: 3,
              cursor: "pointer",
            }}
          >Clear</button>
        )}
      </div>

      {/* Toggle button */}
      <button
        onClick={toggle}
        style={{
          width: "100%",
          padding: "5px 0",
          fontSize: 11,
          fontWeight: active ? 600 : 400,
          color: active ? "#fff" : "#888",
          background: active ? "#4caf50" : "#2a2a2a",
          border: `1px solid ${active ? "transparent" : "#444"}`,
          borderRadius: 4,
          cursor: "pointer",
          transition: "all 0.15s ease",
          marginBottom: 8,
        }}
      >
        {active ? "Point Prompt (active)" : "Point Prompt"}
      </button>

      {/* Point mode hint */}
      {active && (
        <div style={{
          padding: "4px 8px",
          marginBottom: 8,
          background: "#1a2e1a",
          border: "1px solid #2d4a2d",
          borderRadius: 4,
          color: "#7cb87c",
          fontSize: 10,
        }}>
          Click = positive point | Shift+click = negative point | {points.length} point{points.length !== 1 ? "s" : ""}
        </div>
      )}

      {/* Download progress */}
      {downloadProgress && (
        <ProgressBar value={downloadProgress.pct} label={`Downloading ${downloadProgress.file}`} />
      )}

      {/* Status line */}
      <div style={{
        display: "flex",
        alignItems: "center",
        padding: "4px 0",
        fontSize: 11,
        color: "#999",
        minHeight: 20,
      }}>
        {statusText}
      </div>

      {/* Log panel */}
      {logs.length > 0 && (
        <div style={{
          marginTop: 6,
          maxHeight: 140,
          overflowY: "auto",
          fontFamily: "monospace",
          fontSize: 10,
          lineHeight: 1.5,
          background: "#111",
          borderRadius: 4,
          padding: "4px 6px",
          border: "1px solid #222",
        }}>
          {logs.map((l, i) => (
            <div key={i} style={{ color: logColor(l) }}>{l}</div>
          ))}
          <div ref={logsEndRef} />
        </div>
      )}

      {/* Footer controls */}
      {logs.length > 0 && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
          <button
            onClick={() => setLogs([])}
            style={{
              background: "none",
              border: "none",
              color: "#555",
              fontSize: 9,
              cursor: "pointer",
              padding: "2px 4px",
            }}
          >Clear logs</button>
        </div>
      )}

      {/* Commit masks to disk (temp test button) */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
        <button
          onClick={commitMask}
          style={{
            background: "none",
            border: "1px solid #c62828",
            color: "#c62828",
            fontSize: 10,
            cursor: "pointer",
            padding: "3px 8px",
            borderRadius: 3,
          }}
        >Commit masks to disk</button>
      </div>
    </div>
  );
};
