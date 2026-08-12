/**
 * The run-level composition for one visualization run: the plot shell's
 * single plot (and any extension-rendered layout over it) share ONE set of
 * per-run state: geometry stream, color column, visibility masks, the
 * selection bridge, the legend, and the partial/Update bookkeeping.
 *
 * The invariant that makes multi-cell layouts safe lives here: exactly ONE
 * `useSelectionBridge` instance per run (it writes global singletons — the
 * override stage, `fos.selectedSamples`, the published selection count — so
 * a per-cell bridge would race). Cells never own selection state; they
 * render the SAME `points`/`colors`/`selected` arrays through a per-cell
 * visibility mask. Charts register their imperative handle via
 * `registerChart`, and clear/reset fan out to every registered cell.
 */
import { usePanelStatePartial } from "@fiftyone/spaces";
import * as fos from "@fiftyone/state";
import type { SelectionType } from "@fiftyone/state";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  useRecoilCallback,
  useRecoilState,
  useRecoilValue,
  useSetRecoilState,
} from "recoil";
import {
  CONTINUOUS_RAMPS,
  rampDomain,
  rampIdForEntry,
  rampList,
  type ContinuousRamp,
  type ContinuousRampId,
} from "@fiftyone/utilities";
import {
  categoryCss,
  MISSING_CATEGORY,
  type Colorscale,
  type PlotPalette,
} from "./colors";
import { backgroundClickAction } from "./backgroundClick";
import { gridFilterPath } from "./filterPath";
import { legendCounts } from "./legendCounts";
import {
  legendLabels,
  soloLabel,
  toggleLabel,
  type CategoricalFilter,
} from "./legendFilter";
import { type ColorMeta, type VisualizationRun } from "./protocol";
import type { EmbeddingsViewHandle, HoverHit } from "./renderer";
import { clearSelectionNonceState, selectionCountState } from "./state";
import {
  getEmbeddingsPanelExtension,
  useFallbackRunFeatures,
  useFallbackRunSource,
  type PanelMode,
  type PublishSelection,
  type RunFeatures,
} from "./extensions";
import { useColorColumn } from "./useColorColumn";
import { useColorPalette } from "./useColorPalette";
import { useHoverInfo } from "./useHoverInfo";
import { useMasks } from "./useMasks";
import { useRunColumns, type Loaded } from "./useRunColumns";
import { useSelectionBridge } from "./useSelectionBridge";

/** Select option id for the uncolored state (fields are never empty) */
export const NONE_FIELD = "";

export interface RunPlotData {
  // Geometry stream
  loaded: Loaded | null;
  total: number;
  loadedCount: number;

  // Color-by
  colorField: string | null;
  setColorField: (value: string | null) => void;
  choices: string[];
  colorOptions: { id: string; data: { label: string } }[];
  colorMeta: ColorMeta | null;
  colorLoading: boolean;
  pointColors: Float32Array | null;
  /** The App color scheme's palette/colorscale for the color-by field —
   * the legend and the points read the same ones */
  palette: PlotPalette;
  colorscale: Colorscale;
  /** The curated ramp the scheme's colorscale state matches (null = nothing
   * set or a custom/named scale). The plot's palette picker and the color
   * settings modal read and write the SAME scheme state, so a choice made in
   * either shows in both — and in the grid's heatmaps. */
  rampId: ContinuousRampId | null;
  setRampId: (id: ContinuousRampId) => void;
  /** The field whose scheme entry a pick edits; null targets the scheme's
   * defaultColorscale (pickable before anything continuous is colored,
   * exactly like the color settings modal's global section). */
  colorscaleTarget: string | null;
  /** The value domain continuous colors map through (the diverging ramp
   * centers it on zero for signed data); null = meta's min..max. The legend
   * labels its ends from here. */
  colorDomain: readonly [number, number] | null;
  /** The per-point sensor field (patches runs), when present */
  streamField: string | null;
  coloredByStream: boolean;

