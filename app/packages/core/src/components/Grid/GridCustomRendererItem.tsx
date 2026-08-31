import { buildThumbnailSelectionDetail } from "@fiftyone/looker/src/selection";
import {
  type SampleRendererGridClickBehavior,
  type SampleRendererProps,
  type SampleRendererRenderContext,
} from "@fiftyone/plugins";
import type { ID } from "@fiftyone/spotlight";
import * as fos from "@fiftyone/state";
import { useMcapGridOverlays } from "@fiftyone/multimodal/extensions/timeline";
import { TemporalTagGridOverlay } from "@fiftyone/multimodal/temporal-tags/grid-overlay";
import { MEDIA_TYPE_MULTIMODAL } from "@fiftyone/utilities";
import OpenInFullIcon from "@mui/icons-material/OpenInFull";
import { Checkbox } from "@mui/material";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import classes from "./GridCustomRendererItem.module.css";
import GridTagBubbles from "./GridTagBubbles";

type GridCustomRendererItemConfig = {
  pluginName: string;
  Renderer: React.ComponentType<SampleRendererProps>;
  RecoilBridge: React.ComponentType<React.PropsWithChildren>;
  ctx: SampleRendererRenderContext;
  clickBehavior?: SampleRendererGridClickBehavior;
  symbol: ID;
  /**
   * Synchronous lookup against the true `selectedSamples` source of truth,
   * used to reconcile this item's local `selected` flag when it's reattached
   * from the cache (`attach()`), since offscreen cached items don't receive
   * `updateOptions()` calls while hidden.
   */
  isSampleSelected?: (sampleId: string) => boolean;
};

/** Dimensions as [width, height] in pixels. */
type GridItemDimensions = [width: number, height: number];

type GridSizeHintSample = {
  filepath?: string;
  metadata?: {
    size_bytes?: number | null;
  } | null;
};

/** Error boundary for a sample renderer with fallback behavior. */
class GridCustomRendererErrorBoundary extends React.Component<
  React.PropsWithChildren<{ onError: (error: Error) => void }>,
  { hasError: boolean }
> {
  constructor(
    props: React.PropsWithChildren<{ onError: (error: Error) => void }>,
  ) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    // Defer the fail-open handoff so React can finish the failed render before
    // we tear down the dedicated plugin root.
    queueMicrotask(() => this.props.onError(error));
  }

  render() {
    if (this.state.hasError) {
      return null;
    }

    return this.props.children;
  }
}

// Stylesheet constants for renderer UI
const CONTAINER_STYLES: React.CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100%",
};

const HOST_ELEMENT_STYLES: React.CSSProperties = {
  width: "100%",
  height: "100%",
  position: "relative",
  overflow: "hidden",
};

const OPEN_MODAL_BUTTON_STYLES: React.CSSProperties = {
  position: "absolute",
  right: "8px",
  bottom: "8px",
  width: "22px",
  height: "22px",
  border: "1px solid rgba(255, 255, 255, 0.28)",
  borderRadius: "6px",
  background: "rgba(18, 18, 18, 0.72)",
  color: "#f5f5f5",
  fontSize: "14px",
  alignItems: "center",
  display: "flex",
  justifyContent: "center",
  padding: 0,
  cursor: "pointer",
  zIndex: 20,
};

// Bottom chrome for a tile: stacks the tag bubbles and (for multimodal) the
// temporal-tag overlay in a column so they don't overlap. Anchored to the
// bottom; children flow (bubbles on top, overlay beneath).
const FOOTER_STYLES: React.CSSProperties = {
  position: "absolute",
  left: 0,
  right: 0,
  bottom: 0,
  display: "flex",
  flexDirection: "column",
  pointerEvents: "none",
  zIndex: 10,
};

const SELECT_SAMPLE_BUTTON_STYLES: React.CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  color: "hsl(25, 100%, 51%)",
  cursor: "pointer",
  zIndex: 20,
};

type GridItemOptions = {
  selected?: boolean;
  inSelectionMode?: boolean;
};

const BYTES_PER_PIXEL = 4;
const MIN_GRID_RENDERER_SIZE_BYTES = 1;
const MULTIMODAL_SOURCE_SIZE_FALLBACK_BYTES = 10 * 1024 * 1024;
// Large custom-rendered media should influence autosizing, but one giant source
// file should not force the grid straight to maximum zoom by itself.
const SOURCE_SIZE_HINT_CAP_BYTES = 50 * 1024 * 1024;

function getFiniteSizeBytes(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value) || value < 0) {
    return 0;
  }

  return Math.trunc(value);
}

