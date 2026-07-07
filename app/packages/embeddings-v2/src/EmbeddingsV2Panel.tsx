/**
 * Development skeleton for the greenfield embeddings panel: pick a
 * visualization run, fetch its columns over the v2 protocol, render
 * with the in-package renderer. Deliberately unstyled — the real
 * UI comes later; this exists to exercise the renderer + protocol
 * end-to-end in the App.
 *
 * Selection wiring: a lasso resolves server-side to a view stage and
 * lands on the grid via fos.extendedSelectionOverrideStage (the same
 * atoms the legacy panel drives); a plain click toggles the sample in
 * fos.selectedSamples; grid selections style the plot through the
 * id -> wire-index map. Hover resolves lazily per index (cached) and
 * the card renders only once its image has loaded.
 */
import {
  EmbeddingsView,
  type EmbeddingPoint,
  type EmbeddingsViewHandle,
  type HoverHit,
} from "./renderer";
import { usePanelStatePartial } from "@fiftyone/spaces";
import * as fos from "@fiftyone/state";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRecoilState, useRecoilValue, useSetRecoilState } from "recoil";
import { buildColors } from "./colors";
import HoverCard, { type HoverContent } from "./HoverCard";
import {
  buildIdIndex,
  fetchColorByChoices,
  fetchColorMeta,
  fetchColorValues,
  fetchGeometry,
  fetchIds,
  fetchLassoStage,
  fetchMasks,
  fetchRunInfo,
  fetchRuns,
  fetchSampleInfo,
  idAt,
  type IdColumn,
  type Masks,
  type SampleInfo,
  type VisualizationRun,
} from "./protocol";

/** Wire-order slice size for progressive loading */
const CHUNK = 100_000;

interface Loaded {
  brainKey: string;
  points: EmbeddingPoint[];
  ids: IdColumn;
  total: number;
}