  // Visibility + selection (shared across every rendered cell)
  plotVisible: Uint8Array | null;
  visibleCount: number | null;
  /** The bridge's exact-point selection. */
  selectedIndices: number[] | null;
  /** Grid-checkbox selection. */
  selectedSamples: Map<string, SelectionType>;
  selectionCount: number | null;
  chipCount: number | null;
  handleLasso: (
    indices: number[],
    polygon?: Array<[number, number]> | null,
  ) => void;
  handlePointClick: (hit: HoverHit) => void;
  handleBackgroundClick: () => void;
  clearAll: () => void;

  // Hover
  hover: ReturnType<typeof useHoverInfo>["hover"];
  handleHover: ReturnType<typeof useHoverInfo>["handleHover"];
  keepHover: () => void;

  // The extension's per-run feature surface (masks and slots); the shell
  // renders its header controls, banner, notice, settings sections and
  // plot-area layout from here. The fallback is fully inert.
  features: RunFeatures;

  // Legend (derived from the App's sidebar filter for the color field)
  legend: ReturnType<typeof legendLabels>;
  legendFilter: CategoricalFilter | null;
  /** Per-class counts scoped by the selection (focus) or the view +
   * filters (scope); null when nothing narrows the plot */
  scopedCounts: readonly number[] | null;
  handleLegendToggle: (label: string) => void;
  handleLegendSolo: (label: string) => void;

  // Partial / Update bookkeeping
  resultsPartial: boolean;
  canUpdate: boolean;
  applyAllPoints: () => void;
  resolvedCount: number;

  // Interaction mode (the renderer's modes plus at most one extension mode)
  mode: PanelMode;
  setMode: (mode: PanelMode) => void;

  // Errors (first non-null across the pipeline)
  error: string | null;
  /** A cell's renderer failed; surfaces through `error` */
  onRendererError: (e: Error) => void;

  // Chart registry: each rendered EmbeddingsView registers its imperative
  // handle here so clear/reset fan out across every rendered cell
  registerChart: (key: string, handle: EmbeddingsViewHandle | null) => void;
  resetCameras: () => void;
  /** Clear all plot filters + selections (not the cameras) */
  resetAll: () => void;
}

/**
 * Composes all per-run state for a visualization run. Only this hook (and
 * its child hooks) touch App state — atom values in, setters out — so it
 * renderHook-tests without Recoil the same way the child hooks do.
 */
