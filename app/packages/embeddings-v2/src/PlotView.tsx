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
 * in, setters out. Two layers of point treatment: view stages and
 * sidebar filters HIDE points (scope); grid selections EMPHASIZE them
 * (focus). The legend is a view over the sidebar filter for the
 * color-by field — see legendFilter.ts for the click semantics.
 */
import { usePanelStatePartial } from "@fiftyone/spaces";
import * as fos from "@fiftyone/state";
import {
  BackgroundColor,
  BorderColor,
  Button,
  getColorCssVar,
  Icon,
  IconColor,
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
  useRecoilCallback,
  useRecoilState,
  useRecoilValue,
  useSetRecoilState,
} from "recoil";
import { ColorLegend } from "./ColorLegend";
import { ContinuousLegend } from "./ContinuousLegend";
import { categoryHex, MISSING_CATEGORY } from "./colors";
import { gridFilterPath } from "./filterPath";
import HoverCard from "./HoverCard";
import { legendCounts } from "./legendCounts";
import {
  legendLabels,
  soloLabel,
  toggleLabel,
  type CategoricalFilter,
} from "./legendFilter";
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
import { useLocalColorMask } from "./useLocalColorMask";
import { useMasks } from "./useMasks";
import { useRunColumns } from "./useRunColumns";
import { useSelectionBridge } from "./useSelectionBridge";

const TOKEN_VARS = {
  "--emb-bg": `var(${getColorCssVar(BackgroundColor.Background)})`,
  "--emb-card-bg": `var(${getColorCssVar(BackgroundColor.Card2)})`,
  "--emb-card-elevated": `var(${getColorCssVar(BackgroundColor.CardElevated)})`,
  "--emb-border-subtle": `var(${getColorCssVar(BorderColor.Subtle)})`,
  "--emb-border-strong": `var(${getColorCssVar(BorderColor.Strong)})`,
  "--emb-fg": `var(${getColorCssVar(TextColor.Fg)})`,
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
        size={Size.Md}
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
  const isPatchesView = useRecoilValue(fos.isPatchesView);
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
  // The color-by endpoint speaks root-dataset paths, but the grid
  // resolves filters against its CURRENT view's schema — so the filter
  // atom is keyed by view vocabulary: the root path in a samples view,
  // the re-rooted patch path in a patches view (see filterPath.ts)
  const filterPath = colorField
    ? gridFilterPath(colorField, run.patchesField ?? null, isPatchesView)
    : null;
  const brainKey = run.brainKey;

  const plotRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EmbeddingsViewHandle>(null);

  const { loaded, error: loadError } = useRunColumns(datasetName, brainKey);
  const {
    choices,
    colors,
    values: colorValues,
    meta: colorMeta,
    loading: colorLoading,
    error: colorError,
  } = useColorColumn(datasetName, brainKey, run, colorField);
  // The color-by field's filter evaluates client-side when provably
  // faithful (legend clicks never wait on the masks round trip); the
  // rest ships to the masks endpoint, identity-stable
  const { localMask, serverFilters } = useLocalColorMask(
    filters,
    filterPath,
    colorValues,
    colorMeta,
  );

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
    loaded?.points.length ?? 0,
    localMask,
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
  const [rendererError, setRendererError] = useState<string | null>(null);

  // The legend has no state of its own: which classes are on derives
  // from the App's sidebar filter for the color-by field, and clicks
  // write the next filter back. The masks path consumes the same
  // fos.filters, so the plot and grid scope together. String classes
  // only: the sidebar's numeric filters are range-shaped, not value
  // lists, so numeric-class legends render inert
  const fieldFilter = useRecoilValue(
    fos.filter({ path: filterPath ?? "", modal: false }),
  );
  const legendFilter = (fieldFilter ?? null) as CategoricalFilter | null;

  const legend = useMemo(
    () => legendLabels(colorMeta, legendFilter),
    [colorMeta, legendFilter],
  );

  // Focus (selection) wins over scope (view + filters); null means
  // nothing to scope by, and the legend shows the run's full counts
  const scopedCounts = useMemo(
    () =>
      colorValues?.style === "categorical" && colorMeta?.classes?.length
        ? legendCounts(
            colorValues.indices,
            colorMeta.classes.length,
            selectedIndices,
            scopeMask,
          )
        : null,
    [colorValues, colorMeta, selectedIndices, scopeMask],
  );

  // Writes read the filter from a fresh snapshot, not the render-time
  // value — rapid clicks must each transform the latest state, or a
  // click can silently compute from a stale base and drop its
  // predecessor. (Double-click handling lives in ColorLegend, which
  // defers single-click toggles and cancels them when the second
  // click arrives)
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
        }
      },
    [filterPath],
  );

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

  // A completed 3D lasso returns gestures to the camera — orbiting to
  // inspect the selection is the natural next step. 2D stays in select
  // mode so lassos can be redrawn without re-arming the tool
  // (FOEPD-4319); each new lasso replaces the previous selection
  const handleLasso = (
    indices: number[],
    polygon?: Array<[number, number]> | null,
  ) => {
    handleSelection(indices, polygon);
    if (indices.length && run.dims === 3) setMode("explore");
  };

  const chipCount = selectionCount ?? (selectedSamples.size || null);

  // Background clicks clear in stages, topmost layer first: an existing
  // selection (focus) on the first click, the color-by filter (scope)
  // on the next. chipCount is the pre-click value — the chart clears
  // its own lasso layer before this fires
  const handleBackgroundClick = () => {
    if (chipCount) {
      clearAll();
      return;
    }
    if (legendFilter) resetLegendFilter();
  };

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
          {/* Fixed-width slot so the spinner's appearance never nudges
              the control row */}
          <span className="emb-colorby-spinner">
            {colorLoading && (
              <Icon
                name={IconName.Spinner}
                size={Size.Sm}
                color={IconColor.Decorative}
              />
            )}
          </span>
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
              size={Size.Md}
              leadingIcon={IconName.Undo}
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
        {!loaded && !error && (
          <div className="emb-plot-loading">
            <Icon
              name={IconName.Spinner}
              size={Size.Lg}
              color={IconColor.Decorative}
            />
          </div>
        )}
        {loaded && (
          <EmbeddingsView
            ref={viewRef}
            points={loaded.points}
            colors={colors}
            visible={visibleMask}
            selected={selectedIndices}
            tooltip={false}
            mode={mode}
            zCamera={zCamera}
            onSelection={handleLasso}
            onPointClick={mode === "select" ? handlePointClick : undefined}
            onBackgroundClick={handleBackgroundClick}
            onError={(e) => setRendererError(e.message)}
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
        {colorField && colorMeta && colorMeta.style === "categorical" && (
          <ColorLegend
            field={colorField}
            meta={colorMeta}
            offLabels={legend?.off ?? null}
            scopedCounts={scopedCounts}
            onToggle={handleLegendToggle}
            onSolo={handleLegendSolo}
          />
        )}
        {colorField && colorMeta && colorMeta.style === "continuous" && (
          <ContinuousLegend field={colorField} meta={colorMeta} />
        )}
        {chipCount ? (
          <div className="emb-plot-overlay emb-plot-chip">
            <Icon
              name={IconName.Check}
              size={Size.Md}
              color={TextColor.Secondary}
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
