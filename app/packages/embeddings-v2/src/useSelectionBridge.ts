import type { SelectionType } from "@fiftyone/state";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { SetterOrUpdater } from "recoil";
import type {
  LassoStageInput,
  PublishSelection,
  SelectionDecorator,
} from "./extensions";
import { buildIdIndex, fetchLassoStage, fetchSampleInfo } from "./protocol";
import type { EmbeddingsViewHandle, HoverHit } from "./renderer";
import type { Loaded } from "./useRunColumns";

export interface SelectionBridgeOptions {
  datasetName: string | null;
  brainKey: string | null;
  view: unknown[];
  loaded: Loaded | null;
  /** The run's patches field; point ids are label ids when set */
  patchesField: string | null;
  /** The run's stored points field, when a spatial stage is possible */
  pointsField: string | null;
  /** The plot's per-point visibility (view stages + sidebar filters);
   * null when everything is visible. A lasso only selects visible points,
   * so a gesture respects the active filter/view */
  visible: Uint8Array | null;
  /** Renderer handle, for clearing the chart's local dim layer */
  chart: RefObject<EmbeddingsViewHandle | null>;
  /** Commits stage + count + the extension's decoration in ONE batched
   * commit, so a single lasso invalidates the App's view once rather than
   * once per setter. */
  publishSelection: PublishSelection;
  /** fos.useResetExtendedSelection() */
  resetExtended: () => void;
  selectedSamples: Map<string, SelectionType>;
  setSelectedSamples: SetterOrUpdater<Map<string, SelectionType>>;
  /** Joins each publish with the extension's selection artifacts (called
   * with the kept indices; null on clear). Null when nothing decorates. */
  decorateSelection: ((kept: number[] | null) => SelectionDecorator) | null;
  /** Client-side lasso → view stage. Null falls back to the server route
   * (the lasso resolves against the full run there). */
  resolveLassoStage:
    | ((input: LassoStageInput) => Record<string, unknown> | null)
    | null;
}

/**
 * A published stage's sample count, when the stage itself knows it: a
 * Select stage enumerates its sample ids. Any other stage shape (Mongo,
 * a server-resolved spatial stage) selects samples only the server can
 * count — null, and the UI falls back to the point count.
 */
export function stageSampleCount(
  stage: Record<string, unknown>,
): number | null {
  const kwargs = stage["fiftyone.core.stages.Select"];
  if (!kwargs || typeof kwargs !== "object") return null;
  const ids = (kwargs as { sample_ids?: unknown }).sample_ids;
  return Array.isArray(ids) ? ids.length : null;
}

/**
 * Two-way selection wiring between the plot and the App. Plot -> grid:
 * a lasso resolves to a view stage — client-side when the extension
 * supplies a resolver and the run is fully loaded (zero requests per
 * gesture), otherwise server-side; a plain click builds a Select stage
 * directly from the accumulated sample ids. Either way the stage lands
 * on the grid via the override stage. Grid -> plot: selected sample ids
 * style the plot through a lazily built id -> wire-indices map (one id
 * can own many points). Esc (and `clearAll`) clears every layer.
 */