export function useRunPlotData(
  datasetName: string | null,
  run: VisualizationRun,
): RunPlotData {
  const view = useRecoilValue(fos.view) as unknown[];
  const filters = useRecoilValue(fos.filters);
  const isPatchesView = useRecoilValue(fos.isPatchesView);
  const setOverrideStage = useSetRecoilState(
    fos.extendedSelectionOverrideStage,
  );
  const resetExtended = fos.useResetExtendedSelection();

  // ONE commit per selection. Written as separate setters, each write
  // invalidated the App's view on its own and fired a full sidebar
  // aggregation round — several identical round trips for a single lasso.
  // Recoil batches every set made inside a callback into one commit, and
  // the extension's decorator joins the same commit.
  const publishSelection: PublishSelection = useRecoilCallback(
    ({ set, reset }) =>
      (next) => {
        if (next.stage !== undefined) {
          set(fos.extendedSelectionOverrideStage, (current) =>
            current && JSON.stringify(current) === JSON.stringify(next.stage)
              ? current
              : (next.stage as never),
          );
        }
        if (next.count !== undefined) {
          set(selectionCountState, next.count as never);
        }
        next.decorate?.({ set, reset });
      },
    [],
  );
  const [selectedSamples, setSelectedSamples] = useRecoilState(
    fos.selectedSamples,
  );

  // Panel state (local: plot-only state must not reload the page query)
  // survives the remounts that view changes cause. Values normalize to
  // null: partials are undefined until first set
  const [colorFieldState, setColorField] = usePanelStatePartial<string | null>(
    "colorField",
    null,
    true,
  );
  const colorField = colorFieldState ?? null;
  const brainKey = run.brainKey;

  // The color-by endpoint speaks root-dataset paths, but the grid
  // resolves filters against its CURRENT view's schema — so the filter
  // atom is keyed by view vocabulary: the root path in a samples view,
  // the re-rooted patch path in a patches view (see filterPath.ts)
  const filterPath = colorField
    ? gridFilterPath(colorField, run.patchesField ?? null, isPatchesView)
    : null;

  // Everything edition-specific reaches this hook through the extension
  // seam — registered at module load, so the hook identities below are
  // stable for the app's lifetime (rules of hooks hold; a build without an
  // extension takes the inert fallbacks). The source hook owns, for a run
  // the extension claims, the client-side geometry/color loaders.
  const extension = getEmbeddingsPanelExtension();
  const useRunSource = extension?.useRunSource ?? useFallbackRunSource;
  const source = useRunSource(datasetName, brainKey, run.timestamp ?? null);

  const { loaded, error: loadError } = useRunColumns(
    datasetName,
    brainKey,
    source.loadGeometry,
    source.ownsGeometry,
  );

  // color/masks/filter resolve per-point data by the client's wire-order
  // ids. On a large run they resolve against the points loaded SO FAR: the
  // id column is snapshotted when the operation changes (color field /
  // filters / view) and frozen as more stream in, so a filter/lasso narrows
  // to a subset immediately. The rest streams into the pool in the
  // background; an explicit Update recomputes over everything. We recompute
  // only at those points, never per landed chunk (the id buffer ref is
  // stable, so the memo doesn't churn as `loaded` republishes).
  const idColumn = loaded?.ids ?? null;
  const total = loaded?.total ?? 0;
  const loadedCount = loaded?.points.length ?? 0;
  const loadedCountRef = useRef(0);
  loadedCountRef.current = loadedCount;

  // Only an active operation (color-by / sidebar filter / view stage)
  // needs per-point resolution; plain viewing renders every loaded point
  // with no resolution and no partial/Update chrome
  const activeFilters =
    filters && typeof filters === "object" ? Object.keys(filters).length : 0;
  const hasActiveOp =
    colorField !== null ||
    activeFilters > 0 ||
    (Array.isArray(view) && view.length > 0);

  // Count the resolution was computed over: snapshotted when the op
  // changes (post-load ops capture everything), frozen as more points
  // stream in, jumped to `total` only on an explicit Update
  const [resolvedCount, setResolvedCount] = useState(0);
  useEffect(() => {
    setResolvedCount(hasActiveOp ? loadedCountRef.current : 0);
  }, [brainKey, colorField, filters, view, hasActiveOp]);
  useEffect(() => {
    if (hasActiveOp && resolvedCount === 0 && loadedCount > 0) {
      setResolvedCount(loadedCount);
    }
  }, [hasActiveOp, loadedCount, resolvedCount]);

  // Partial only when an op resolved over fewer points than are loaded;
  // Update becomes available once the whole run is in
  const resultsPartial =
    hasActiveOp && resolvedCount > 0 && resolvedCount < loadedCount;
  const canUpdate = resultsPartial && loadedCount === total;
  const applyAllPoints = useCallback(() => setResolvedCount(total), [total]);

  const {
    choices,
    values: colorValues,
    meta: colorMeta,
    loading: colorLoading,
    error: colorError,
  } = useColorColumn(
    datasetName,
    brainKey,
    run,
    colorField,
    source.colorSource,
  );
  // The scheme's colorscale is the ONE continuous-color setting: the plot's
  // picker and the color settings modal edit the same atom in the same
  // shapes (a `{ path, list }` entry for a continuous color-by field, the
  // scheme's `defaultColorscale` otherwise — pickable before any consumer
  // loads, exactly like the modal), and useColorPalette resolves the plot's
  // colors from it — so the plot, the modal and the grid's heatmaps cannot
  // disagree.
  const colorScheme = useRecoilValue(fos.colorScheme);
  const setColorScheme = fos.useSetSessionColorScheme();
  const colorscaleTarget =
    colorMeta?.style === "continuous" ? colorField : null;
  const rampId = useMemo(() => {
    // The check mark reflects what's APPLIED: the field's entry when it has
    // one, else the scheme default, else the built-in blue → orange (which
    // is what resolveColorscale paints when nothing is configured)
    const entry = colorscaleTarget
      ? colorScheme.colorscales?.find(
          (setting) => setting.path === colorscaleTarget,
        )
      : undefined;
    if (entry) return rampIdForEntry(entry);
    const fallback = colorScheme.defaultColorscale;
    if (fallback?.name || fallback?.list?.length) {
      return rampIdForEntry(fallback);
    }
    return "blueOrange";
  }, [colorScheme, colorscaleTarget]);
  const setRampId = useCallback(
    (id: ContinuousRampId) => {
      setColorScheme((current) => {
        if (!colorscaleTarget) {
          return {
            ...current,
            defaultColorscale: { name: null, list: rampList(id) },
          };
        }
        const others = (current.colorscales ?? []).filter(
          (setting) => setting.path !== colorscaleTarget,
        );
        return {
          ...current,
          colorscales: [
            ...others,
            { path: colorscaleTarget, name: null, list: rampList(id) },
          ],
        };
      });
    },
    [colorscaleTarget, setColorScheme],
  );

  // The diverging ramp reads signed data through a zero-centered domain:
  // widened to ±max(|min|, |max|) so its middle stop IS zero. Null leaves
  // min..max untouched. (Typed as Ramp, not the literal CONTINUOUS_RAMPS member: only
  // one member declares `diverging`, so the union hides the flag.)
  const activeRamp: ContinuousRamp | null = rampId
    ? CONTINUOUS_RAMPS[rampId]
    : null;
  const colorDomain = useMemo<readonly [number, number] | null>(() => {
    if (!activeRamp?.diverging || colorMeta?.style !== "continuous") {
      return null;
    }
    const { min, max } = colorMeta;
    if (min == null || max == null) return null;
    const [lo, hi] = rampDomain(min, max, activeRamp);
    return lo === min && hi === max ? null : [lo, hi];
  }, [activeRamp, colorMeta]);

  // The palette lives in the App's color scheme, not in the fetched
  // column: editing the pool (or a per-value override) recolors the plot
  // in place, and values match their labels in the grid
  const { palette, colorscale, colors } = useColorPalette(
    colorField,
    colorValues,
    colorMeta,
    colorDomain,
  );

  // The legend is a view over the App's sidebar filter for the color-by
  // field; its on/off set drives both plot visibility and grid scope. Read
  // here (above the visibility mask) so the mask can honor it.
  const fieldFilter = useRecoilValue(
    fos.filter({ path: filterPath ?? "", modal: false }),
  );
  const legendFilter = (fieldFilter ?? null) as CategoricalFilter | null;
  const legend = useMemo(
    () => legendLabels(colorMeta, legendFilter),
    [colorMeta, legendFilter],
  );

  // The extension's feature surface: locally-evaluated filter masks, the
  // selection decoration, the shell's slots. Its filters run FIRST — the
  // masks endpoint resolves through a view builder that does not apply
  // extension-owned paths, so only the browser can narrow the plot by
  // them; what it does not own passes through below.
  const useRunFeatures = extension?.useRunFeatures ?? useFallbackRunFeatures;
  const features = useRunFeatures({
    datasetName,
    brainKey,
    run,
    source,
    filters,
    colorField,
    filterPath,
    colorValues,
    colorMeta,
    loadedIds: idColumn,
    loadedCount,
    publishSelection,
    setOverrideStage,
    resetExtended,
  });

  // Filters the extension answered locally are its own; everything else
  // resolves server-side through the masks endpoint
  const serverFilters = features.serverFilters;
  const localMask = features.localMask;

  const {
    visibleMask,
    visibleCount,
    scopeMask,
    error: masksError,
  } = useMasks(
    datasetName,
    brainKey,
    view,
    serverFilters,
    resolvedCount,
    localMask,
    source.serverMasks,
  );
  // color covers the resolved prefix; only apply once it covers every
  // rendered point (the renderer no-ops on a length mismatch anyway)
  const pointColors = useMemo(() => {
    if (!colors || !loaded) return null;
    return colors.length === loaded.points.length * 3 ? colors : null;
  }, [colors, loaded]);
  // The visibility mask must span every rendered point: the resolved
  // prefix drives it and the unresolved tail stays visible until Update.
  // When the extension owns the color field, the legend's hide/isolate is
  // applied HERE, straight from the resolved color column — the id-keyed
  // sidebar filter path can't evaluate an extension-owned field, so
  // clicking/double-clicking a class otherwise reloaded the grid without
  // changing the plot.
  const plotVisible = useMemo(() => {
    if (!loaded) return null;
    const n = loaded.points.length;

    const off = legend?.off;
    const applyLegend =
      features.foldLegendLocally &&
      colorField &&
      off &&
      off.size > 0 &&
      colorValues?.style === "categorical" &&
      colorMeta?.style === "categorical";

    // Nothing narrows the view (no server/client filter AND no legend
    // isolate) → everything visible
    if (!visibleMask && !applyLegend) return null;

    let base: Uint8Array;
    if (!visibleMask) {
      base = new Uint8Array(n).fill(1);
    } else if (visibleMask.length === n) {
      base = visibleMask;
    } else {
      base = new Uint8Array(n).fill(1);
      base.set(visibleMask.subarray(0, Math.min(visibleMask.length, n)));
    }

    if (!applyLegend) return base;

    // Don't mutate the shared mask from useMasks
    const out = base === visibleMask ? base.slice() : base;
    const classes = colorMeta.classes ?? [];
    const indices = colorValues.indices;
    const limit = Math.min(n, indices.length);
    for (let i = 0; i < limit; i++) {
      const ci = indices[i];
      if (ci === MISSING_CATEGORY) continue;
      const label = classes[ci]?.label;
      if (label !== undefined && off.has(String(label))) out[i] = 0;
    }
    return out;
  }, [
    visibleMask,
    loaded,
    features.foldLegendLocally,
    colorField,
    legend,
    colorValues,
    colorMeta,
  ]);

  /** Points actually drawn. Counted from the rendered mask rather than taken
   * from useMasks: that count knows only about the server/client filters, so
   * isolating a legend label narrowed the plot without moving the number. */
  const shownCount = useMemo(() => {
    if (!plotVisible) return visibleCount;
    let n = 0;
    for (let i = 0; i < plotVisible.length; i++) n += plotVisible[i];
    return n;
  }, [plotVisible, visibleCount]);

  // The hover card's swatch mirrors the point's rendered color, which
  // buildColors derives from the same value column
  const pointSwatch = (index: number): string | null => {
    if (colorValues?.style !== "categorical") return null;
    const valueIndex = colorValues.indices[index];
    return valueIndex === MISSING_CATEGORY
      ? null
      : categoryCss(palette, valueIndex);
  };

  const { hover, handleHover, keepHover } = useHoverInfo(
    datasetName,
    brainKey,
    colorField,
    fos.getSampleSrc,
    pointSwatch,
    features.localDetail,
  );

  // Charts register their imperative handle here (one per rendered cell, or
  // a single chart for the plain plot). Clear/reset fan out to every
  // registered cell so one bridge clears them all. The map is a stable ref;
  // the aggregate handle closes over it, so it always hits live charts.
  const chartsRef = useRef(new Map<string, EmbeddingsViewHandle>());
  const registerChart = useCallback(
    (key: string, handle: EmbeddingsViewHandle | null) => {
      if (handle) chartsRef.current.set(key, handle);
      else chartsRef.current.delete(key);
    },
    [],
  );
  const resetCameras = useCallback(() => {
    chartsRef.current.forEach((chart) => chart.resetCamera());
  }, []);
  const aggregateChart = useRef<RefObject<EmbeddingsViewHandle | null>>({
    current: {
      resetCamera: () =>
        chartsRef.current.forEach((chart) => chart.resetCamera()),
      clearSelection: () =>
        chartsRef.current.forEach((chart) => chart.clearSelection()),
    },
  }).current;

  const {
    selectedIndices,
    lassoIndices,
    handleSelection,
    handlePointClick,
    clearAll,
    error: selectionError,
  } = useSelectionBridge({
    datasetName,
    brainKey,
    view,
    loaded,
    patchesField: run.patchesField,
    pointsField: run.pointsField,
    visible: plotVisible,
    chart: aggregateChart,
    resetExtended,
    selectedSamples,
    setSelectedSamples,
    decorateSelection: features.decorateSelection,
    resolveLassoStage: features.resolveLassoStage,
    publishSelection,
  });

  // Focus (selection) wins over scope (view + filters); null means
  // nothing to scope by, and the legend shows the run's full counts.
  // A lasso's indices live in the bridge, never in fos.selectedSamples,
  // so they lead and grid checkbox selections are the fallback focus
  const focusIndices = lassoIndices ?? selectedIndices;
  const scopedCounts = useMemo(
    () =>
      colorValues?.style === "categorical" && colorMeta?.classes?.length
        ? legendCounts(
            colorValues.indices,
            colorMeta.classes.length,
            focusIndices,
            scopeMask,
          )
        : null,
    [colorValues, colorMeta, focusIndices, scopeMask],
  );

  const [mode, setMode] = useState<PanelMode>("explore");
  const [rendererError, setRendererError] = useState<string | null>(null);
  const onRendererError = useCallback(
    (e: Error) => setRendererError(e.message),
    [],
  );

  // (legendFilter + legend are computed above, before the visibility mask,
  // so the mask can honor the legend's hide/isolate.)

  // Writes read the filter from a fresh snapshot, not the render-time
  // value — rapid clicks must each transform the latest state, or a
  // click can silently compute from a stale base and drop its
  // predecessor. (Double-click handling lives in ColorLegend, which
  // defers single-click toggles and cancels them when the second
  // click arrives)
  // The extension syncs its own selection artifacts to the legend filter
  // (e.g. marking the shown classes on linked views). Ref so the memoized
  // recoil callback always calls the freshest closure, never a stale one
  const onLegendFilterChangeRef = useRef(features.onLegendFilterChange);
  onLegendFilterChangeRef.current = features.onLegendFilterChange;

  const handleLegendClick = useRecoilCallback(
    ({ snapshot, set, reset }) =>
      (label: string, solo: boolean) => {
        if (!filterPath || !legend) return;
        const filterState = fos.filter({ path: filterPath, modal: false });
        const current = (snapshot.getLoadable(filterState).valueMaybe() ??
          null) as CategoricalFilter | null;
        const transform = solo ? soloLabel : toggleLabel;
        const next = transform(current, legend.labels, label);
        if (next) {
          set(filterState, next);
        } else {
          reset(filterState);
        }
        onLegendFilterChangeRef.current(next);
      },
    [filterPath, legend],
  );
  const handleLegendToggle = (label: string) => handleLegendClick(label, false);
  const handleLegendSolo = (label: string) => handleLegendClick(label, true);

  const resetLegendFilter = useRecoilCallback(
    ({ reset }) =>
      () => {
        if (filterPath) {
          reset(fos.filter({ path: filterPath, modal: false }));
          // Clearing the class filter also clears anything the extension
          // derived from it (e.g. legend-driven linked-view marks)
          onLegendFilterChangeRef.current(null);
        }
      },
    [filterPath],
  );

  // Clear everything the plot introduced: the selection (lasso / grid /
  // extension actions → override stage + decorations) AND the color-by
  // legend isolate/hide filter. Distinct from resetCameras, which only
  // recenters.
  const resetAll = useCallback(() => {
    clearAll();
    resetLegendFilter();
  }, [clearAll, resetLegendFilter]);

  const error =
    loadError ?? rendererError ?? colorError ?? masksError ?? selectionError;

  const colorOptions = useMemo(
    () => [
      { id: NONE_FIELD, data: { label: "None" } },
      ...choices
        // A run's own spatial-index field colors by x-coordinate;
        // not a useful choice
        .filter((field) => field !== run.pointsField)
        .map((field) => ({ id: field, data: { label: field } })),
    ],
    [choices, run.pointsField],
  );

  // Patches runs whose labels carry a ``stream`` subfield can color by it:
  // one hue per stream, and the color legend's toggle/solo then doubles as
  // a per-stream visibility control — a legend click writes the sidebar
  // filter for the stream field, which both hides the stream's points here
  // (via the masks path) and scopes the grid.
  const streamField = useMemo(() => {
    if (!run.patchesField) return null;
    const candidate = `${run.patchesField}.detections.stream`;
    return choices.includes(candidate) ? candidate : null;
  }, [choices, run.patchesField]);
  const coloredByStream = Boolean(streamField && colorField === streamField);

  // A completed 3D lasso returns gestures to the camera — orbiting to
  // inspect the selection is the natural next step. 2D stays in select
  // mode so lassos can be redrawn without re-arming the tool
  // (FOEPD-4319); each new lasso replaces the previous selection. NOT in
  // an extension mode: a lasso there IS that mode's input (e.g. a query),
  // and dropping to explore would turn the mode off under the user
  const extraMode = features.extraMode;
  const handleLasso = useCallback(
    (indices: number[], polygon?: Array<[number, number]> | null) => {
      // A lasso that caught nothing is not an instruction. Every rendered
      // cell fires its own selection, so one non-gesture arrives once PER
      // CELL — nine of them on a 3x3 layout — and treating each as
      // "deselect everything" wipes a selection made in another cell
      if (!indices.length) return;

      if (extraMode && mode === extraMode.key) {
        extraMode.onLasso(indices);
        return;
      }

      handleSelection(indices, polygon);
      if (run.dims === 3) setMode("explore");
    },
    [mode, handleSelection, extraMode, run.dims],
  );

  // The published count IS the count. Every selection — lasso, grid, an
  // extension action — commits it through `publishSelection`, and the panel
  // tab's pill (which lives outside this tree) reads the same atom.
  // Deriving it here and writing it back instead meant the write-back
  // clobbered what a selection had just published, so the chip never
  // appeared for anything but a grid checkbox.
  const publishedCount = useRecoilValue(selectionCountState);
  const chipCount = publishedCount ?? (selectedSamples.size || null);

  // chipCount is the pre-click value — the chart clears its own lasso layer
  // before this fires. See backgroundClickAction for which layer comes off
  const handleBackgroundClick = useCallback(() => {
    const action = backgroundClickAction({
      chipCount,
      origin: features.selectionOrigin,
      legendFilter: Boolean(legendFilter),
    });
    if (action === "clear-all") clearAll();
    if (action === "reset-legend") resetLegendFilter();
  }, [
    chipCount,
    clearAll,
    legendFilter,
    resetLegendFilter,
    features.selectionOrigin,
  ]);

  const clearNonce = useRecoilValue(clearSelectionNonceState);
  const seenClearNonce = useRef(clearNonce);
  useEffect(() => {
    if (clearNonce !== seenClearNonce.current) {
      seenClearNonce.current = clearNonce;
      clearAll();
    }
  }, [clearAll, clearNonce]);

  return {
    loaded,
    total,
    loadedCount,
    colorField,
    setColorField,
    choices,
    colorOptions,
    colorMeta,
    colorLoading,
    pointColors,
    palette,
    colorscale,
    rampId,
    setRampId,
    colorscaleTarget,
    colorDomain,
    streamField,
    coloredByStream,
    plotVisible,
    visibleCount: shownCount,
    selectedIndices,
    selectedSamples,
    selectionCount: chipCount,
    chipCount,
    handleLasso,
    handlePointClick,
    handleBackgroundClick,
    clearAll,
    hover,
    handleHover,
    keepHover,
    features,
    legend,
    legendFilter,
    scopedCounts,
    handleLegendToggle,
    handleLegendSolo,
    resultsPartial,
    canUpdate,
    applyAllPoints,
    resolvedCount,
    mode,
    setMode,
    error,
    onRendererError,
    registerChart,
    resetCameras,
    resetAll,
  };
}
