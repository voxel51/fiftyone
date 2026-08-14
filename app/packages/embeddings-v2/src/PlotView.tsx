/**
 * The plot shell for one visualization run: header (color-by, mode toggle,
 * settings, reset controls), legends, overlays, and the plot area. All
 * per-run state (geometry, color, masks, ONE selection bridge, legend)
 * comes from {@link useRunPlotData}.
 *
 * The shell renders a single full-size {@link FacetCell} over the run's
 * shared arrays. An extension may substitute the plot area with its own
 * layout of cells over the SAME arrays (see
 * {@link RunFeatures.renderPlotArea}) and contribute header controls, a
 * banner, settings sections and one extra interaction mode — the shell
 * itself never branches on what the extension is.
 */
import {
  BackgroundColor,
  BorderColor,
  Button,
  getColorCssVar,
  Icon,
  IconColor,
  IconName,
  Size,
  Text,
  TextColor,
  TextVariant,
  Tooltip,
  Variant,
} from "@voxel51/voodo";
import { useMemo, type CSSProperties } from "react";
import { ColorByMenu } from "./ColorByMenu";
import { ColorLegend } from "./ColorLegend";
import { ContinuousLegend } from "./ContinuousLegend";
import FacetCell from "./FacetCell";
import type { SharedPlotProps } from "./extensions";
import { counterLabel } from "./plotCounter";
import { SettingsMenu } from "./SettingsMenu";
import "./panel.css";
import { type VisualizationRun } from "./protocol";
import { type CameraAdapterFactory, type InteractionMode } from "./renderer";
import { NONE_FIELD, useRunPlotData } from "./useRunPlotData";

