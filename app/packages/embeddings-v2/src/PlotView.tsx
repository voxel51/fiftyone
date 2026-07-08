/**
 * The plot view for one visualization run: fetch its columns over the
 * v2 protocol, render with the in-package renderer. Chrome follows the
 * lovable viewer: back + title on the left; color-by, the
 * Explore/Select mode toggle, and reset-view on the right; a mode hint
 * or "N selected" chip overlays the scene's top-left corner.
 *
 * The component is hook composition: each concern lives in its own
 * use* module beside this file, provider-free so it renderHook-tests
 * without Recoil. Only this component touches App state — atom values
 * in, setters out — and it owns the precedence between layers (a grid
 * selection dims over filter matches).
 */
import { usePanelStatePartial } from "@fiftyone/spaces";
import * as fos from "@fiftyone/state";
import {
  BackgroundColor,
  BorderColor,
  Button,
  getColorCssVar,
  Icon,
  IconName,
  Select,
  Size,
  Text,
  TextColor,
  TextVariant,
  Tooltip,
  Variant,
} from "@voxel51/voodo";
import { useMemo, useRef, useState, type CSSProperties } from "react";
import { useRecoilState, useRecoilValue, useSetRecoilState } from "recoil";
import { ColorLegend } from "./ColorLegend";
import HoverCard from "./HoverCard";
import "./panel.css";
import type { VisualizationRun } from "./protocol";
import {
  EmbeddingsView,
  type EmbeddingsViewHandle,
  type InteractionMode,
} from "./renderer";
import { useColorColumn } from "./useColorColumn";
import { useHoverInfo } from "./useHoverInfo";
import { useMasks } from "./useMasks";
import { useRunColumns } from "./useRunColumns";
import { useSelectionBridge } from "./useSelectionBridge";

const TOKEN_VARS = {
  "--emb-bg": `var(${getColorCssVar(BackgroundColor.Background)})`,
  "--emb-card-bg": `var(${getColorCssVar(BackgroundColor.Card2)})`,
  "--emb-card-elevated": `var(${getColorCssVar(BackgroundColor.CardElevated)})`,
  "--emb-border-subtle": `var(${getColorCssVar(BorderColor.Subtle)})`,
  "--emb-border-strong": `var(${getColorCssVar(BorderColor.Strong)})`,
} as CSSProperties;

/** Select option id for the uncolored state (fields are never empty) */
const NONE_FIELD = "";

function ModeSegment({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: IconName;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="emb-mode-segment"
      data-active={active ? "true" : "false"}
      onClick={onClick}
    >
      <Icon
        name={icon}
        size={Size.Xs}
        color={active ? TextColor.Fg : TextColor.Secondary}
      />
      <Text
        variant={TextVariant.Sm}
        color={active ? TextColor.Fg : TextColor.Secondary}
      >
        {label}
      </Text>
    </button>
  );
}

