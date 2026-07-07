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
  /** Renderer handle, for clearing the chart's local dim layer */
  chart: RefObject<EmbeddingsViewHandle | null>;
  /** fos.extendedSelectionOverrideStage setter */
  setOverrideStage: (stage: Record<string, unknown>) => void;
  /** fos.useResetExtendedSelection() */
  resetExtended: () => void;
  selectedSamples: Map<string, SelectionType>;
  setSelectedSamples: SetterOrUpdater<Map<string, SelectionType>>;
}

/**
 * Two-way selection wiring between the plot and the App. Plot -> grid:
 * a lasso resolves server-side to a view stage and lands on the grid
 * via the override stage — no id lists exist client-side or on the
 * wire; a plain click toggles the sample in the App's selection.
 * Grid -> plot: selected sample ids style the plot through a lazily
 * built id -> wire-index map. Esc (and `clearAll`) clears every layer.
 */
export function useSelectionBridge({
  datasetName,
  brainKey,
  view,
  loaded,
  patchesField,
  chart,
  setOverrideStage,
  resetExtended,
  selectedSamples,
  setSelectedSamples,
}: SelectionBridgeOptions): {
  selectedIndices: number[] | null;
  handleSelection: (
    indices: number[],
    polygon?: Array<[number, number]> | null,
  ) => void;
  handlePointClick: (hit: HoverHit) => void;
  clearAll: () => void;
  error: string | null;
} {
  const [error, setError] = useState<string | null>(null);

  // Stable because the Esc effect below depends on it
  const clearAll = useCallback(() => {
    resetExtended();
    setSelectedSamples(new Map());
    chart.current?.clearSelection();
  }, [resetExtended, setSelectedSamples, chart]);

  // Esc clears every selection layer (App state + the chart's local dim)
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      clearAll();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [clearAll]);

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
  // grid. The override stage alone drives the grid
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
    if (!patchesField) {
      toggleSample(hit.id);
      return;
    }
    if (!datasetName || !brainKey) return;
    fetchSampleInfo(datasetName, brainKey, hit.index, null)
      .then((info) => toggleSample(info.sampleId))
      .catch(() => undefined);
  };

  return {
    selectedIndices,
    handleSelection,
    handlePointClick,
    clearAll,
    error,
  };
}