export function useSelectionBridge({
  datasetName,
  brainKey,
  view,
  loaded,
  patchesField,
  pointsField,
  visible,
  chart,
  resetExtended,
  selectedSamples,
  setSelectedSamples,
  decorateSelection,
  resolveLassoStage,
  publishSelection,
}: SelectionBridgeOptions): {
  selectedIndices: number[] | null;
  /** The live lasso's enclosed wire indices (null = no lasso). Kept
   * client-side for selection-scoped UI like the legend counts; the
   * grid itself is driven by the resolved stage, never these.
   * Typed array on purpose: a lasso can enclose millions of points,
   * and this is retained until the selection clears */
  lassoIndices: Uint32Array | null;
  handleSelection: (
    indices: number[],
    polygon?: Array<[number, number]> | null,
  ) => void;
  handlePointClick: (hit: HoverHit) => void;
  clearAll: () => void;
  error: string | null;
} {
  const [error, setError] = useState<string | null>(null);
  const [lassoIndices, setLassoIndices] = useState<Uint32Array | null>(null);
  // Monotonic lasso-request id: a slow older response must not
  // overwrite a newer selection (or resurrect one that was cleared)
  const lassoSeq = useRef(0);

  // Stable because the Esc effect below depends on it
  const clearAll = useCallback(() => {
    lassoSeq.current++;
    resetExtended();
    setSelectedSamples(new Map());
    setLassoIndices(null);
    setError(null);
    // The extension's artifacts clear in the same commit they were
    // published in; the counts are what the chip and the panel tab's
    // pill both read, and they clear together so they can never desync
    publishSelection({
      stage: null,
      count: null,
      sampleCount: null,
      decorate: decorateSelection?.(null) ?? null,
    });
    chart.current?.clearSelection();
  }, [
    resetExtended,
    setSelectedSamples,
    publishSelection,
    decorateSelection,
    chart,
  ]);

  // Esc clears every selection layer (App state + the chart's local dim)
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      clearAll();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [clearAll]);

  // Grid/checkbox selections style the plot (id -> every wire index
  // sharing that id — one sample can own many points, e.g. every window
  // of an episode in a multimodal run). The map is built lazily and
  // cached per loaded snapshot; a plain click resolves through the same
  // map to publish its Select stage below.
  const idIndexRef = useRef<{
    token: Loaded;
    map: Map<string, number[]>;
  } | null>(null);
  const resolveIndices = useCallback(
    (ids: Iterable<string>): number[] => {
      if (!loaded) return [];
      if (idIndexRef.current?.token !== loaded) {
        idIndexRef.current = {
          token: loaded,
          map: buildIdIndex(loaded.ids, loaded.points.length),
        };
      }
      const indices: number[] = [];
      for (const id of ids) {
        const matches = idIndexRef.current.map.get(id);
        // Plain loop: spread-push overflows the arg limit past ~100k
        // matches, and one id can own every window of an episode
        if (matches) for (const m of matches) indices.push(m);
      }
      return indices;
    },
    [loaded],
  );
  const selectedIndices = useMemo(() => {
    if (!selectedSamples.size) return null;
    const indices = resolveIndices(selectedSamples.keys());
    // No id resolving means the selection is not representable in this
    // plot's id space (sample selections against a patches run, whose
    // wire ids are label ids). That is "no selection" (null) — an empty
    // selection would dim every point and outrank the filter-match
    // layer in the host's precedence
    return indices.length ? indices : null;
  }, [selectedSamples, resolveIndices]);

  // Lasso -> view stage -> the grid. The override stage alone drives
  // the grid; the stage builds locally when the extension supplies a
  // resolver and every point is loaded (the hit-test is complete),
  // otherwise the server resolves the data-space polygon against the
  // full run
  const handleSelection = (
    indices: number[],
    polygon?: Array<[number, number]> | null,
  ) => {
    if (!datasetName || !brainKey) return;
    const seq = ++lassoSeq.current;
    // A failure banner describes the previous gesture; a new one starts
    // clean (the success path below still resets, as a race safeguard)
    setError(null);

    // Keep only points passing the active filter/view. When something is
    // hidden, a spatial shortcut can't express the filter, so resolve by
    // id from the surviving points instead of the polygon
    const filtered = visible != null;
    const kept = filtered ? indices.filter((i) => visible[i]) : indices;
    if (!kept.length) {
      resetExtended();
      setLassoIndices(null);
      publishSelection({
        stage: null,
        count: null,
        sampleCount: null,
        decorate: decorateSelection?.(null) ?? null,
      });
      return;
    }
    // Synchronous, unlike any stage resolution below: the legend
    // counts follow the gesture, not the network
    setLassoIndices(Uint32Array.from(kept));

    if (resolveLassoStage && loaded && loaded.points.length === loaded.total) {
      const stage = resolveLassoStage({
        indices: kept,
        polygon: filtered ? null : (polygon ?? null),
        ids: loaded.ids,
        view,
        patchesField,
        pointsField,
      });
      if (stage) {
        publishSelection({
          stage,
          count: kept.length,
          sampleCount: stageSampleCount(stage),
          decorate: decorateSelection?.(kept) ?? null,
        });
        return;
      }
    }

    const selection =
      !filtered && polygon?.length ? { polygon } : { indices: kept };
    fetchLassoStage(datasetName, brainKey, view, selection)
      .then((stage) => {
        if (seq !== lassoSeq.current) return;
        // A stale failure banner must not outlive the success after it
        setError(null);
        const published = { [stage._cls]: stage.kwargs };
        publishSelection({
          stage: published,
          count: stage.count ?? kept.length,
          sampleCount: stageSampleCount(published),
          decorate: decorateSelection?.(kept) ?? null,
        });
      })
      .catch((e) => seq === lassoSeq.current && setError(String(e)));
  };

  // A click's Select stage is built directly from the accumulated sample
  // ids — no polygon or index resolution needed, so (unlike a lasso)
  // this never leaves the client
  const publishClickSelection = (samples: Map<string, SelectionType>) => {
    if (!samples.size) {
      resetExtended();
      publishSelection({
        stage: null,
        count: null,
        sampleCount: null,
        decorate: decorateSelection?.(null) ?? null,
      });
      return;
    }
    const sampleIds = Array.from(samples.keys());
    const indices = resolveIndices(sampleIds);
    publishSelection({
      stage: {
        "fiftyone.core.stages.Select": {
          sample_ids: sampleIds,
          ordered: false,
        },
      },
      // Point count, not sample count — matches what a lasso reports for
      // the same points, and what the dim layer actually highlights. One
      // clicked sample can carry many points (every window of an
      // episode), so this can be far bigger than samples.size.
      count: indices.length || samples.size,
      sampleCount: samples.size,
      decorate: decorateSelection?.(indices.length ? indices : null) ?? null,
    });
  };

  // Plain click toggles the sample in the App's selection AND filters
  // the grid to the accumulated set, the same way a lasso would. For
  // patches runs the point id is a label id; the owning sample id
  // resolves through sample-info (clicks are human-rate)
  const toggleSample = (sampleId: string) => {
    // One concrete map feeds both writes: an updater form could fold two
    // batched toggles into state the publish below never saw
    const next = new Map(selectedSamples);
    if (next.has(sampleId)) {
      next.delete(sampleId);
    } else {
      next.set(sampleId, "default");
    }
    setSelectedSamples(next);
    publishClickSelection(next);
  };

  const handlePointClick = (hit: HoverHit) => {
    if (!patchesField) {
      toggleSample(hit.id);
      return;
    }
    if (!datasetName || !brainKey) return;
    // Patches point: resolve the label to its owning sample, server-side
    fetchSampleInfo(datasetName, brainKey, hit.index, null)
      .then((info) => toggleSample(info.sampleId))
      .catch(() => undefined);
  };

  return {
    selectedIndices,
    lassoIndices,
    handleSelection,
    handlePointClick,
    clearAll,
    error,
  };
}