export default function EmbeddingsV2Panel() {
  const datasetName = useRecoilValue(fos.datasetName);
  const view = useRecoilValue(fos.view) as unknown[];
  const filters = useRecoilValue(fos.filters);
  const setOverrideStage = useSetRecoilState(
    fos.extendedSelectionOverrideStage,
  );
  const resetExtended = fos.useResetExtendedSelection();
  const [selectedSamples, setSelectedSamples] = useRecoilState(
    fos.selectedSamples,
  );

  // Panel state (local: plot-only state must not reload the page query)
  // survives the remounts that view changes cause
  const [brainKey, setBrainKey] = usePanelStatePartial<string | null>(
    "brainKey",
    null,
    true,
  );
  const [colorField, setColorField] = usePanelStatePartial<string | null>(
    "colorField",
    null,
    true,
  );
  const [runs, setRuns] = useState<VisualizationRun[] | null>(null);
  const [choices, setChoices] = useState<string[]>([]);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [colors, setColors] = useState<Float32Array | null>(null);
  const [masks, setMasks] = useState<Masks | null>(null);
  const [hover, setHover] = useState<HoverContent | null>(null);
  const [error, setError] = useState<string | null>(null);

  const plotRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EmbeddingsViewHandle>(null);
  const hoverIndexRef = useRef<number | null>(null);
  const infoCache = useRef(new Map<string, SampleInfo>());

  const run = runs?.find((r) => r.brainKey === brainKey) ?? null;

  useEffect(() => {
    if (!datasetName) return undefined;
    let stale = false;
    setRuns(null);
    setError(null);
    fetchRuns(datasetName)
      .then((result) => !stale && setRuns(result))
      .catch((e) => !stale && setError(String(e)));
    return () => {
      stale = true;
    };
  }, [datasetName]);

  // Default to the first run once the list arrives
  useEffect(() => {
    if (!runs?.length) return;
    if (!brainKey || !runs.some((r) => r.brainKey === brainKey)) {
      setBrainKey(runs[0].brainKey);
    }
  }, [runs, brainKey, setBrainKey]);

  // Geometry + ids for the selected run, loaded progressively in
  // wire-order chunks: the plot paints as each slice lands. The
  // in-flight guard is a ref, NOT state: keying this effect on `loaded`
  // would make each chunk's setLoaded cancel its own loop
  const loadingKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!datasetName || !brainKey) return undefined;
    const loadKey = `${datasetName}::${brainKey}`;
    if (loadingKeyRef.current === loadKey) return undefined;
    loadingKeyRef.current = loadKey;
    let stale = false;
    setError(null);
    (async () => {
      // run-info first: reports n AND warms the server's results cache,
      // so the parallel column fetches below don't race a cold load
      const info = await fetchRunInfo(datasetName, brainKey);
      if (stale) return;

      const total = info.n;
      const ids: IdColumn = new Uint8Array(total * 12);
      const points: EmbeddingPoint[] = [];
      setColors(null);
      setHover(null);
      infoCache.current.clear();

      for (let offset = 0; offset < total; offset += CHUNK) {
        const slice = { offset, limit: Math.min(CHUNK, total - offset) };
        const [geometry, sliceIds] = await Promise.all([
          fetchGeometry(datasetName, brainKey, slice),
          fetchIds(datasetName, brainKey, slice),
        ]);
        if (stale) return;

        ids.set(sliceIds, offset * 12);
        const [xs, ys] = geometry.columns;
        for (let i = 0; i < geometry.n; i++) {
          points.push({
            id: idAt(ids, offset + i),
            x: xs[i],
            y: ys[i],
            label: null,
          });
        }
        setLoaded({ brainKey, points: points.slice(), ids, total });
      }
    })().catch((e) => {
      if (stale) return;
      loadingKeyRef.current = null;
      setError(String(e));
    });
    return () => {
      stale = true;
      // An aborted load (run switch mid-flight) may retry later
      if (loadingKeyRef.current === loadKey) {
        loadingKeyRef.current = null;
      }
    };
  }, [datasetName, brainKey]);

  // Color-by field choices depend on the run (patches vs samples)
  useEffect(() => {
    if (!datasetName || !run) return undefined;
    let stale = false;
    fetchColorByChoices(datasetName, run.patchesField)
      .then((fields) => !stale && setChoices(fields))
      .catch(() => !stale && setChoices([]));
    return () => {
      stale = true;
    };
  }, [datasetName, run]);

  // Color column for the selected field
  useEffect(() => {
    if (!datasetName || !brainKey || !colorField) {
      setColors(null);
      return undefined;
    }
    let stale = false;
    Promise.all([
      fetchColorValues(datasetName, brainKey, colorField),
      fetchColorMeta(datasetName, brainKey, colorField),
    ])
      .then(([values, meta]) => {
        if (stale) return;
        setColors(
          buildColors(values, { min: meta.min ?? null, max: meta.max ?? null }),
        );
      })
      .catch((e) => !stale && setError(String(e)));
    return () => {
      stale = true;
    };
  }, [datasetName, brainKey, colorField]);

  // View stages hide points; sidebar filters dim them (PDF semantics)
  useEffect(() => {
    if (!datasetName || !brainKey) {
      setMasks(null);
      return undefined;
    }
    let stale = false;
    fetchMasks(datasetName, brainKey, view, filters)
      .then((result) => !stale && setMasks(result))
      .catch((e) => !stale && setError(String(e)));
    return () => {
      stale = true;
    };
  }, [datasetName, brainKey, view, filters]);

  // Masks cover the full run; during a progressive load, the loaded
  // prefix of the mask is valid by wire-order construction
  const visibleMask = useMemo(() => {
    if (!masks?.visible || !loaded) return null;
    return masks.visible.length === loaded.points.length
      ? masks.visible
      : masks.visible.subarray(0, loaded.points.length);
  }, [masks, loaded]);

  // Filter matches dim via the renderer's selection mechanism; an actual
  // grid selection takes precedence over filter dimming
  const matchIndices = useMemo(() => {
    if (!masks?.match) return null;
    const indices: number[] = [];
    for (let i = 0; i < masks.match.length; i++) {
      if (masks.match[i]) indices.push(i);
    }
    return indices;
  }, [masks]);

  const visibleCount = useMemo(() => {
    if (!masks?.visible) return null;
    let count = 0;
    for (let i = 0; i < masks.visible.length; i++) {
      count += masks.visible[i];
    }
    return count;
  }, [masks]);

  // Esc clears every selection layer (App state + the chart's local dim)
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      resetExtended();
      setSelectedSamples(new Map());
      viewRef.current?.clearSelection();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [resetExtended, setSelectedSamples]);

  // Grid/checkbox selections style the plot (id -> wire index). The map
  // is built lazily — only when a grid selection actually exists — and
  // cached per loaded snapshot
  const idIndexRef = useRef<{
    token: Loaded;
    map: Map<string, number>;
  } | null>(null);
  const selectedIndices = useMemo(() => {
    if (!loaded || !selectedSamples.size) return null;
    if (idIndexRef.current?.token !== loaded) {
      idIndexRef.current = {
        token: loaded,
        map: buildIdIndex(loaded.ids, loaded.points.length),
      };
    }
    const indices: number[] = [];
    for (const id of selectedSamples.keys()) {
      const index = idIndexRef.current.map.get(id);
      if (index !== undefined) indices.push(index);
    }
    return indices;
  }, [loaded, selectedSamples]);

  // Lasso -> data-space polygon -> server-resolved view stage -> the
  // grid. No id lists exist client-side or on the wire; the override
  // stage alone drives the grid
  const handleSelection = (
    indices: number[],
    polygon?: Array<[number, number]> | null,
  ) => {
    if (!datasetName || !brainKey) return;
    if (!indices.length) {
      resetExtended();
      return;
    }
    const selection = polygon?.length ? { polygon } : { indices };
    fetchLassoStage(datasetName, brainKey, view, selection)
      .then((stage) => setOverrideStage({ [stage._cls]: stage.kwargs }))
      .catch((e) => setError(String(e)));
  };

  // Plain click toggles the sample in the App's selection. For patches
  // runs the point id is a label id; the owning sample id resolves
  // through sample-info (clicks are human-rate)
  const toggleSample = (sampleId: string) => {
    setSelectedSamples((current) => {
      const next = new Map(current);
      if (next.has(sampleId)) {
        next.delete(sampleId);
      } else {
        next.set(sampleId, "default");
      }
      return next;
    });
  };

  const handlePointClick = (hit: HoverHit) => {
    if (!run?.patchesField) {
      toggleSample(hit.id);
      return;
    }
    if (!datasetName || !brainKey) return;
    fetchSampleInfo(datasetName, brainKey, hit.index, null)
      .then((info) => toggleSample(info.sampleId))
      .catch(() => undefined);
  };

  // Hover -> lazy sample info (cached per run/field/index)
  const handleHover = (hit: HoverHit | null) => {
    hoverIndexRef.current = hit?.index ?? null;
    if (!hit || !datasetName || !brainKey) {
      setHover(null);
      return;
    }
    const key = `${brainKey}::${colorField ?? ""}::${hit.index}`;
    const apply = (info: SampleInfo) => {
      if (hoverIndexRef.current !== hit.index) return;
      const lines = [];
      if (info.value !== null && info.value !== undefined) {
        lines.push(String(info.value));
      }
      lines.push(info.sampleId);
      setHover({
        hit,
        src: info.media ? (fos.getSampleSrc(info.media) as string) : null,
        lines,
      });
    };

    const cached = infoCache.current.get(key);
    if (cached) {
      apply(cached);
      return;
    }
    fetchSampleInfo(datasetName, brainKey, hit.index, colorField)
      .then((info) => {
        infoCache.current.set(key, info);
        apply(info);
      })
      .catch(() => undefined);
  };

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.5rem",
          flex: "none",
        }}
      >
        <select
          value={brainKey ?? ""}
          onChange={(event) => {
            setBrainKey(event.target.value);
            setColorField(null);
          }}
          disabled={!runs?.length}
        >
          {!runs?.length && <option value="">No visualizations</option>}
          {runs?.map((r) => (
            <option key={r.brainKey} value={r.brainKey}>
              {r.brainKey}
              {r.method ? ` (${r.method})` : ""}
            </option>
          ))}
        </select>
        <select
          value={colorField ?? ""}
          onChange={(event) => setColorField(event.target.value || null)}
          disabled={!choices.length}
        >
          <option value="">(uncolored)</option>
          {choices
            // A run's own spatial-index field colors by x-coordinate;
            // not a useful choice
            .filter((field) => field !== run?.pointsField)
            .map((field) => (
              <option key={field} value={field}>
                {field}
              </option>
            ))}
        </select>
        <button onClick={() => viewRef.current?.resetCamera()}>
          reset view
        </button>
        <button
          onClick={() => {
            resetExtended();
            setSelectedSamples(new Map());
            viewRef.current?.clearSelection();
          }}
        >
          clear
        </button>
        {loaded && (
          <span>
            {loaded.points.length.toLocaleString()}
            {loaded.points.length < loaded.total &&
              ` / ${loaded.total.toLocaleString()}`}{" "}
            points
            {visibleCount !== null &&
              ` · ${visibleCount.toLocaleString()} in view`}
          </span>
        )}
        {runs && !runs.length && (
          <span>
            Run <code>fob.compute_visualization(dataset)</code> to get started
          </span>
        )}
        {error && <span style={{ color: "#ff6b6b" }}>{error}</span>}
      </div>
      <div
        ref={plotRef}
        style={{ flex: 1, position: "relative", minHeight: 0 }}
      >
        {loaded && (
          <EmbeddingsView
            ref={viewRef}
            points={loaded.points}
            colors={colors}
            visible={visibleMask}
            selected={selectedIndices ?? matchIndices}
            tooltip={false}
            onSelection={handleSelection}
            onPointClick={handlePointClick}
            onHover={handleHover}
          />
        )}
        {hover && (
          <HoverCard
            content={hover}
            containerWidth={plotRef.current?.clientWidth ?? 0}
            containerHeight={plotRef.current?.clientHeight ?? 0}
          />
        )}
      </div>
    </div>
  );
}
