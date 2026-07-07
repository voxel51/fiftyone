/**
 * Development skeleton for the greenfield embeddings panel: pick a
 * visualization run, fetch its columns over the v2 protocol, render
 * with the in-package renderer. Deliberately unstyled — the real
 * UI comes later; this exists to exercise the renderer + protocol
 * end-to-end in the App.
 *
 * The component is hook composition: each concern lives in its own
 * use* module beside this file, provider-free so it renderHook-tests
 * without Recoil. Only this component touches App state — atom values
 * in, setters out — and it owns the precedence between layers (a grid
 * selection dims over filter matches).
 */
import { usePanelStatePartial } from "@fiftyone/spaces";
import * as fos from "@fiftyone/state";
import { useRef } from "react";
import { useRecoilState, useRecoilValue, useSetRecoilState } from "recoil";
import HoverCard from "./HoverCard";
import { EmbeddingsView, type EmbeddingsViewHandle } from "./renderer";
import { useColorColumn } from "./useColorColumn";
import { useHoverInfo } from "./useHoverInfo";
import { useMasks } from "./useMasks";
import { useRunColumns } from "./useRunColumns";
import { useSelectionBridge } from "./useSelectionBridge";
import { useVisualizationRuns } from "./useVisualizationRuns";

export default function EmbeddingsV2Panel() {
  const datasetName = useRecoilValue(fos.datasetName) ?? null;
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
  // survives the remounts that view changes cause. Values normalize to
  // null: partials are undefined until first set
  const [brainKeyState, setBrainKey] = usePanelStatePartial<string | null>(
    "brainKey",
    null,
    true,
  );
  const [colorFieldState, setColorField] = usePanelStatePartial<string | null>(
    "colorField",
    null,
    true,
  );
  const brainKey = brainKeyState ?? null;
  const colorField = colorFieldState ?? null;

  const plotRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EmbeddingsViewHandle>(null);

  const {
    runs,
    run,
    error: runsError,
  } = useVisualizationRuns(datasetName, brainKey, setBrainKey);
  const { loaded, error: loadError } = useRunColumns(datasetName, brainKey);
  const {
    choices,
    colors,
    error: colorError,
  } = useColorColumn(datasetName, brainKey, run, colorField);
  const {
    visibleMask,
    matchIndices,
    visibleCount,
    error: masksError,
  } = useMasks(
    datasetName,
    brainKey,
    view,
    filters,
    loaded?.points.length ?? 0,
  );
  const { hover, handleHover } = useHoverInfo(
    datasetName,
    brainKey,
    colorField,
    fos.getSampleSrc,
  );
  const {
    selectedIndices,
    handleSelection,
    handlePointClick,
    clearAll,
    error: selectionError,
  } = useSelectionBridge({
    datasetName,
    brainKey,
    view,
    loaded,
    patchesField: run?.patchesField ?? null,
    chart: viewRef,
    setOverrideStage,
    resetExtended,
    selectedSamples,
    setSelectedSamples,
  });

  const error =
    runsError ?? loadError ?? colorError ?? masksError ?? selectionError;

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
        <button onClick={clearAll}>clear</button>
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