const TOKEN_VARS = {
  "--emb-bg": `var(${getColorCssVar(BackgroundColor.Background)})`,
  "--emb-card-bg": `var(${getColorCssVar(BackgroundColor.Card2)})`,
  "--emb-card-elevated": `var(${getColorCssVar(BackgroundColor.CardElevated)})`,
  "--emb-border-subtle": `var(${getColorCssVar(BorderColor.Subtle)})`,
  "--emb-border-strong": `var(${getColorCssVar(BorderColor.Strong)})`,
  "--emb-fg": `var(${getColorCssVar(TextColor.Fg)})`,
} as CSSProperties;

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
  const data = useRunPlotData(datasetName, run);
  const {
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
    streamField,
    coloredByStream,
    plotVisible,
    visibleCount,
    selectedIndices,
    chipCount,
    chipSampleCount,
    handleLasso,
    handlePointClick,
    handleBackgroundClick,
    clearAll,
    hover,
    handleHover,
    keepHover,
    features,
    palette,
    colorscale,
    rampId,
    setRampId,
    colorscaleTarget,
    colorDomain,
    scopedCounts,
    legend,
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
  } = data;

  const extraMode = features.extraMode;
  const inExtraMode = extraMode != null && mode === extraMode.key;

  // The renderer only knows explore/select; an extension mode uses SELECT
  // interaction (only select fires point clicks) and routes its gestures
  // through the shell's handlers
  // Cast, not narrowed: `PanelMode`'s open string member defeats literal
  // narrowing, but the guarded branch is by construction a renderer mode
  const rendererMode: InteractionMode =
    mode === "explore" || mode === "select"
      ? (mode as InteractionMode)
      : "select";
  const cellPointClick =
    mode === "select"
      ? handlePointClick
      : inExtraMode
        ? extraMode.onPointClick
        : undefined;
  // An extension mode already acts on point click, so the card's action
  // button is redundant there; explore/select reach it here
  const hoverAction = inExtraMode ? null : features.hoverAction;

  const subtitle = `${run.method ?? "visualization"}${
    run.dims ? ` (${run.dims}D)` : ""
  }`;

  // A cell's `visible` prop is a total mask; the plain plot's single cell is
  // everything the plot-level mask admits (or everything, when null).
  // Memoized so the cell's chart doesn't re-diff a fresh array every render
  const n = loaded?.points.length ?? 0;
  const singleCellMask = useMemo(() => {
    if (plotVisible && plotVisible.length === n) return plotVisible;
    return new Uint8Array(n).fill(1);
  }, [n, plotVisible]);

  const shared: SharedPlotProps | null = loaded
    ? {
        loaded,
        colors: pointColors,
        visible: plotVisible,
        selected: selectedIndices,
        mode: rendererMode,
        panelMode: mode,
        zCamera,
        onLasso: handleLasso,
        onPointClick: cellPointClick,
        onBackgroundClick: handleBackgroundClick,
        onError: onRendererError,
        onHover: handleHover,
        onKeepHover: keepHover,
        hover,
        hoverAction,
        registerChart,
      }
    : null;

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
          {/* Extension header controls (null when it contributes none) */}
          {features.headerControls}
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
          <ColorByMenu
            disabled={!choices.length}
            value={colorField ?? NONE_FIELD}
            options={colorOptions}
            onChange={(value) =>
              setColorField(value !== NONE_FIELD ? value : null)
            }
          />
          {streamField && (
            <Tooltip
              content={
                coloredByStream
                  ? "Coloring by stream — click legend entries to show/hide individual streams"
                  : "Color points by stream (then toggle streams in the legend)"
              }
              portal
            >
              <Button
                variant={coloredByStream ? Variant.Primary : Variant.Secondary}
                size={Size.Sm}
                leadingIcon={IconName.Sliders}
                aria-label="Color by stream"
                onClick={() =>
                  setColorField(coloredByStream ? null : streamField)
                }
              >
                Streams
              </Button>
            </Tooltip>
          )}
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
            {extraMode?.control({
              active: inExtraMode,
              onActivate: () => setMode(extraMode.key),
            })}
          </div>
          <span className="emb-plot-divider" />
          <SettingsMenu
            rampId={rampId}
            colorscaleTarget={colorscaleTarget}
            onRampChange={setRampId}
            renderBefore={features.renderSettingsBefore}
            renderAfter={features.renderSettingsAfter}
          />
          {/* Two distinct actions: clear all filters/selections vs recenter
              the cameras. portal: inline rendering clips against the chrome */}
          <Tooltip content="Clear filters & selection" portal>
            <Button
              variant={Variant.Icon}
              size={Size.Md}
              leadingIcon={IconName.Undo}
              aria-label="Clear filters and selection"
              onClick={resetAll}
            />
          </Tooltip>
          <Tooltip content="Recenter plots" portal>
            <Button
              variant={Variant.Icon}
              size={Size.Md}
              leadingIcon={IconName.Fullscreen}
              aria-label="Recenter plots"
              onClick={resetCameras}
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
      {features.banner && (
        <div className="emb-plot-error">
          <Text variant={TextVariant.Sm} color={TextColor.Tertiary}>
            {features.banner}
          </Text>
        </div>
      )}
      <div className="emb-plot-scene">
        {!loaded && !error && (
          <div className="emb-plot-loading">
            <Icon
              name={IconName.Spinner}
              size={Size.Lg}
              color={IconColor.Decorative}
            />
          </div>
        )}
        {shared &&
          (features.renderPlotArea ? (
            features.renderPlotArea(shared)
          ) : (
            <div
              className="emb-facet-grid"
              data-faceted="false"
              style={{ gridTemplateColumns: "1fr", gridTemplateRows: "1fr" }}
            >
              <FacetCell
                cellKey="0:0"
                rowLabel={null}
                colLabel={null}
                count={visibleCount ?? shared.loaded.points.length}
                loaded={shared.loaded}
                colors={shared.colors}
                selected={shared.selected}
                visible={singleCellMask}
                mode={shared.mode}
                zCamera={zCamera}
                onLasso={shared.onLasso}
                onPointClick={shared.onPointClick}
                onBackgroundClick={shared.onBackgroundClick}
                onError={shared.onError}
                onHover={shared.onHover}
                onKeepHover={shared.onKeepHover}
                hoverAction={shared.hoverAction}
                registerChart={shared.registerChart}
                hover={shared.hover}
              />
            </div>
          ))}
        {/* One shared legend floating over the whole plot area — color is
            computed once at the run level, so every rendered cell uses the
            identical class→hue mapping and there is exactly one legend */}
        {colorField && colorMeta && colorMeta.style === "categorical" && (
          <ColorLegend
            field={colorField}
            meta={colorMeta}
            palette={palette}
            offLabels={legend?.off ?? null}
            scopedCounts={scopedCounts}
            onToggle={handleLegendToggle}
            onSolo={handleLegendSolo}
          />
        )}
        {colorField && colorMeta && colorMeta.style === "continuous" && (
          <ContinuousLegend
            field={colorField}
            meta={colorMeta}
            colorscale={colorscale}
            domain={colorDomain}
          />
        )}
        {chipCount ? (
          <div className="emb-plot-overlay emb-plot-chip">
            <Icon
              name={IconName.Check}
              size={Size.Md}
              color={TextColor.Secondary}
            />
            <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
              {/* Samples when knowable — the footer already counts points,
                  and one sample can own many points, so an unlabeled point
                  count here reads as a wrong sample count */}
              {chipSampleCount != null ? (
                <>
                  <strong>{chipSampleCount.toLocaleString()}</strong>{" "}
                  {chipSampleCount === 1 ? "sample" : "samples"}
                </>
              ) : (
                <>
                  <strong>{chipCount.toLocaleString()}</strong> selected
                </>
              )}
            </Text>
            <Button
              variant={Variant.Icon}
              size={Size.Xs}
              leadingIcon={IconName.Close}
              aria-label="Clear selection"
              onClick={clearAll}
            />
          </div>
        ) : features.renderPlotArea ? null : (
          // The always-on hint would sit on top of a cell header in an
          // extension layout; per-cell headers carry the context there
          <div className="emb-plot-overlay emb-plot-hint">
            <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
              {mode === "explore"
                ? "Drag to pan · scroll to zoom"
                : mode === "select"
                  ? "Drag to lasso · click points to toggle"
                  : (extraMode?.hint ?? "")}
            </Text>
          </div>
        )}
        {loaded && (
          <div className="emb-plot-overlay emb-plot-counter">
            {/* Beside the count, because the count is what a pending filter is
                about to change — silence here reads as "nothing matched" */}
            {features.filterLoading && (
              <Icon
                name={IconName.Spinner}
                size={Size.Xs}
                color={IconColor.Decorative}
                aria-label="Applying filter"
              />
            )}
            <Text variant={TextVariant.Sm} color={TextColor.Tertiary}>
              {features.filterLoading
                ? "filtering…"
                : counterLabel({
                    loaded: loadedCount,
                    total,
                    selected: chipCount,
                    inView: visibleCount,
                  })}
            </Text>
            {resultsPartial && (
              <button
                type="button"
                className="emb-update-btn"
                disabled={!canUpdate}
                title={
                  canUpdate
                    ? undefined
                    : "Loading the rest of the run before it can be applied"
                }
                onClick={(e) => {
                  e.stopPropagation();
                  applyAllPoints();
                }}
              >
                <Icon
                  name={IconName.Refresh}
                  size={Size.Xs}
                  color={TextColor.Fg}
                />
                {canUpdate
                  ? `Apply to all ${total.toLocaleString()}`
                  : `Applied to ${resolvedCount.toLocaleString()} · loading…`}
              </button>
            )}
          </div>
        )}
        {/* Extension notices are only honest if dismissible and replaced by
            the next one, so they never linger over a result they do not
            describe */}
        {features.notice && (
          <div className="emb-toast" role="status" aria-live="polite">
            <Icon name={IconName.Info} size={Size.Sm} color={TextColor.Fg} />
            <Text variant={TextVariant.Sm} color={TextColor.Fg}>
              {features.notice.text}
            </Text>
            <button
              type="button"
              className="emb-toast-close"
              aria-label="Dismiss"
              onClick={features.notice.dismiss}
            >
              <Icon
                name={IconName.Close}
                size={Size.Sm}
                color={TextColor.Tertiary}
              />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