export default function PlotView({
  datasetName,
  run,
  onBack,
}: {
  datasetName: string | null;
  run: VisualizationRun;
  onBack: () => void;
}) {
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
  const [colorFieldState, setColorField] = usePanelStatePartial<string | null>(
    "colorField",
    null,
    true,
  );
  const colorField = colorFieldState ?? null;
  const brainKey = run.brainKey;

  const plotRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EmbeddingsViewHandle>(null);

  const { loaded, error: loadError } = useRunColumns(datasetName, brainKey);
  const {
    choices,
    colors,
    meta: colorMeta,
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
    selectionCount,
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
    chart: viewRef,
    setOverrideStage,
    resetExtended,
    selectedSamples,
    setSelectedSamples,
  });

  const [mode, setMode] = useState<InteractionMode>("explore");

  const error = loadError ?? colorError ?? masksError ?? selectionError;

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

  // A completed lasso hands gestures back to the camera (lovable
  // behavior: select, then immediately explore the result)
  const handleLasso = (
    indices: number[],
    polygon?: Array<[number, number]> | null,
  ) => {
    handleSelection(indices, polygon);
    if (indices.length) setMode("explore");
  };

  const chipCount = selectionCount ?? (selectedSamples.size || null);
  const subtitle = `${run.method ?? "visualization"}${
    run.dims ? ` (${run.dims}D)` : ""
  }`;

  return (
    <div className="emb-plot" style={TOKEN_VARS}>
      <div className="emb-plot-header">
        <Button
          variant={Variant.Icon}
          size={Size.Sm}
          leadingIcon={IconName.ArrowLeft}
          aria-label="Back to visualizations"
          onClick={onBack}
        />
        <div className="emb-plot-title">
          <Text variant={TextVariant.Sm} color={TextColor.Fg}>
            {run.brainKey}
          </Text>
          <Text variant={TextVariant.Caption} color={TextColor.Tertiary}>
            {subtitle}
          </Text>
        </div>
        <div className="emb-plot-controls">
          <Text
            variant={TextVariant.Sm}
            color={TextColor.Secondary}
            className="emb-nowrap"
          >
            Color by
          </Text>
          <div className="emb-colorby">
            <Select
              exclusive
              disabled={!choices.length}
              value={colorField ?? NONE_FIELD}
              options={colorOptions}
              onChange={(value) => {
                setColorField(
                  typeof value === "string" && value !== NONE_FIELD
                    ? value
                    : null,
                );
              }}
            />
          </div>
          <span className="emb-plot-divider" />
          <div className="emb-mode-toggle">
            <ModeSegment
              active={mode === "explore"}
              icon={IconName.Move}
              label="Explore"
              onClick={() => setMode("explore")}
            />
            <ModeSegment
              active={mode === "select"}
              icon={IconName.Draw}
              label="Select"
              onClick={() => setMode("select")}
            />
          </div>
          <Tooltip content="Reset view">
            <Button
              variant={Variant.Icon}
              size={Size.Sm}
              leadingIcon={IconName.Refresh}
              aria-label="Reset view"
              onClick={() => viewRef.current?.resetCamera()}
            />
          </Tooltip>
        </div>
      </div>
      {error && (
        <div className="emb-plot-error">
          <Text variant={TextVariant.Caption} color={TextColor.Destructive}>
            {error}
          </Text>
        </div>
      )}
      <div ref={plotRef} className="emb-plot-scene">
        {loaded && (
          <EmbeddingsView
            ref={viewRef}
            points={loaded.points}
            colors={colors}
            visible={visibleMask}
            selected={selectedIndices ?? matchIndices}
            tooltip={false}
            mode={mode}
            onSelection={handleLasso}
            onPointClick={mode === "select" ? handlePointClick : undefined}
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
        {colorField && colorMeta && (
          <ColorLegend field={colorField} meta={colorMeta} />
        )}
        {chipCount ? (
          <div className="emb-plot-overlay emb-plot-chip">
            <Icon
              name={IconName.Check}
              size={Size.Xs}
              color={TextColor.Success}
            />
            <Text variant={TextVariant.Caption} color={TextColor.Secondary}>
              <strong>{chipCount.toLocaleString()}</strong> selected
            </Text>
            <Button
              variant={Variant.Icon}
              size={Size.Xs}
              leadingIcon={IconName.Close}
              aria-label="Clear selection"
              onClick={clearAll}
            />
          </div>
        ) : (
          <div className="emb-plot-overlay emb-plot-hint">
            <Text variant={TextVariant.Caption} color={TextColor.Secondary}>
              {mode === "explore"
                ? "Drag to pan · scroll to zoom"
                : "Drag to lasso · click points to toggle"}
            </Text>
          </div>
        )}
        {loaded && (
          <div className="emb-plot-overlay emb-plot-counter">
            <Text variant={TextVariant.Caption} color={TextColor.Tertiary}>
              {loaded.points.length.toLocaleString()}
              {loaded.points.length < loaded.total &&
                ` / ${loaded.total.toLocaleString()}`}{" "}
              points
              {visibleCount !== null &&
                ` · ${visibleCount.toLocaleString()} in view`}
            </Text>
          </div>
        )}
      </div>
    </div>
  );
}