function getPixelSizeBytes(width: number, height: number): number {
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return 0;
  }

  return Math.max(0, width * height * BYTES_PER_PIXEL);
}

function getSourceSizeHintBytes(
  sourceSizeBytes: number,
  mediaType: string | null,
): number {
  if (sourceSizeBytes > 0) {
    return Math.min(sourceSizeBytes, SOURCE_SIZE_HINT_CAP_BYTES);
  }

  if (mediaType === MEDIA_TYPE_MULTIMODAL) {
    // Multimodal files often decode expensive container data even when metadata
    // has not populated size_bytes yet, so bias autosizing as though each item
    // has a modest source-size hint.
    return MULTIMODAL_SOURCE_SIZE_FALLBACK_BYTES;
  }

  return 0;
}

type GridCustomRendererWrapperProps = React.PropsWithChildren<{
  clickBehavior?: SampleRendererGridClickBehavior;
  selected: boolean;
  onOpenModal: React.MouseEventHandler<HTMLButtonElement>;
  onSelect: React.MouseEventHandler<HTMLButtonElement>;
}>;

const stopGridActivationPropagation: React.MouseEventHandler<HTMLElement> = (
  event,
) => {
  event.stopPropagation();
};

const GridCustomRendererWrapper = ({
  children,
  clickBehavior = "renderer",
  selected,
  onOpenModal,
  onSelect,
}: GridCustomRendererWrapperProps) => {
  const [hovering, setHovering] = React.useState(false);
  const showSelectionControl = hovering || selected;
  const passThroughGridActivation = clickBehavior === "passthrough";

  return (
    <div
      className={classes.container}
      style={CONTAINER_STYLES}
      data-cy="grid-custom-renderer"
      onMouseEnter={() => setHovering(true)}
      onMouseMove={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onClick={
        passThroughGridActivation ? undefined : stopGridActivationPropagation
      }
      onContextMenu={
        passThroughGridActivation ? undefined : stopGridActivationPropagation
      }
    >
      {children}
      {showSelectionControl && (
        <Checkbox
          style={SELECT_SAMPLE_BUTTON_STYLES}
          title={selected ? "Selected" : "Select sample"}
          checked={selected}
          onClick={onSelect}
        />
      )}
      <button
        aria-label="Open sample modal"
        className={classes.openModalButton}
        title="Open sample modal"
        onClick={onOpenModal}
        style={OPEN_MODAL_BUTTON_STYLES}
      >
        <OpenInFullIcon fontSize="inherit" />
      </button>
    </div>
  );
};

// Keyed by the overlay's own reference (stable per registration), not its
// position in the registry's array — an earlier overlay unregistering must
// not shift a later one's key and force it to remount.
const overlayIds = new WeakMap<
  React.ComponentType<SampleRendererProps>,
  number
>();
let nextOverlayId = 0;
function overlayKey(overlay: React.ComponentType<SampleRendererProps>): number {
  let id = overlayIds.get(overlay);
  if (id === undefined) {
    id = nextOverlayId++;
    overlayIds.set(overlay, id);
  }
  return id;
}

/** Edition-registered grid-tile overlays (rendered inside the multimodal
 * guard); nothing renders before anything registers. */
const McapGridOverlays = ({
  ctx,
}: {
  readonly ctx: SampleRendererRenderContext;
}) => {
  const overlays = useMcapGridOverlays();
  return (
    <>
      {overlays.map((Overlay) => (
        <Overlay key={overlayKey(Overlay)} ctx={ctx} />
      ))}
    </>
  );
};

const GridCustomRenderer = ({
  Renderer,
  ctx,
  onRetainedBytesChange,
}: {
  readonly Renderer: React.ComponentType<SampleRendererProps>;
  readonly ctx: SampleRendererRenderContext;
  readonly onRetainedBytesChange: (retainedBytes: number) => void;
}) => {
  const modalActive = fos.useModalActive();

  return (
    <Renderer
      ctx={ctx}
      isGridActive={!modalActive}
      onRetainedBytesChange={onRetainedBytesChange}
    />
  );
};

/**
 * Spotlight-compatible adapter that mounts a sample renderer directly in grid tiles.
 *
 * Lifecycle:
 * 1. Create instance with config
 * 2. Call attach() to mount the renderer
 * 3. If renderer fails, mark the dataset fail-open and wait for the grid to
 *    rebuild with the built-in renderer on the next pass
 * 4. Call destroy() to clean up resources
 *
 * Events: Forwards "load" and "selectthumbnail" events.
 */
export class GridCustomRendererItem {
  public loaded = false;

  private readonly eventTarget = new EventTarget();
  private readonly hostElement = document.createElement("div");
  private mountedElement: HTMLElement | null = null;
  private pluginRoot: Root | null = null;
  private pluginFailed = false;
  private destroyed = false;
  private selected = false;
  private inSelectionMode = false;
  private retainedSizeBytes?: number;
  private dimensions?: GridItemDimensions;

  constructor(private readonly config: GridCustomRendererItemConfig) {
    Object.assign(this.hostElement.style, HOST_ELEMENT_STYLES);
    this.pluginFailed = fos.isGridCustomRendererFailOpen(
      this.config.ctx.dataset.name,
    );
  }

  addEventListener(
    eventType: string,
    handler: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ) {
    this.eventTarget.addEventListener(eventType, handler, options);
  }

  removeEventListener(
    eventType: string,
    handler: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ) {
    this.eventTarget.removeEventListener(eventType, handler, options);
  }

  private dispatchEvent(eventType: string, detail?: unknown) {
    this.eventTarget.dispatchEvent(new CustomEvent(eventType, { detail }));
  }

  private handleRetainedBytesChange = (retainedBytes: number) => {
    const normalized = getFiniteSizeBytes(retainedBytes);
    if (this.retainedSizeBytes === normalized) {
      return;
    }

    this.retainedSizeBytes = normalized;
    this.dispatchEvent("refresh");
  };

  private isDatasetFailOpen() {
    return fos.isGridCustomRendererFailOpen(this.config.ctx.dataset.name);
  }

  private renderPluginRenderer() {
    if (this.isDatasetFailOpen()) {
      this.pluginFailed = true;
    }

    if (this.destroyed || this.pluginFailed) {
      return;
    }

    const { Renderer, ctx, RecoilBridge } = this.config;
    const sample =
      (ctx.sample as { sample?: Record<string, unknown> })?.sample ??
      (ctx.sample as Record<string, unknown>);

    if (!this.pluginRoot) {
      this.pluginRoot = createRoot(this.hostElement);
    }

    this.pluginRoot.render(
      <RecoilBridge>
        <GridCustomRendererErrorBoundary
          onError={(error) => this.switchToFallback(error)}
          key={
            ctx.media.url ??
            ctx.media.mediaReference?.key ??
            this.config.pluginName
          }
        >
          <GridCustomRendererWrapper
            clickBehavior={this.config.clickBehavior}
            selected={this.selected}
            onOpenModal={this.handleOpenModalClick}
            onSelect={this.handleSelectSampleClick}
          >
            <GridCustomRenderer
              Renderer={Renderer}
              ctx={ctx}
              onRetainedBytesChange={this.handleRetainedBytesChange}
            />
            <div style={FOOTER_STYLES}>
              <GridTagBubbles sample={sample} />
              {ctx.media?.mediaType === MEDIA_TYPE_MULTIMODAL ? (
                <>
                  <TemporalTagGridOverlay ctx={ctx} />
                  <McapGridOverlays ctx={ctx} />
                </>
              ) : null}
            </div>
          </GridCustomRendererWrapper>
        </GridCustomRendererErrorBoundary>
      </RecoilBridge>,
    );
  }

  private getSampleId(): string {
    const sample = this.config.ctx.sample?.sample;
    return sample?._id ?? sample?.["id"] ?? this.config.symbol.description;
  }

  private getSelectionPayload(event: React.MouseEvent<HTMLButtonElement>) {
    const sample = this.config.ctx.sample?.sample;
    const sampleId = this.getSampleId();

    return buildThumbnailSelectionDetail({
      id: sampleId,
      sample,
      symbol: this.config.symbol,
      modifiers: event,
    });
  }

  private handleSelectSampleClick = (
    event: React.MouseEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    if (this.destroyed) {
      return;
    }

    this.selected = !this.selected;
    this.dispatchEvent("selectthumbnail", this.getSelectionPayload(event));
    this.renderPluginRenderer();
  };

  private handleOpenModalClick = (
    event: React.MouseEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    if (!this.mountedElement || this.destroyed) {
      return;
    }

    this.mountedElement.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );
  };

  private switchToFallback(error: Error) {
    if (this.destroyed || this.pluginFailed) {
      return;
    }

    console.error(
      `Grid sample renderer failed (plugin: ${this.config.pluginName}), ` +
        "disabling custom grid renderers for this dataset for the rest of this browser session:",
      error,
    );

    this.pluginFailed = true;

    fos.markGridCustomRendererFailed({
      datasetName: this.config.ctx.dataset.name,
      rendererName: this.config.pluginName,
      errorMessage: error.message,
    });

    setTimeout(() => {
      if (!this.destroyed) {
        this.unmountPluginRenderer();
      }
    }, 0);
  }

  attach(
    element: HTMLElement | string,
    dimensions?: GridItemDimensions,
    _fontSize?: number,
  ) {
    if (this.destroyed) {
      return;
    }

    const resolvedElement =
      typeof element === "string" ? document.getElementById(element) : element;

    if (!resolvedElement) {
      return;
    }

    this.mountedElement = resolvedElement;
    this.dimensions = dimensions;

    if (this.hostElement.parentElement !== resolvedElement) {
      // Replace all children of the target element with the host element.
      resolvedElement.replaceChildren(this.hostElement);
    }

    // Reconcile against the true selection state on (re)attach: while this
    // item was scrolled offscreen it stayed alive in the grid's cache but
    // stopped receiving updateOptions() calls (those only reach currently
    // shown rows), so its local `selected` flag can be stale relative to the
    // real selectedSamples atom.
    //
    // Known trade-off: the selection click handler applies its toggle to
    // `this.selected` optimistically, before the Recoil write it dispatches
    // has actually committed (that round-trip is async). If this exact
    // instance were detached and reattached inside that narrow window, this
    // reconciliation would read the not-yet-committed snapshot and revert the
    // optimistic toggle. In practice a reattach is driven by scroll/relayout,
    // which cannot happen inside the same microtask window as the click, so
    // this hasn't been observed — flagging for future readers rather than
    // guarding against it, since a guard would have to reintroduce the same
    // staleness this reconciliation exists to fix.
    if (this.config.isSampleSelected) {
      this.selected = this.config.isSampleSelected(this.getSampleId());
    }

    this.renderPluginRenderer();
    this.loaded = true;
    this.dispatchEvent("load");
  }

  detach() {
    this.hostElement.remove();
  }

  destroy() {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    this.detach();
    this.unmountPluginRenderer();
    this.pluginFailed = false;
    this.mountedElement = null;
    this.hostElement.remove();
  }

  private unmountPluginRenderer() {
    const root = this.pluginRoot;
    this.pluginRoot = null;

    if (!root) {
      return;
    }

    // Deferred out of the caller's stack: destroy() runs from the grid cache's
    // eviction, which fires inside a React effect cleanup, and unmounting
    // another root from there races the commit React is still finishing
    // ("Attempted to synchronously unmount a root while React was already
    // rendering"). The host element is detached before this, so nothing of the
    // renderer is on screen while the unmount waits.
    setTimeout(() => root.unmount(), 0);
  }

  updateOptions(options: unknown, disableReload?: boolean) {
    void disableReload;

    const { selected: nextSelected, inSelectionMode: nextInSelectionMode } =
      options as GridItemOptions;

    const shouldRender =
      (typeof nextSelected === "boolean" && this.selected !== nextSelected) ||
      (typeof nextInSelectionMode === "boolean" &&
        this.inSelectionMode !== nextInSelectionMode);

    if (typeof nextSelected === "boolean") {
      this.selected = nextSelected;
    }

    if (typeof nextInSelectionMode === "boolean") {
      this.inSelectionMode = nextInSelectionMode;
    }

    if (shouldRender) {
      this.renderPluginRenderer();
    }
  }

  refreshSample(renderLabels: string[] | null = null) {
    void renderLabels;
  }

  getSampleOverlays() {
    return [];
  }

  getSizeBytesEstimate(): number {
    const renderedSizeBytes = (() => {
      const dimensions = this.dimensions;
      if (dimensions) {
        const [width, height] = dimensions;
        return getPixelSizeBytes(width, height);
      }

      const rect = this.hostElement.getBoundingClientRect();
      return getPixelSizeBytes(rect.width, rect.height);
    })();

    const wrappedSample = this.config.ctx.sample as unknown as
      | { sample?: GridSizeHintSample }
      | null
      | undefined;
    const safeSample =
      wrappedSample?.sample ??
      (this.config.ctx.sample as unknown as GridSizeHintSample | undefined);
    const isSampleFile =
      Boolean(safeSample) &&
      (this.config.ctx.media.field === "filepath" ||
        this.config.ctx.media.path === safeSample?.filepath);
    const sourceSizeBytes =
      isSampleFile && safeSample
        ? getFiniteSizeBytes(safeSample.metadata?.size_bytes)
        : 0;
    const retainedSizeBytes =
      this.retainedSizeBytes ??
      getSourceSizeHintBytes(sourceSizeBytes, this.config.ctx.media.mediaType);

    return Math.ceil(
      MIN_GRID_RENDERER_SIZE_BYTES + renderedSizeBytes + retainedSizeBytes,
    );
  }
}
