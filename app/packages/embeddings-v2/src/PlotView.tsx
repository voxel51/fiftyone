/**
 * The plot view for one visualization run: fetches the run's columns
 * over the v2 protocol and renders them with the in-package renderer.
 * Header: back, title, color-by, the explore/select mode toggle, and
 * camera reset. Overlays: a mode hint or selection-count chip
 * (top-left), the color legend (top-right), and a load-progress
 * counter (bottom-left).
 *
 * The component is hook composition: each concern lives in its own
 * use* module beside this file, provider-free so it renderHook-tests
 * without Recoil. Only this component touches App state — atom values
 * in, setters out — and it owns the precedence between selection
 * layers (grid selection, then class highlight, then filter dimming).
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
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  useRecoilState,
  useRecoilValue,
  useResetRecoilState,
  useSetRecoilState,
} from "recoil";
import { ColorLegend } from "./ColorLegend";
import { categoryHex, classIndices, MISSING_CATEGORY } from "./colors";
import HoverCard from "./HoverCard";
import "./panel.css";
import type { VisualizationRun } from "./protocol";
import {
  EmbeddingsView,
  type CameraAdapterFactory,
  type EmbeddingsViewHandle,
  type InteractionMode,
} from "./renderer";
import { clearSelectionNonceState, selectionCountState } from "./state";
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
        variant={TextVariant.Md}
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
  zCamera,
}: {
  datasetName: string | null;
  run: VisualizationRun;
  onBack: () => void;
  /** Loads a camera for runs whose points carry a third coordinate */
  zCamera?: () => Promise<CameraAdapterFactory>;
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
    values: colorValues,
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
  // The hover card's swatch mirrors the point's rendered color, which
  // buildColors derives from the same class column
  const pointSwatch = (index: number): string | null => {
    if (colorValues?.style !== "categorical") return null;
    const classIndex = colorValues.indices[index];
    return classIndex === MISSING_CATEGORY ? null : categoryHex(classIndex);
  };

  const { hover, handleHover } = useHoverInfo(
    datasetName,
    brainKey,
    colorField,
    fos.getSampleSrc,
    pointSwatch,
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

  // Legend click-to-highlight: a class index, resolved to wire-order
  // indices client-side (the raw column is already here). Cleared when
  // the field or run changes — the class indices mean nothing there.
  const [highlightClass, setHighlightClass] = useState<number | null>(null);
  useEffect(() => {
    setHighlightClass(null);
  }, [brainKey, colorField]);

  const highlightIndices = useMemo(
    () =>
      highlightClass !== null && colorValues
        ? classIndices(colorValues, highlightClass)
        : null,
    [colorValues, highlightClass],
  );

  // Shift-click filters the grid through the App's sidebar filter for
  // the field — the masks endpoint consumes the same fos.filters, so
  // the plot dims to match. String classes only: the sidebar's numeric
  // filters are range-shaped, not value lists
  const [fieldFilter, setFieldFilter] = useRecoilState(
    fos.filter({ path: colorField ?? "", modal: false }),
  );
  const resetFieldFilter = useResetRecoilState(
    fos.filter({ path: colorField ?? "", modal: false }),
  );
  const handleClassClick = (index: number, shiftKey: boolean) => {
    const label = colorMeta?.classes?.[index]?.label;
    if (shiftKey && colorField && typeof label === "string") {
      const values = (fieldFilter as { values?: unknown[] } | null)?.values;
      const active = values?.length === 1 && values[0] === label;
      if (active) {
        resetFieldFilter();
      } else {
        setFieldFilter({ values: [label], exclude: false });
      }
      // The filter's dimming should show; a class highlight outranks
      // it in the selection precedence and would mask it
      setHighlightClass(null);
      return;
    }
    setHighlightClass((current) => (current === index ? null : index));
  };

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

  // A completed lasso returns gestures to the camera, so the
  // selection can be explored immediately without switching modes
  const handleLasso = (
    indices: number[],
    polygon?: Array<[number, number]> | null,
  ) => {
    handleSelection(indices, polygon);
    if (indices.length) setMode("explore");
  };

  const chipCount = selectionCount ?? (selectedSamples.size || null);

  // The panel tab's selection pill lives outside this tree; it mirrors
  // the chip's count through the package atom and requests clears back
  // through a nonce
  const publishCount = useSetRecoilState(selectionCountState);
  useEffect(() => {
    publishCount(chipCount);
    return () => publishCount(null);
  }, [chipCount, publishCount]);

  const clearNonce = useRecoilValue(clearSelectionNonceState);
  const seenClearNonce = useRef(clearNonce);
  useEffect(() => {
    if (clearNonce !== seenClearNonce.current) {
      seenClearNonce.current = clearNonce;
      clearAll();
    }
  }, [clearAll, clearNonce]);

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
          <Text variant={TextVariant.Md} color={TextColor.Fg}>
            {run.brainKey}
          </Text>
          <Text variant={TextVariant.Sm} color={TextColor.Tertiary}>
            {subtitle}
          </Text>
        </div>
        <div className="emb-plot-controls">
          <Text
            variant={TextVariant.Md}
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
          {/* portal: inline rendering clips against the panel chrome */}
          <Tooltip content="Reset view" portal>
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
          <Text variant={TextVariant.Sm} color={TextColor.Destructive}>
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
            selected={selectedIndices ?? highlightIndices ?? matchIndices}
            tooltip={false}
            mode={mode}
            zCamera={zCamera}
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
          <ColorLegend
            field={colorField}
            meta={colorMeta}
            activeClass={highlightClass}
            onClassClick={handleClassClick}
          />
        )}
        {chipCount ? (
          <div className="emb-plot-overlay emb-plot-chip">
            <Icon
              name={IconName.Check}
              size={Size.Xs}
              color={TextColor.Success}
            />
            <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
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
            <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
              {mode === "explore"
                ? "Drag to pan · scroll to zoom"
                : "Drag to lasso · click points to toggle"}
            </Text>
          </div>
        )}
        {loaded && (
          <div className="emb-plot-overlay emb-plot-counter">
            <Text variant={TextVariant.Sm} color={TextColor.Tertiary}>
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
